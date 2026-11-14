/**
 * El puente andando: al arrancar termina lo de su diario; se conecta a los avisos en vivo (`GET /v1/eventos`) con su
 * llave y, con cada `impresion` y al conectarse, atiende sus trabajos; aunque no llegue ningún aviso, los pide cada
 * `intervalo_segundos` (60), y esa pregunta es su señal de vida. Con `426`, el aviso `actualizar` o un `hola` con
 * versión mínima mayor, deja de pedir trabajos: su impresora deja de contar como conectada. Revocado, igual.
 * Fase 20 · docs/apps/puente-de-impresion.md («Cómo trabaja», «La llave» y «Cómo se actualiza») y
 * docs/cimientos/EVENTOS-Y-TRABAJOS.md («Avisos en vivo»)
 *
 * Una sola vuelta a la vez: un aviso que llega a media vuelta deja pedida otra. Los avisos son pistas: si la conexión
 * se cae, se vuelve a conectar a los 5 segundos, y mientras tanto la pregunta de cada minuto sigue.
 */

import { setTimeout as esperar } from "node:timers/promises";
import { ErrorSinRed } from "@uniformame/compartido/cliente/cliente";
import { type EventoEnVivo, escucharEventos } from "@uniformame/compartido/cliente/en-vivo";
import { respuestaDeError } from "@uniformame/compartido/contratos/protocolo";
import { compararVersiones } from "@uniformame/compartido/contratos/versiones";
import { z } from "zod";
import { AparatoRevocado, HayQueActualizar } from "./api.ts";
import { atenderTrabajos, type PiezasDelPuente } from "./trabajos.ts";
import { versionDelPuente } from "./version.ts";

/** Cuánto espera para volver a conectarse a los avisos. */
const esperaParaReconectar = 5_000;

/** Por qué se detuvo el puente. */
export type Detenido = "revocado" | "actualizar" | "detenido";

/** Lo que trae `hola`. */
const datosDeHola = z.object({
	intervalo_segundos: z.number().int().positive().optional(),
	version_minima: z.string().optional(),
});

/** El puente andando. */
export interface PuenteAndando {
	/** Cómo está: trabajando, o por qué se detuvo. */
	estado: () => "trabajando" | Detenido;
	/** Se resuelve cuando se detiene, con el porqué. */
	terminado: Promise<Detenido>;
	/** Lo detiene. */
	detener: () => void;
}

/** Lo que necesita para andar, además de lo de sus trabajos. */
export interface OpcionesDelPuente extends PiezasDelPuente {
	/** La dirección de la API. */
	api_url: () => Promise<string>;
	/** Cada cuánto pide sus trabajos sin avisos, en segundos. */
	intervaloSegundos: number;
	/** Si se conecta a los avisos en vivo (sí); las pruebas los apagan para ver la pregunta de cada minuto. */
	avisosEnVivo?: boolean;
	/** El `fetch` de los avisos. */
	fetch?: typeof fetch;
}

/**
 * Arranca el puente.
 * @param opciones Sus piezas y su intervalo.
 */
export function arrancarPuente(opciones: OpcionesDelPuente): PuenteAndando {
	let estado: "trabajando" | Detenido = "trabajando";
	let intervalo = opciones.intervaloSegundos;
	let reloj: ReturnType<typeof setTimeout> | undefined;
	let vuelta: Promise<void> | null = null;
	let otraVuelta = false;
	const cortar = new AbortController();
	let avisarFin: (porque: Detenido) => void = () => undefined;
	const terminado = new Promise<Detenido>((resolver) => {
		avisarFin = resolver;
	});

	/** Se detiene: deja de pedir trabajos y de escuchar avisos, y lo anota. */
	async function detenerse(porque: Detenido): Promise<void> {
		if (estado !== "trabajando") return;
		estado = porque;
		clearTimeout(reloj);
		cortar.abort();
		if (porque === "revocado") await opciones.registro.anotar(new AparatoRevocado().message);
		if (porque === "actualizar") await opciones.registro.anotar(new HayQueActualizar().message);
		avisarFin(porque);
	}

	/** Una vuelta de trabajos; lo que la corta se anota, y revocado o versión vieja lo detienen. */
	async function unaVuelta(): Promise<void> {
		try {
			await atenderTrabajos(opciones);
		} catch (error) {
			if (error instanceof AparatoRevocado) await detenerse("revocado");
			else if (error instanceof HayQueActualizar) await detenerse("actualizar");
			else if (error instanceof ErrorSinRed) await opciones.registro.anotar("Sin conexión con el sistema");
			else await opciones.registro.anotar(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/** Pide una vuelta: si ya hay una, deja pedida la siguiente. */
	function atender(): Promise<void> {
		if (estado !== "trabajando") return Promise.resolve();
		if (vuelta !== null) {
			otraVuelta = true;
			return vuelta;
		}
		vuelta = (async () => {
			do {
				otraVuelta = false;
				await unaVuelta();
			} while (otraVuelta && estado === "trabajando");
			vuelta = null;
		})();
		return vuelta;
	}

	/** La pregunta de cada intervalo, aunque no lleguen avisos. */
	function programar(): void {
		if (estado !== "trabajando") return;
		reloj = setTimeout(() => {
			void atender().then(programar);
		}, intervalo * 1000);
	}

	/** Lo que hace con cada aviso en vivo. */
	async function alEvento(evento: EventoEnVivo): Promise<void> {
		if (evento.nombre === "hola") {
			const hola = datosDeHola.safeParse(evento.datos);
			if (hola.success && hola.data.intervalo_segundos !== undefined) intervalo = hola.data.intervalo_segundos;
			const minima = hola.success ? hola.data.version_minima : undefined;
			if (minima !== undefined && (compararVersiones(versionDelPuente, minima) ?? 0) < 0) {
				await detenerse("actualizar");
				return;
			}
			await atender();
		} else if (evento.nombre === "impresion") await atender();
		else if (evento.nombre === "actualizar") await detenerse("actualizar");
		else if (evento.nombre === "dispositivo_revocado") await detenerse("revocado");
	}

	/** Escucha los avisos en vivo y se vuelve a conectar si se cae la conexión. */
	async function escuchar(): Promise<void> {
		const llamar = opciones.fetch ?? fetch;
		while (estado === "trabajando") {
			try {
				const respuesta = await llamar(`${await opciones.api_url()}/v1/eventos`, {
					headers: await opciones.api.encabezados(),
					signal: cortar.signal,
				});
				if (respuesta.status === 426) await detenerse("actualizar");
				else if (respuesta.status === 401) {
					const error = respuestaDeError.safeParse(await respuesta.json().catch(() => null));
					if (error.success && error.data.codigo === "llave_revocada") await detenerse("revocado");
				} else if (respuesta.ok && respuesta.body !== null) await escucharEventos(respuesta.body, alEvento);
			} catch {
				// Sin red o cortada: los avisos son pistas; la pregunta de cada minuto sigue.
			}
			if (estado === "trabajando") {
				await esperar(esperaParaReconectar, undefined, { signal: cortar.signal }).catch(() => undefined);
			}
		}
	}

	void (async () => {
		await opciones.registro.anotar(`Arrancó el puente ${versionDelPuente}`);
		await atender();
		programar();
		if (opciones.avisosEnVivo !== false) await escuchar();
	})();

	return {
		estado: () => estado,
		terminado,
		detener: () => {
			void detenerse("detenido");
		},
	};
}
