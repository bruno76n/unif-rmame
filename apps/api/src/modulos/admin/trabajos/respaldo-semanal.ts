/**
 * `admin.respaldo_semanal`: vuelca la base, la cifra y la sube al cubo de respaldos.
 * Fase 4 · docs/modulos/admin/respaldos.md («Respaldo semanal»)
 *
 * Corre el día y la hora de sus parámetros, en hora de México. Si ya hay uno correcto esa semana, no
 * corre. El volcado sale cifrado con la llave pública y se sube por partes mientras sale, sin pasar por
 * disco, con la suma de cada parte; la suma de todo queda en su registro. Si falla, queda registrado como
 * fallido y avisa a la dueña y a soporte; no se reintenta cada minuto: el recordatorio diario vuelve a avisar.
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { and, eq, gte } from "drizzle-orm";
import { cubos } from "../../../nucleo/almacen.ts";
import type { Horario, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { volcarYCifrar } from "../../../nucleo/respaldo.ts";
import { respaldos } from "../tablas.ts";

/** Los días de la semana como los guarda `admin.dia_respaldo_semanal`, del lunes (1) al domingo (7). */
const diasDeLaSemana = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

export const respaldoSemanal: Trabajo = {
	nombre: "admin.respaldo_semanal",
	horario: async (contexto): Promise<Horario> => ({
		cada: "semana",
		dia:
			diasDeLaSemana.indexOf(String(await leerParametro(contexto.base, { clave: "admin.dia_respaldo_semanal" }))) + 1,
		hora: String(await leerParametro(contexto.base, { clave: "admin.hora_respaldo_semanal" })),
	}),
	correr: async (contexto) => {
		// El lunes de esta semana en México: si ya hay uno correcto desde entonces, no corre.
		const local = contexto.ahora.toZonedDateTimeISO(zonaDelNegocio);
		const lunes = local.toPlainDate().subtract({ days: local.dayOfWeek - 1 });
		const desde = lunes.toZonedDateTime(zonaDelNegocio).toInstant().toString();
		const [yaHay] = await contexto.base
			.select({ id: respaldos.id })
			.from(respaldos)
			.where(and(eq(respaldos.estado, "correcto"), gte(respaldos.hechoEn, desde)));
		if (yaHay !== undefined) return;
		const fecha = local.toPlainDate().toString();
		const destino = `r2://${cubos.respaldos}/${local.year}/${fecha}.dump.age`;
		const clave = `${local.year}/${fecha}.dump.age`;
		const hechoEn = contexto.ahora.toString();
		let registro: Record<string, unknown>;
		try {
			const medios = contexto.respaldo;
			if (medios === undefined) {
				throw new Error("el worker no tiene la llave pública, la credencial del cubo de respaldos o el rol dueño");
			}
			const { flujo, termino } = volcarYCifrar(medios);
			const [subido] = await Promise.all([
				medios.almacen.guardarFlujo(clave, flujo, "application/octet-stream"),
				termino,
			]);
			registro = { estado: "correcto", tamano_bytes: subido.tamano, sha256: subido.sha256 };
		} catch (error) {
			registro = { estado: "fallido", error: error instanceof Error ? error.message : String(error) };
		}
		await contexto.enTransaccion((accion) =>
			accion.interna("admin.registrar_respaldo", { hecho_en: hechoEn, cifrado: true, destino, ...registro }),
		);
	},
};
