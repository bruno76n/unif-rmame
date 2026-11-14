/**
 * `catalogo.escuelas_y_tallas`: la pestaña Escuelas y tallas de Catálogo.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Escuelas y tallas»), docs/modulos/catalogo/escuelas-y-secciones.md y
 * docs/modulos/catalogo/tallas-y-tipos-de-prenda.md
 *
 * Las escuelas con sus modelos activos y si son de un cliente externo activo; los grupos de tallas con sus tallas en
 * orden y cuántos productos los usan; los tipos de prenda con su sección, su flujo y sus medidas iniciales por talla;
 * las secciones con sus productos activos; y los flujos vigentes del taller, para escoger el de un tipo.
 */

import { escuelasYTallas } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { filas } from "./comun.ts";

/** Una medida de un tipo, por talla, como la lee la base. */
const medidaLeida = z.object({
	tipo_prenda_id: z.uuid(),
	medida: z.string(),
	orden: z.number(),
	talla_id: z.uuid(),
	talla: z.string(),
	valor_cm: z.coerce.number().nullable(),
});

export const consultaEscuelasYTallas = implementarConsulta(escuelasYTallas, async ({ base }) => {
	const escuelas = await filas(
		base,
		sql`SELECT e.id, e.version::int, e.nombre, e.municipio, e.color, e.baja_en IS NOT NULL AS baja,
			EXISTS (SELECT 1 FROM clientes c WHERE c.escuela_id = e.id AND c.baja_en IS NULL) AS cliente_externo,
			(SELECT count(*) FROM productos p WHERE p.escuela_id = e.id AND p.baja_en IS NULL)::int AS modelos
			FROM escuelas e ORDER BY e.nombre`,
		z.object({
			id: z.uuid(),
			version: z.number(),
			nombre: z.string(),
			municipio: z.string(),
			color: z.string(),
			baja: z.boolean(),
			cliente_externo: z.boolean(),
			modelos: z.number(),
		}),
	);
	const grupos = await filas(
		base,
		sql`SELECT g.id, g.version::int, g.nombre,
			(SELECT count(DISTINCT v.producto_id) FROM variantes v JOIN tallas t ON t.id = v.talla_id
			  WHERE t.grupo_talla_id = g.id)::int AS productos,
			coalesce((SELECT json_agg(json_build_object('id', t.id, 'nombre', t.nombre, 'orden', t.orden) ORDER BY t.orden)
			  FROM tallas t WHERE t.grupo_talla_id = g.id AND t.baja_en IS NULL), '[]') AS tallas
			FROM grupos_talla g WHERE g.baja_en IS NULL ORDER BY g.orden`,
		z.object({
			id: z.uuid(),
			version: z.number(),
			nombre: z.string(),
			productos: z.number(),
			tallas: z.array(z.object({ id: z.uuid(), nombre: z.string(), orden: z.number() })),
		}),
	);
	const tipos = await filas(
		base,
		sql`SELECT tp.id, tp.version::int, tp.nombre, tp.seccion_id, s.nombre AS seccion, tp.flujo_defecto_id AS flujo_id,
			f.nombre AS flujo
			FROM tipos_prenda tp JOIN secciones s ON s.id = tp.seccion_id LEFT JOIN flujos f ON f.id = tp.flujo_defecto_id
			WHERE tp.baja_en IS NULL ORDER BY s.orden, tp.orden, tp.nombre`,
		z.object({
			id: z.uuid(),
			version: z.number(),
			nombre: z.string(),
			seccion_id: z.uuid(),
			seccion: z.string(),
			flujo_id: z.uuid().nullable(),
			flujo: z.string().nullable(),
		}),
	);
	const medidas = await filas(
		base,
		sql`SELECT m.tipo_prenda_id, m.medida, m.orden, m.talla_id, t.nombre AS talla, m.valor_cm
			FROM tipo_prenda_medidas m JOIN tallas t ON t.id = m.talla_id JOIN grupos_talla g ON g.id = t.grupo_talla_id
			WHERE m.baja_en IS NULL ORDER BY m.orden, g.orden, t.orden`,
		medidaLeida,
	);
	const secciones = await filas(
		base,
		sql`SELECT s.id, s.nombre, s.lleva_receta,
			(SELECT count(*) FROM productos p WHERE p.seccion_id = s.id AND p.baja_en IS NULL)::int AS productos
			FROM secciones s WHERE s.baja_en IS NULL ORDER BY s.orden`,
		z.object({ id: z.uuid(), nombre: z.string(), lleva_receta: z.boolean(), productos: z.number() }),
	);
	const flujos = await filas(
		base,
		sql`SELECT id, nombre FROM flujos WHERE baja_en IS NULL ORDER BY nombre`,
		z.object({ id: z.uuid(), nombre: z.string() }),
	);
	return {
		resultado: {
			escuelas,
			grupos,
			tipos: tipos.map((tipo) => {
				const suyas = medidas.filter((medida) => medida.tipo_prenda_id === tipo.id);
				const nombres = [...new Map(suyas.map((medida) => [medida.medida, medida.orden])).entries()];
				return {
					...tipo,
					medidas: nombres.map(([medida, orden]) => ({
						medida,
						orden,
						valores: suyas
							.filter((una) => una.medida === medida)
							.map(({ talla_id, talla, valor_cm }) => ({ talla_id, talla, valor_cm })),
					})),
				};
			}),
			secciones,
			flujos,
		},
	};
});
