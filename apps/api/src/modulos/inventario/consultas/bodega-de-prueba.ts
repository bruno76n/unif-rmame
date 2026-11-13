/**
 * Lo que comparten las pruebas de las consultas de Bodega: pedir una consulta como una cuenta, leer un valor de la base
 * y poner (y quitar al terminar) lo que la muestra no trae: una pieza apartada en Bodega para un pedido, una diferencia
 * y una excepción.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { expect } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import type { ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/**
 * Pide una consulta y espera un 200.
 * @param servidor El servidor de prueba.
 * @param nombre La consulta.
 * @param parametros Sus parámetros.
 * @param quien La cuenta de prueba.
 * @returns Su resultado.
 */
export async function pedir(
	servidor: ServidorDePrueba,
	nombre: string,
	parametros: Record<string, string> = {},
	quien = "bodega",
): Promise<Record<string, unknown>> {
	const respuesta = await pedirConsulta(servidor, nombre, parametros, quien);
	expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
	return respuesta.cuerpo.resultado as Record<string, unknown>;
}

/**
 * Revisa que una consulta solo la pidan las cuentas con Bodega (y las que se digan) y que no mande precios ni costos.
 * @param servidor El servidor de prueba.
 * @param nombre La consulta.
 * @param parametros Sus parámetros.
 * @param tambien Otros departamentos que sí la piden.
 */
export async function soloBodegaYSinPrecios(
	servidor: ServidorDePrueba,
	nombre: string,
	parametros: Record<string, string> = {},
	tambien: readonly string[] = [],
): Promise<void> {
	for (const quien of ["ventas", "aduana", "contaduria", "compras"].filter((uno) => !tambien.includes(uno))) {
		expect((await pedirConsulta(servidor, nombre, parametros, quien)).estado, quien).toBe(403);
	}
	const texto = JSON.stringify(await pedir(servidor, nombre, parametros));
	expect(texto).not.toMatch(/centavos|costo|precio/);
}

/**
 * Un valor de la base de prueba.
 * @param servidor El servidor de prueba.
 * @param consulta El SQL, que regresa una fila.
 * @param parametros Sus parámetros.
 */
export async function valorDe(servidor: ServidorDePrueba, consulta: string, ...parametros: unknown[]): Promise<string> {
	const { rows } = await servidor.base.dueno.query(consulta, parametros);
	return String(Object.values(rows[0] ?? {})[0]);
}

/** Lo que una prueba puso en la base, para quitarlo al terminar. */
export interface Puesto {
	quitar: () => Promise<void>;
}

/**
 * Aparta en Bodega dos piezas de una variante para un pedido de la muestra: queda por surtir.
 * @param servidor El servidor de prueba.
 * @returns El pedido, la reserva y cómo quitarla.
 */
export async function apartarEnBodega(
	servidor: ServidorDePrueba,
): Promise<Puesto & { pedido: string; reserva: string }> {
	const pedido = await valorDe(servidor, "SELECT id FROM pedidos ORDER BY folio LIMIT 1");
	const reserva = await valorDe(
		servidor,
		`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, estado)
		SELECT uuidv7(), u.id, e.variante_id, 2, 'pedido_externo', $1, 'activa'
		FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id AND u.tipo = 'bodega'
		WHERE e.piezas > 5 ORDER BY e.variante_id LIMIT 1 RETURNING id`,
		pedido,
	);
	return {
		pedido,
		reserva,
		quitar: async () => {
			await servidor.base.dueno.query("DELETE FROM reservas WHERE id = $1", [reserva]);
		},
	};
}

/**
 * Abre una diferencia por contar en Bodega y una excepción de Bodega por resolver.
 * @param servidor El servidor de prueba.
 * @returns Sus ids y cómo quitarlas.
 */
export async function abrirDiferenciaYExcepcion(
	servidor: ServidorDePrueba,
): Promise<Puesto & { diferencia: string; excepcion: string }> {
	const diferencia = await valorDe(
		servidor,
		`INSERT INTO diferencias (id, folio, origen, ubicacion_id, variante_id, piezas, descripcion, sistema_decia,
			a_cargo_ubicacion_id, estado)
		SELECT uuidv7(), 'DF-PRUEBA', 'cuadre', u.id, e.variante_id, -2, 'El cuadre del 8 nov halló −2 en Bodega', 0, u.id,
			'por_contar'
		FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id AND u.tipo = 'bodega'
		WHERE e.piezas > 5 ORDER BY e.variante_id DESC LIMIT 1 RETURNING id`,
	);
	const excepcion = await valorDe(
		servidor,
		`INSERT INTO excepciones (id, tipo, area, estado, descripcion, detectada_en)
		VALUES (uuidv7(), 'cuadre_proyeccion', 'bodega', 'por_revisar', 'La existencia no era la del libro', now())
		RETURNING id`,
	);
	return {
		diferencia,
		excepcion,
		quitar: async () => {
			await servidor.base.dueno.query("DELETE FROM diferencias WHERE id = $1", [diferencia]);
			await servidor.base.dueno.query("DELETE FROM excepciones WHERE id = $1", [excepcion]);
		},
	};
}
