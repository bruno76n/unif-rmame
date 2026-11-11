/**
 * `admin.depurar_eventos`: quita los eventos procesados de hace más de `admin.dias_guardar_eventos`.
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («Depurar eventos»)
 *
 * Suelta las particiones de los meses que terminaron antes del corte y ya no tienen nada sin procesar
 * (`soltar_particiones_de_eventos`, con los permisos del dueño). Un mes a medias espera a que termine su
 * mes completo. No toca `avisos`, `bitacora` ni `comandos_recibidos`. Repetirlo no hace nada. Lo encola el
 * evento `cuadre.terminado` del cuadre nocturno (fase 9).
 */

import { sql } from "drizzle-orm";
import type { Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";

export const depurarEventos: Trabajo = {
	nombre: "admin.depurar_eventos",
	// Lo encola el cuadre de la noche al terminar.
	trasEventos: ["cuadre.terminado"],
	correr: async (contexto) => {
		const dias = Number(await leerParametro(contexto.base, { clave: "admin.dias_guardar_eventos" }));
		const corte = contexto.ahora.subtract({ hours: dias * 24 }).toString();
		await contexto.base.execute(sql`SELECT soltar_particiones_de_eventos(${corte}::timestamptz)`);
	},
};
