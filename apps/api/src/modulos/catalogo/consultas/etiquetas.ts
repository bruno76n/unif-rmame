/**
 * `catalogo.etiquetas`: la pestaña Etiquetas de Catálogo.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Etiquetas») y docs/modulos/catalogo/variantes-codigos-y-etiquetas.md
 *
 * «Variantes nuevas sin etiqueta»: por producto activo, cuántas tallas vivas están por imprimir. «Por variante»: las
 * tallas de un producto que no están dadas de baja, con su código y el estado de su etiqueta. El precio de la vista
 * previa solo viaja con `catalogo.etiqueta_lleva_precio`, y sale de la lectura `catalogo.precio_talla` en Mostrador
 * (con su recargo en una talla de pedido especial).
 */

import { etiquetasDeCatalogo } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { filas, parametroNumero, parametroSiNo } from "./comunes.ts";

/** Una talla del producto como la lee la base. */
const varianteLeida = z.object({
	id: z.uuid(),
	talla: z.string(),
	codigo: z.string(),
	es_pedido_especial: z.boolean(),
	estado_etiqueta: z.enum(["por_imprimir", "impresa", "por_reimprimir", "al_fabricar"]),
	descontinuada: z.boolean(),
});

/**
 * El precio de Mostrador de cada talla, con la lectura del módulo.
 * @param contexto El de la consulta.
 * @param variantes Las tallas.
 */
async function preciosDeMostrador(contexto: ContextoDeConsulta, variantes: readonly { id: string }[]) {
	const [mostrador] = await filas(
		contexto.base,
		sql`SELECT id FROM listas_precios WHERE tipo = 'mostrador' AND baja_en IS NULL`,
		z.object({ id: z.uuid() }),
	);
	const precios = new Map<string, number | null>();
	for (const variante of variantes) {
		const leido = z
			.object({ precio_centavos: z.number().nullable() })
			.parse(await contexto.lectura("catalogo.precio_talla", { lista_id: mostrador?.id, variante_id: variante.id }));
		precios.set(variante.id, leido.precio_centavos);
	}
	return precios;
}

export const consultaEtiquetas = implementarConsulta(etiquetasDeCatalogo, async (contexto, parametros) => {
	const { base } = contexto;
	const nuevas = await filas(
		base,
		sql`SELECT p.id AS producto_id, p.nombre, e.nombre AS escuela, count(*)::int AS variantes, p.foto_archivo_id
			FROM variantes v JOIN productos p ON p.id = v.producto_id LEFT JOIN escuelas e ON e.id = p.escuela_id
			WHERE v.estado_etiqueta = 'por_imprimir' AND v.baja_en IS NULL AND v.descontinuada_en IS NULL AND p.baja_en IS NULL
			GROUP BY p.id, p.nombre, e.nombre, p.foto_archivo_id ORDER BY p.nombre, e.nombre`,
		z.object({
			producto_id: z.uuid(),
			nombre: z.string(),
			escuela: z.string().nullable(),
			variantes: z.number(),
			foto_archivo_id: z.uuid().nullable(),
		}),
	);
	const productos = await filas(
		base,
		sql`SELECT p.id, p.nombre, e.nombre AS escuela FROM productos p LEFT JOIN escuelas e ON e.id = p.escuela_id
			WHERE p.baja_en IS NULL AND NOT p.es_servicio ORDER BY p.nombre, e.nombre NULLS FIRST`,
		z.object({ id: z.uuid(), nombre: z.string(), escuela: z.string().nullable() }),
	);
	const llevaPrecio = await parametroSiNo(base, "catalogo.etiqueta_lleva_precio");
	let producto = null;
	if (parametros.producto_id !== undefined) {
		const [elegido] = await filas(
			base,
			sql`SELECT p.id, p.nombre, e.nombre AS escuela FROM productos p LEFT JOIN escuelas e ON e.id = p.escuela_id
				WHERE p.id = ${parametros.producto_id}`,
			z.object({ id: z.uuid(), nombre: z.string(), escuela: z.string().nullable() }),
		);
		if (elegido === undefined) throw noExiste();
		const variantes = await filas(
			base,
			sql`SELECT v.id, t.nombre AS talla, v.codigo, v.es_pedido_especial, v.estado_etiqueta,
				v.descontinuada_en IS NOT NULL AS descontinuada
				FROM variantes v JOIN tallas t ON t.id = v.talla_id JOIN grupos_talla g ON g.id = t.grupo_talla_id
				WHERE v.producto_id = ${elegido.id} AND v.baja_en IS NULL ORDER BY g.orden, t.orden`,
			varianteLeida,
		);
		const precios = llevaPrecio ? await preciosDeMostrador(contexto, variantes) : new Map<string, number | null>();
		producto = {
			...elegido,
			variantes: variantes.map((variante) => ({ ...variante, precio_centavos: precios.get(variante.id) ?? null })),
		};
	}
	return {
		resultado: {
			nuevas,
			productos,
			producto,
			maximo_por_talla: await parametroNumero(base, "catalogo.etiquetas_max_por_talla"),
			lleva_precio: llevaPrecio,
		},
	};
});
