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
 */

import { eq } from "drizzle-orm";
import type pg from "pg";
import { avisos, eventos } from "../../modulos/admin/tablas.ts";
import type { AparatoQueLlama, QuienLlama } from "../acceso/quien.ts";
import type { Base } from "../base/conexion.ts";
import type { RegistroDeModulos } from "../modulos.ts";

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
}

/** A dónde se escribe una conexión abierta. */
export interface SalidaDeEventos {
	escribir: (texto: string) => void;
	/** Cierra la conexión desde el servidor. */
	terminar: () => void;
}

/** Una conexión abierta, con lo que le toca. */
interface Conexion {
	salida: SalidaDeEventos;
	/** La cuenta de la sesión, para sus avisos; un aparato no tiene. */
	usuarioId: string | undefined;
	/** De las tablas de un evento, las que le tocan (vacío si ninguna). */
	tablasQueLeTocan: (tablas: readonly string[], ubicacionIds: readonly string[]) => string[];
}

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

	/** Lee el evento que avisó el worker y manda `cambios` a quien le toca. */
	async function repartir(eventoId: string): Promise<void> {
		const [evento] = await dependencias.base
			.select({
				tablas: eventos.tablas,
				ubicacionIds: eventos.ubicacionIds,
				entidad: eventos.entidad,
				entidadId: eventos.entidadId,
			})
			.from(eventos)
			.where(eq(eventos.id, eventoId));
		if (evento === undefined) return;
		for (const conexion of abiertas) {
			const tablas = conexion.tablasQueLeTocan(evento.tablas, evento.ubicacionIds);
			if (tablas.length === 0) continue;
			conexion.salida.escribir(
				formatoDeEvento("cambios", {
					tablas,
					...(evento.entidad === null ? {} : { entidad: evento.entidad }),
					...(evento.entidadId === null ? {} : { entidad_id: evento.entidadId }),
				}),
			);
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
				if (llegada.channel === canalDeEventos) repartir(llegada.payload).catch(() => undefined);
				if (llegada.channel === canalDeAvisos) avisar(llegada.payload).catch(() => undefined);
			});
			await escucha.query(`LISTEN ${canalDeEventos}; LISTEN ${canalDeAvisos}`);
			latido = setInterval(() => {
				for (const conexion of abiertas) conexion.salida.escribir(": latido\n\n");
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
		 * @returns Con qué se quita la conexión cuando el cliente se va.
		 */
		async conectar(quien: QuienLlama, salida: SalidaDeEventos, hola: Record<string, unknown>): Promise<() => void> {
			const alcance = quien.tipo === "aparato" ? await dependencias.alcanceDelAparato(quien) : undefined;
			const conexion: Conexion = {
				salida,
				usuarioId: quien.tipo === "cuenta" ? quien.usuarioId : undefined,
				tablasQueLeTocan: filtroDe(quien, dependencias.registro.lectores, alcance),
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
