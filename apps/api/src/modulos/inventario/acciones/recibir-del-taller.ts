/**
 * `inventario.recibir_del_taller` e `inventario.recibir_reproceso`: Aduana recibe a ciegas un lote revisado o un
 * reproceso aprobado. Lo aprobado viaja solo al servidor: ni la respuesta ni un error lo dicen.
 * Fase 14 · docs/modulos/inventario/recepcion-del-taller.md (reglas 1 a 3, «Acciones»)
 *
 * Cada uno toma primero el candado de lo que recibe: dos recepciones del mismo lote o del mismo reproceso van una tras
 * otra, y la segunda ve que ya se recibió. Todo lo escribe `inventario.registrar_entrada_del_taller`.
 */

import { recibirDelTaller, recibirReproceso } from "@uniformame/compartido/contratos/inventario/taller";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { leerLoteParaAduana } from "../dominio/taller.ts";
import { entradaRegistrada } from "../internas/entrada-del-taller.ts";
import { recepciones } from "../tablas.ts";

/** Lo que regresa `calidad.aprobadas_del_lote`, en lo que usa Aduana. */
const aprobadasDelLote = z
	.object({
		revision_id: z.uuid(),
		tallas: z.array(z.object({ variante_id: z.uuid(), piezas_aprobadas: z.number() })),
	})
	.passthrough()
	.nullable();

/** Lo que regresa `calidad.reproceso_para_aduana`. */
const reprocesoParaAduana = z
	.object({
		reproceso_id: z.uuid(),
		folio: z.string(),
		lote_id: z.uuid(),
		variante_id: z.uuid(),
		estado: z.string(),
		piezas_aprobadas: z.number().nullable(),
	})
	.nullable();

/** Toma el candado de lo que se recibe del taller, hasta que termine la transacción. */
async function candadoDeLaEntrada(contexto: ContextoDeAccion, llave: string): Promise<void> {
	await contexto.transaccion.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`entrada_taller:${llave}`}, 0))`,
	);
}

/** El mensaje: cuántas para quién y, si no cuadró con lo aprobado, cuántas faltaron o sobraron. */
function mensajeDeEntrada(folio: string, entrada: z.infer<typeof entradaRegistrada>): string {
	const partes = [`${folio} en aduana: ${entrada.piezas} piezas para ${entrada.destino}`];
	if (entrada.faltaron > 0) {
		partes.push(`Faltaron ${entrada.faltaron} contra lo que aprobó calidad: queda por aclarar a cargo del taller`);
	}
	if (entrada.sobraron > 0) {
		partes.push(`Sobraron ${entrada.sobraron} contra lo que aprobó calidad: queda por aclarar a cargo del taller`);
	}
	return partes.join(". ");
}

export const accionRecibirDelTaller = implementarAccion(recibirDelTaller, async (contexto, datos) => {
	await candadoDeLaEntrada(contexto, datos.lote_id);
	const lote = await leerLoteParaAduana(contexto, datos.lote_id);
	if (lote.estado === "en_aduana") throw errorDeRegla("lote_ya_recibido", `${lote.folio} ya se recibió en aduana.`);
	if (lote.estado !== "revisado") {
		throw errorDeRegla("lote_no_revisado", `${lote.folio} todavía no lo revisa Calidad.`);
	}
	const revision = aprobadasDelLote.parse(
		await contexto.lectura("calidad.aprobadas_del_lote", { lote_id: lote.lote_id }),
	);
	if (revision === null) throw new Error(`${lote.folio} revisado sin revisión`);
	// Cada talla que revisó Calidad, una vez, aunque sea 0; ninguna otra.
	const contadas = new Map(datos.tallas.map((talla) => [talla.variante_id, talla.piezas]));
	const delLote = new Set(revision.tallas.map((talla) => talla.variante_id));
	if (
		contadas.size !== datos.tallas.length ||
		revision.tallas.some((talla) => !contadas.has(talla.variante_id)) ||
		datos.tallas.some((talla) => !delLote.has(talla.variante_id))
	) {
		throw errorDeCampo("tallas", "Cuenta esta talla, aunque sea 0");
	}
	const entrada = entradaRegistrada.parse(
		await contexto.interna("inventario.registrar_entrada_del_taller", {
			origen: "lote",
			lote_id: lote.lote_id,
			revision_id: revision.revision_id,
			folio: lote.folio,
			tallas: revision.tallas.map((talla) => ({
				variante_id: talla.variante_id,
				aprobadas: talla.piezas_aprobadas,
				contadas: contadas.get(talla.variante_id) ?? 0,
			})),
		}),
	);
	await contexto.interna("produccion.marcar_lote_en_aduana", {
		lote_id: lote.lote_id,
		recepcion_id: entrada.recepcion_id,
	});
	contexto.bitacora({
		descripcion: `Recibió ${lote.folio}`,
		entidad: "recepciones",
		entidadId: entrada.recepcion_id,
		entidadFolio: lote.folio,
		despues: {
			tallas: datos.tallas,
			destino: entrada.destino,
			traspasos: entrada.traspasos.map((traspaso) => traspaso.folio),
			diferencias: entrada.diferencias.map((diferencia) => diferencia.folio),
		},
	});
	return {
		resultado: {
			mensaje: mensajeDeEntrada(lote.folio, entrada),
			recepcion_id: entrada.recepcion_id,
			traspaso_ids: entrada.traspasos.map((traspaso) => traspaso.traspaso_id),
		},
		entidad: { nombre: "recepciones", id: entrada.recepcion_id },
	};
});

export const accionRecibirReproceso = implementarAccion(recibirReproceso, async (contexto, datos) => {
	await candadoDeLaEntrada(contexto, datos.reproceso_id);
	const reproceso = reprocesoParaAduana.parse(
		await contexto.lectura("calidad.reproceso_para_aduana", { reproceso_id: datos.reproceso_id }),
	);
	if (reproceso === null) throw noExiste();
	const [yaRecibido] = await contexto.transaccion
		.select({ id: recepciones.id })
		.from(recepciones)
		.where(and(eq(recepciones.tipo, "aduana_del_taller"), eq(recepciones.reprocesoId, reproceso.reproceso_id)));
	if (yaRecibido !== undefined) throw errorDeRegla("reproceso_ya_recibido", `${reproceso.folio} ya se recibió.`);
	if (reproceso.estado !== "listo" || reproceso.piezas_aprobadas === null) {
		throw errorDeRegla("reproceso_no_listo", `${reproceso.folio} todavía no lo aprueba Calidad.`);
	}
	const entrada = entradaRegistrada.parse(
		await contexto.interna("inventario.registrar_entrada_del_taller", {
			origen: "reproceso",
			lote_id: reproceso.lote_id,
			reproceso_id: reproceso.reproceso_id,
			folio: reproceso.folio,
			tallas: [{ variante_id: reproceso.variante_id, aprobadas: reproceso.piezas_aprobadas, contadas: datos.piezas }],
		}),
	);
	contexto.bitacora({
		descripcion: `Recibió ${reproceso.folio}`,
		entidad: "recepciones",
		entidadId: entrada.recepcion_id,
		entidadFolio: reproceso.folio,
		despues: {
			piezas: datos.piezas,
			destino: entrada.destino,
			diferencias: entrada.diferencias.map((diferencia) => diferencia.folio),
		},
	});
	return {
		resultado: {
			mensaje: mensajeDeEntrada(reproceso.folio, entrada),
			recepcion_id: entrada.recepcion_id,
			traspaso_ids: entrada.traspasos.map((traspaso) => traspaso.traspaso_id),
		},
		entidad: { nombre: "recepciones", id: entrada.recepcion_id },
	};
});
