/**
 * `compras.material`: el cajón de un material. Sus cifras (libre, comprometido, mínimo y lo que hay), lo comprometido
 * lote por lote y lo que viene, sus proveedores con su plazo, su última compra y su último precio, los que todavía no
 * lo surten, sus últimos precios con su cambio y lo de «Cómo se pide».
 * Fase 19 · docs/interfaz/fabrica/compras.md («Material», «Otro proveedor para {material}») y
 * docs/modulos/compras/proveedores-y-precios.md (reglas 7 a 9, «El costo de un material»)
 */

import { aMilesimosConSigno, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { materialDeCompras } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { cambioDePrecio } from "@uniformame/compartido/contratos/compras/textos";
import { and, desc, eq, isNull, max, ne } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarConsulta } from "../../../nucleo/modulos.ts";
import { terceros } from "../../contaduria/tablas.ts";
import { plazosReales } from "../dominio/ordenes.ts";
import { costoMaterial } from "../lecturas/costo-material.ts";
import { ordenCompraLineas, ordenesCompra, preciosCompra, proveedores } from "../tablas.ts";
import {
	comprometidoConLotes,
	cuentas,
	datosDeMateriales,
	enCaminoDe,
	estadoDeMaterial,
	numeroDe,
	surtidores,
	tonoDeExistencia,
} from "./comun.ts";

/** Cuántos precios muestra «Precios · Los últimos {n}». */
const preciosQueSeMuestran = 8;

/** Cómo se dice el origen de un precio. */
const origenes: Readonly<Record<string, string>> = {
	alta: "alta",
	proveedor_agregado: "al agregar al proveedor",
	orden: "en la orden",
	nota: "según la nota",
};

/**
 * Los últimos precios del material, el más nuevo primero, con su proveedor, su orden y su cambio.
 * @param accion El contexto de la lectura.
 * @param materialId El material.
 */
async function ultimosPrecios(accion: ContextoDeAccion, materialId: string) {
	const umbral = await numeroDe(accion, "compras.umbral_cambio_precio_pct");
	const filas = await accion.transaccion
		.select({
			precio: preciosCompra.precioCentavos,
			anterior: preciosCompra.precioAnteriorCentavos,
			origen: preciosCompra.origen,
			fecha: preciosCompra.fecha,
			proveedor: terceros.nombre,
			folio: ordenesCompra.folio,
		})
		.from(preciosCompra)
		.innerJoin(proveedores, eq(proveedores.id, preciosCompra.proveedorId))
		.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
		.leftJoin(ordenesCompra, eq(ordenesCompra.id, preciosCompra.ordenCompraId))
		.where(eq(preciosCompra.materialId, materialId))
		.orderBy(desc(preciosCompra.creadoEn))
		.limit(preciosQueSeMuestran);
	return filas.map((fila) => ({
		precio_centavos: fila.precio,
		proveedor: fila.proveedor,
		folio: fila.folio,
		origen: origenes[fila.origen] ?? fila.origen,
		cambio: cambioDePrecio(fila.anterior, fila.precio, umbral),
		fecha: fila.fecha,
	}));
}

/**
 * La última compra de cada proveedor del material: el día en que se envió la orden más reciente de ese par.
 * @param accion El contexto de la lectura.
 * @param materialId El material.
 */
async function ultimasCompras(accion: ContextoDeAccion, materialId: string): Promise<Map<string, string>> {
	const filas = await accion.transaccion
		.select({ proveedorId: ordenesCompra.proveedorId, enviadaEn: max(ordenesCompra.enviadaEn) })
		.from(ordenesCompra)
		.innerJoin(ordenCompraLineas, eq(ordenCompraLineas.ordenCompraId, ordenesCompra.id))
		.where(and(eq(ordenCompraLineas.materialId, materialId), ne(ordenesCompra.estado, "cancelada")))
		.groupBy(ordenesCompra.proveedorId);
	return new Map(
		filas.flatMap((fila) =>
			fila.enviadaEn === null
				? []
				: [[fila.proveedorId, diaDeNegocio(Temporal.Instant.from(fila.enviadaEn)).toString()] as const],
		),
	);
}

export const consultaMaterial = implementarConsulta(materialDeCompras, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const [material] = await datosDeMateriales(accion, { ids: [parametros.material_id] });
		const cuenta = (await cuentas(accion, [parametros.material_id]))[parametros.material_id];
		if (material === undefined || cuenta === undefined) throw noExiste();
		const suyos = (await surtidores(accion, [material.id])).filter((par) => par.activo);
		const plazos = await plazosReales(
			accion,
			suyos.map((par) => ({ id: par.proveedorId, diasDiceTardar: par.diasDiceTardar })),
		);
		const compras = await ultimasCompras(accion, material.id);
		const otros = await accion.transaccion
			.select({ proveedor_id: proveedores.id, nombre: terceros.nombre, surte: proveedores.surte })
			.from(proveedores)
			.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
			.where(isNull(proveedores.bajaEn))
			.orderBy(terceros.nombre);
		const costo = await costoMaterial(accion, { material_ids: [material.id] });
		const surtidoresIds = suyos.map((par) => par.proveedorId);
		return {
			material: {
				material_id: material.id,
				version: material.version,
				nombre: material.nombre,
				tipo: material.tipo,
				unidad: material.unidad,
				presentacion: material.presentacion,
				color: material.color,
				estado: cuenta.estado,
				estado_armado: estadoDeMaterial(cuenta),
				linea: cuenta.linea,
				hay: deMilesimos(aMilesimosConSigno(cuenta.hay_bodega) + aMilesimosConSigno(cuenta.hay_aduana)),
				libre: cuenta.libre_para_comprar,
				comprometido: cuenta.comprometido,
				minimo: material.minimo,
				tono_existencia: tonoDeExistencia(cuenta, material.minimo),
				multiplo_compra: material.multiploCompra,
				dias_cubre: material.diasCubre,
				consumo_diario_inicial: material.consumoDiarioInicial,
				unidad_tablet: material.unidadTablet,
				factor_tablet: material.factorTablet,
				dado_de_baja: material.bajaEn !== null,
			},
			comprometido: await comprometidoConLotes(accion, cuenta),
			en_camino: enCaminoDe(cuenta),
			proveedores: suyos.map((par) => ({
				proveedor_id: par.proveedorId,
				nombre: par.nombre,
				plazo: plazos.get(par.proveedorId)?.plazo ?? par.diasDiceTardar,
				ultima_compra: compras.get(par.proveedorId) ?? null,
				ultimo_precio_centavos: par.ultimoPrecioCentavos,
				habitual: par.proveedorId === material.proveedorId,
			})),
			otros_proveedores: otros.filter((otro) => !surtidoresIds.includes(otro.proveedor_id)),
			ultimo_precio_centavos: costo[material.id] ?? null,
			precios: await ultimosPrecios(accion, material.id),
			largo_minimo_motivo: await numeroDe(accion, "general.largo_minimo_motivo"),
		};
	}),
}));
