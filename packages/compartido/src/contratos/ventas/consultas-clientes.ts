/**
 * Los contratos de las consultas de los clientes en las pantallas de Ventas a externos: la pestaña Clientes y el cajón
 * del cliente nuevo o de sus datos.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Clientes», «Cliente nuevo y Datos del cliente»)
 *
 * Ventas ve el semáforo del crédito de cada cliente, nunca su saldo ni su límite: eso es de Contaduría.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";
import { tiposDeCliente } from "./clientes.ts";
import { clientePintado } from "./vistas.ts";

/** El crédito de un cliente como lo ve Ventas: su semáforo, sin montos. */
const creditoDeVentas = z.object({
	texto: z
		.string()
		.describe("«Crédito al corriente», «Cerca del límite de crédito», «Detenido por crédito», «Sin crédito»"),
	color: colorDeEstado,
});

/** La pestaña Clientes: una ficha por cliente activo y los dados de baja. */
export const clientesVentas = definirConsulta({
	nombre: "ventas.clientes",
	descripcion: "Los clientes activos con su ficha, su crédito y sus pedidos; y los dados de baja",
	entrada: z.object({}),
	salida: z.object({
		fichas: z.array(
			clientePintado.extend({
				version: z.number().int(),
				descripcion: z.string().describe("«Escuela en Yurécuaro, cliente desde 2019»"),
				contacto: z.string().describe("«{contacto} · {teléfono}»"),
				credito: creditoDeVentas,
				detenido: z.boolean(),
				pedidos_abiertos: z.number().int(),
				borradores: z.number().int(),
				piezas_por_entregar: z.number().int(),
				proxima_entrega: z.string().describe("«14 oct» o «Ninguna»"),
				modelos_propios: z.number().int(),
				productos_lista: z.number().int(),
				lista: z.string().describe("«Precios de la lista Colegio Morelos»"),
			}),
		),
		de_baja: z.array(
			z.object({
				cliente_id: z.uuid(),
				nombre: z.string(),
				version: z.number().int(),
				desde: z.string().describe("El año en que se dio de alta"),
				motivo: z.string(),
			}),
		),
	}),
	permiso: { departamento: "ventas" },
});

/** El cajón del cliente nuevo o de sus datos. */
export const clienteVentas = definirConsulta({
	nombre: "ventas.cliente",
	descripcion: "Los datos de un cliente para editarlos, o lo que pide el alta: las escuelas que todavía no son cliente",
	entrada: z.object({ cliente_id: z.uuid().optional().describe("El cliente; sin él, el alta") }),
	salida: z.object({
		escuelas: z
			.array(z.object({ escuela_id: z.uuid(), nombre: z.string() }))
			.describe("Las escuelas que todavía no son cliente, para el alta"),
		cliente: z
			.object({
				cliente_id: z.uuid(),
				version: z.number().int(),
				nombre: z.string(),
				tipo: z.enum(tiposDeCliente),
				escuela: z.string().nullable(),
				municipio: z.string(),
				direccion_entrega: z.string(),
				contacto: z.string().nullable(),
				telefono: z.string(),
				correo: z.string().nullable(),
				rfc: z.string().nullable(),
				lista: z.string().describe("El nombre de su lista de precios"),
				credito: creditoDeVentas,
				de_baja: z.boolean(),
			})
			.nullable(),
	}),
	permiso: { departamento: "ventas" },
});
