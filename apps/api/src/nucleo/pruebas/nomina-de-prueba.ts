/**
 * Las ayudas de las pruebas de la nómina: una semana cerrada con su nómina, una persona del taller con su forma de
 * pago, un registro de la tablet, la cuenta de una nómina como la ve la pantalla y pagarla.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md («Cómo se construye»: las pruebas usan
 * las personas, la asistencia y los registros reales)
 *
 * Las semanas de prueba son de 2025: los registros de la muestra son de 2026, así no entran a sus nóminas. Los
 * registros nuevos usan el bulto, el lote, la operación y la tablet de un registro de la muestra.
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { asistenciaDeLaNomina, bloquearNomina, cuentaDeLaNomina } from "../../modulos/contaduria/dominio/nomina.ts";
import { crearBase } from "../base/conexion.ts";
import { enAccionDePrueba } from "./accion-de-prueba.ts";
import { llamarInterna } from "./inventario-de-prueba.ts";
import { conGoogle, mandarAccion } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Una semana de prueba con su nómina. */
export interface SemanaDePrueba {
	semanaId: string;
	nominaId: string;
	inicio: string;
	fin: string;
}

/**
 * Una semana de lunes a sábado, cerrada directo en la base, y su nómina con `contaduria.crear_nomina_semana`, como al
 * cerrarla Personal.
 * @param servidor El servidor de prueba.
 * @param lunes Su primer día.
 */
export async function semanaConNomina(servidor: ServidorDePrueba, lunes: string): Promise<SemanaDePrueba> {
	const fin = Temporal.PlainDate.from(lunes).add({ days: 5 }).toString();
	const { rows } = await servidor.base.dueno.query(
		`INSERT INTO asistencia_semanas (id, fecha_inicio, fecha_fin, estado, cerrada_en)
		 VALUES (gen_random_uuid(), $1, $2, 'cerrada', now()) RETURNING id`,
		[lunes, fin],
	);
	const semanaId = z.uuid().parse(rows[0]?.id);
	const { nomina_id } = z.object({ nomina_id: z.uuid() }).parse(
		await llamarInterna(servidor, "contaduria.crear_nomina_semana", {
			asistencia_semana_id: semanaId,
			fecha_inicio: lunes,
			fecha_fin: fin,
		}),
	);
	return { semanaId, nominaId: nomina_id, inicio: lunes, fin };
}

/**
 * Una persona del taller, directo en la base, con su forma de pago y su pago por día.
 * @param servidor El servidor de prueba.
 * @param ficha Su nombre, su forma de pago y su pago por día (si cobra por tiempo o mixta); entró en 2020.
 * @returns Su id.
 */
export async function personaDeNomina(
	servidor: ServidorDePrueba,
	ficha: { nombre: string; formaPago: "tiempo" | "pieza" | "mixta"; pagoDiaCentavos?: number },
): Promise<string> {
	const id = uuidv7();
	await servidor.base.dueno.query(
		`INSERT INTO personas (id, folio, nombre, area, puesto, forma_pago, pago_dia_centavos, fecha_ingreso)
		 VALUES ($1, $2, $3, 'taller', 'Costurera', $4, $5, '2020-01-06')`,
		[id, `E-N${id.slice(-8)}`, ficha.nombre, ficha.formaPago, ficha.pagoDiaCentavos ?? null],
	);
	return id;
}

/** El bulto, el lote, la operación y la tablet de un registro de la muestra, para los registros de prueba. */
async function dondeRegistrar(servidor: ServidorDePrueba) {
	const { rows } = await servidor.base.dueno.query(
		`SELECT bulto_id, lote_id, flujo_operacion_id, dispositivo_id FROM registros_operacion
		 WHERE origen = 'tablet' ORDER BY id LIMIT 1`,
	);
	return z
		.object({ bulto_id: z.uuid(), lote_id: z.uuid(), flujo_operacion_id: z.uuid(), dispositivo_id: z.uuid() })
		.parse(rows[0]);
}

/**
 * Un registro de la tablet, directo en la base, con la tarifa que se diga (o sin tarifa).
 * @param servidor El servidor de prueba.
 * @param registro La persona, el día, sus buenas y sus dañadas, y su tarifa.
 * @returns Su id.
 */
export async function registroDeNomina(
	servidor: ServidorDePrueba,
	registro: { personaId: string; fecha: string; buenas: number; danadas?: number; tarifaCentavos: number | null },
): Promise<string> {
	const donde = await dondeRegistrar(servidor);
	const id = uuidv7();
	await servidor.base.dueno.query(
		`INSERT INTO registros_operacion (id, bulto_id, lote_id, flujo_operacion_id, persona_id, dispositivo_id,
			piezas_buenas, piezas_danadas, tarifa_centavos, tarifa_puesta_en, clave_idempotencia, hecho_en, fecha,
			sin_internet)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9::bigint IS NULL THEN NULL ELSE now() END, $10,
			($11::date + time '10:00') AT TIME ZONE 'America/Mexico_City', $11, false)`,
		[
			id,
			donde.bulto_id,
			donde.lote_id,
			donde.flujo_operacion_id,
			registro.personaId,
			donde.dispositivo_id,
			registro.buenas,
			registro.danadas ?? 0,
			registro.tarifaCentavos,
			uuidv7(),
			registro.fecha,
		],
	);
	return id;
}

/**
 * Cancela un registro, directo en la base, como lo cancela Producción.
 * @param servidor El servidor de prueba.
 * @param registroId El registro.
 */
export async function cancelarRegistroDeNomina(servidor: ServidorDePrueba, registroId: string): Promise<void> {
	await servidor.base.dueno.query(
		"UPDATE registros_operacion SET estado = 'cancelado', cancelado_en = now(), motivo_cancelacion = 'Prueba' WHERE id = $1",
		[registroId],
	);
}

/**
 * Pone su tarifa a un registro que no tenía, directo en la base, como la pone Personal después.
 * @param servidor El servidor de prueba.
 * @param registroId El registro.
 * @param tarifa La tarifa.
 */
export async function ponerTarifaDeNomina(
	servidor: ServidorDePrueba,
	registroId: string,
	tarifa: number,
): Promise<void> {
	await servidor.base.dueno.query(
		"UPDATE registros_operacion SET tarifa_centavos = $2, tarifa_puesta_en = now() WHERE id = $1",
		[registroId, tarifa],
	);
}

/**
 * La cuenta de una nómina como la ve la pantalla, en su propia transacción.
 * @param servidor El servidor de prueba.
 * @param nominaId La nómina.
 */
export async function cuentaDePrueba(servidor: ServidorDePrueba, nominaId: string) {
	return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, async (contexto) => {
		const nomina = await bloquearNomina(contexto.transaccion, nominaId);
		return (await cuentaDeLaNomina(contexto, nomina, await asistenciaDeLaNomina(contexto, nomina))).cuenta;
	});
}

/**
 * Contaduría paga una nómina con «Confirmar con Google», el total que da su cuenta (o el que se diga) y su versión.
 * @param servidor El servidor de prueba.
 * @param nominaId La nómina.
 * @param opciones El total visto, los renglones, quién paga y los encabezados.
 */
export async function pagarNominaDePrueba(
	servidor: ServidorDePrueba,
	nominaId: string,
	opciones: {
		total?: number;
		renglones?: unknown[];
		quien?: string;
		encabezados?: Record<string, string>;
	} = {},
) {
	const total = opciones.total ?? (await cuentaDePrueba(servidor, nominaId)).totalCentavos;
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM nominas WHERE id = $1", [nominaId]);
	return mandarAccion(
		servidor,
		"contaduria.pagar_nomina",
		{
			datos: {
				nomina_id: nominaId,
				total_visto_centavos: total,
				...(opciones.renglones === undefined ? {} : { renglones: opciones.renglones }),
			},
			version: rows[0]?.v,
		},
		opciones.quien ?? "contaduria_sueldos",
		opciones.encabezados ?? conGoogle(),
	);
}

/**
 * El renglón de una persona en una nómina pagada.
 * @param servidor El servidor de prueba.
 * @param nominaId La nómina.
 * @param personaId La persona.
 */
export async function renglonPagado(servidor: ServidorDePrueba, nominaId: string, personaId: string) {
	const { rows } = await servidor.base.dueno.query(
		`SELECT dias::float AS dias, importe_tiempo_centavos::int AS tiempo, piezas, importe_piezas_centavos::int AS importe_piezas,
			correcciones_centavos::int AS correcciones, bruto_centavos::int AS bruto, descuento_centavos::int AS descuento,
			arrastre_centavos::int AS arrastre, descontado_centavos::int AS descontado,
			no_alcanzo_centavos::int AS no_alcanzo, destino_no_alcanzo AS destino, total_centavos::int AS total
		 FROM nomina_lineas WHERE nomina_id = $1 AND persona_id = $2`,
		[nominaId, personaId],
	);
	return rows[0];
}
