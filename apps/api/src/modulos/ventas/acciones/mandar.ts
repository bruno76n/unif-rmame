/**
 * `ventas.mandar_a_produccion` y `ventas.surtir_de_bodega`: la revisión antes de fabricar. Primero se aparta en Bodega
 * lo libre; lo que falta va a los lotes del pedido, con los avisos de receta y de material que no detienen nada.
 * Fase 16 · docs/modulos/ventas/mandar-a-produccion.md (reglas 1 a 6, «Acciones»)
 *
 * Nada se escribe en las tablas de Ventas: lo mandado se lee de los lotes del pedido y lo de Bodega, de sus reservas.
 * Las dos toman la versión del pedido (la suben) para que dos revisiones a la vez no manden de más.
 */

import { mandarAProduccion, surtirDeBodega } from "@uniformame/compartido/contratos/ventas/mandar";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { nombreDeCuenta, quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { variantes } from "../../catalogo/tablas.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { lotes } from "../../produccion/tablas.ts";
import { avanceDeLasTallas } from "../dominio/avance-de-pedido.ts";
import { leerPedido, renglonesVigentes, variantesParaVender } from "../dominio/pedidos.ts";
import { pedidos, pedidoVersiones } from "../tablas.ts";

/**
 * Lee y bloquea un pedido confirmado, toma su versión y calcula lo que falta por mandar de cada talla.
 * @throws `422 pedido_no_confirmado`.
 */
async function pedidoParaMandar(contexto: ContextoDeAccion, pedidoId: string, version: number | undefined) {
	const pedido = await leerPedido(contexto.transaccion, pedidoId, true);
	await tomarVersion(contexto, pedidos, pedido.id, version, async () => ({
		pedido_id: pedido.id,
		folio: pedido.folio,
		estado: pedido.estado,
	}));
	if (pedido.estado !== "confirmado") {
		throw errorDeRegla(
			"pedido_no_confirmado",
			`${pedido.folio} está ${pedido.estado}: solo un pedido confirmado se manda a producción.`,
		);
	}
	const avance = await avanceDeLasTallas(contexto, pedido.id, await renglonesVigentes(contexto.transaccion, pedido.id));
	return { pedido, porMandar: new Map(avance.map((talla) => [talla.varianteId, talla.porMandar])) };
}

/**
 * Revisa que ninguna talla pase de lo que falta por mandar (regla 3).
 * @throws `422 piezas_de_mas_por_mandar`.
 */
async function revisarPorMandar(
	contexto: ContextoDeAccion,
	renglones: readonly { variante_id: string; piezas: number }[],
	porMandar: ReadonlyMap<string, number>,
) {
	const leidas = await variantesParaVender(
		contexto.transaccion,
		renglones.map((renglon) => renglon.variante_id),
	);
	for (const renglon of renglones) {
		const falta = porMandar.get(renglon.variante_id) ?? 0;
		if (renglon.piezas > falta) {
			const variante = leidas.get(renglon.variante_id);
			throw errorDeRegla(
				"piezas_de_mas_por_mandar",
				`${variante?.prenda ?? "La prenda"} talla ${variante?.talla ?? ""}: solo faltan ${falta} por mandar.`,
			);
		}
	}
	return leidas;
}

/** Lo que regresa `produccion.mandar_a_produccion`. */
const mandado = z.object({
	orden_produccion_id: z.uuid().optional(),
	folio: z.string().optional(),
	lotes: z.array(z.object({ lote_id: z.uuid(), folio: z.string(), nuevo: z.boolean(), piezas: z.number() })),
	avisos: z.array(z.string()),
});

/** Lo que regresa `compras.cuenta_material`: lo que se usa para los avisos. */
const cuentaMaterial = z.record(
	z.string(),
	z
		.object({
			libre_en_la_cuenta: z.string(),
			libre_para_corte: z.string(),
			comprometido_por_lote: z.array(z.object({ lote_id: z.string() })),
			en_camino: z.array(z.object({ llegada_esperada: z.string() })),
		})
		.passthrough(),
);

/**
 * Los avisos de material de unos lotes (regla 4), con la misma cuenta que usa Compras: falta material, o parte llega
 * después de su fecha de corte.
 * @param contexto El contexto de la acción.
 * @param loteIds Los lotes que se tocaron.
 */
async function avisosDeMaterial(contexto: ContextoDeAccion, loteIds: readonly string[]): Promise<string[]> {
	if (loteIds.length === 0) return [];
	const cortes = await contexto.transaccion
		.select({ id: lotes.id, fechaCorte: lotes.fechaCorte })
		.from(lotes)
		.where(inArray(lotes.id, [...loteIds]));
	const primerCorte = cortes.map((lote) => lote.fechaCorte).sort()[0] ?? "";
	const cuentas = Object.values(cuentaMaterial.parse(await contexto.lectura("compras.cuenta_material", {})));
	const suyas = cuentas.filter((cuenta) =>
		cuenta.comprometido_por_lote.some((comprometido) => loteIds.includes(comprometido.lote_id)),
	);
	if (suyas.some((cuenta) => Number(cuenta.libre_en_la_cuenta) < 0)) {
		return ["Falta material: el corte no puede empezar hasta que Compras lo consiga"];
	}
	const tarde = suyas.some(
		(cuenta) =>
			Number(cuenta.libre_para_corte) < 0 && cuenta.en_camino.some((llega) => llega.llegada_esperada > primerCorte),
	);
	return tarde ? ["Parte del material llega después de la fecha de corte"] : [];
}

export const accionMandarAProduccion = implementarAccion(mandarAProduccion, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const { pedido, porMandar } = await pedidoParaMandar(contexto, datos.pedido_id, version);
	const renglones =
		datos.renglones ??
		[...porMandar.entries()]
			.filter(([, piezas]) => piezas > 0)
			.map(([variante_id, piezas]) => ({ variante_id, piezas }));
	if (renglones.length === 0) throw errorDeRegla("nada_por_mandar", "Todo el pedido ya está en producción.");
	const leidas = await revisarPorMandar(contexto, renglones, porMandar);
	for (const renglon of renglones) {
		const variante = leidas.get(renglon.variante_id);
		if (variante?.descontinuada === true) {
			throw errorDeRegla(
				"talla_descontinuada",
				`${variante.prenda} talla ${variante.talla} está descontinuada: ya no se fabrica.`,
			);
		}
	}
	const [suVersion] = await transaccion
		.select({ id: pedidoVersiones.id })
		.from(pedidoVersiones)
		.where(and(eq(pedidoVersiones.pedidoId, pedido.id), eq(pedidoVersiones.numero, pedido.versionVigente)));
	const enProduccion = mandado.parse(
		await contexto.interna("produccion.mandar_a_produccion", {
			pedido_id: pedido.id,
			pedido_version_id: suVersion?.id,
			fecha_entrega: pedido.fechaEntrega,
			renglones,
		}),
	);
	const piezas = renglones.reduce((total, renglon) => total + renglon.piezas, 0);
	const quien = await nombreDeCuenta(contexto, quienCambia(contexto));
	const sumados = enProduccion.lotes.filter((lote) => !lote.nuevo);
	const nuevos = enProduccion.lotes.filter((lote) => lote.nuevo);
	for (const lote of enProduccion.lotes) {
		contexto.bitacora({
			descripcion: `${quien} mandó a producción ${lote.piezas} piezas a ${lote.folio}`,
			entidad: "pedidos",
			entidadId: pedido.id,
			entidadFolio: pedido.folio,
			despues: { lote_id: lote.lote_id, renglones },
		});
	}
	if (enProduccion.folio !== undefined) {
		contexto.bitacora({
			descripcion: `Producción abrió ${enProduccion.folio}: ${nuevos.map((lote) => lote.folio).join(", ")}`,
			entidad: "pedidos",
			entidadId: pedido.id,
			entidadFolio: pedido.folio,
		});
	}
	contexto.guardarEvento({
		tipo: "pedido.mandado_a_produccion",
		datos: { pedido_id: pedido.id },
		tablas: ["pedidos"],
		entidad: "pedidos",
		entidadId: pedido.id,
		entidadFolio: pedido.folio,
	});
	const detalle = [
		...(sumados.length > 0
			? [`se suman a ${sumados.map((lote) => lote.folio).join(", ")}, que todavía no se corta`]
			: []),
		...(enProduccion.folio !== undefined
			? [`${enProduccion.folio} con el lote ${nuevos.map((lote) => lote.folio).join(", ")}`]
			: []),
	].join(" y ");
	return {
		resultado: {
			mensaje: `${pedido.folio}: ${piezas} piezas a producción: ${detalle}`,
			piezas,
			...(enProduccion.orden_produccion_id === undefined
				? {}
				: { orden_produccion_id: enProduccion.orden_produccion_id }),
			lotes: enProduccion.lotes,
			version: await versionActual(transaccion, pedidos, pedido.id),
		},
		avisos: [
			...enProduccion.avisos,
			...(await avisosDeMaterial(
				contexto,
				enProduccion.lotes.map((lote) => lote.lote_id),
			)),
		],
		entidad: { nombre: "pedidos", id: pedido.id },
	};
});

export const accionSurtirDeBodega = implementarAccion(surtirDeBodega, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const { pedido, porMandar } = await pedidoParaMandar(contexto, datos.pedido_id, version);
	const [bodega] = await transaccion
		.select({ id: ubicaciones.id })
		.from(ubicaciones)
		.where(eq(ubicaciones.tipo, "bodega"));
	if (bodega === undefined) throw new Error("no está Bodega");
	const tallasDeLaPrenda = await transaccion
		.select({ id: variantes.id })
		.from(variantes)
		.where(eq(variantes.productoId, datos.producto_id));
	const libresDe = async (varianteId: string) =>
		z
			.object({ libres: z.number() })
			.parse(await contexto.lectura("inventario.libres", { ubicacion_id: bodega.id, variante_id: varianteId })).libres;
	// Sin renglones: por talla, lo menor entre lo libre y lo que falta por mandar.
	const renglones =
		datos.renglones ??
		(
			await Promise.all(
				tallasDeLaPrenda.map(async (talla) => ({
					variante_id: talla.id,
					piezas: Math.min(Math.max(0, await libresDe(talla.id)), porMandar.get(talla.id) ?? 0),
				})),
			)
		).filter((renglon) => renglon.piezas > 0);
	const leidas = await revisarPorMandar(contexto, renglones, porMandar);
	for (const renglon of renglones) {
		const libres = Math.max(0, await libresDe(renglon.variante_id));
		if (renglon.piezas > libres) {
			const variante = leidas.get(renglon.variante_id);
			throw errorDeRegla(
				"bodega_sin_libres",
				`Bodega ya no tiene libres de ${variante?.prenda ?? "la prenda"} talla ${variante?.talla ?? ""}: quedan ${libres}.`,
			);
		}
	}
	const piezas = renglones.reduce((total, renglon) => total + renglon.piezas, 0);
	if (piezas > 0) {
		await contexto.interna("inventario.reservar", {
			motivo: "pedido_externo",
			pedido_id: pedido.id,
			renglones: renglones.map((renglon) => ({ ...renglon, ubicacion_id: bodega.id })),
		});
	}
	const prenda = leidas.values().next().value?.prenda ?? "la prenda";
	const quien = await nombreDeCuenta(contexto, quienCambia(contexto));
	contexto.guardarEvento({
		tipo: "pedido.surtido_de_bodega",
		datos: { pedido_id: pedido.id },
		tablas: ["pedidos", "reservas"],
		entidad: "pedidos",
		entidadId: pedido.id,
		entidadFolio: pedido.folio,
	});
	contexto.bitacora({
		descripcion: `${quien} apartó en bodega ${piezas} piezas de ${prenda} para ${pedido.folio}`,
		entidad: "pedidos",
		entidadId: pedido.id,
		entidadFolio: pedido.folio,
		despues: { renglones },
	});
	const quedan = [...porMandar.values()].reduce((total, falta) => total + falta, 0) - piezas;
	return {
		resultado: {
			mensaje: `${piezas} piezas se apartan en bodega para ${pedido.folio}. A producción va solo lo que falta`,
			piezas,
			por_mandar: Math.max(0, quedan),
			version: await versionActual(transaccion, pedidos, pedido.id),
		},
		entidad: { nombre: "pedidos", id: pedido.id },
	};
});
