/**
 * Los avisos en vivo: `GET /v1/eventos` (eventos del servidor, SSE) y su reparto entre instancias.
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («Avisos en vivo · `GET /v1/eventos`»)
 *
 * Cada instancia de la API escucha `LISTEN ua_eventos` con una conexión propia. El worker hace `NOTIFY`
 * con el id de cada evento que procesa; la instancia lee el evento y le manda `cambios` a sus conexiones a
 * las que les toca: a una cuenta, las tablas que lee alguno de sus departamentos (la dueña, todas); a un
 * aparato, las de su alcance y sus ubicaciones. Son pistas, no datos: nombres de tablas e ids, nunca
 * montos. También escucha `ua_avisos`: cada aviso nuevo sale como `aviso` a las sesiones de su cuenta. A
 * cada conexión le llega un latido cada 25 segundos.
 * Fase 5 · docs/modulos/admin/acceso-con-google.md (regla 4: «se puede cortar al instante»)
 *
 * Una conexión no vale más que su sesión: con cada latido, y en cuanto llega un evento que cambia lo que
 * puede su cuenta (`sesion.*`, `cuenta.*`), vuelve a identificar a quien se conectó; si ya no vale, se
 * corta, y si cambiaron sus departamentos, se rearma lo que le toca.
 */

import { eq } from "drizzle-orm";
import type pg from "pg";
import { z } from "zod";
import { avisos, eventos, sesiones } from "../../modulos/admin/tablas.ts";
import type { AparatoQueLlama, QuienLlama } from "../acceso/quien.ts";
import type { Base } from "../base/conexion.ts";
import type { DestinoEnVivo, RegistroDeModulos } from "../modulos.ts";

/** El canal de `LISTEN`/`NOTIFY` de los eventos. */
export const canalDeEventos = "ua_eventos";

/** El canal de los avisos nuevos (lo usa `admin.crear_aviso`). */
export const canalDeAvisos = "ua_avisos";

/** Cada cuánto va el latido, en milisegundos. */
const latidoPorOmision = 25_000;

/** Cuánto espera el cliente para reconectarse, en milisegundos (`retry`). */
export const esperaParaReconectar = 5000;

/** Lo que alcanza un aparato: las tablas que baja y sus ubicaciones (fase 6). */
export interface AlcanceDelAparato {
	tablas: readonly string[];
	ubicacionIds: readonly string[];
}

/** Lo que necesitan los avisos en vivo. */
export interface DependenciasDeLosAvisosEnVivo {
	/** El grupo de conexiones con el rol de la app: de ahí sale la conexión que escucha. */
	conexiones: pg.Pool;
	base: Base;
	registro: RegistroDeModulos;
	/** El alcance de un aparato; lo da la fase 6. */
	alcanceDelAparato: (aparato: AparatoQueLlama) => Promise<AlcanceDelAparato>;
	/** Cada cuántos segundos pregunta solo un aparato si no le llega nada (`sync.intervalo_segundos`). */
	intervaloDeSincronizacion: () => Promise<number>;
	latidoMs?: number;
	/** Anota en el registro técnico un aviso que no se pudo repartir; la conexión sigue. */
	anotarError: (error: unknown) => void;
}

/** A dónde se escribe una conexión abierta. */
export interface SalidaDeEventos {
	escribir: (texto: string) => void;
	/** Cierra la conexión desde el servidor. */
	terminar: () => void;
}

/**
 * Espera una promesa a lo más `ms` milisegundos.
 * @throws Error si no terminó a tiempo.
 */
function conTiempoLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
	let reloj: NodeJS.Timeout | undefined;
	const tarde = new Promise<never>((_listo, falla) => {
		reloj = setTimeout(() => falla(new Error(`la revisión de la conexión tardó más de ${ms} ms`)), ms);
	});
	return Promise.race([promesa, tarde]).finally(() => clearTimeout(reloj));
}

/** Una conexión abierta, con lo que le toca. */
interface Conexion {
	salida: SalidaDeEventos;
	/** La cuenta y la sesión, para sus avisos; un aparato no tiene. */
	usuarioId: string | undefined;
	sesionId: string | undefined;
	/** El aparato, si es uno. */
	dispositivoId: string | undefined;
	/** De las tablas de un evento, las que le tocan (vacío si ninguna). */
	tablasQueLeTocan: (tablas: readonly string[], ubicacionIds: readonly string[]) => string[];
	/** Vuelve a identificar a quien se conectó, sin contar como actividad; `undefined` si ya no vale. */
	revisar: (() => Promise<QuienLlama | undefined>) | undefined;
	/** La última revisión que empezó: solo vale el resultado de la más nueva. */
	revision: number;
	/** Si hay una revisión en curso: el latido no empieza otra encima. */
	enRevision: boolean;
	/** Si ya le llegó `sesion_cerrada`, para no mandarlo dos veces. */
	avisadaDelCierre: boolean;
}

/** Los eventos que cambian lo que puede una cuenta: tras ellos se revisan sus conexiones. */
const tocanALaCuenta = /^(sesion|cuenta)\./;

/** La cuenta de un evento de sesión o de cuenta. */
const deUnaCuenta = z.object({ usuario_id: z.string() });

/**
 * Escribe un evento en el formato de SSE.
 * @param nombre El nombre del evento en vivo (`hola`, `cambios`…).
 * @param datos Sus datos, en JSON.
 */
export function formatoDeEvento(nombre: string, datos: unknown): string {
	return `event: ${nombre}\ndata: ${JSON.stringify(datos)}\n\n`;
}

/**
 * Qué tablas de un evento le tocan a quien se conectó.
 * @param quien La cuenta o el aparato.
 * @param lectores Por tabla, los departamentos que la leen.
 * @param alcance El alcance, si es un aparato.
 */
function filtroDe(
	quien: QuienLlama,
	lectores: ReadonlyMap<string, readonly string[]>,
	alcance: AlcanceDelAparato | undefined,
): Conexion["tablasQueLeTocan"] {
	if (quien.tipo === "cuenta") {
		return (tablas) =>
			quien.esDuena
				? [...tablas]
				: tablas.filter((tabla) => (lectores.get(tabla) ?? []).some((d) => quien.departamentos.includes(d)));
	}
	return (tablas, ubicacionIds) => {
		if (alcance === undefined) return [];
		const enSusUbicaciones =
			ubicacionIds.length === 0 || ubicacionIds.some((ubicacion) => alcance.ubicacionIds.includes(ubicacion));
		return enSusUbicaciones ? tablas.filter((tabla) => alcance.tablas.includes(tabla)) : [];
	};
}

/**
 * Arma los avisos en vivo de una instancia de la API.
 * @param dependencias La base, la conexión para escuchar, los lectores de cada tabla y el alcance de un aparato.
 */
export function crearAvisosEnVivo(dependencias: DependenciasDeLosAvisosEnVivo) {
	const abiertas = new Set<Conexion>();
	let escucha: pg.PoolClient | undefined;
	let latido: NodeJS.Timeout | undefined;

	/** Dice si un aviso en vivo va a esta conexión. */
	function vaA(conexion: Conexion, para: DestinoEnVivo): boolean {
		if ("sesionId" in para) return conexion.sesionId === para.sesionId;
		if ("dispositivoId" in para) return conexion.dispositivoId === para.dispositivoId;
		return conexion.usuarioId === para.usuarioId;
	}

	/**
	 * Vuelve a revisar una conexión: si su sesión ya no vale (cerrada, vencida, sin acceso), le manda
	 * `sesion_cerrada` con su motivo (si no le llegó ya) y la corta; si vale, rearma lo que le toca con sus
	 * departamentos de ahora. La del latido no empieza si ya hay una en curso; la de un evento de la cuenta sí,
	 * y entonces la anterior ya no rearma nada: vale lo que hay después del evento. Un «ya no vale» corta
	 * siempre. Cada revisión tiene tiempo límite: el del latido de producción.
	 * @param conexion La conexión.
	 * @param porEvento Si la pide un evento de su cuenta.
	 */
	async function revisarConexion(conexion: Conexion, porEvento: boolean): Promise<void> {
		if (conexion.revisar === undefined || !abiertas.has(conexion)) return;
		if (conexion.enRevision && !porEvento) return;
		conexion.revision += 1;
		conexion.enRevision = true;
		const esta = conexion.revision;
		let quien: QuienLlama | undefined;
		try {
			// Con tiempo límite: una revisión que no termina no deja la conexión sin revisar para siempre.
			quien = await conTiempoLimite(conexion.revisar(), latidoPorOmision);
		} finally {
			if (conexion.revision === esta) conexion.enRevision = false;
		}
		if (!abiertas.has(conexion)) return;
		if (quien !== undefined) {
			// Solo la revisión más nueva rearma lo que le toca: una vieja traería los departamentos de antes.
			if (conexion.revision !== esta) return;
			const alcance = quien.tipo === "aparato" ? await dependencias.alcanceDelAparato(quien) : undefined;
			if (abiertas.has(conexion) && conexion.revision === esta) {
				conexion.tablasQueLeTocan = filtroDe(quien, dependencias.registro.lectores, alcance);
			}
			return;
		}
		// Una sesión que ya no vale no vuelve a valer: corta aunque haya una revisión más nueva.
		// Sale de las abiertas antes de esperar: ninguna otra revisión la vuelve a cortar.
		abiertas.delete(conexion);
		try {
			if (conexion.sesionId !== undefined && !conexion.avisadaDelCierre) {
				// La pantalla sabe por qué: el motivo con que se cerró su sesión.
				const [cerrada] = await dependencias.base
					.select({ motivo: sesiones.motivoCierre })
					.from(sesiones)
					.where(eq(sesiones.id, conexion.sesionId));
				conexion.salida.escribir(formatoDeEvento("sesion_cerrada", { motivo: cerrada?.motivo ?? "sin_sesion" }));
			}
		} finally {
			conexion.salida.terminar();
		}
	}

	/** Lee el evento que avisó el worker y manda `cambios` a quien le toca, y lo que declaren los módulos. */
	async function repartir(eventoId: string): Promise<void> {
		const [evento] = await dependencias.base
			.select({
				tipo: eventos.tipo,
				datos: eventos.datos,
				tablas: eventos.tablas,
				ubicacionIds: eventos.ubicacionIds,
				entidad: eventos.entidad,
				entidadId: eventos.entidadId,
			})
			.from(eventos)
			.where(eq(eventos.id, eventoId));
		if (evento === undefined) return;
		const envios = (dependencias.registro.enVivo.get(evento.tipo) ?? []).flatMap((mandar) =>
			mandar({ id: eventoId, tipo: evento.tipo, datos: evento.datos }),
		);
		for (const conexion of abiertas) {
			for (const envio of envios) {
				if (!vaA(conexion, envio.para)) continue;
				conexion.salida.escribir(formatoDeEvento(envio.nombre, envio.datos));
				if (envio.nombre === "sesion_cerrada") conexion.avisadaDelCierre = true;
			}
			const tablas = conexion.tablasQueLeTocan(evento.tablas, evento.ubicacionIds);
			if (tablas.length === 0) continue;
			conexion.salida.escribir(
				formatoDeEvento("cambios", {
					tablas,
					// El documento solo viaja a quien lee su tabla.
					...(evento.entidad === null || !tablas.includes(evento.entidad)
						? {}
						: { entidad: evento.entidad, ...(evento.entidadId === null ? {} : { entidad_id: evento.entidadId }) }),
				}),
			);
		}
		// Si el evento cambió lo que puede una cuenta (cerró sus sesiones, le quitó el acceso, cambió sus
		// departamentos), sus conexiones se revisan ya: lo que la pantalla haga no cuenta como permiso.
		const cuenta = deUnaCuenta.safeParse(evento.datos);
		if (tocanALaCuenta.test(evento.tipo) && cuenta.success) {
			const suyas = [...abiertas].filter((conexion) => conexion.usuarioId === cuenta.data.usuario_id);
			const revisadas = await Promise.allSettled(suyas.map((conexion) => revisarConexion(conexion, true)));
			for (const revisada of revisadas) {
				if (revisada.status === "rejected") dependencias.anotarError(revisada.reason);
			}
		}
	}

	/** Lee el aviso nuevo y lo manda a las sesiones de su cuenta. */
	async function avisar(avisoId: string): Promise<void> {
		const [aviso] = await dependencias.base
			.select({ usuarioId: avisos.usuarioId, tipo: avisos.tipo, texto: avisos.texto, enlace: avisos.enlace })
			.from(avisos)
			.where(eq(avisos.id, avisoId));
		if (aviso === undefined) return;
		for (const conexion of abiertas) {
			if (conexion.usuarioId !== aviso.usuarioId) continue;
			conexion.salida.escribir(
				formatoDeEvento("aviso", { aviso_id: avisoId, tipo: aviso.tipo, texto: aviso.texto, enlace: aviso.enlace }),
			);
		}
	}

	return {
		/** Empieza a escuchar `ua_eventos` y `ua_avisos`, y a mandar el latido. */
		async iniciar(): Promise<void> {
			escucha = await dependencias.conexiones.connect();
			escucha.on("notification", (llegada) => {
				if (llegada.payload === undefined) return;
				if (llegada.channel === canalDeEventos) repartir(llegada.payload).catch(dependencias.anotarError);
				if (llegada.channel === canalDeAvisos) avisar(llegada.payload).catch(dependencias.anotarError);
			});
			await escucha.query(`LISTEN ${canalDeEventos}; LISTEN ${canalDeAvisos}`);
			// Con cada latido, cada conexión vuelve a revisar su sesión: una vencida o inactiva se corta.
			latido = setInterval(() => {
				for (const conexion of abiertas) {
					conexion.salida.escribir(": latido\n\n");
					revisarConexion(conexion, false).catch(dependencias.anotarError);
				}
			}, dependencias.latidoMs ?? latidoPorOmision);
		},

		/** Deja de escuchar y cierra las conexiones abiertas. */
		async cerrar(): Promise<void> {
			clearInterval(latido);
			for (const conexion of abiertas) conexion.salida.terminar();
			abiertas.clear();
			escucha?.release();
			escucha = undefined;
		},

		/**
		 * Abre una conexión: manda `retry` y `hola`, y desde ahí lo que le toque.
		 * @param quien La cuenta o el aparato que se conectó.
		 * @param salida A dónde se escribe.
		 * @param hola Los datos de `hola`, sin `intervalo_segundos`, que se suma aquí.
		 * @param revisar Cómo se vuelve a identificar a quien se conectó, sin contar como actividad.
		 * @returns Con qué se quita la conexión cuando el cliente se va.
		 */
		async conectar(
			quien: QuienLlama,
			salida: SalidaDeEventos,
			hola: Record<string, unknown>,
			revisar?: () => Promise<QuienLlama | undefined>,
		): Promise<() => void> {
			const alcance = quien.tipo === "aparato" ? await dependencias.alcanceDelAparato(quien) : undefined;
			const conexion: Conexion = {
				salida,
				usuarioId: quien.tipo === "cuenta" ? quien.usuarioId : undefined,
				sesionId: quien.tipo === "cuenta" ? quien.sesionId : undefined,
				dispositivoId: quien.tipo === "aparato" ? quien.dispositivoId : undefined,
				tablasQueLeTocan: filtroDe(quien, dependencias.registro.lectores, alcance),
				revisar,
				revision: 0,
				enRevision: false,
				avisadaDelCierre: false,
			};
			salida.escribir(`retry: ${esperaParaReconectar}\n\n`);
			salida.escribir(
				formatoDeEvento("hola", { ...hola, intervalo_segundos: await dependencias.intervaloDeSincronizacion() }),
			);
			abiertas.add(conexion);
			return () => abiertas.delete(conexion);
		},
	};
}

/** Los avisos en vivo de una instancia. */
export type AvisosEnVivo = ReturnType<typeof crearAvisosEnVivo>;
