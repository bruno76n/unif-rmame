/**
 * El contrato de `contaduria.estado_pago_notas`: si cada nota de entrega entregada está sin pagar, pagada en parte o
 * pagada. Lo pide la pestaña Notas de entrega de Ventas a externos para su columna «Pago».
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Notas de entrega») y docs/modulos/contaduria/cuentas-por-cobrar.md
 * («Lecturas»)
 *
 * El saldo de cada nota solo viaja a quien tiene Contaduría (o a la dueña); a Ventas, el estado del pago.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";

/** Los estados del pago de una nota. */
export const estadosDePago = ["sin_pagar", "pagada_en_parte", "pagada"] as const;

export const estadoPagoNotas = definirConsulta({
	nombre: "contaduria.estado_pago_notas",
	descripcion: "El estado del pago de unas notas de entrega entregadas; el saldo, solo a quien tiene Contaduría",
	entrada: z.object({
		nota_ids: z
			.string()
			.regex(/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,99}$/, "Las notas van por sus ids, separadas por coma, hasta 100")
			.describe("Las notas de entrega, por sus ids separadas por coma; hasta 100"),
	}),
	salida: z.object({
		notas: z.array(
			z.object({
				nota_entrega_id: z.uuid(),
				estado: z.enum(estadosDePago),
				texto: z.string().describe("«Sin pagar», «Pagada en parte» o «Pagada»"),
				saldo_centavos: z.number().int().optional().describe("Solo a quien tiene Contaduría"),
			}),
		),
	}),
	permiso: { departamento: ["ventas", "contaduria", "direccion"] },
	recortables: ["saldo_centavos"],
});
