/**
 * Los contratos del módulo de prueba.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md («Cómo se construye»)
 */

import { definirAccion, definirConsulta, paginaDe, parametrosDePagina } from "@uniformame/compartido/contratos/definir";
import { z } from "zod";

/** Crea una nota; con `con_pin`, entrega un PIN que es secreto; con `fallar`, falla en ese paso. */
export const crearNota = definirAccion({
	nombre: "prueba.crear_nota",
	descripcion: "Crea una nota de prueba",
	entrada: z.object({
		texto: z.string().min(1, "Escribe el texto").describe("El texto de la nota"),
		monto_centavos: z.number().int().nonnegative().describe("Un monto, en centavos"),
		con_pin: z.boolean().optional().describe("Si entrega un PIN"),
		fallar: z
			.enum(["despues_de_la_interna", "con_regla", "con_error"])
			.optional()
			.describe("Dónde falla, para las pruebas"),
	}),
	salida: z.object({
		id: z.uuid().describe("El id de la nota"),
		pin: z.string().optional().describe("Un PIN que se entrega una sola vez"),
	}),
	permiso: { departamento: "ventas" },
	errores: [{ codigo: "texto_prohibido", mensaje: "Ese texto no se puede guardar" }],
	secretos: ["pin"],
});

/** Cambia el texto de una nota que ya existe. */
export const editarNota = definirAccion({
	nombre: "prueba.editar_nota",
	descripcion: "Cambia el texto de una nota",
	entrada: z.object({
		id: z.uuid().describe("La nota"),
		texto: z.string().min(1, "Escribe el texto").describe("El texto nuevo"),
	}),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
	edita: true,
});

/** Agrega un renglón a una nota: sube la versión de la nota. */
export const agregarRenglon = definirAccion({
	nombre: "prueba.agregar_renglon",
	descripcion: "Agrega un renglón a una nota",
	entrada: z.object({
		nota_id: z.uuid().describe("La nota"),
		cantidad: z.number().int().positive().describe("Cuántas piezas"),
	}),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
	edita: true,
});

/** Las notas, de 2 en 2 a lo más por página; el monto solo lo ve quien tiene `ven_montos`. */
export const listarNotas = definirConsulta({
	nombre: "prueba.notas",
	descripcion: "Las notas, por página",
	entrada: z.object(parametrosDePagina(2)),
	salida: z.object(
		paginaDe(
			z.object({
				id: z.uuid().describe("La nota"),
				texto: z.string().describe("Su texto"),
				monto_centavos: z.number().int().optional().describe("Su monto; se recorta sin ven_montos"),
			}),
		),
	),
	permiso: { departamento: "ventas" },
	recortables: ["monto_centavos"],
});

/** Una nota; las que empiezan con «privada» solo las ve la dueña: a las demás les responde 404. */
export const verNota = definirConsulta({
	nombre: "prueba.nota",
	descripcion: "Una nota",
	entrada: z.object({ id: z.uuid().describe("La nota") }),
	salida: z.object({
		id: z.uuid().describe("La nota"),
		texto: z.string().describe("Su texto"),
		version: z.number().int().describe("Su versión"),
	}),
	permiso: { departamento: "ventas" },
});

/** Pide «Confirmar con Google» y ser la dueña, para probar el 401 reautenticar y el 403 solo_duena. */
export const confirmar = definirAccion({
	nombre: "prueba.confirmar",
	descripcion: "Una acción que pide confirmar con Google",
	entrada: z.object({}),
	salida: z.object({}),
	permiso: { soloDuena: true, confirmarConGoogle: "probar la confirmación" },
});

/** Lanza el error que se le pide, para probar la forma de cada error de la tabla. */
export const provocar = definirAccion({
	nombre: "prueba.provocar",
	descripcion: "Lanza un error de la tabla",
	entrada: z.object({
		error: z.enum(["demasiados_intentos", "no_disponible", "interno"]).describe("El error que lanza"),
	}),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
});
