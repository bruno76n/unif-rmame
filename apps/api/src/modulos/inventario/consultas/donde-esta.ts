/**
 * `inventario.donde_esta`: la búsqueda «¿Dónde está?» de la barra superior, para Aduana, Bodega y Dirección.
 * Fase 19 · docs/interfaz/comunes.md («¿Dónde está?», «`inventario.donde_esta`»)
 *
 * Un texto de 4 dígitos o más busca por código; cualquier otro, por prenda y talla: la palabra que es una talla
 * escoge la talla y las demás deben estar en el nombre de la prenda. Por variante regresa sus piezas en cada
 * ubicación (sin el Taller), el total, lo comprometido, lo libre, lo apartado con su documento y lo que va de camino.
 */

import { dondeEsta } from "@uniformame/compartido/contratos/inventario/armazon";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";

/** Una variante encontrada. */
const encontrada = z.object({ id: z.uuid(), prenda: z.string(), talla: z.string(), codigo: z.string().nullable() });
/** Las piezas de una variante en una ubicación. */
const enUbicacion = z.object({
	variante_id: z.uuid(),
	codigo: z.string(),
	nombre: z.string(),
	piezas: z.coerce.number(),
});
/** Lo apartado de una variante. */
const apartado = z.object({
	variante_id: z.uuid(),
	documento: z.string(),
	ubicacion: z.string(),
	piezas: z.coerce.number(),
});
/** Lo que va de camino. */
const deCamino = z.object({ variante_id: z.uuid(), folio: z.string(), destino: z.string(), piezas: z.coerce.number() });

/** Cuántas variantes, si no se pide otro número. */
const maximo = 5;

/**
 * Busca las variantes del texto.
 * @param texto Lo que escribió la persona.
 * @param limite Cuántas.
 */
function busqueda(texto: string, limite: number) {
	if (/^\d{4,}$/.test(texto)) {
		return sql`SELECT v.id, p.nombre AS prenda, t.nombre AS talla, v.codigo FROM variantes v
			JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
			WHERE v.codigo LIKE ${`${texto}%`} ORDER BY v.codigo LIMIT ${limite}`;
	}
	const palabras = texto
		.toLocaleLowerCase("es-MX")
		.split(/\s+/)
		.filter((palabra) => palabra.length > 0);
	// Cada palabra está en el nombre de la prenda o es su talla; al menos una tiene que estar en la prenda.
	const condiciones = palabras.map(
		(palabra) => sql`(lower(p.nombre) LIKE ${`%${palabra}%`} OR lower(t.nombre) = ${palabra})`,
	);
	const enLaPrenda = sql.join(
		palabras.map((palabra) => sql`lower(p.nombre) LIKE ${`%${palabra}%`}`),
		sql` OR `,
	);
	return sql`SELECT v.id, p.nombre AS prenda, t.nombre AS talla, v.codigo FROM variantes v
		JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
		WHERE ${sql.join(condiciones, sql` AND `)} AND (${enLaPrenda}) AND p.baja_en IS NULL
		ORDER BY p.nombre, t.orden LIMIT ${limite}`;
}

export const consultaDondeEsta = implementarConsulta(dondeEsta, async ({ base }, parametros) => {
	const variantes = z
		.array(encontrada)
		.parse((await base.execute(busqueda(parametros.texto, parametros.limite ?? maximo))).rows);
	if (variantes.length === 0) return { resultado: { variantes: [] } };
	const ids = sql.join(
		variantes.map((variante) => sql`${variante.id}::uuid`),
		sql`, `,
	);
	const piezas = z.array(enUbicacion).parse(
		(
			await base.execute(sql`SELECT v.id AS variante_id, u.codigo, u.nombre, coalesce(e.piezas, 0) AS piezas
				FROM (SELECT unnest(ARRAY[${ids}]) AS id) v CROSS JOIN ubicaciones u
				LEFT JOIN existencias e ON e.ubicacion_id = u.id AND e.variante_id = v.id
				WHERE u.tipo <> 'taller' ORDER BY u.orden`)
		).rows,
	);
	const apartadas = z.array(apartado).parse(
		(
			await base.execute(sql`SELECT r.variante_id, coalesce(pe.folio, w.folio, ne.folio, 'Apartado') AS documento,
					u.nombre AS ubicacion, sum(r.piezas) AS piezas
				FROM reservas r JOIN ubicaciones u ON u.id = r.ubicacion_id
				LEFT JOIN pedidos pe ON pe.id = r.pedido_id LEFT JOIN pedidos_linea w ON w.id = r.pedido_linea_id
				LEFT JOIN notas_entrega ne ON ne.id = r.nota_entrega_id
				WHERE r.estado = 'activa' AND r.variante_id IN (${ids})
				GROUP BY r.variante_id, documento, u.nombre, u.orden ORDER BY u.orden, documento`)
		).rows,
	);
	const enCamino = z.array(deCamino).parse(
		(
			await base.execute(sql`SELECT l.variante_id, t.folio, coalesce(d.nombre, CASE t.destino_externo
					WHEN 'proveedor' THEN 'Proveedor' WHEN 'cliente_externo' THEN 'Cliente' ELSE 'Cliente en línea' END) AS destino,
					sum(l.piezas_enviadas) AS piezas
				FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id
				LEFT JOIN ubicaciones d ON d.id = t.destino_ubicacion_id
				WHERE t.estado IN ('en_camino_aduana', 'en_transito') AND l.variante_id IN (${ids})
				GROUP BY l.variante_id, t.folio, destino ORDER BY t.folio`)
		).rows,
	);
	return {
		resultado: {
			variantes: variantes.map((variante) => {
				const suyas = piezas.filter((pieza) => pieza.variante_id === variante.id);
				const total = suyas.reduce((suma, pieza) => suma + pieza.piezas, 0);
				const deEsta = apartadas.filter((reserva) => reserva.variante_id === variante.id);
				const comprometidas = deEsta.reduce((suma, reserva) => suma + reserva.piezas, 0);
				return {
					variante_id: variante.id,
					prenda: variante.prenda,
					talla: variante.talla,
					codigo: variante.codigo,
					ubicaciones: suyas.map(({ codigo, nombre, piezas }) => ({ codigo, nombre, piezas })),
					total,
					comprometidas,
					libres: total - comprometidas,
					apartadas: deEsta.map(({ documento, ubicacion, piezas }) => ({ documento, ubicacion, piezas })),
					en_camino: enCamino
						.filter((traspaso) => traspaso.variante_id === variante.id)
						.map(({ folio, destino, piezas }) => ({ folio, destino, piezas })),
				};
			}),
		},
	};
});
