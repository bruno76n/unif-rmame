/**
 * Los contratos de los clientes externos: su alta con su tercero, su crédito, su lista y su escuela; sus cambios, su
 * baja y su reactivación.
 * Fase 16 · docs/modulos/ventas/clientes.md («Acciones»)
 */

import { z } from "zod";
import { rfc } from "../compras/proveedores.ts";
import { definirAccion } from "../definir.ts";

/** Los tres tipos de cliente; el tipo no cambia. */
export const tiposDeCliente = ["escuela", "mayorista", "empresa_otro"] as const;

/** Los campos de la ficha de un cliente que se pueden cambiar. */
const fichaDeCliente = {
	nombre: z
		.string("Escribe el nombre del cliente.")
		.trim()
		.min(3, "Escribe el nombre del cliente.")
		.max(80, "Escribe el nombre del cliente.")
		.describe("Su nombre: vive en la ficha de su tercero"),
	municipio: z
		.string("Escribe el municipio.")
		.trim()
		.min(3, "Escribe el municipio.")
		.max(60, "Escribe el municipio.")
		.describe("«{tipo} en {municipio}»"),
	direccion_entrega: z
		.string("Escribe la dirección de entrega: Aduana la necesita para despachar.")
		.trim()
		.min(8, "Escribe la dirección de entrega: Aduana la necesita para despachar.")
		.max(200, "Escribe la dirección de entrega: Aduana la necesita para despachar.")
		.describe("La usa Aduana para despachar"),
	contacto: z.string().trim().max(60, "Va en 60 letras.").describe("«¿Con quién se trata?»"),
	telefono: z
		.string("Teléfono a 10 dígitos.")
		.refine((texto) => texto.replace(/\D/g, "").length === 10, "Teléfono a 10 dígitos.")
		.describe("Se guardan sus 10 dígitos"),
	correo: z.email("Revisa el correo.").describe("Su correo"),
	rfc,
};

/** El nombre ya es de otro cliente. */
const clienteRepetido = { codigo: "cliente_repetido", mensaje: "Ya hay un cliente con ese nombre." } as const;

/** Ventas da de alta un cliente externo: nacen con él su tercero, su crédito, su lista y, si es escuela, su escuela. */
export const crearCliente = definirAccion({
	nombre: "ventas.crear_cliente",
	descripcion:
		"Da de alta un cliente externo con su tercero, su crédito, su lista de precios y, si es escuela, su escuela",
	entrada: z.object({
		nombre: fichaDeCliente.nombre,
		tipo: z.enum(tiposDeCliente, "Escoge el tipo.").describe("Escuela, mayorista o empresa u otro"),
		escuela_id: z.uuid("Escoge la escuela.").optional().describe("Una escuela que ya existe; sin ella, nace una"),
		municipio: fichaDeCliente.municipio,
		direccion_entrega: fichaDeCliente.direccion_entrega,
		contacto: fichaDeCliente.contacto.optional(),
		telefono: fichaDeCliente.telefono,
		correo: fichaDeCliente.correo.optional(),
		rfc: fichaDeCliente.rfc.optional(),
		desde_pedido: z.boolean().optional().describe("Si se da de alta desde un pedido nuevo, para escogerlo en él"),
	}),
	salida: z.object({ cliente_id: z.uuid(), lista_id: z.uuid(), escuela_id: z.uuid().nullable() }),
	permiso: { departamento: "ventas" },
	errores: [
		clienteRepetido,
		{ codigo: "escuela_ya_es_cliente", mensaje: "{escuela} ya es cliente: {cliente}." },
		{ codigo: "escuela_repetida", mensaje: "Esa escuela ya existe: escógela en la lista." },
	],
});

/** Ventas cambia los datos de un cliente; el tipo y la escuela no cambian. */
export const editarCliente = definirAccion({
	nombre: "ventas.editar_cliente",
	descripcion: "Cambia los datos de un cliente; con el nombre, renombra su tercero, su lista y su escuela",
	entrada: z.object({
		cliente_id: z.uuid().describe("El cliente"),
		nombre: fichaDeCliente.nombre.optional(),
		municipio: fichaDeCliente.municipio.optional(),
		direccion_entrega: fichaDeCliente.direccion_entrega.optional(),
		contacto: fichaDeCliente.contacto.nullable().optional(),
		telefono: fichaDeCliente.telefono.optional(),
		correo: fichaDeCliente.correo.nullable().optional(),
		rfc: fichaDeCliente.rfc.nullable().optional(),
	}),
	salida: z.object({ cliente_id: z.uuid() }),
	permiso: { departamento: "ventas" },
	errores: [clienteRepetido, { codigo: "sin_cambios", mensaje: "Sin cambios" }],
	edita: true,
});

/** Ventas da de baja un cliente sin pedidos abiertos ni saldo por cobrar. */
export const darBajaCliente = definirAccion({
	nombre: "ventas.dar_baja_cliente",
	descripcion: "Da de baja un cliente sin pedidos abiertos ni saldo; su historial se conserva",
	entrada: z.object({
		cliente_id: z.uuid().describe("El cliente"),
		motivo: z.string("Escribe el motivo.").trim().min(1, "Escribe el motivo.").max(200).describe("Por qué"),
	}),
	salida: z.object({ cliente_id: z.uuid() }),
	permiso: { departamento: "ventas" },
	errores: [
		{ codigo: "cliente_con_pedidos", mensaje: "{cliente} tiene {n} pedido(s) abierto(s): no se puede dar de baja." },
		{
			codigo: "cliente_con_saldo",
			mensaje: "{cliente} tiene saldo por cobrar: no se puede dar de baja hasta que pague.",
		},
	],
	edita: true,
});

/** Ventas reactiva un cliente dado de baja. */
export const reactivarCliente = definirAccion({
	nombre: "ventas.reactivar_cliente",
	descripcion: "Reactiva un cliente dado de baja y su lista de precios",
	entrada: z.object({ cliente_id: z.uuid().describe("El cliente") }),
	salida: z.object({ cliente_id: z.uuid() }),
	permiso: { departamento: "ventas" },
	errores: [{ codigo: "cliente_activo", mensaje: "{cliente} ya está activo." }],
	edita: true,
});
