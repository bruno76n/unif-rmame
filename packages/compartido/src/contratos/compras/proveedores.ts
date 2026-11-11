/**
 * Los contratos de los proveedores de Compras: su alta ligada al tercero, su ficha, su baja y su reactivación.
 * Fase 10 · docs/modulos/compras/proveedores-y-precios.md («Acciones»)
 *
 * Lo que dicen los parámetros (lo más que un proveedor puede decir que tarda) lo revisa la acción, con el mensaje
 * que lo nombra.
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** El RFC: 12 o 13 letras y números. */
export const rfc = z
	.string("El RFC lleva 12 o 13 letras y números")
	.trim()
	.regex(/^[A-Za-zÑñ&0-9]{12,13}$/, "El RFC lleva 12 o 13 letras y números")
	.describe("12 o 13 letras y números; se guarda en mayúsculas");

/** Los campos de la ficha de un proveedor, todos obligatorios en el alta. */
const fichaDeProveedor = {
	nombre: z
		.string("Escribe el nombre del proveedor")
		.trim()
		.min(3, "Escribe el nombre del proveedor")
		.max(80, "Escribe el nombre del proveedor")
		.describe("Su nombre: vive en la ficha de su tercero"),
	ciudad: z
		.string("Escribe la ciudad")
		.trim()
		.min(2, "Escribe la ciudad")
		.max(60, "Escribe la ciudad")
		.describe("Su ciudad"),
	telefono: z
		.string("Escribe el teléfono a 10 dígitos")
		.refine((texto) => texto.replace(/\D/g, "").length === 10, "Escribe el teléfono a 10 dígitos")
		.describe("Se guardan sus 10 dígitos"),
	dias_credito: z
		.number("Escribe los días de crédito, 0 si es de contado")
		.int("Escribe los días de crédito, 0 si es de contado")
		.nonnegative("Escribe los días de crédito, 0 si es de contado")
		.describe("0 es «Contado»; otro número, «Crédito {n} días»"),
	dias_dice_tardar: z
		.number("Escribe cuántos días dice que tarda")
		.int("Escribe cuántos días dice que tarda")
		.describe("De 1 a `compras.dias_dice_tardar_maximo`"),
	surte: z.string().trim().max(120).describe("«Qué surte», en texto"),
};

/** El nombre ya es de otro proveedor. */
const proveedorRepetido = { codigo: "proveedor_repetido", mensaje: "Ya existe un proveedor con ese nombre" } as const;

/** Compras da de alta un proveedor; se liga a la ficha del tercero si ya existe con otro rol. */
export const crearProveedor = definirAccion({
	nombre: "compras.crear_proveedor",
	descripcion: "Da de alta un proveedor, con su tercero: nuevo, o ligado si el nombre ya es un cliente o un acreedor",
	entrada: z.object({
		...fichaDeProveedor,
		surte: fichaDeProveedor.surte.optional(),
		rfc: rfc.optional(),
	}),
	salida: z.object({ proveedor_id: z.uuid().describe("El proveedor") }),
	permiso: { departamento: "compras" },
	errores: [proveedorRepetido],
});

/** Compras cambia la ficha de un proveedor: solo lo que cambia. */
export const guardarProveedor = definirAccion({
	nombre: "compras.guardar_proveedor",
	descripcion: "Cambia la ficha de un proveedor; el nombre y el RFC cambian en su tercero",
	entrada: z.object({
		proveedor_id: z.uuid().describe("El proveedor"),
		nombre: fichaDeProveedor.nombre.optional(),
		rfc: rfc.nullable().optional(),
		ciudad: fichaDeProveedor.ciudad.optional(),
		telefono: fichaDeProveedor.telefono.optional(),
		dias_credito: fichaDeProveedor.dias_credito.optional(),
		dias_dice_tardar: fichaDeProveedor.dias_dice_tardar.optional(),
		surte: fichaDeProveedor.surte.nullable().optional(),
	}),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [proveedorRepetido, { codigo: "sin_cambios", mensaje: "Sin cambios" }],
	edita: true,
});

/** Compras da de baja un proveedor que nada usa. */
export const darBajaProveedor = definirAccion({
	nombre: "compras.dar_baja_proveedor",
	descripcion: "Da de baja un proveedor sin órdenes abiertas que no es el habitual de ningún material",
	entrada: z.object({
		proveedor_id: z.uuid().describe("El proveedor"),
		motivo: z.string().trim().max(200).describe("Por qué, al menos `general.largo_minimo_motivo` letras"),
	}),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [
		{ codigo: "proveedor_dado_de_baja", mensaje: "Ya está dado de baja." },
		{ codigo: "proveedor_con_ordenes", mensaje: "Tiene órdenes abiertas: termínalas o cancélalas antes." },
		{ codigo: "proveedor_habitual_de", mensaje: "Es el habitual de un material: haz habitual a otro antes." },
	],
	edita: true,
});

/** Compras reactiva un proveedor dado de baja. */
export const reactivarProveedor = definirAccion({
	nombre: "compras.reactivar_proveedor",
	descripcion: "Reactiva un proveedor dado de baja",
	entrada: z.object({ proveedor_id: z.uuid().describe("El proveedor") }),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [{ codigo: "proveedor_activo", mensaje: "Ya está activo." }],
	edita: true,
});
