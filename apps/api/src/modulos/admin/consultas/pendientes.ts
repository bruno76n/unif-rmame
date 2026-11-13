/**
 * `admin.pendientes` y la pastilla de Administración del sistema en el menú.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Quién entra»: la pastilla; «Pendientes»)
 *
 * La cola: las altas de usuario por confirmar (solo a la dueña, que las decide), los aparatos sin sincronizar (la regla
 * de `admin.aparatos_sin_sincronizar`), las cinco alertas de seguridad sin revisar más recientes y la prueba de
 * restauración cuando lleva `admin.restauracion_aviso_dias` sin probarse. La pastilla cuenta las tres primeras y se pone
 * roja con una alerta sin revisar.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { pendientesDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-pendientes";
import { and, asc, count, desc, eq, gte, isNull, ne } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { esLaDuena } from "../../../nucleo/acceso/quien.ts";
import type { ConteoDePastilla, ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { bitacora, dispositivos, respaldos, restauracionesProbadas, usuarios } from "../tablas.ts";
import {
	alertaSinRevisar,
	altasPorConfirmar,
	diaDe,
	diaYHora,
	inicioDelDia,
	personaDeLaBitacora,
	personaDelRenglon,
} from "./comun.ts";
import { diasDesde } from "./respaldos.ts";

/** Las alertas sin revisar que salen en Pendientes: las más recientes. */
const alertasEnPendientes = 5;

/** Lo que regresa `admin.aparatos_sin_sincronizar`. */
const aparatosLeidos = z.object({
	aparatos: z.array(
		z.object({ dispositivo_id: z.uuid(), nombre: z.string(), ubicacion: z.string().nullable(), desde: z.string() }),
	),
});

/**
 * Los aparatos sin sincronizar, con la regla de su lectura.
 * @param contexto El contexto de la consulta.
 */
async function aparatosSinSincronizar(contexto: ContextoDeConsulta) {
	return aparatosLeidos.parse(await contexto.lectura("admin.aparatos_sin_sincronizar", {})).aparatos;
}

/**
 * Las alertas de seguridad sin revisar más recientes, con quién (o nadie, si no había cuenta).
 * @param contexto El contexto de la consulta.
 */
async function alertasSinRevisar(contexto: ContextoDeConsulta) {
	return contexto.base
		.select({
			id: bitacora.id,
			ocurridoEn: bitacora.ocurridoEn,
			descripcion: bitacora.descripcion,
			quien: personaDeLaBitacora.nombre,
		})
		.from(bitacora)
		.leftJoin(usuarios, eq(usuarios.id, bitacora.usuarioId))
		.leftJoin(personaDeLaBitacora, personaDelRenglon)
		.where(alertaSinRevisar)
		.orderBy(desc(bitacora.ocurridoEn))
		.limit(alertasEnPendientes);
}

/**
 * La pastilla de Administración del sistema: las altas por confirmar (solo a la dueña), los aparatos sin sincronizar y
 * las alertas de seguridad sin revisar de Pendientes; roja si hay una alerta sin revisar.
 * @param contexto El contexto de la consulta.
 */
export async function pastillaAdmin(contexto: ContextoDeConsulta): Promise<ConteoDePastilla> {
	const altas = esLaDuena(contexto.quien) ? (await altasPorConfirmar(contexto.base)).length : 0;
	const aparatos = (await aparatosSinSincronizar(contexto)).length;
	const alertas = (await alertasSinRevisar(contexto)).length;
	return { conteo: altas + aparatos + alertas, rojo: alertas > 0 };
}

/**
 * Los días sin probar una restauración: desde la última que cuadró o, si nunca se probó, desde el primer respaldo.
 * @param contexto El contexto de la consulta.
 * @returns Los días, o nulo si todavía no hay respaldos; y el último respaldo semanal.
 */
async function diasSinProbar(contexto: ContextoDeConsulta) {
	const [buena] = await contexto.base
		.select({ probadaEn: restauracionesProbadas.probadaEn })
		.from(restauracionesProbadas)
		.where(eq(restauracionesProbadas.conteosCuadraron, true))
		.orderBy(desc(restauracionesProbadas.probadaEn))
		.limit(1);
	const [primero] = await contexto.base
		.select({ hechoEn: respaldos.hechoEn })
		.from(respaldos)
		.orderBy(asc(respaldos.hechoEn))
		.limit(1);
	const [ultimo] = await contexto.base
		.select({ hechoEn: respaldos.hechoEn })
		.from(respaldos)
		.orderBy(desc(respaldos.hechoEn))
		.limit(1);
	const desde = buena?.probadaEn ?? primero?.hechoEn;
	return {
		dias: desde === undefined ? null : diasDesde(desde, contexto.diaDeNegocio),
		probada: buena?.probadaEn ?? null,
		ultimoRespaldo: ultimo?.hechoEn ?? null,
	};
}

/**
 * Los movimientos de hoy en la bitácora y, de ellos, las consultas sensibles.
 * @param contexto El contexto de la consulta.
 */
async function movimientosDeHoy(contexto: ContextoDeConsulta) {
	const deHoy = gte(bitacora.ocurridoEn, inicioDelDia(contexto.diaDeNegocio));
	const [todos] = await contexto.base.select({ cuantos: count() }).from(bitacora).where(deHoy);
	const [sensibles] = await contexto.base
		.select({ cuantos: count() })
		.from(bitacora)
		.where(and(deHoy, eq(bitacora.tipo, "consulta_sensible")));
	const [alertas] = await contexto.base.select({ cuantos: count() }).from(bitacora).where(alertaSinRevisar);
	return { todos: todos?.cuantos ?? 0, sensibles: sensibles?.cuantos ?? 0, alertas: alertas?.cuantos ?? 0 };
}

export const consultaPendientesAdmin = implementarConsulta(pendientesDeAdmin, async (contexto, parametros) => {
	const { base, ahora } = contexto;
	const duena = esLaDuena(contexto.quien);
	const altas = duena ? await altasPorConfirmar(base) : [];
	const todasLasAltas = duena ? altas.length : (await altasPorConfirmar(base)).length;
	const aparatos = await aparatosSinSincronizar(contexto);
	const alertas = await alertasSinRevisar(contexto);
	const avisoDias = await parametroNumero(contexto, "admin.restauracion_aviso_dias");
	const respaldo = await diasSinProbar(contexto);
	const movimientos = await movimientosDeHoy(contexto);
	const [cuentas] = await base
		.select({ cuantos: count() })
		.from(usuarios)
		.where(and(eq(usuarios.estado, "activa"), eq(usuarios.esSoporte, false)));
	const [registrados] = await base
		.select({ cuantos: count() })
		.from(dispositivos)
		.where(and(isNull(dispositivos.bajaEn), ne(dispositivos.tipo, "credencial_servidor")));
	const porProbar = respaldo.dias !== null && respaldo.dias >= avisoDias;
	const renglones = [
		...altas.map((alta) => ({
			clave: `alta-${alta.autorizacionId}`,
			grupo: "usuarios" as const,
			tipo: "alta_usuario" as const,
			titulo: alta.pidio,
			detalle: alta.resumen,
			fecha: { momento: new Date(alta.pedidaEn).toISOString(), texto: textoDeDiaCorto(diaDe(alta.pedidaEn)) },
			tiempo: null,
			estado: { texto: "Por confirmar", color: "ambar" as const },
			accion: { tipo: "revisar" as const, texto: "Revisar", id: alta.autorizacionId },
		})),
		...aparatos.map((aparato) => ({
			clave: `dispositivo-${aparato.dispositivo_id}`,
			grupo: "dispositivos" as const,
			tipo: "dispositivo" as const,
			titulo: aparato.nombre,
			detalle: `${aparato.ubicacion ?? "—"} · sin sincronizar`,
			fecha: null,
			tiempo: `hace ${Math.floor(Temporal.Instant.from(aparato.desde).until(ahora).total("hours"))} h`,
			estado: { texto: "Sin sincronizar", color: "rojo" as const },
			accion: { tipo: "ver_dispositivo" as const, texto: "Ver dispositivo", id: aparato.dispositivo_id },
		})),
		...alertas.map((alerta) => ({
			clave: `alerta-${alerta.id}`,
			grupo: "seguridad" as const,
			tipo: "alerta" as const,
			titulo: alerta.descripcion,
			detalle: alerta.quien ?? "—",
			fecha: { momento: new Date(alerta.ocurridoEn).toISOString(), texto: diaYHora(alerta.ocurridoEn) },
			tiempo: null,
			estado: { texto: "Por revisar", color: "rojo" as const },
			// La dueña la marca revisada; las demás cuentas van a la bitácora.
			accion: duena
				? { tipo: "marcar_revisada" as const, texto: "Marcar revisada", id: alerta.id }
				: { tipo: "ver_bitacora" as const, texto: "Ver bitácora", id: alerta.id },
		})),
		...(porProbar
			? [
					{
						clave: "respaldo",
						grupo: "seguridad" as const,
						tipo: "respaldo" as const,
						titulo: "Prueba de restauración",
						detalle:
							respaldo.probada === null
								? "Sin pruebas de restauración"
								: `Última prueba hace ${plural(respaldo.dias ?? 0, "día", "días")}`,
						fecha:
							respaldo.probada === null
								? null
								: {
										momento: new Date(respaldo.probada).toISOString(),
										texto: textoDeDiaCorto(diaDe(respaldo.probada)),
									},
						tiempo: null,
						estado: { texto: "Por probar", color: "ambar" as const },
						accion: { tipo: "ver_respaldos" as const, texto: "Ver respaldos", id: null },
					},
				]
			: []),
	];
	const contar = (grupo: string) => renglones.filter((renglon) => renglon.grupo === grupo).length;
	const unAparato = aparatos.length === 1 ? aparatos[0] : undefined;
	return {
		resultado: {
			cifras: {
				usuarios: {
					numero: cuentas?.cuantos ?? 0,
					unidad: (cuentas?.cuantos ?? 0) === 1 ? "usuario" : "usuarios",
					tono: todasLasAltas > 0 ? ("ambar" as const) : null,
					contexto:
						todasLasAltas > 0
							? [{ texto: `${plural(todasLasAltas, "alta", "altas")} por confirmar`, tono: "ambar" as const }]
							: [{ texto: "Acceso con Google", tono: "normal" as const }],
				},
				dispositivos: {
					numero: registrados?.cuantos ?? 0,
					unidad: (registrados?.cuantos ?? 0) === 1 ? "registrado" : "registrados",
					tono: aparatos.length > 0 ? ("rojo" as const) : null,
					contexto:
						aparatos.length === 0
							? [{ texto: "Todos sincronizan", tono: "normal" as const }]
							: [
									{
										texto:
											unAparato === undefined
												? `${aparatos.length} dispositivos sin sincronizar`
												: `${unAparato.nombre} sin sincronizar`,
										tono: "rojo" as const,
									},
								],
				},
				bitacora: {
					numero: movimientos.todos,
					unidad: movimientos.todos === 1 ? "movimiento hoy" : "movimientos hoy",
					tono: null,
					contexto: [
						...(movimientos.alertas > 0
							? [{ texto: plural(movimientos.alertas, "alerta", "alertas"), tono: "rojo" as const }]
							: []),
						{
							texto: plural(movimientos.sensibles, "consulta sensible", "consultas sensibles"),
							tono: "normal" as const,
						},
					],
				},
				respaldos: {
					numero: respaldo.dias,
					unidad: "días sin probar",
					tono: porProbar ? ("ambar" as const) : null,
					contexto: [
						{
							texto:
								respaldo.ultimoRespaldo === null
									? "Sin respaldo semanal"
									: `Respaldo semanal: ${textoDeDiaCorto(diaDe(respaldo.ultimoRespaldo))}`,
							tono: "normal" as const,
						},
					],
				},
			},
			renglones:
				parametros.grupo === undefined || parametros.grupo === "todos"
					? renglones
					: renglones.filter((renglon) => renglon.grupo === parametros.grupo),
			conteos: {
				todos: renglones.length,
				usuarios: contar("usuarios"),
				dispositivos: contar("dispositivos"),
				seguridad: contar("seguridad"),
			},
		},
	};
});
