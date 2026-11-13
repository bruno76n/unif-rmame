/**
 * `personal.pines`: Personal · PIN del taller.
 * Fase 19 · docs/interfaz/fabrica/personal.md («PIN del taller») y docs/modulos/personal/pin-del-taller.md (regla 1)
 *
 * Las personas activas del Taller sin cuenta de Google (las únicas que pueden tener PIN), cada una con su PIN vivo:
 * «Sin PIN» (ámbar), activo (sin estado: la pantalla muestra «••••») o «Bloqueado» (rojo) desde cuándo, y la versión
 * del PIN para restablecerlo o desbloquearlo. El PIN y su hash nunca viajan.
 */

import { pinesDelTaller } from "@uniformame/compartido/contratos/personal/pines";
import { and, asc, eq, inArray, isNull, notExists } from "drizzle-orm";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { usuarios } from "../../admin/tablas.ts";
import { ubicacionDelPin } from "../dominio/pines.ts";
import { personas, pines } from "../tablas.ts";

export const consultaPines = implementarConsulta(pinesDelTaller, async (contexto) =>
	contexto.comoAccion(async ({ transaccion }) => {
		const ubicacionId = await ubicacionDelPin(transaccion);
		// La cuenta viva (activa o solicitada) es la que deja a una persona sin PIN, como al asignarlo.
		const conCuenta = transaccion
			.select({ id: usuarios.id })
			.from(usuarios)
			.where(and(eq(usuarios.personaId, personas.id), inArray(usuarios.estado, ["activa", "solicitada"])));
		const filas = await transaccion
			.select({
				persona_id: personas.id,
				nombre: personas.nombre,
				puesto: personas.puesto,
				estado: pines.estado,
				bloqueadoEn: pines.bloqueadoEn,
				version: pines.version,
			})
			.from(personas)
			.leftJoin(
				pines,
				and(
					eq(pines.personaId, personas.id),
					eq(pines.ubicacionId, ubicacionId),
					inArray(pines.estado, ["activo", "bloqueado"]),
				),
			)
			.where(and(isNull(personas.bajaEn), eq(personas.area, "taller"), notExists(conCuenta)))
			.orderBy(asc(personas.nombre), asc(personas.id));
		return {
			resultado: {
				personas: filas.map((fila) => ({
					persona_id: fila.persona_id,
					nombre: fila.nombre,
					puesto: fila.puesto,
					tablet: {
						tiene: fila.estado !== null,
						estado:
							fila.estado === null
								? { texto: "Sin PIN", color: "ambar" as const }
								: fila.estado === "bloqueado"
									? { texto: "Bloqueado", color: "rojo" as const }
									: null,
						bloqueado_desde:
							fila.estado === "bloqueado" && fila.bloqueadoEn !== null
								? new Date(fila.bloqueadoEn).toISOString()
								: null,
						version: fila.version,
					},
				})),
			},
		};
	}),
);
