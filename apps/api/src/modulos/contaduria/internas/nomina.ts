/**
 * Las internas y la lectura de la nómina que llaman Personal y Configuración: crear la nómina de una semana al
 * cerrarla, mover las fechas de pago cuando cambia el día de pago, y decir si la nómina de una semana está pagada.
 * Fase 17 · docs/modulos/contaduria/nomina.md (reglas 1 y 12, «Acciones internas», «Lecturas»)
 *
 * Ninguna escribe bitácora: la escribe la acción que las llama.
 */

import { textoDeDia } from "@uniformame/compartido/calculos/fechas";
import { asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { textoDeSemana } from "../../personal/dominio/asistencia.ts";
import { candadoDeLaNomina, fechaDePago, primerDiaDesde } from "../dominio/nomina.ts";
import { nominas } from "../tablas.ts";

/** Lo que recibe `contaduria.crear_nomina_semana`. */
const deLaSemana = z
	.object({ asistencia_semana_id: z.uuid(), fecha_inicio: z.iso.date(), fecha_fin: z.iso.date() })
	.strict();

/** El evento de una nómina por pagar. */
function eventoListaParaPagar(contexto: ContextoDeAccion, nominaId: string): void {
	contexto.guardarEvento({
		tipo: "nomina.lista_para_pagar",
		datos: { nomina_id: nominaId },
		tablas: ["nominas"],
		entidad: "nominas",
		entidadId: nominaId,
	});
}

/**
 * `contaduria.crear_nomina_semana`: Personal cerró la semana; nace su nómina por pagar, con su fecha de pago (regla 1).
 * Si la semana ya tenía nómina (se reabrió y se volvió a cerrar), regresa esa.
 * @param contexto El contexto de `personal.cerrar_semana_asistencia`.
 * @param datos La semana con su inicio y su fin.
 * @returns La nómina y su fecha de pago.
 */
export async function crearNominaSemana(contexto: ContextoDeAccion, datos: unknown) {
	const semana = deLaSemana.parse(datos);
	const { transaccion } = contexto;
	const [existente] = await transaccion
		.select({ id: nominas.id, fechaPago: nominas.fechaPago })
		.from(nominas)
		.where(eq(nominas.asistenciaSemanaId, semana.asistencia_semana_id));
	if (existente !== undefined) {
		eventoListaParaPagar(contexto, existente.id);
		return { nomina_id: existente.id, fecha_pago: existente.fechaPago };
	}
	const dia = String(await contexto.lectura("admin.parametro", { clave: "nomina.dia_pago" }));
	const id = uuidv7();
	const pago = fechaDePago(semana.fecha_fin, dia);
	await transaccion.insert(nominas).values({
		id,
		asistenciaSemanaId: semana.asistencia_semana_id,
		fechaInicio: semana.fecha_inicio,
		fechaFin: semana.fecha_fin,
		fechaPago: pago,
	});
	eventoListaParaPagar(contexto, id);
	return { nomina_id: id, fecha_pago: pago };
}

/** Lo que recibe `contaduria.mover_fecha_pago_nomina`. */
const conDiaDePago = z.object({ dia_pago: z.string() }).strict();

/**
 * `contaduria.mover_fecha_pago_nomina`: la dueña cambió el día de pago; cada nómina por pagar pasa a la siguiente fecha
 * con ese día, a partir de mañana (regla 12).
 * @param contexto El contexto de `admin.cambiar_parametro`.
 * @param datos El día de pago nuevo.
 * @returns Las nóminas que cambiaron, con su semana, su fecha de antes y la nueva, para la bitácora de Configuración.
 */
export async function moverFechaPagoNomina(contexto: ContextoDeAccion, datos: unknown) {
	const { dia_pago } = conDiaDePago.parse(datos);
	const { transaccion } = contexto;
	await candadoDeLaNomina(transaccion);
	const nueva = primerDiaDesde(contexto.diaDeNegocio.add({ days: 1 }), dia_pago).toString();
	const porPagar = await transaccion
		.select()
		.from(nominas)
		.where(eq(nominas.estado, "por_pagar"))
		.orderBy(asc(nominas.fechaInicio));
	const movidas: { nomina_id: string; descripcion: string; antes: string; despues: string }[] = [];
	for (const nomina of porPagar) {
		if (nomina.fechaPago === nueva) continue;
		await transaccion.update(nominas).set({ fechaPago: nueva }).where(eq(nominas.id, nomina.id));
		contexto.guardarEvento({
			tipo: "nomina.fecha_pago_cambiada",
			datos: { nomina_id: nomina.id },
			tablas: ["nominas"],
			entidad: "nominas",
			entidadId: nomina.id,
		});
		movidas.push({
			nomina_id: nomina.id,
			descripcion: `Fecha de pago de la nómina del ${textoDeSemana(nomina.fechaInicio, nomina.fechaFin)}: ${textoDeDia(nomina.fechaPago)} → ${textoDeDia(nueva)}`,
			antes: nomina.fechaPago,
			despues: nueva,
		});
	}
	return { nominas: movidas };
}

/** Lo que recibe `contaduria.estado_nomina_semana`. */
const deUnaSemana = z.object({ asistencia_semana_id: z.uuid() }).strict();

/**
 * `contaduria.estado_nomina_semana`: si la semana tiene nómina, su estado y su fecha de pago.
 * @param contexto El contexto de quien lee (Personal, al reabrir la semana).
 * @param datos `asistencia_semana_id`.
 */
export async function estadoNominaSemana(contexto: ContextoDeAccion, datos: unknown) {
	const { asistencia_semana_id } = deUnaSemana.parse(datos);
	const [nomina] = await contexto.transaccion
		.select({ estado: nominas.estado, fechaPago: nominas.fechaPago })
		.from(nominas)
		.where(eq(nominas.asistenciaSemanaId, asistencia_semana_id));
	return {
		pagada: nomina?.estado === "pagada",
		estado: nomina?.estado ?? null,
		fecha_pago: nomina?.fechaPago ?? null,
	};
}
