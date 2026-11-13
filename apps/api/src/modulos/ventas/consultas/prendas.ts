/**
 * Una prenda como la usa el editor del pedido: su precio sugerido para el cliente (el de Catálogo) y sus tallas
 * vigentes, con lo que ya lleva el pedido y su mínimo.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pedido nuevo y Modificar pedido»)
 *
 * El sugerido sale de `catalogo.precio_sugerido`, el mismo con que la acción pone el precio al guardar: la pantalla
 * muestra lo que se va a guardar.
 */

import type { prendaDelEditor } from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { ordenDeTallas } from "../../catalogo/dominio/tallas.ts";
import type { AvanceDeTalla, RenglonLeido } from "./comun.ts";

/** Una prenda del editor, como la da el contrato. */
export type PrendaDelEditor = z.infer<typeof prendaDelEditor>;

/** Lo que regresa `catalogo.precio_sugerido`. */
const sugeridoLeido = z.object({
	precio_sugerido_centavos: z.number().nullable(),
	origen_sugerido: z.string().nullable(),
	porcentaje_aplicado: z.union([z.string(), z.number()]).nullable(),
});

/**
 * Cómo se lee el origen de un sugerido: «su lista», «12% sobre mostrador», «mayoreo» o «mostrador».
 * @param origen El origen, como lo guarda Catálogo.
 * @param porcentaje El porcentaje que usó, si fue el del cliente.
 */
export function textoDeOrigen(origen: string | null, porcentaje: string | number | null): string | null {
	if (origen === null) return null;
	if (origen === "lista_cliente") return "su lista";
	if (origen === "porcentaje_cliente") return `${Number(porcentaje ?? 0)}% sobre mostrador`;
	return origen === "mostrador" ? "mostrador" : "mayoreo";
}

/**
 * El sugerido de una talla para un cliente, con su texto de origen.
 * @param contexto El contexto de la consulta.
 * @param clienteId El cliente.
 * @param varianteId La talla.
 */
export async function sugeridoDe(contexto: ContextoDeConsulta, clienteId: string, varianteId: string) {
	const sugerido = sugeridoLeido.parse(
		await contexto.lectura("catalogo.precio_sugerido", { cliente_id: clienteId, variante_id: varianteId }),
	);
	return {
		precio: sugerido.precio_sugerido_centavos,
		origen: textoDeOrigen(sugerido.origen_sugerido, sugerido.porcentaje_aplicado),
	};
}

/** Las tallas de una prenda. */
const tallasLeidas = z.array(
	z.object({
		id: z.uuid(),
		talla: z.string(),
		especial: z.boolean(),
		recargo: z.coerce.number(),
		nombre: z.string(),
		escuela: z.string().nullable(),
	}),
);

/**
 * Una prenda para el editor: sus tallas vigentes (y las que ya lleva el pedido), su sugerido, lo que lleva el pedido
 * de cada talla y su mínimo (entregado + en nota + listo en aduana).
 * @param contexto El contexto de la consulta.
 * @param clienteId El cliente del pedido.
 * @param productoId La prenda.
 * @param delPedido Sus renglones vigentes y su avance, si el pedido ya existe.
 * @throws `404` si la prenda no existe.
 */
export async function prendaParaElEditor(
	contexto: ContextoDeConsulta,
	clienteId: string,
	productoId: string,
	delPedido: { renglones: readonly RenglonLeido[]; avance: readonly AvanceDeTalla[] } = { renglones: [], avance: [] },
): Promise<PrendaDelEditor> {
	const suyos = delPedido.renglones.filter((renglon) => renglon.producto_id === productoId);
	const { rows } = await contexto.base.execute(sql`SELECT v.id, t.nombre AS talla, v.es_pedido_especial AS especial,
			p.recargo_pedido_especial_centavos AS recargo, p.nombre, e.nombre AS escuela
		FROM variantes v JOIN tallas t ON t.id = v.talla_id JOIN productos p ON p.id = v.producto_id
		LEFT JOIN escuelas e ON e.id = p.escuela_id
		WHERE v.producto_id = ${productoId} AND (v.baja_en IS NULL OR v.id IN (${sql.join(
			[...suyos.map((renglon) => sql`${renglon.variante_id}::uuid`), sql`NULL::uuid`],
			sql`, `,
		)}))
		ORDER BY ${ordenDeTallas("t")}`);
	const tallas = tallasLeidas.parse(rows);
	const primera = tallas.find((talla) => !talla.especial) ?? tallas[0];
	if (primera === undefined) throw noExiste();
	const sugerido = await sugeridoDe(contexto, clienteId, primera.id);
	const minimoDe = (varianteId: string) => {
		const talla = delPedido.avance.find((suya) => suya.variante_id === varianteId);
		return talla === undefined ? 0 : talla.entregado + talla.en_nota + talla.listo;
	};
	const dado = suyos.find((renglon) => renglon.precio_dado_centavos !== null)?.precio_dado_centavos ?? null;
	return {
		producto_id: productoId,
		nombre: primera.nombre,
		escuela: primera.escuela ?? "Básico",
		sugerido_centavos: sugerido.precio,
		origen: sugerido.origen,
		precio_dado_centavos: dado,
		se_quita: tallas.every((talla) => minimoDe(talla.id) === 0),
		tallas: tallas.map((talla) => ({
			variante_id: talla.id,
			talla: talla.talla,
			especial: talla.especial,
			recargo_centavos: talla.especial ? talla.recargo : 0,
			minimo: minimoDe(talla.id),
			cantidad: suyos.find((renglon) => renglon.variante_id === talla.id)?.cantidad ?? 0,
		})),
	};
}
