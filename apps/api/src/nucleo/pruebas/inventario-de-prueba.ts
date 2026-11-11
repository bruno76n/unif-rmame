/**
 * Las ayudas de las pruebas del inventario: las ubicaciones por código y un traspaso nuevo.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md («Cómo se construye»)
 */

import { crearTraspaso, type PedidoDeTraspaso } from "../../modulos/inventario/dominio/traspasos.ts";
import { crearBase } from "../base/conexion.ts";
import { enAccionDePrueba } from "./accion-de-prueba.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/**
 * Las ubicaciones, por su código (`ADU`, `BOD`, `T1`…).
 * @param servidor El servidor de prueba.
 */
export async function ubicacionesPorCodigo(servidor: ServidorDePrueba): Promise<Record<string, string>> {
	const { rows } = await servidor.base.dueno.query("SELECT codigo, id FROM ubicaciones");
	return Object.fromEntries(rows.map((fila) => [fila.codigo, fila.id]));
}

/**
 * Crea un traspaso con `crearTraspaso`, en su propia transacción.
 * @param servidor El servidor de prueba.
 * @param pedido El traspaso.
 * @returns Su id y su folio.
 */
export function nuevoTraspaso(servidor: ServidorDePrueba, pedido: PedidoDeTraspaso) {
	return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
		crearTraspaso(contexto, pedido),
	);
}
