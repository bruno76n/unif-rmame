/**
 * La nómina por dentro: su candado, sus fechas de pago y lo que junta para su cuenta de Personal (la asistencia y las
 * fichas), de Producción (los registros) y de sus propias tablas (lo ya pagado, lo que pasó de la anterior y los
 * descuentos).
 * Fase 17 · docs/modulos/contaduria/nomina.md (reglas 1 a 9 y 12, «La cuenta de la nómina»)
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { descuentosNomina, nominaLineaPiezas, nominaLineas, nominas } from "../tablas.ts";
import {
	type CuentaDeNomina,
	contarNomina,
	type FichaParaNomina,
	type FormaDePago,
	type RegistroACorregir,
	type RegistroParaPagar,
	type ReglasDeNomina,
} from "./cuenta-nomina.ts";

/** Una nómina como la lee quien la cambia. */
export type Nomina = typeof nominas.$inferSelect;

/** Los días de pago, en el número que les da Temporal (lunes 1 … domingo 7). */
const numeroDelDia: Readonly<Record<string, number>> = {
	lunes: 1,
	martes: 2,
	miercoles: 3,
	jueves: 4,
	viernes: 5,
	sabado: 6,
	domingo: 7,
};

/**
 * El primer día con ese día de la semana desde una fecha, ella incluida.
 * @param desde La fecha desde donde se busca.
 * @param dia El día de pago: `lunes` … `domingo`.
 * @throws Error si el día no es uno de la semana.
 */
export function primerDiaDesde(desde: Temporal.PlainDate, dia: string): Temporal.PlainDate {
	const buscado = numeroDelDia[dia];
	if (buscado === undefined) throw new Error(`${dia} no es un día de la semana`);
	return desde.add({ days: (buscado - desde.dayOfWeek + 7) % 7 });
}

/**
 * La fecha de pago de una semana (regla 1): el siguiente día de pago después de que termina.
 * @param fin El último día de la semana.
 * @param dia `nomina.dia_pago`.
 */
export function fechaDePago(fin: string, dia: string): string {
	return primerDiaDesde(Temporal.PlainDate.from(fin).add({ days: 1 }), dia).toString();
}

/**
 * Toma el candado de la nómina: dos pagos nunca corren a la vez, y una semana no se paga mientras otra se paga.
 * @param transaccion La transacción.
 */
export async function candadoDeLaNomina(transaccion: Transaccion): Promise<void> {
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('nomina', 0))`);
}

/**
 * Lee y bloquea una nómina.
 * @throws `404` si no existe.
 */
export async function bloquearNomina(transaccion: Transaccion, id: string): Promise<Nomina> {
	const [nomina] = await transaccion.select().from(nominas).where(eq(nominas.id, id)).for("update");
	if (nomina === undefined) throw noExiste();
	return nomina;
}

/** Lo que regresa `personal.asistencia_para_nomina`. */
const asistenciaLeida = z.object({
	semana: z.object({ asistencia_semana_id: z.uuid(), inicio: z.iso.date(), fin: z.iso.date(), cerrada: z.boolean() }),
	abiertas_anteriores: z.array(z.object({ id: z.uuid(), inicio: z.iso.date(), fin: z.iso.date() })),
	personas: z.array(z.object({ persona_id: z.uuid(), dias: z.number() })),
});

/** Lo que regresa `personal.fichas_para_nomina`. */
const fichasLeidas = z.object({
	fichas: z.array(
		z.object({
			persona_id: z.uuid(),
			nombre: z.string(),
			area: z.string(),
			ubicacion_id: z.uuid().nullable(),
			puesto: z.string(),
			forma_pago: z.enum(["tiempo", "pieza", "mixta"]),
			pago_dia_centavos: z.number().int().nullable(),
			baja_en: z.iso.date().nullable(),
		}),
	),
});

/** Lo que regresa `produccion.registros_para_nomina`. */
const registrosLeidos = z.object({
	registros: z.array(
		z.object({
			registro_id: z.uuid(),
			persona_id: z.uuid(),
			fecha: z.iso.date(),
			flujo_operacion_id: z.uuid(),
			piezas_buenas: z.number().int(),
			piezas_danadas: z.number().int(),
			tarifa_centavos: z.number().int().nullable(),
			estado: z.enum(["vigente", "cancelado"]),
		}),
	),
});

/** La asistencia de una semana, como la usa la nómina. */
export type AsistenciaDeLaSemana = z.infer<typeof asistenciaLeida>;

/**
 * La asistencia de la semana de una nómina, de Personal.
 * @param contexto El contexto de la acción.
 * @param nomina La nómina.
 */
export async function asistenciaDeLaNomina(
	contexto: ContextoDeAccion,
	nomina: Pick<Nomina, "asistenciaSemanaId">,
): Promise<AsistenciaDeLaSemana> {
	return asistenciaLeida.parse(
		await contexto.lectura("personal.asistencia_para_nomina", { asistencia_semana_id: nomina.asistenciaSemanaId }),
	);
}

/**
 * Las fichas de unas personas, de Personal.
 * @param contexto El contexto de la acción.
 * @param personaIds Las personas.
 */
export async function fichasDePersonas(
	contexto: ContextoDeAccion,
	personaIds: readonly string[],
): Promise<Map<string, FichaParaNomina>> {
	const { fichas } = fichasLeidas.parse(
		await contexto.lectura("personal.fichas_para_nomina", { persona_ids: [...new Set(personaIds)] }),
	);
	return new Map(
		fichas.map((ficha) => [
			ficha.persona_id,
			{
				personaId: ficha.persona_id,
				nombre: ficha.nombre,
				area: ficha.area,
				ubicacionId: ficha.ubicacion_id,
				puesto: ficha.puesto,
				formaPago: ficha.forma_pago satisfies FormaDePago,
				pagoDiaCentavos: ficha.pago_dia_centavos,
				bajaEn: ficha.baja_en,
			},
		]),
	);
}

/**
 * La última nómina pagada: de ella sale desde cuándo se leen los registros y lo que pasa a la siguiente semana.
 * @param transaccion La transacción.
 */
async function ultimaPagada(transaccion: Transaccion): Promise<Nomina | undefined> {
	const [nomina] = await transaccion
		.select()
		.from(nominas)
		.where(eq(nominas.estado, "pagada"))
		.orderBy(desc(nominas.fechaInicio))
		.limit(1);
	return nomina;
}

/**
 * Los registros que todavía cuentan para una nómina: de `produccion.registros_para_nomina`, desde el inicio de la
 * semana de la última nómina pagada (desde siempre, en la primera), los nuevos (vigentes, con tarifa, de la semana o
 * de antes y sin su renglón `pago`) y los que se cancelaron después de pagados (con su `pago` y sin su `correccion`).
 * @param contexto El contexto de la acción.
 * @param fin El último día de la semana que se paga.
 * @param ultima La última nómina pagada, si hay.
 */
async function registrosQueCuentan(
	contexto: ContextoDeAccion,
	fin: string,
	ultima: Nomina | undefined,
): Promise<{ registros: RegistroParaPagar[]; correcciones: RegistroACorregir[] }> {
	const desde =
		ultima === undefined
			? "2000-01-01T00:00:00Z"
			: Temporal.PlainDate.from(ultima.fechaInicio).toZonedDateTime(zonaDelNegocio).toInstant().toString();
	// Hasta ahora; con un día de holgura por si el reloj de la base va adelante del de la API (decisión 712).
	const hasta = contexto.ahora.add({ hours: 24 }).toString();
	const { registros } = registrosLeidos.parse(
		await contexto.lectura("produccion.registros_para_nomina", { desde, hasta }),
	);
	const ids = registros.map((registro) => registro.registro_id);
	const yaEntraron =
		ids.length === 0
			? []
			: await contexto.transaccion
					.select({
						registroId: nominaLineaPiezas.registroOperacionId,
						tipo: nominaLineaPiezas.tipo,
						piezasPagadas: nominaLineaPiezas.piezasPagadas,
						importe: nominaLineaPiezas.importeCentavos,
					})
					.from(nominaLineaPiezas)
					.where(inArray(nominaLineaPiezas.registroOperacionId, ids));
	const pagoDe = new Map(
		yaEntraron.filter((pieza) => pieza.tipo === "pago").map((pieza) => [pieza.registroId, pieza] as const),
	);
	const corregidos = new Set(
		yaEntraron.filter((pieza) => pieza.tipo === "correccion").map((pieza) => pieza.registroId),
	);
	const comoRegistro = (registro: (typeof registros)[number]): RegistroParaPagar => ({
		registroId: registro.registro_id,
		personaId: registro.persona_id,
		fecha: registro.fecha,
		flujoOperacionId: registro.flujo_operacion_id,
		piezasBuenas: registro.piezas_buenas,
		piezasDanadas: registro.piezas_danadas,
		tarifaCentavos: registro.tarifa_centavos ?? 0,
	});
	return {
		registros: registros
			.filter(
				(registro) =>
					registro.estado === "vigente" &&
					registro.tarifa_centavos !== null &&
					registro.fecha <= fin &&
					!pagoDe.has(registro.registro_id),
			)
			.map(comoRegistro),
		correcciones: registros.flatMap((registro) => {
			const pago = pagoDe.get(registro.registro_id);
			if (registro.estado !== "cancelado" || pago === undefined || corregidos.has(registro.registro_id)) return [];
			return [{ ...comoRegistro(registro), piezasPagadas: pago.piezasPagadas, importePagadoCentavos: pago.importe }];
		}),
	};
}

/**
 * Lo que pasó de la nómina anterior (regla 8): lo que no alcanzó de cada persona, si se fue a la siguiente semana.
 * @param transaccion La transacción.
 * @param ultima La última nómina pagada.
 */
async function arrastresDe(transaccion: Transaccion, ultima: Nomina | undefined): Promise<Map<string, number>> {
	if (ultima === undefined) return new Map();
	const lineas = await transaccion
		.select({ personaId: nominaLineas.personaId, monto: nominaLineas.noAlcanzoCentavos })
		.from(nominaLineas)
		.where(and(eq(nominaLineas.nominaId, ultima.id), eq(nominaLineas.destinoNoAlcanzo, "siguiente_semana")));
	return new Map(lineas.map((linea) => [linea.personaId, linea.monto]));
}

/**
 * Los descuentos semanales vigentes de unas personas.
 * @param transaccion La transacción.
 * @param personaIds Las personas.
 */
async function descuentosDe(transaccion: Transaccion, personaIds: readonly string[]) {
	if (personaIds.length === 0) return new Map();
	const vigentes = await transaccion
		.select()
		.from(descuentosNomina)
		.where(and(inArray(descuentosNomina.personaId, [...personaIds]), eq(descuentosNomina.estado, "vigente")));
	return new Map(
		vigentes.map((descuento) => [
			descuento.personaId,
			{ id: descuento.id, montoCentavos: descuento.montoSemanalCentavos, motivo: descuento.motivo },
		]),
	);
}

/**
 * Las dos opciones de la nómina, de sus parámetros.
 * @param contexto El contexto de la acción.
 */
export async function reglasDeLaNomina(contexto: ContextoDeAccion): Promise<ReglasDeNomina> {
	const danadas = await contexto.lectura("admin.parametro", { clave: "nomina.pagar_piezas_danadas" });
	const mayor = await contexto.lectura("admin.parametro", { clave: "nomina.descuento_mayor_que_lo_ganado" });
	return {
		pagarDanadas: danadas === true,
		descuentoMayor: mayor === "siguiente_semana" ? "siguiente_semana" : "perdonar",
	};
}

/**
 * La cuenta de una nómina con lo de hoy: la asistencia y las fichas de Personal, los registros de Producción, lo ya
 * pagado, lo que pasó de la anterior, los descuentos vigentes y las dos opciones.
 * @param contexto El contexto de la acción.
 * @param nomina La nómina.
 * @param asistencia La asistencia de su semana.
 */
export async function cuentaDeLaNomina(
	contexto: ContextoDeAccion,
	nomina: Pick<Nomina, "fechaFin">,
	asistencia: AsistenciaDeLaSemana,
): Promise<{ cuenta: CuentaDeNomina; reglas: ReglasDeNomina }> {
	const { transaccion } = contexto;
	const ultima = await ultimaPagada(transaccion);
	const { registros, correcciones } = await registrosQueCuentan(contexto, nomina.fechaFin, ultima);
	const arrastres = await arrastresDe(transaccion, ultima);
	const conAsistencia = new Map(asistencia.personas.map((persona) => [persona.persona_id, persona.dias]));
	const personas = [
		...conAsistencia.keys(),
		...registros.map((registro) => registro.personaId),
		...correcciones.map((registro) => registro.personaId),
		...arrastres.keys(),
	];
	const reglas = await reglasDeLaNomina(contexto);
	const cuenta = contarNomina({
		conAsistencia,
		fichas: await fichasDePersonas(contexto, personas),
		registros,
		correcciones,
		arrastres,
		descuentos: await descuentosDe(transaccion, [...new Set(personas)]),
		reglas,
	});
	return { cuenta, reglas };
}
