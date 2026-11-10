/**
 * `admin.enviar_correos`: manda por correo los avisos que lo piden.
 * Fase 4 · docs/modulos/admin/avisos.md («El correo»)
 *
 * Lo encola `admin.crear_aviso` cuando nace un aviso por correo. Toma los avisos pendientes de 20 en 20
 * con `FOR UPDATE SKIP LOCKED` y los manda con la plantilla, al correo de la cuenta y con la clave de
 * idempotencia del aviso. Si uno falla, sube `correo_intentos`, guarda `correo_error` y espera como los
 * eventos (1, 5, 30 y 120 minutos); a los 10 intentos avisa a soporte con `trabajo_fallido` (sin correo,
 * para no avisar por correo que el correo falla). Al terminar, se vuelve a encolar para el siguiente
 * reintento que toque.
 */

import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Trabajo } from "../../../nucleo/modulos.ts";
import { encolar } from "../../../nucleo/trabajos/encolar.ts";
import { siguienteIntentoEnSql } from "../../../nucleo/trabajos/procesar-eventos.ts";
import { armarCorreoDeAviso } from "../dominio/plantilla-de-correo.ts";
import { tareaDeCorreos } from "../internas/crear-aviso.ts";
import { avisos, empresa } from "../tablas.ts";

/**
 * La lectura que da el correo de una cuenta (el de Google). La da `usuarios` desde la fase 5; en esta fase
 * la pone el servidor de prueba.
 */
export const lecturaDeCorreoDeCuenta = "admin.correo_de_cuenta";

/** Cuántos avisos toma cada vuelta. */
const avisosPorVuelta = 20;

/** Al llegar a este intento, se avisa a soporte y el aviso ya no se reintenta. */
const intentosParaAvisar = 10;

/** La marca de los correos cuando todavía no se capturan los datos de la empresa. */
const marcaPorOmision = "Unifórmame";

export const enviarCorreos: Trabajo = {
	nombre: tareaDeCorreos,
	correr: async (contexto) => {
		const ahora = contexto.ahora.toString();
		const [deLaEmpresa] = await contexto.base.select({ marca: empresa.nombreComercial }).from(empresa);
		const marca = deLaEmpresa?.marca ?? marcaPorOmision;
		const pendientes = and(
			eq(avisos.porCorreo, true),
			isNull(avisos.correoEnviadoEn),
			lt(avisos.correoIntentos, intentosParaAvisar),
		);
		for (;;) {
			const tomados = await contexto.enTransaccion(async (accion) => {
				const listos = await accion.transaccion
					.select()
					.from(avisos)
					.where(
						and(
							pendientes,
							or(
								eq(avisos.correoIntentos, 0),
								lte(siguienteIntentoEnSql(avisos.actualizadoEn, avisos.correoIntentos), sql`${ahora}::timestamptz`),
							),
						),
					)
					.orderBy(asc(avisos.creadoEn))
					.limit(avisosPorVuelta)
					.for("update", { skipLocked: true });
				for (const aviso of listos) {
					try {
						const para = String(await accion.lectura(lecturaDeCorreoDeCuenta, { usuario_id: aviso.usuarioId }));
						const enlace = aviso.enlace === null ? undefined : `${contexto.dominioWeb}/${aviso.enlace}`;
						const { html, texto } = armarCorreoDeAviso({ texto: aviso.texto, enlace, marca });
						await contexto.enviarCorreo({ para, asunto: aviso.texto, html, texto, clave: `aviso:${aviso.id}` });
						await accion.transaccion
							.update(avisos)
							.set({ correoEnviadoEn: ahora, correoError: null, actualizadoEn: ahora })
							.where(eq(avisos.id, aviso.id));
					} catch (error) {
						const intentos = aviso.correoIntentos + 1;
						const mensaje = error instanceof Error ? error.message : String(error);
						await accion.transaccion
							.update(avisos)
							.set({ correoIntentos: intentos, correoError: mensaje, actualizadoEn: ahora })
							.where(eq(avisos.id, aviso.id));
						if (intentos === intentosParaAvisar) {
							await accion.interna("admin.crear_aviso", {
								tipo: "trabajo_fallido",
								destinatarios: { regla: "soporte" },
								texto: `El correo del aviso «${aviso.texto}» falló: ${mensaje}`,
								entidad: "avisos",
								entidadId: aviso.id,
								sinCorreo: true,
							});
						}
					}
				}
				return listos.length;
			});
			if (tomados < avisosPorVuelta) break;
		}
		// El siguiente reintento que toque, si queda alguno.
		const [siguiente] = await contexto.base
			.select({ cuando: sql<string>`min(${siguienteIntentoEnSql(avisos.actualizadoEn, avisos.correoIntentos)})` })
			.from(avisos)
			.where(pendientes);
		if (siguiente?.cuando !== null && siguiente?.cuando !== undefined) {
			await contexto.enTransaccion((accion) =>
				encolar(accion.transaccion, {
					tarea: tareaDeCorreos,
					cola: tareaDeCorreos,
					clave: tareaDeCorreos,
					cuando: new Date(siguiente.cuando).toISOString(),
				}),
			);
		}
	},
};
