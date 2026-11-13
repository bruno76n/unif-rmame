/**
 * `inventario.detalle_llegada_aduana`: el cajón Llegada de aduana de Bodega. Lo que trae un despacho a Bodega: su
 * folio y su versión (que pide `inventario.recibir_despacho`), cuándo salió, cuánto mandó Aduana y, por renglón, la
 * prenda y talla con sus piezas o el rollo con su partida y sus metros.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»: Llegada de aduana) y
 * docs/modulos/inventario/surtido-y-despachos.md («`inventario.recibir_despacho`»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { detalleDeLlegadaAduana } from "@uniformame/compartido/contratos/inventario/bodega-cajones";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { metrosEscritos } from "./bodega-comun.ts";

/** El despacho como sale de la base. */
const delDespacho = z.object({
	id: z.uuid(),
	folio: z.string(),
	version: z.coerce.number(),
	estado: z.string(),
	salio: z.string(),
});

/** Un renglón como sale de la base. */
const delRenglon = z.object({
	traspaso_linea_id: z.uuid(),
	prenda: z.string().nullable(),
	material: z.string().nullable(),
	rollo: z.string().nullable(),
	partida: z.string().nullable(),
	piezas: z.coerce.number().nullable(),
	cantidad: z.string().nullable(),
});

export const consultaDetalleDeLlegadaAduana = implementarConsulta(
	detalleDeLlegadaAduana,
	async (contexto, parametros) => ({
		resultado: await contexto.comoAccion(async (accion) => {
			const { rows } = await accion.transaccion.execute(sql`
			SELECT d.id, d.folio, d.version, d.estado, (d.despachado_en AT TIME ZONE 'America/Mexico_City')::date::text AS salio
			FROM despachos d JOIN ubicaciones u ON u.id = d.destino_ubicacion_id AND u.tipo = 'bodega'
			WHERE d.id = ${parametros.despacho_id}::uuid`);
			const despacho = z.array(delDespacho).parse(rows)[0];
			if (despacho === undefined) throw noExiste();
			const { rows: filas } = await accion.transaccion.execute(sql`
			SELECT l.id AS traspaso_linea_id, p.nombre || ' ' || t.nombre AS prenda, m.nombre AS material, r.folio AS rollo,
				pt.folio AS partida, l.piezas_repartidas AS piezas, l.cantidad_repartida::text AS cantidad
			FROM traspasos tr JOIN traspaso_lineas l ON l.traspaso_id = tr.id
			LEFT JOIN variantes v ON v.id = l.variante_id LEFT JOIN productos p ON p.id = v.producto_id
			LEFT JOIN tallas t ON t.id = v.talla_id LEFT JOIN materiales m ON m.id = l.material_id
			LEFT JOIN rollos r ON r.id = l.rollo_id LEFT JOIN partidas_tela pt ON pt.id = r.partida_tela_id
			WHERE tr.despacho_id = ${despacho.id}::uuid ORDER BY tr.folio, l.renglon`);
			const renglones = z
				.array(delRenglon)
				.parse(filas)
				.map((renglon) => ({
					traspaso_linea_id: renglon.traspaso_linea_id,
					es_material: renglon.prenda === null,
					prenda: renglon.prenda ?? renglon.material ?? "",
					rollo: renglon.rollo,
					partida: renglon.partida,
					enviado: renglon.prenda === null ? metrosEscritos(renglon.cantidad ?? 0) : String(renglon.piezas ?? 0),
				}));
			const esMaterial = renglones.every((renglon) => renglon.es_material);
			const total = renglones.reduce((suma, renglon) => suma + Number(renglon.enviado), 0);
			const nombres = [...new Set(renglones.map((renglon) => renglon.prenda))];
			return {
				despacho_id: despacho.id,
				folio: despacho.folio,
				version: despacho.version,
				trae: nombres.join(" · "),
				salio: textoDeDiaCorto(despacho.salio),
				mando: esMaterial ? `${metrosEscritos(total)} m` : `${total} pz`,
				recibido: despacho.estado !== "en_transito",
				renglones,
			};
		}),
	}),
);
