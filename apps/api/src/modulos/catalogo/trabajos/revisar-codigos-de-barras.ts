/**
 * `catalogo.revisar_codigos_de_barras`: avisa a la dueña cuando quedan pocos códigos de barras de fábrica.
 * Fase 8 · docs/modulos/catalogo/variantes-codigos-y-etiquetas.md («Trabajos · Revisar los códigos de barras que
 * quedan»)
 *
 * Corre cada día a las 04:00, hora de México. Si quedan menos de `catalogo.codigos_restantes_aviso`, crea el aviso
 * `codigos_por_acabarse` a la dueña; mientras siga abajo, uno por semana: si ya hay uno de los últimos 7 días, no
 * crea otro.
 */

import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion, Trabajo } from "../../../nucleo/modulos.ts";
import { avisos } from "../../admin/tablas.ts";

/** El tipo de aviso de este trabajo. */
const tipoDeAviso = "codigos_por_acabarse";

/** Los días que pasan antes de repetir el aviso. */
const diasEntreAvisos = 7;

/** Lo que regresa `admin.siguiente_folio` de los códigos: el siguiente y, como su contador tiene máximo, cuántos quedan. */
const folioDeCodigos = z.object({ folio: z.string(), quedan: z.number().int() });

/**
 * Si ya hubo un aviso de este tipo en los últimos 7 días, a cualquier cuenta.
 * @param contexto El contexto de la transacción del trabajo.
 */
async function yaSeAviso(contexto: ContextoDeAccion): Promise<boolean> {
	const desde = contexto.ahora.subtract({ hours: diasEntreAvisos * 24 });
	const [reciente] = await contexto.transaccion
		.select({ id: avisos.id })
		.from(avisos)
		.where(and(eq(avisos.tipo, tipoDeAviso), gt(avisos.creadoEn, desde.toString())))
		.limit(1);
	return reciente !== undefined;
}

export const revisarCodigosDeBarras: Trabajo = {
	nombre: "catalogo.revisar_codigos_de_barras",
	horario: async () => ({ cada: "dia", hora: "04:00" }),
	correr: async (contexto) => {
		await contexto.enTransaccion(async (accion) => {
			const { folio, quedan } = folioDeCodigos.parse(
				await accion.lectura("admin.siguiente_folio", { tipo: "codigo_barras" }),
			);
			const minimo = Number(await accion.lectura("admin.parametro", { clave: "catalogo.codigos_restantes_aviso" }));
			if (quedan >= minimo || (await yaSeAviso(accion))) return;
			await accion.interna("admin.crear_aviso", {
				tipo: tipoDeAviso,
				destinatarios: { regla: "duena" },
				// El último código es el siguiente más los que quedan, menos uno: el máximo del contador.
				texto: `Quedan ${quedan.toLocaleString("es-MX")} códigos de barras de fábrica (hasta ${Number(folio) + quedan - 1}).`,
			});
		});
	},
};
