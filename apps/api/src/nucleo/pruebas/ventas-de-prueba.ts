/**
 * Las ayudas de las pruebas de Ventas: un cliente dado de alta con `ventas.crear_cliente`, o solo su renglón (con su
 * tercero) para las pruebas que crean su lista o su crédito con las internas.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Cómo se construye»)
 */

import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { llamarInterna } from "./inventario-de-prueba.ts";
import { mandarAccion } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Los tipos de cliente. */
type TipoDeCliente = "escuela" | "mayorista" | "empresa_otro";

/** Un cliente dado de alta en la prueba. */
export interface ClienteDeVentas {
	clienteId: string;
	terceroId: string;
	nombre: string;
}

/** Un nombre que ningún otro cliente de la prueba tiene. */
export function nombreDeClienteNuevo(prefijo = "Cliente de prueba"): string {
	return `${prefijo} ${uuidv7().slice(-12)}`;
}

/**
 * Da de alta un cliente con `ventas.crear_cliente`: su tercero, su crédito, su lista y, si es escuela, su escuela.
 * @param servidor El servidor de prueba.
 * @param datos Lo que cambia de la ficha de ejemplo (un mayorista de León).
 * @returns El cliente, su lista y su escuela.
 */
export async function darDeAltaClienteDePrueba(servidor: ServidorDePrueba, datos: Record<string, unknown> = {}) {
	const respuesta = await mandarAccion(
		servidor,
		"ventas.crear_cliente",
		{
			datos: {
				nombre: nombreDeClienteNuevo(),
				tipo: "mayorista",
				municipio: "León",
				direccion_entrega: "Blvd. López Mateos 1200, León",
				telefono: "4771234567",
				...datos,
			},
		},
		"ventas",
	);
	return z
		.object({ cliente_id: z.uuid(), lista_id: z.uuid(), escuela_id: z.uuid().nullable() })
		.parse(respuesta.cuerpo.resultado);
}

/**
 * Solo el renglón de un cliente, con su tercero (y su escuela, si es escuela): sin crédito ni lista, para las pruebas
 * que los crean con las internas de Contaduría y de Catálogo.
 * @param servidor El servidor de prueba.
 * @param tipo Su tipo.
 * @param nombre Su nombre; uno nuevo si no se dice.
 */
export async function renglonDeClienteDePrueba(
	servidor: ServidorDePrueba,
	tipo: TipoDeCliente = "mayorista",
	nombre = nombreDeClienteNuevo(),
): Promise<ClienteDeVentas> {
	const { tercero_id: terceroId } = z
		.object({ tercero_id: z.uuid() })
		.parse(await llamarInterna(servidor, "contaduria.crear_tercero", { nombre, rol: "cliente" }));
	const escuelaId =
		tipo === "escuela"
			? z
					.object({ escuela_id: z.uuid() })
					.parse(await llamarInterna(servidor, "catalogo.crear_escuela_para_cliente", { nombre, municipio: "León" }))
					.escuela_id
			: null;
	const clienteId = uuidv7();
	await servidor.base.dueno.query(
		`INSERT INTO clientes (id, tercero_id, tipo, escuela_id, municipio, direccion_entrega, telefono)
		 VALUES ($1, $2, $3, $4, 'León', 'Blvd. López Mateos 1200, León', '4771234567')`,
		[clienteId, terceroId, tipo, escuelaId],
	);
	return { clienteId, terceroId, nombre };
}
