/**
 * `catalogo.crear_escuela_para_cliente`: Ventas da de alta un cliente escuela sin escuela escogida, y la escuela
 * nace con su nombre y su municipio.
 * Fase 8 · docs/modulos/catalogo/escuelas-y-secciones.md («`catalogo.crear_escuela_para_cliente`», regla 3)
 *
 * Igual que agregarla, pero sin bitácora propia: lo que cambió va en el renglón de Ventas.
 */

import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { crearEscuela } from "../dominio/escuelas.ts";

/** Lo que recibe: el nombre y el municipio del cliente. */
const pedido = z.object({ nombre: z.string().trim().min(4).max(80), municipio: z.string().trim().min(3).max(60) });

/**
 * Crea la escuela del cliente.
 * @param contexto El contexto de Ventas.
 * @param datos `nombre` y `municipio`.
 * @returns `escuela_id`.
 * @throws `422 escuela_repetida` («Esa escuela ya existe: escógela en la lista.»).
 */
export async function crearEscuelaParaCliente(contexto: ContextoDeAccion, datos: unknown) {
	const escuela = await crearEscuela(contexto, pedido.parse(datos), "Esa escuela ya existe: escógela en la lista.");
	return { escuela_id: escuela.id };
}
