/**
 * `contaduria.estado_pago_notas`: si cada nota de entrega entregada está sin pagar, pagada en parte o pagada, para la
 * columna «Pago» de las notas de entrega de Ventas a externos.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Notas de entrega») y docs/modulos/contaduria/cuentas-por-cobrar.md
 * («Lecturas»)
 *
 * Usa la lectura del mismo nombre, que solo da el saldo a quien tiene Contaduría (o a la dueña): a los demás se les
 * recorta. Una nota sin cuenta por cobrar (todavía por entregar) no sale.
 */

import { estadoPagoNotas } from "@uniformame/compartido/contratos/contaduria/estado-pago-notas";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";

/** Cómo se lee cada estado del pago. */
const textos = { sin_pagar: "Sin pagar", pagada_en_parte: "Pagada en parte", pagada: "Pagada" } as const;

/** Lo que regresa la lectura. */
const leido = z.object({
	notas: z.array(
		z.object({
			nota_entrega_id: z.uuid(),
			estado: z.enum(["sin_pagar", "pagada_en_parte", "pagada"]),
			saldo_centavos: z.number().optional(),
		}),
	),
});

export const consultaEstadoPagoNotas = implementarConsulta(estadoPagoNotas, async (contexto, parametros) => {
	const { notas } = leido.parse(
		await contexto.lectura("contaduria.estado_pago_notas", { nota_entrega_ids: parametros.nota_ids.split(",") }),
	);
	const conSaldo = notas.some((nota) => nota.saldo_centavos !== undefined);
	return {
		resultado: {
			notas: notas.map((nota) => ({
				nota_entrega_id: nota.nota_entrega_id,
				estado: nota.estado,
				texto: textos[nota.estado],
				...(nota.saldo_centavos === undefined ? {} : { saldo_centavos: nota.saldo_centavos }),
			})),
		},
		// Sin Contaduría, el saldo no viaja.
		...(conSaldo || notas.length === 0 ? {} : { recortado: ["saldo_centavos"] }),
	};
});
