/**
 * `produccion.opciones_orden_nueva`: lo que ofrece la ventana «Orden de producción nueva». Para quién (Bodega, que es
 * temporada, y las tiendas activas), las prendas activas que pasan por el taller (sin ser servicio y con flujo) que
 * coinciden con lo escrito, cada una con sus tallas vigentes (la de pedido especial marcada y la descontinuada
 * apagada) y si tiene receta, y la entrega que propone «Para cuándo»: hoy + `produccion.orden_entrega_temporada_dias`.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Ventanas»: «Orden de producción nueva»)
 */

import { opcionesOrdenNueva } from "@uniformame/compartido/contratos/produccion/ordenes-de-produccion";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { ordenDeTallas } from "../../catalogo/dominio/tallas.ts";

/** Cuántas prendas ofrece a la vez. */
const prendasALaVez = 20;

export const consultaOpcionesOrdenNueva = implementarConsulta(opcionesOrdenNueva, async (contexto, parametros) => {
	const { base } = contexto;
	const { rows: destinos } = await base.execute(sql`
		SELECT id AS ubicacion_id, CASE WHEN tipo = 'bodega' THEN 'Temporada · bodega' ELSE nombre END AS nombre
		FROM ubicaciones WHERE tipo IN ('bodega', 'tienda') AND baja_en IS NULL
		ORDER BY tipo = 'bodega' DESC, orden, nombre`);
	const texto = `%${(parametros.texto ?? "").trim()}%`;
	const { rows: prendas } = await base.execute(sql`
		SELECT p.id AS producto_id, p.nombre,
			EXISTS (SELECT 1 FROM recetas r WHERE r.producto_id = p.id AND r.version_vigente_id IS NOT NULL) AS con_receta,
			coalesce((SELECT json_agg(json_build_object('variante_id', v.id, 'talla', t.nombre,
				'especial', v.es_pedido_especial, 'descontinuada', v.descontinuada_en IS NOT NULL) ORDER BY ${ordenDeTallas("t")})
				FROM variantes v JOIN tallas t ON t.id = v.talla_id
				WHERE v.producto_id = p.id AND v.baja_en IS NULL), '[]') AS tallas
		FROM productos p
		WHERE p.baja_en IS NULL AND NOT p.es_servicio AND p.flujo_id IS NOT NULL AND p.nombre ILIKE ${texto}
		ORDER BY p.nombre LIMIT ${prendasALaVez}`);
	const dias = await parametroNumero(contexto, "produccion.orden_entrega_temporada_dias");
	return {
		resultado: {
			destinos: z.array(z.object({ ubicacion_id: z.uuid(), nombre: z.string() })).parse(destinos),
			prendas: z
				.array(
					z.object({
						producto_id: z.uuid(),
						nombre: z.string(),
						con_receta: z.boolean(),
						tallas: z.array(
							z.object({
								variante_id: z.uuid(),
								talla: z.string(),
								especial: z.boolean(),
								descontinuada: z.boolean(),
							}),
						),
					}),
				)
				.parse(prendas),
			entrega_propuesta: contexto.diaDeNegocio.add({ days: dias }).toString(),
		},
	};
});
