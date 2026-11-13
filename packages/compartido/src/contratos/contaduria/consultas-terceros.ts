/**
 * Los contratos de las consultas de los terceros: `contaduria.terceros` (la pestaña Terceros, con sus compensaciones)
 * y `contaduria.tercero` (el cajón del tercero, consulta sensible). Solo las pide Contaduría.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Terceros», «El tercero»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { cursor, estadoArmado, monto, opcion, pagina } from "./vistas.ts";

/** Los roles de un tercero. */
export const rolesDeTercero = ["cliente", "proveedor", "acreedor"] as const;

/** El saldo neto de un tercero: a favor, en contra o saldado. */
const neto = z.object({
	como: z.enum(["a_favor", "en_contra", "saldado"]),
	monto_centavos: monto.describe("Lo que nos debe menos lo que le debemos, sin signo"),
});

/** Una compensación con su tercero. */
const compensacion = z.object({
	compensacion_id: z.uuid(),
	version: z.number().int(),
	fecha: z.string().describe("«9 nov»"),
	tercero: z.string(),
	descripcion: z.string(),
	monto_centavos: monto,
	cancelada: z.boolean(),
});

export const tercerosDeContaduria = definirConsulta({
	nombre: "contaduria.terceros",
	descripcion:
		"Los terceros con lo que nos deben, lo que les debemos y su saldo neto (primero los que van de los dos lados, luego del mayor al menor), y las compensaciones",
	entrada: z.object({
		buscar: z.string().trim().max(80).optional().describe("Parte del nombre"),
		rol: z.enum(rolesDeTercero).optional().describe("Solo clientes, proveedores o acreedores"),
		cursor,
	}),
	salida: z.object({
		renglones: z.array(
			z.object({
				tercero_id: z.uuid(),
				nombre: z.string(),
				relacion: z.array(z.string()).describe("«Cliente», «Proveedor», «Acreedor»"),
				por_cobrar_centavos: monto,
				por_pagar_centavos: monto,
				neto,
			}),
		),
		...pagina,
		compensaciones: z.array(compensacion),
		para_deuda: z.array(opcion).describe("Los terceros, para «¿A quién le debemos?»"),
	}),
	permiso: { departamento: "contaduria" },
});

export const terceroDeContaduria = definirConsulta({
	nombre: "contaduria.tercero",
	descripcion:
		"El cajón del tercero: lo que nos debe, lo que le debemos, sus deudas, los pagos a su cuenta y sus compensaciones; queda en la bitácora como consulta sensible",
	entrada: z.object({ tercero_id: z.uuid().describe("El tercero") }),
	salida: z.object({
		tercero_id: z.uuid(),
		nombre: z.string(),
		relacion: z.string().describe("«Cliente y Acreedor»"),
		cliente_id: z.uuid().nullable().describe("Su cliente, si es cliente"),
		nos_debe_centavos: monto,
		le_debemos_centavos: monto,
		maximo_compensar_centavos: monto.describe("Lo menor entre lo que nos debe y lo que le debemos sin lo detenido"),
		neto,
		nos_debe: z.array(
			z.object({
				folio: z.string(),
				vence: z.string().describe("«24 nov»"),
				vencida: z.boolean(),
				saldo_centavos: monto,
			}),
		),
		le_debemos: z.array(
			z.object({
				documento: z.string(),
				prestamo_total_centavos: monto.describe("En un préstamo, el saldo total del préstamo"),
				vence: z.string(),
				vencida: z.boolean(),
				saldo_centavos: monto,
				detenida: z.boolean(),
			}),
		),
		deudas: z.array(
			z.object({
				deuda_id: z.uuid(),
				version: z.number().int(),
				folio: z.string(),
				descripcion: z.string(),
				estado: estadoArmado,
				mensualidades: z.string().describe("«3 de 20 pagadas»"),
				cancelable: z.boolean().describe("Abierta y sin pagos"),
			}),
		),
		pagos_a_su_cuenta: z.array(
			z.object({
				pago_id: z.uuid(),
				texto: z.string().describe("«{cliente} depositó a {tercero}»"),
				aplicado: z.string().describe("«aplicado a {deuda}» o «sin aplicar»"),
				monto_centavos: monto,
				a_favor_centavos: monto.describe("Lo que queda a favor con el tercero"),
			}),
		),
		compensaciones: z.array(compensacion),
	}),
	permiso: { departamento: "contaduria" },
});
