/**
 * `produccion.crear_orden`: Producción levanta una orden de temporada (para Bodega) o de reabasto (para una tienda),
 * con su lote por cortar.
 * Fase 12 · docs/modulos/produccion/ordenes-de-produccion.md (reglas 1, 4 y 5, «`produccion.crear_orden`»)
 * Fase 14 · `produccion.levantar_orden_sugerencia`, con las sugerencias de Bodega (reglas 1 y 3)
 *
 * La fecha de corte es la menor entre hoy + `produccion.orden_corte_dias` y la entrega. Las tallas en 0 no se guardan.
 * Al nacer el lote se recalculan los rollos sugeridos (regla 8).
 */

import { crearOrden, levantarOrdenSugerencia } from "@uniformame/compartido/contratos/produccion/ordenes";
import { eq } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { ErrorDeApi, errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { avisoSinReceta, nuevaOrden, nuevoLote, prendaQueSeFabrica, tallasQueSeFabrican } from "../dominio/lotes.ts";

/**
 * La fecha de corte de una orden de temporada o de reabasto: la menor entre hoy + `produccion.orden_corte_dias` y la
 * entrega (regla 1).
 */
async function fechaDeCorte(contexto: ContextoDeAccion, entrega: Temporal.PlainDate): Promise<string> {
	const dias = Number(await contexto.lectura("admin.parametro", { clave: "produccion.orden_corte_dias" }));
	const corte = contexto.diaDeNegocio.add({ days: dias });
	return (Temporal.PlainDate.compare(corte, entrega) < 0 ? corte : entrega).toString();
}

export const accionCrearOrden = implementarAccion(crearOrden, async (contexto, datos) => {
	const { transaccion } = contexto;
	const [destino] = await transaccion
		.select({ id: ubicaciones.id, tipo: ubicaciones.tipo, nombre: ubicaciones.nombre })
		.from(ubicaciones)
		.where(eq(ubicaciones.id, datos.ubicacion_destino_id));
	if (destino === undefined || (destino.tipo !== "bodega" && destino.tipo !== "tienda")) {
		throw errorDeRegla("destino_no_valido", "Escoge para quién es: temporada o una tienda.");
	}
	const hoy = contexto.diaDeNegocio;
	const entrega = Temporal.PlainDate.from(datos.fecha_entrega);
	if (Temporal.PlainDate.compare(entrega, hoy) < 0) {
		throw errorDeRegla("fecha_pasada", "La fecha no puede ser antes de hoy.");
	}
	const prenda = await prendaQueSeFabrica(contexto, datos.producto_id);
	const tallas = await tallasQueSeFabrican(
		contexto,
		prenda,
		datos.tallas.map((talla) => ({ varianteId: talla.variante_id, piezas: talla.piezas })),
	);
	if (tallas.length === 0) throw errorDeCampo("tallas", "Pon las piezas por talla.");
	const esTemporada = destino.tipo === "bodega";
	const orden = await nuevaOrden(contexto, {
		motivo: esTemporada ? "temporada" : "reabasto",
		ubicacionDestinoId: destino.id,
		...(datos.motivo === undefined || datos.motivo === "" ? {} : { referencia: datos.motivo }),
		fechaEntrega: entrega.toString(),
	});
	const lote = await nuevoLote(contexto, {
		ordenProduccionId: orden.id,
		productoId: prenda.id,
		destino: esTemporada ? "temporada" : "tienda",
		ubicacionDestinoId: destino.id,
		fechaCorte: await fechaDeCorte(contexto, entrega),
		fechaEntrega: entrega.toString(),
		tallas,
	});
	await contexto.interna("inventario.recalcular_rollos_sugeridos", {});
	const piezas = tallas.reduce((suma, talla) => suma + talla.piezas, 0);
	contexto.bitacora({
		descripcion: `Levantó ${orden.folio} para ${esTemporada ? "temporada" : destino.nombre}: ${prenda.nombre}, ${piezas} piezas`,
		entidad: "ordenes_produccion",
		entidadId: orden.id,
		entidadFolio: orden.folio,
		despues: {
			orden_produccion_id: orden.id,
			lote_id: lote.id,
			lote: lote.folio,
			tallas: tallas.map((talla) => ({ variante_id: talla.varianteId, piezas: talla.piezas })),
		},
	});
	return {
		resultado: {
			orden_produccion_id: orden.id,
			folio: orden.folio,
			lote_id: lote.id,
			lote_folio: lote.folio,
			mensaje: `${orden.folio} levantada: ${lote.folio}, ${piezas} piezas por cortar${prenda.tieneReceta ? "" : `. ${avisoSinReceta}`}`,
		},
		entidad: { nombre: "ordenes_produccion", id: orden.id },
	};
});

/** Lo que regresa `inventario.sugerencias_de_fabricar`, en lo que usa Producción. */
const sugerenciasDeFabricar = z.object({
	sugerencias: z.array(
		z
			.object({
				sugerencia_id: z.uuid(),
				variante_id: z.uuid(),
				producto_id: z.uuid(),
				ubicacion_id: z.uuid(),
				ubicacion: z.string(),
				tipo_ubicacion: z.string(),
				piezas: z.number().int(),
				estado: z.string(),
				orden: z.string().nullable(),
			})
			.passthrough(),
	),
});

/**
 * `produccion.levantar_orden_sugerencia`: junta las sugerencias por decidir de una prenda y una ubicación, redondea
 * cada talla hacia arriba al múltiplo de `produccion.orden_multiplo_piezas` y levanta la orden (`reabasto` para una
 * tienda, `temporada` para Bodega) con su lote por cortar. Las sugerencias quedan levantadas con
 * `inventario.decidir_sugerencia`, que las toma en orden: dos a la vez no levantan la misma.
 * Fase 14 · docs/modulos/produccion/ordenes-de-produccion.md (reglas 1 y 3, «`produccion.levantar_orden_sugerencia`»)
 */
export const accionLevantarOrdenSugerencia = implementarAccion(levantarOrdenSugerencia, async (contexto, datos) => {
	const { sugerencias } = sugerenciasDeFabricar.parse(
		await contexto.lectura("inventario.sugerencias_de_fabricar", { sugerencia_ids: datos.sugerencia_ids }),
	);
	const levantada = sugerencias.find((sugerencia) => sugerencia.estado !== "por_decidir");
	if (levantada !== undefined) {
		throw errorDeRegla("sugerencia_ya_decidida", `Esa sugerencia ya se levantó: ${levantada.orden ?? "otra orden"}.`);
	}
	const [primera] = sugerencias;
	if (
		primera === undefined ||
		sugerencias.length !== new Set(datos.sugerencia_ids).size ||
		sugerencias.some(
			(sugerencia) =>
				sugerencia.producto_id !== primera.producto_id || sugerencia.ubicacion_id !== primera.ubicacion_id,
		)
	) {
		throw new ErrorDeApi(
			"validacion",
			"sugerencias_mezcladas",
			"Las sugerencias deben ser de una prenda y una ubicación.",
			{ campos: { sugerencia_ids: "Las sugerencias deben ser de una prenda y una ubicación." } },
		);
	}
	// Por talla, la suma redondeada hacia arriba al múltiplo (regla 3).
	const multiplo = Number(await contexto.lectura("admin.parametro", { clave: "produccion.orden_multiplo_piezas" }));
	const porTalla = new Map<string, number>();
	for (const sugerencia of sugerencias) {
		porTalla.set(sugerencia.variante_id, (porTalla.get(sugerencia.variante_id) ?? 0) + sugerencia.piezas);
	}
	const prenda = await prendaQueSeFabrica(contexto, primera.producto_id);
	const tallas = await tallasQueSeFabrican(
		contexto,
		prenda,
		[...porTalla].map(([varianteId, piezas]) => ({ varianteId, piezas: Math.ceil(piezas / multiplo) * multiplo })),
	);
	const esTemporada = primera.tipo_ubicacion === "bodega";
	const dias = Number(
		await contexto.lectura("admin.parametro", {
			clave: esTemporada ? "produccion.orden_entrega_temporada_dias" : "produccion.orden_entrega_tienda_dias",
		}),
	);
	const entrega = contexto.diaDeNegocio.add({ days: dias });
	const orden = await nuevaOrden(contexto, {
		motivo: esTemporada ? "temporada" : "reabasto",
		ubicacionDestinoId: primera.ubicacion_id,
		referencia: "Sugerencia de bodega",
		fechaEntrega: entrega.toString(),
	});
	const lote = await nuevoLote(contexto, {
		ordenProduccionId: orden.id,
		productoId: prenda.id,
		destino: esTemporada ? "temporada" : "tienda",
		ubicacionDestinoId: primera.ubicacion_id,
		fechaCorte: await fechaDeCorte(contexto, entrega),
		fechaEntrega: entrega.toString(),
		tallas,
	});
	await contexto.interna("inventario.decidir_sugerencia", {
		sugerencia_ids: datos.sugerencia_ids,
		orden_produccion_id: orden.id,
		lote_id: lote.id,
	});
	await contexto.interna("inventario.recalcular_rollos_sugeridos", {});
	const piezas = tallas.reduce((suma, talla) => suma + talla.piezas, 0);
	contexto.bitacora({
		descripcion: `Levantó ${orden.folio} desde la sugerencia de Bodega: ${primera.ubicacion}, ${prenda.nombre}, ${piezas} piezas`,
		entidad: "ordenes_produccion",
		entidadId: orden.id,
		entidadFolio: orden.folio,
		despues: {
			sugerencias: datos.sugerencia_ids,
			lote: lote.folio,
			tallas: tallas.map((talla) => ({ variante_id: talla.varianteId, piezas: talla.piezas })),
		},
	});
	return {
		resultado: {
			orden_produccion_id: orden.id,
			folio: orden.folio,
			lote_id: lote.id,
			lote_folio: lote.folio,
			mensaje: `${orden.folio} levantada: ${lote.folio}, ${piezas} piezas por cortar${prenda.tieneReceta ? "" : `. ${avisoSinReceta}`}`,
		},
		avisos: prenda.tieneReceta ? [] : [avisoSinReceta],
		entidad: { nombre: "ordenes_produccion", id: orden.id },
	};
});
