/**
 * `compras.pendientes` y la pastilla de Compras en el menú.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Quién entra», «Pendientes»)
 *
 * Pendientes junta los materiales sin tiempo de entrega o por pedir esta semana (de `compras.cuenta_material`), las
 * órdenes atrasadas o que llegan esta semana, y las facturas que no cuadran o no han llegado (los renglones de la
 * conciliación). La pastilla cuenta los materiales por pedir más las órdenes atrasadas, y va en rojo si hay un
 * material sin tiempo de entrega o una orden atrasada.
 */

import { cantidadConUnidad } from "@uniformame/compartido/calculos/compras";
import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { plural } from "@uniformame/compartido/calculos/textos";
import { pendientesDeCompras } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { isNull } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { z } from "zod";
import {
	type ConteoDePastilla,
	type ContextoDeAccion,
	type ContextoDeConsulta,
	implementarConsulta,
} from "../../../nucleo/modulos.ts";
import { type RenglonDeConciliacion, renglonesDeConciliacion } from "../dominio/conciliacion.ts";
import { plazosReales } from "../dominio/ordenes.ts";
import { type OrdenResumida, ordenesResumidas } from "../dominio/ordenes-resumidas.ts";
import type { CuentaDeMaterial } from "../lecturas/cuenta-material.ts";
import { proveedores } from "../tablas.ts";
import { cuentas, datosDeMateriales, estadoEnSuLinea } from "./comun.ts";

/** Lo que regresa la consulta. */
type Resultado = z.infer<typeof pendientesDeCompras.resultado>;
/** Un renglón de Pendientes. */
type Renglon = Resultado["renglones"][number];

/** Los días en que una orden «llega esta semana». */
const diasDeLaSemana = 7;

/** Las órdenes que cuentan en camino. */
const enCamino = ["enviada", "recibida_en_parte"];

/**
 * Los días que faltan para que llegue una orden; negativo si ya pasó su fecha.
 * @param orden La orden.
 * @param hoy Hoy.
 */
function diasParaLlegar(orden: OrdenResumida, hoy: Temporal.PlainDate): number | null {
	return orden.fechaPrometida === null ? null : hoy.until(Temporal.PlainDate.from(orden.fechaPrometida)).days;
}

/**
 * La pastilla: los materiales sin tiempo de entrega o por pedir esta semana más las órdenes atrasadas; en rojo si hay
 * un material sin tiempo de entrega o una orden atrasada.
 * @param deMateriales La cuenta de cada material activo.
 * @param abiertas Las órdenes en camino.
 */
function contarPastilla(
	deMateriales: readonly CuentaDeMaterial[],
	abiertas: readonly OrdenResumida[],
): ConteoDePastilla {
	const sinTiempo = deMateriales.filter((uno) => uno.estado === "sin_tiempo_de_entrega").length;
	const estaSemana = deMateriales.filter((uno) => uno.estado === "pedir_esta_semana").length;
	const atrasadas = abiertas.filter((orden) => orden.diasAtraso > 0).length;
	return { conteo: sinTiempo + estaSemana + atrasadas, rojo: sinTiempo > 0 || atrasadas > 0 };
}

/**
 * Los renglones de los materiales que hay que pedir.
 * @param cuentasDeMateriales La cuenta de cada material activo.
 * @param datos Por material, su nombre, su unidad y su proveedor habitual.
 * @param hoy Hoy.
 */
function renglonesDeMateriales(
	cuentasDeMateriales: readonly CuentaDeMaterial[],
	datos: ReadonlyMap<string, { nombre: string; unidad: string; proveedor: string }>,
	hoy: string,
): Renglon[] {
	return cuentasDeMateriales.flatMap((cuenta) => {
		const material = datos.get(cuenta.material_id);
		if (cuenta.estado === "alcanza" || material === undefined) return [];
		const sinTiempo = cuenta.estado === "sin_tiempo_de_entrega";
		return [
			{
				clave: `material:${cuenta.material_id}`,
				grupo: "materiales",
				tipo: "material",
				referencia: material.nombre,
				detalle: sinTiempo ? material.proveedor : `${material.proveedor} · ${cuenta.linea}`,
				fecha: sinTiempo ? hoy : (cuenta.fecha_limite ?? hoy),
				fecha_roja: false,
				cifra: cantidadConUnidad(cuenta.por_pedir, material.unidad),
				estado: sinTiempo ? estadoEnSuLinea(cuenta) : { texto: "Pedir esta semana", color: "ambar", abajo: null },
				abre: { cajon: "material", id: cuenta.material_id },
			},
		];
	});
}

/**
 * Los renglones de las órdenes atrasadas o que llegan esta semana.
 * @param ordenes Las órdenes en camino.
 * @param hoy Hoy.
 */
function renglonesDeOrdenes(ordenes: readonly OrdenResumida[], hoy: Temporal.PlainDate): Renglon[] {
	return ordenes.flatMap((orden) => {
		const faltan = diasParaLlegar(orden, hoy);
		if (orden.diasAtraso === 0 && (faltan === null || faltan > diasDeLaSemana)) return [];
		return [
			{
				clave: `orden:${orden.id}`,
				grupo: "ordenes",
				tipo: "orden",
				referencia: `${orden.folio} · ${orden.proveedor}`,
				detalle: plural(orden.lineas.length, "material", "materiales"),
				fecha: orden.fechaPrometida,
				fecha_roja: orden.diasAtraso > 0,
				cifra: enPesos(orden.totalCentavos),
				estado:
					orden.diasAtraso > 0
						? { texto: `Atrasada ${plural(orden.diasAtraso, "día", "días")}`, color: "rojo", abajo: null }
						: { texto: "Llega esta semana", color: "azul", abajo: null },
				abre: { cajon: "orden", id: orden.id },
			},
		];
	});
}

/**
 * Los renglones de las facturas: las que no cuadran y las que no han llegado.
 * @param conciliacion Los renglones de la conciliación.
 */
function renglonesDeFacturas(conciliacion: readonly RenglonDeConciliacion[]): Renglon[] {
	return conciliacion.map((renglon) => ({
		clave: `factura:${renglon.clave}`,
		grupo: "facturas",
		tipo: "factura",
		referencia:
			renglon.factura === null
				? `Esperando factura · ${renglon.proveedor}`
				: `${renglon.factura} · ${renglon.proveedor}`,
		detalle: `${renglon.orden} · ${renglon.que_no_cuadra}`,
		fecha: null,
		fecha_roja: false,
		cifra: null,
		estado:
			renglon.factura === null
				? { texto: "Esperando factura", color: "ambar", abajo: null }
				: { texto: "No cuadra", color: "ambar", abajo: null },
		abre: { cajon: "conciliacion", id: null },
	}));
}

/**
 * Lee todo lo de Pendientes.
 * @param accion El contexto de la lectura.
 */
async function leerPendientes(accion: ContextoDeAccion): Promise<Omit<Resultado, "renglones"> & { todos: Renglon[] }> {
	const hoy = accion.diaDeNegocio;
	const deMateriales = Object.values(await cuentas(accion));
	const datos = new Map((await datosDeMateriales(accion, {})).map((material) => [material.id, material]));
	const ordenes = await ordenesResumidas(accion, { estados: [...enCamino, "borrador"] });
	const abiertas = ordenes.filter((orden) => enCamino.includes(orden.estado));
	const conciliacion = await renglonesDeConciliacion(accion);
	const activos = await accion.transaccion
		.select({ id: proveedores.id, diasDiceTardar: proveedores.diasDiceTardar })
		.from(proveedores)
		.where(isNull(proveedores.bajaEn));
	const plazos = await plazosReales(accion, activos);
	const fueraDePlazo = [...plazos.values()].filter((plazo) => plazo.fueraDePlazo).length;
	const cuantos = (estado: CuentaDeMaterial["estado"]) => deMateriales.filter((uno) => uno.estado === estado).length;
	const sinTiempo = cuantos("sin_tiempo_de_entrega");
	const estaSemana = cuantos("pedir_esta_semana");
	const atrasadas = abiertas.filter((orden) => orden.diasAtraso > 0).length;
	const borradores = ordenes.length - abiertas.length;
	const bajoMinimo = deMateriales.filter((uno) => uno.bajo_minimo).length;
	const todos = [
		...renglonesDeMateriales(deMateriales, datos, hoy.toString()),
		...renglonesDeOrdenes(abiertas, hoy),
		...renglonesDeFacturas(conciliacion),
	];
	const delGrupo = (grupo: Renglon["grupo"]) => todos.filter((renglon) => renglon.grupo === grupo).length;
	return {
		todos,
		indicadores: {
			por_pedir: {
				sin_tiempo: sinTiempo,
				esta_semana: estaSemana,
				suficiente: cuantos("alcanza"),
				// En rojo con algo sin tiempo de entrega; si no, el de su contexto (ámbar si hay por pedir esta semana).
				tono: sinTiempo > 0 ? ("rojo" as const) : null,
				contexto: [
					...(estaSemana > 0 ? [{ texto: `${estaSemana} por pedir esta semana`, tono: "ambar" as const }] : []),
					...(sinTiempo === 0 && estaSemana === 0 ? [{ texto: "Existencia suficiente", tono: "normal" as const }] : []),
				],
			},
			ordenes: {
				en_camino: abiertas.length,
				por_semana: [0, 1, 2, 3].map(
					(semana) =>
						abiertas.filter((orden) => {
							const faltan = diasParaLlegar(orden, hoy);
							return faltan !== null && faltan >= semana * 7 && faltan < semana * 7 + 7;
						}).length,
				),
				contexto: [
					...(atrasadas > 0 ? [{ texto: plural(atrasadas, "atrasada", "atrasadas"), tono: "rojo" as const }] : []),
					...(borradores > 0 ? [{ texto: `${borradores} en borrador`, tono: "normal" as const }] : []),
				],
			},
			materiales: {
				activos: deMateriales.length,
				contexto: [
					bajoMinimo > 0
						? { texto: `${bajoMinimo} bajo mínimo`, tono: "ambar" }
						: { texto: "Todos sobre su mínimo", tono: "normal" },
				],
			},
			proveedores: {
				activos: activos.length,
				contexto: [
					fueraDePlazo > 0
						? {
								texto: `${fueraDePlazo} ${fueraDePlazo === 1 ? "entrega" : "entregan"} fuera de plazo`,
								tono: "ambar",
							}
						: { texto: "Entregas en plazo", tono: "normal" },
				],
			},
			facturas: {
				sin_conciliar: conciliacion.length,
				// Las que no cuadran van en ámbar: las resuelve Contaduría.
				tono: conciliacion.length > 0 ? ("ambar" as const) : null,
				contexto: [
					conciliacion.length > 0
						? { texto: "Responsable: Contaduría", tono: "normal" }
						: { texto: "Todas concilian", tono: "normal" },
				],
			},
		},
		conteos: {
			todos: todos.length,
			materiales: delGrupo("materiales"),
			ordenes: delGrupo("ordenes"),
			facturas: delGrupo("facturas"),
		},
		pastilla: contarPastilla(deMateriales, abiertas),
	};
}

export const consultaPendientesDeCompras = implementarConsulta(pendientesDeCompras, async (contexto, parametros) => {
	const { todos, ...resto } = await contexto.comoAccion(leerPendientes);
	const grupo = parametros.grupo ?? "todos";
	return {
		resultado: { ...resto, renglones: grupo === "todos" ? todos : todos.filter((renglon) => renglon.grupo === grupo) },
	};
});

/**
 * La pastilla de Compras en el menú (ver `contarPastilla`).
 * @param contexto El contexto de quien pregunta.
 */
export async function pastillaCompras(contexto: ContextoDeConsulta): Promise<ConteoDePastilla> {
	return contexto.comoAccion(async (accion) => {
		const deMateriales = Object.values(await cuentas(accion));
		return contarPastilla(deMateriales, await ordenesResumidas(accion, { estados: enCamino }));
	});
}
