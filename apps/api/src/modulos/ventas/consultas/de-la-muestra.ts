/**
 * Ayudas de las pruebas de las consultas de Ventas: el id de un pedido, de una nota o de un cliente de la muestra.
 * Fase 19 · docs/interfaz/fabrica/ventas.md
 */

import { z } from "zod";
import type { ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/**
 * El id de un renglón por una columna de texto.
 * @param servidor El servidor de prueba.
 * @param consulta La consulta, con `$1`.
 * @param valor El valor de `$1`.
 * @throws Error si no existe.
 */
async function idPor(servidor: ServidorDePrueba, consulta: string, valor: string): Promise<string> {
	const { rows } = await servidor.base.dueno.query(consulta, [valor]);
	return z.uuid(`no hay ${valor}`).parse(rows[0]?.id);
}

/**
 * El id de un pedido por su folio.
 * @param servidor El servidor de prueba.
 * @param folio «PE-0145».
 */
export function pedidoDeLaMuestra(servidor: ServidorDePrueba, folio: string): Promise<string> {
	return idPor(servidor, "SELECT id FROM pedidos WHERE folio = $1", folio);
}

/**
 * El id de una nota de entrega por su folio.
 * @param servidor El servidor de prueba.
 * @param folio «NV-0142».
 */
export function notaDeLaMuestra(servidor: ServidorDePrueba, folio: string): Promise<string> {
	return idPor(servidor, "SELECT id FROM notas_entrega WHERE folio = $1", folio);
}

/**
 * El id de un cliente por su nombre.
 * @param servidor El servidor de prueba.
 * @param nombre «Colegio Morelos».
 */
export function clienteDeLaMuestra(servidor: ServidorDePrueba, nombre: string): Promise<string> {
	return idPor(
		servidor,
		"SELECT c.id FROM clientes c JOIN terceros t ON t.id = c.tercero_id WHERE t.nombre = $1",
		nombre,
	);
}
