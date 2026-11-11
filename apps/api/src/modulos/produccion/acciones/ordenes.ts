/**
 * `produccion.crear_orden`: Producción levanta una orden de temporada (para Bodega) o de reabasto (para una tienda),
 * con su lote por cortar.
 * Fase 12 · docs/modulos/produccion/ordenes-de-produccion.md (reglas 1, 4 y 5, «`produccion.crear_orden`»)
 *
 * La fecha de corte es la menor entre hoy + `produccion.orden_corte_dias` y la entrega. Las tallas en 0 no se guardan.
 * Al nacer el lote se recalculan los rollos sugeridos (regla 8).
 */

import { crearOrden } from "@uniformame/compartido/contratos/produccion/ordenes";
import { eq } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { avisoSinReceta, nuevaOrden, nuevoLote, prendaQueSeFabrica, tallasQueSeFabrican } from "../dominio/lotes.ts";

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
	const dias = Number(await contexto.lectura("admin.parametro", { clave: "produccion.orden_corte_dias" }));
	const corte = hoy.add({ days: dias });
	const lote = await nuevoLote(contexto, {
		ordenProduccionId: orden.id,
		productoId: prenda.id,
		destino: esTemporada ? "temporada" : "tienda",
		ubicacionDestinoId: destino.id,
		fechaCorte: (Temporal.PlainDate.compare(corte, entrega) < 0 ? corte : entrega).toString(),
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
