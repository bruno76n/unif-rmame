/**
 * `compras.cuenta_material`: la cuenta de cada material que alimenta Por pedir, la revisión de Ventas, lo libre para
 * el corte y la alerta de Dirección. Calcula todos los materiales activos en una pasada y la memoriza durante la
 * petición: quien la lee dos veces en la misma transacción ve los mismos números. No se guarda.
 * Fase 10 · docs/modulos/compras/proyeccion-de-material.md (reglas 1 a 16, «El consumo», «Lecturas»)
 *
 * Lo comprometido con los lotes por cortar llega con Producción en la fase 12: hasta entonces es cero. El plazo es el
 * plazo real del proveedor habitual: el promedio de sus entregas, o lo que dice que tarda si no tiene.
 */

import { aMilesimos, aMilesimosConSigno, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { consumoNormal, type Llegada, proyectarMaterial } from "@uniformame/compartido/calculos/proyeccion-material";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../dominio/comunes.ts";
import { plazosReales } from "../dominio/ordenes.ts";
import { materiales, ordenCompraLineas, ordenesCompra, proveedores } from "../tablas.ts";
import { ordenesPorRecibir } from "./ordenes.ts";

/** Lo que recibe: los materiales, o ninguno para todos los activos. */
const pedido = z.object({ material_ids: z.array(z.uuid()).optional() }).strict();

/** Lo que regresa `inventario.existencias_de_materiales`. */
const deExistencias = z.record(z.string(), z.object({ bodega: z.string(), aduana: z.string() }));

/** Lo que regresa `inventario.salidas_de_materiales`. */
const deSalidas = z.record(
	z.string(),
	z.object({ primera: z.string().nullable(), por_dia: z.record(z.string(), z.string()) }),
);

/** Lo que viene de una orden para un material. */
interface EnCamino {
	orden_compra_id: string;
	folio: string;
	cantidad: string;
	llegada_esperada: string;
	atrasada: boolean;
}

/** La cuenta de un material, como la regresa la lectura. Las cantidades, en su unidad de inventario. */
export interface CuentaDeMaterial {
	material_id: string;
	hay_bodega: string;
	hay_aduana: string;
	comprometido: string;
	comprometido_por_lote: { lote_id: string; cantidad: string }[];
	en_camino: EnCamino[];
	libre_para_comprar: string;
	libre_para_corte: string;
	libre_en_la_cuenta: string;
	bajo_minimo: boolean;
	consumo_normal: string | null;
	consumo_medido: boolean;
	consumo_por_mes: string[];
	se_acaba: string | null;
	plazo: number;
	fecha_limite: string | null;
	dias_sin_material: number;
	estado: "sin_tiempo_de_entrega" | "pedir_esta_semana" | "alcanza";
	linea: string;
	para_cuando: string;
	por_pedir: string;
	en_borrador: { orden_compra_id: string; folio: string } | null;
}

/** Los meses, en el orden de sus factores. */
const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** Lo calculado en cada transacción: todos los activos, y los que se pidieron aparte. */
const memoria = new WeakMap<object, { activos: string[]; cuentas: Map<string, CuentaDeMaterial> }>();

/**
 * Lee la cuenta de unos materiales.
 * @param contexto El contexto de quien lee.
 * @param datos `material_ids`, o nada para todos los activos.
 * @returns Por material, su cuenta. Un material que no existe no viene.
 */
export async function cuentaMaterial(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<Record<string, CuentaDeMaterial>> {
	const { material_ids } = pedido.parse(datos);
	let calculado = memoria.get(contexto.transaccion);
	if (calculado === undefined) {
		const cuentas = await calcular(contexto, undefined);
		calculado = { activos: [...cuentas.keys()], cuentas };
		memoria.set(contexto.transaccion, calculado);
	}
	const { cuentas } = calculado;
	// Los que se piden y no están entre los activos (dados de baja) se calculan aparte.
	const faltan = (material_ids ?? []).filter((id) => !cuentas.has(id));
	if (faltan.length > 0) for (const [id, cuenta] of await calcular(contexto, faltan)) cuentas.set(id, cuenta);
	const ids = material_ids ?? calculado.activos;
	const resultado: Record<string, CuentaDeMaterial> = {};
	for (const id of ids) {
		const cuenta = cuentas.get(id);
		if (cuenta !== undefined) resultado[id] = cuenta;
	}
	return resultado;
}

/**
 * Los parámetros de la proyección: los doce factores (en milésimos del factor) y los días.
 * @param contexto El contexto de quien lee.
 */
async function parametrosDeProyeccion(contexto: ContextoDeAccion) {
	const factores: bigint[] = [];
	for (const mes of meses) {
		// Se guardan en por ciento de un mes normal: 90 % es 0.9, o 900 milésimos.
		const porciento = await parametroNumero(contexto, `compras.factor_consumo_${mes}`);
		factores.push((aMilesimos(String(porciento)) + 50n) / 100n);
	}
	return {
		factores,
		diasMedido: await parametroNumero(contexto, "compras.dias_consumo_medido"),
		limites: {
			diasMaximos: await parametroNumero(contexto, "compras.dias_maximos_proyeccion"),
			diasPedirEstaSemana: await parametroNumero(contexto, "compras.dias_pedir_esta_semana"),
			diasMasDeSeisMeses: await parametroNumero(contexto, "compras.dias_etiqueta_mas_de_6_meses"),
		},
	};
}

/**
 * Lo que viene en camino de cada material: lo que falta de cada línea de las órdenes enviadas o recibidas en
 * parte, en su llegada esperada.
 * @param contexto El contexto de quien lee.
 */
async function enCaminoPorMaterial(contexto: ContextoDeAccion): Promise<Map<string, EnCamino[]>> {
	const { ordenes } = await ordenesPorRecibir(contexto, {});
	const porMaterial = new Map<string, EnCamino[]>();
	for (const orden of ordenes) {
		if (orden.llegada_esperada === null) continue;
		for (const linea of orden.lineas) {
			if (aMilesimosConSigno(linea.falta) <= 0n) continue;
			const suyas = porMaterial.get(linea.material_id) ?? [];
			suyas.push({
				orden_compra_id: orden.orden_compra_id,
				folio: orden.folio,
				cantidad: linea.falta,
				llegada_esperada: orden.llegada_esperada,
				atrasada: orden.atrasada,
			});
			porMaterial.set(linea.material_id, suyas);
		}
	}
	return porMaterial;
}

/**
 * El borrador en que está cada material, con su folio: sigue en Por pedir, porque el borrador no cuenta en camino.
 * @param contexto El contexto de quien lee.
 * @param ids Los materiales.
 */
async function borradores(
	contexto: ContextoDeAccion,
	ids: readonly string[],
): Promise<Map<string, { orden_compra_id: string; folio: string }>> {
	const filas = await contexto.transaccion
		.select({
			materialId: ordenCompraLineas.materialId,
			ordenId: ordenesCompra.id,
			folio: ordenesCompra.folio,
		})
		.from(ordenCompraLineas)
		.innerJoin(ordenesCompra, eq(ordenesCompra.id, ordenCompraLineas.ordenCompraId))
		.where(and(eq(ordenesCompra.estado, "borrador"), inArray(ordenCompraLineas.materialId, [...ids])))
		.orderBy(ordenesCompra.folio);
	const porMaterial = new Map<string, { orden_compra_id: string; folio: string }>();
	for (const fila of filas) {
		if (!porMaterial.has(fila.materialId)) {
			porMaterial.set(fila.materialId, { orden_compra_id: fila.ordenId, folio: fila.folio });
		}
	}
	return porMaterial;
}

/**
 * Calcula la cuenta de unos materiales, o de todos los activos.
 * @param contexto El contexto de quien lee.
 * @param ids Los materiales, o `undefined` para todos los activos.
 */
async function calcular(
	contexto: ContextoDeAccion,
	ids: readonly string[] | undefined,
): Promise<Map<string, CuentaDeMaterial>> {
	const suyos = await contexto.transaccion
		.select({
			id: materiales.id,
			minimo: materiales.minimo,
			multiploCompra: materiales.multiploCompra,
			diasCubre: materiales.diasCubre,
			consumoDiarioInicial: materiales.consumoDiarioInicial,
			proveedorId: proveedores.id,
			diasDiceTardar: proveedores.diasDiceTardar,
		})
		.from(materiales)
		.innerJoin(proveedores, eq(proveedores.id, materiales.proveedorHabitualId))
		.where(ids === undefined ? isNull(materiales.bajaEn) : inArray(materiales.id, [...ids]))
		.orderBy(materiales.nombre);
	const cuentas = new Map<string, CuentaDeMaterial>();
	if (suyos.length === 0) return cuentas;
	const materialIds = suyos.map((material) => material.id);
	const parametros = await parametrosDeProyeccion(contexto);
	const hoy = contexto.diaDeNegocio;
	const existencias = deExistencias.parse(
		await contexto.lectura("inventario.existencias_de_materiales", { material_ids: materialIds }),
	);
	const salidas = deSalidas.parse(
		await contexto.lectura("inventario.salidas_de_materiales", {
			material_ids: materialIds,
			desde: hoy.subtract({ days: parametros.diasMedido }).toString(),
		}),
	);
	const enCamino = await enCaminoPorMaterial(contexto);
	const habituales = new Map(suyos.map((material) => [material.proveedorId, material.diasDiceTardar]));
	const plazos = await plazosReales(
		contexto,
		[...habituales].map(([id, diasDiceTardar]) => ({ id, diasDiceTardar })),
	);
	const enBorrador = await borradores(contexto, materialIds);
	for (const material of suyos) {
		const plazo = plazos.get(material.proveedorId)?.plazo ?? material.diasDiceTardar;
		const hay = existencias[material.id] ?? { bodega: "0.000", aduana: "0.000" };
		const bodega = aMilesimosConSigno(hay.bodega);
		const aduana = aMilesimosConSigno(hay.aduana);
		// Lo comprometido con los lotes por cortar llega con Producción (fase 12).
		const comprometido = 0n;
		const viene = enCamino.get(material.id) ?? [];
		const llegadas: Llegada[] = viene.map((suya) => ({
			dia: suya.llegada_esperada,
			cantidad: aMilesimosConSigno(suya.cantidad),
		}));
		const enCaminoTotal = llegadas.reduce((suma, llegada) => suma + llegada.cantidad, 0n);
		const libre = bodega + aduana - comprometido;
		const minimo = aMilesimosConSigno(material.minimo);
		const suyas = salidas[material.id] ?? { primera: null, por_dia: {} };
		const consumo = consumoNormal({
			hoy,
			inicial: material.consumoDiarioInicial === null ? null : aMilesimosConSigno(material.consumoDiarioInicial),
			primeraSalida: suyas.primera,
			salidas: Object.entries(suyas.por_dia).map(([dia, cantidad]) => ({
				dia,
				cantidad: aMilesimosConSigno(cantidad),
			})),
			factores: parametros.factores,
			dias: parametros.diasMedido,
		});
		const proyeccion = proyectarMaterial({
			hoy,
			libre,
			llegadas,
			consumoNormal: consumo.consumo,
			factores: parametros.factores,
			plazo,
			minimo,
			multiplo: aMilesimosConSigno(material.multiploCompra),
			diasCubre: material.diasCubre,
			limites: parametros.limites,
		});
		cuentas.set(material.id, {
			material_id: material.id,
			hay_bodega: deMilesimos(bodega),
			hay_aduana: deMilesimos(aduana),
			comprometido: deMilesimos(comprometido),
			comprometido_por_lote: [],
			en_camino: viene,
			libre_para_comprar: deMilesimos(libre),
			libre_para_corte: deMilesimos(bodega - comprometido),
			libre_en_la_cuenta: deMilesimos(libre + enCaminoTotal),
			bajo_minimo: libre < minimo,
			consumo_normal: consumo.consumo === null ? null : deMilesimos(consumo.consumo),
			consumo_medido: consumo.medido,
			consumo_por_mes: proyeccion.consumoPorMes.map(deMilesimos),
			se_acaba: proyeccion.seAcaba,
			plazo,
			fecha_limite: proyeccion.fechaLimite,
			dias_sin_material: proyeccion.diasSinMaterial,
			estado: proyeccion.estado,
			linea: proyeccion.linea,
			para_cuando: proyeccion.paraCuando,
			por_pedir: deMilesimos(proyeccion.porPedir),
			en_borrador: enBorrador.get(material.id) ?? null,
		});
	}
	return cuentas;
}
