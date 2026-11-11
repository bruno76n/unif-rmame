/**
 * `produccion.poner_tarifa_a_registros` y `produccion.registros_para_nomina`: la tarifa que Personal pone después
 * llega a los registros que no la tenían, y Contaduría lee los registros para la nómina por pieza.
 * Fase 12 · docs/modulos/produccion/registros-de-operacion.md (regla 4, «Acciones internas», «Lecturas»)
 *
 * Saber cuáles registros son de semanas ya pagadas llega con la nómina (fase 17): hasta entonces son cero.
 */

import { and, eq, gte, isNull, lt, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { registrosOperacion } from "../tablas.ts";

/** Lo que recibe `produccion.poner_tarifa_a_registros`. */
const tarifaNueva = z.object({
	flujo_operacion_id: z.uuid(),
	tarifa_operacion_id: z.uuid(),
	tarifa_centavos: z.number().int().positive(),
});

/**
 * Los registros vigentes de esa operación sin tarifa toman la que se puso, con `tarifa_puesta_en`.
 * @returns Cuántos la tomaron y cuántos son de semanas ya pagadas, sin montos.
 */
export async function ponerTarifaARegistros(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = tarifaNueva.parse(datos);
	const tomaron = await contexto.transaccion
		.update(registrosOperacion)
		.set({
			tarifaCentavos: pedido.tarifa_centavos,
			tarifaOperacionId: pedido.tarifa_operacion_id,
			tarifaPuestaEn: contexto.ahora.toString(),
		})
		.where(
			and(
				eq(registrosOperacion.flujoOperacionId, pedido.flujo_operacion_id),
				eq(registrosOperacion.estado, "vigente"),
				isNull(registrosOperacion.tarifaCentavos),
			),
		)
		.returning({ id: registrosOperacion.id });
	if (tomaron.length > 0) {
		contexto.guardarEvento({
			tipo: "registros_operacion.tarifa_puesta",
			datos: { flujo_operacion_id: pedido.flujo_operacion_id },
			tablas: ["registros_operacion"],
		});
	}
	return { tomaron: tomaron.length, de_semanas_pagadas: 0 };
}

/** Lo que recibe `produccion.registros_para_nomina`. */
const periodo = z.object({ desde: z.iso.datetime({ offset: true }), hasta: z.iso.datetime({ offset: true }) });

/**
 * Los registros que llegaron al servidor, se cancelaron o tomaron su tarifa en ese tiempo, con su persona, su fecha,
 * su operación, sus piezas, su tarifa, cuándo la tomó, su estado y cuándo se canceló.
 * @param contexto El contexto de quien lee (Contaduría).
 * @param datos `desde` y `hasta` (este, sin incluir).
 */
export async function registrosParaNomina(contexto: ContextoDeAccion, datos: unknown) {
	const { desde, hasta } = periodo.parse(datos);
	const enElTramo = (columna: AnyPgColumn) => and(gte(columna, desde), lt(columna, hasta));
	const filas = await contexto.transaccion
		.select({
			registro_id: registrosOperacion.id,
			persona_id: registrosOperacion.personaId,
			fecha: registrosOperacion.fecha,
			flujo_operacion_id: registrosOperacion.flujoOperacionId,
			piezas_buenas: registrosOperacion.piezasBuenas,
			piezas_danadas: registrosOperacion.piezasDanadas,
			tarifa_centavos: registrosOperacion.tarifaCentavos,
			tarifa_puesta_en: registrosOperacion.tarifaPuestaEn,
			estado: registrosOperacion.estado,
			cancelado_en: registrosOperacion.canceladoEn,
		})
		.from(registrosOperacion)
		.where(
			or(
				enElTramo(registrosOperacion.recibidoEn),
				enElTramo(registrosOperacion.canceladoEn),
				enElTramo(registrosOperacion.tarifaPuestaEn),
			),
		)
		.orderBy(registrosOperacion.fecha, registrosOperacion.id);
	return { registros: filas };
}
