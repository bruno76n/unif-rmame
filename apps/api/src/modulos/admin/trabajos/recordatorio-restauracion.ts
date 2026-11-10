/**
 * `admin.recordatorio_restauracion`: recuerda probar la restauración y avisa si no hay respaldos buenos.
 * Fase 4 · docs/modulos/admin/respaldos.md («Recordatorio de prueba de restauración»)
 *
 * Corre cada día a `admin.hora_recordatorio_respaldo`, hora de México.
 * - Si desde la última prueba que cuadró (o, sin ninguna, desde el primer respaldo) pasaron
 *   `admin.restauracion_aviso_dias`, avisa `restauracion_por_probar` a la dueña.
 * - Si el último respaldo falló, o no hay uno correcto en los últimos `admin.dias_respaldo_vencido` días,
 *   avisa `respaldo_fallido` a la dueña y a soporte.
 * - Cada aviso se repite cada `admin.dias_repetir_recordatorio`, no antes.
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { ContextoDeAccion, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { textoDeRespaldoFallido } from "../internas/registrar-respaldo.ts";
import { avisos, respaldos, restauracionesProbadas } from "../tablas.ts";

/** Lee un parámetro entero en la transacción. */
async function entero(contexto: ContextoDeAccion, clave: string): Promise<number> {
	return Number(await contexto.lectura("admin.parametro", { clave }));
}

/** Dice si ya salió un aviso de ese tipo hace menos de `dias`. */
async function avisadoHacePoco(contexto: ContextoDeAccion, tipo: string, dias: number): Promise<boolean> {
	const desde = contexto.ahora.subtract({ hours: dias * 24 }).toString();
	const [reciente] = await contexto.transaccion
		.select({ id: avisos.id })
		.from(avisos)
		.where(and(eq(avisos.tipo, tipo), gte(avisos.creadoEn, desde)))
		.limit(1);
	return reciente !== undefined;
}

/** Los días completos entre dos momentos. */
function diasEntre(desde: string, hasta: Temporal.Instant): number {
	return Math.floor(Temporal.Instant.from(new Date(desde).toISOString()).until(hasta).total("hours") / 24);
}

export const recordatorioRestauracion: Trabajo = {
	nombre: "admin.recordatorio_restauracion",
	horario: async (contexto) => ({
		cada: "dia",
		hora: String(await leerParametro(contexto.base, { clave: "admin.hora_recordatorio_respaldo" })),
	}),
	correr: async (contexto) => {
		await contexto.enTransaccion(async (accion) => {
			const { transaccion, ahora } = accion;
			const repetir = await entero(accion, "admin.dias_repetir_recordatorio");
			const [ultimaBuena] = await transaccion
				.select({ probadaEn: restauracionesProbadas.probadaEn })
				.from(restauracionesProbadas)
				.where(eq(restauracionesProbadas.conteosCuadraron, true))
				.orderBy(desc(restauracionesProbadas.probadaEn))
				.limit(1);
			const [primerRespaldo] = await transaccion
				.select({ hechoEn: respaldos.hechoEn })
				.from(respaldos)
				.orderBy(asc(respaldos.hechoEn))
				.limit(1);
			const desde = ultimaBuena?.probadaEn ?? primerRespaldo?.hechoEn;
			if (desde !== undefined) {
				const dias = diasEntre(desde, ahora);
				if (dias >= (await entero(accion, "admin.restauracion_aviso_dias"))) {
					if (!(await avisadoHacePoco(accion, "restauracion_por_probar", repetir))) {
						const siguiente = Temporal.Instant.from(new Date(desde).toISOString())
							.add({ hours: 24 * (await entero(accion, "admin.restauracion_cada_dias")) })
							.toZonedDateTimeISO(zonaDelNegocio)
							.toPlainDate();
						await accion.interna("admin.crear_aviso", {
							tipo: "restauracion_por_probar",
							destinatarios: { regla: "duena" },
							texto: `Prueba de restauración: la última fue hace ${dias} días. La siguiente toca el ${siguiente.toString()}.`,
							enlace: "admin/respaldos",
						});
					}
				}
			}
			const [ultimo] = await transaccion
				.select({ estado: respaldos.estado, error: respaldos.error })
				.from(respaldos)
				.orderBy(desc(respaldos.hechoEn))
				.limit(1);
			const vencido = await entero(accion, "admin.dias_respaldo_vencido");
			const [correctoReciente] = await transaccion
				.select({ id: respaldos.id })
				.from(respaldos)
				.where(
					and(
						eq(respaldos.estado, "correcto"),
						gte(respaldos.hechoEn, ahora.subtract({ hours: vencido * 24 }).toString()),
					),
				)
				.limit(1);
			const fallo = ultimo?.estado === "fallido";
			if (
				(fallo || (ultimo !== undefined && correctoReciente === undefined)) &&
				!(await avisadoHacePoco(accion, "respaldo_fallido", repetir))
			) {
				const error = fallo ? (ultimo?.error ?? "sin mensaje") : `no hay uno correcto en los últimos ${vencido} días`;
				for (const regla of ["duena", "soporte"]) {
					await accion.interna("admin.crear_aviso", {
						tipo: "respaldo_fallido",
						destinatarios: { regla },
						texto: textoDeRespaldoFallido(error),
						enlace: "admin/respaldos",
					});
				}
			}
		});
	},
};
