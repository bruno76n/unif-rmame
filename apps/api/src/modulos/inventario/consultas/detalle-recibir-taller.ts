/**
 * `inventario.detalle_recibir_taller`: el cajón Recibir del taller. El lote, su prenda, a dónde va («{destino} y
 * Bodega» si parte va a Bodega) y las tallas que revisó Calidad, con «Parte va a bodega» en las que la llevan. Lo que
 * aprobó Calidad nunca viaja: el conteo es a ciegas.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Cajones»: Recibir del taller) y
 * docs/modulos/inventario/recepcion-del-taller.md (reglas 3 y 4)
 */

import { detalleRecibirTaller } from "@uniformame/compartido/contratos/inventario/aduana-cajones";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { destinoDelLote } from "./aduana-comun.ts";

/** Lo que regresa `calidad.aprobadas_del_lote`, en lo único que se usa aquí: qué tallas revisó. */
const tallasRevisadas = z
	.object({ tallas: z.array(z.object({ variante_id: z.uuid() }).passthrough()) })
	.passthrough()
	.nullable();

export const consultaDetalleRecibirTaller = implementarConsulta(detalleRecibirTaller, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const { lote, vaA } = await destinoDelLote(accion, parametros.lote_id);
		const revisadas = tallasRevisadas.parse(
			await accion.lectura("calidad.aprobadas_del_lote", { lote_id: lote.lote_id }),
		);
		const ids = (revisadas?.tallas ?? []).map((talla) => sql`${talla.variante_id}::uuid`);
		const { rows } =
			ids.length === 0
				? { rows: [] }
				: await accion.transaccion.execute(sql`
				SELECT v.id AS variante_id, t.nombre AS talla FROM variantes v JOIN tallas t ON t.id = v.talla_id
				WHERE v.id IN (${sql.join(ids, sql`, `)}) ORDER BY t.orden`);
		const tallas = z.array(z.object({ variante_id: z.uuid(), talla: z.string() })).parse(rows);
		return {
			lote_id: lote.lote_id,
			folio: lote.folio,
			prenda: lote.prenda,
			va_a: vaA,
			recibido: lote.estado === "en_aduana",
			tallas: tallas.map((talla) => ({
				...talla,
				parte_a_bodega:
					lote.destino === "pedido" &&
					(lote.tallas.find((suya) => suya.variante_id === talla.variante_id)?.piezas_a_bodega ?? 0) > 0,
			})),
		};
	}),
}));
