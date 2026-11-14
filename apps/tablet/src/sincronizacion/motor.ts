/**
 * El motor de la tablet: sube su cola y baja lo que cambió al arrancar, con cada aviso en vivo, al volver la red y,
 * aunque no llegue nada, cada `sync.intervalo_segundos`. Una sola vuelta a la vez. Lleva el estado que ven las
 * pantallas: el aparato, si está conectada, lo que queda en la cola y el aviso de lo que mandó al volver el internet.
 * Fase 20 · docs/apps/tablet.md («Cómo sube», «Cómo baja», «Cómo se actualiza» y regla 7 de «El registro») y
 * docs/cimientos/EVENTOS-Y-TRABAJOS.md («Avisos en vivo»)
 *
 * Revocada, deja de bajar y de escuchar y sigue subiendo su cola hasta vaciarla. Con `426`, el aviso `actualizar` o un
 * `hola` con una mínima mayor, deja de subir y de bajar: su cola espera en la base hasta la versión nueva, y al arrancar
 * la versión nueva vuelve a intentar.
 */

import { type EventoEnVivo, escucharEventos } from "@uniformame/compartido/cliente/en-vivo";
import { compararVersiones } from "@uniformame/compartido/contratos/versiones";
import { z } from "zod";
import type { BaseDeLaTablet } from "../copia/base.ts";
import { versionDeLaTablet } from "../version.ts";
import { type Conexion, encabezadosDeLaLlave, HayQueActualizar, SinInternet, TabletRevocada } from "./api.ts";
import { bajarCambios, bajarFoto } from "./bajar.ts";
import { type EstadoDelAparato, estadoDelAparato, guardarDato, leerDato } from "./estado.ts";
import { subirCola } from "./subir.ts";

/** Lo que ven las pantallas. */
export interface EstadoDeLaTablet {
	aparato: EstadoDelAparato;
	conectada: boolean;
	/** Lo que queda en la cola. */
	pendientes: number;
	/** Mientras baja su foto: cuántos renglones van. */
	avanceDeLaFoto: number;
	/** «{n} captura(s) enviada(s) al volver el internet», una vez. */
	enviadasAlVolver: number;
}

/** Lo que trae `hola`. */
const datosDeHola = z.object({ version_minima: z.string().optional() });

/** Cuánto espera para volver a conectarse a los avisos. */
const esperaParaReconectar = 5_000;

/** El motor de la tablet. */
export interface MotorDeLaTablet {
	estado: () => EstadoDeLaTablet;
	/** Avisa cada cambio de estado; regresa cómo dejar de escuchar. */
	suscribir: (alCambiar: () => void) => () => void;
	/** Arranca: baja su foto si le falta, sincroniza, escucha avisos y pregunta cada intervalo. */
	arrancar: () => Promise<void>;
	/** Una vuelta: sube la cola y baja lo nuevo. */
	sincronizar: () => Promise<void>;
	/** Vuelve a leer la cola y el aparato, después de guardar algo. */
	refrescar: () => Promise<void>;
	/** Ya se dijo el aviso de lo enviado al volver el internet. */
	avisoVisto: () => void;
	detener: () => void;
}

/**
 * Arma el motor.
 * @param base La base local.
 * @param conexion A dónde llama.
 */
export function crearMotor(base: BaseDeLaTablet, conexion: Conexion): MotorDeLaTablet {
	let estado: EstadoDeLaTablet = {
		aparato: "sin_registro",
		conectada: typeof navigator === "undefined" ? true : navigator.onLine,
		pendientes: 0,
		avanceDeLaFoto: 0,
		enviadasAlVolver: 0,
	};
	const escuchas = new Set<() => void>();
	let vuelta: Promise<void> | null = null;
	let otraVuelta = false;
	let reloj: ReturnType<typeof setTimeout> | undefined;
	let estuvoSinInternet = false;
	const cortar = new AbortController();

	/** Cambia el estado y avisa. */
	function cambiar(cambio: Partial<EstadoDeLaTablet>): void {
		estado = { ...estado, ...cambio };
		for (const escucha of escuchas) escucha();
	}

	/** Vuelve a leer el aparato y la cola. */
	async function refrescar(): Promise<void> {
		cambiar({ aparato: await estadoDelAparato(base), pendientes: await base.cola.count() });
	}

	/** Lo que hace con lo que corta una vuelta. */
	async function alFallar(error: unknown): Promise<void> {
		if (error instanceof SinInternet) {
			estuvoSinInternet = true;
			cambiar({ conectada: false });
		} else if (error instanceof HayQueActualizar) await guardarDato(base, "estado", "actualizar");
		else if (error instanceof TabletRevocada) await guardarDato(base, "estado", "revocada");
		else throw error;
	}

	/** Una vuelta: sube, y si puede, baja. */
	async function unaVuelta(): Promise<void> {
		const aparato = await estadoDelAparato(base);
		if (aparato === "sin_registro" || aparato === "actualizar") return refrescar();
		try {
			if (aparato === "preparando")
				await bajarFoto(base, conexion, (renglones) => cambiar({ avanceDeLaFoto: renglones }));
			const antes = await base.cola.count();
			const subida = await subirCola(base, conexion);
			cambiar({ conectada: true });
			const quedan = await base.cola.count();
			if (estuvoSinInternet && antes > 0 && quedan === 0) cambiar({ enviadasAlVolver: subida.contestados });
			estuvoSinInternet = false;
			if ((await estadoDelAparato(base)) === "lista") await bajarCambios(base, conexion);
		} catch (error) {
			await alFallar(error);
		}
		await refrescar();
	}

	/** Pide una vuelta: si ya hay una, deja pedida la siguiente. */
	function sincronizar(): Promise<void> {
		if (vuelta !== null) {
			otraVuelta = true;
			return vuelta;
		}
		vuelta = (async () => {
			do {
				otraVuelta = false;
				await unaVuelta();
			} while (otraVuelta);
			vuelta = null;
		})();
		return vuelta;
	}

	/** La pregunta de cada intervalo, aunque no lleguen avisos. */
	async function programar(): Promise<void> {
		const guardado = await leerDato(base, "intervalo_segundos");
		const segundos = typeof guardado === "number" ? guardado : 60;
		reloj = setTimeout(() => {
			void sincronizar().then(programar);
		}, segundos * 1000);
	}

	/**
	 * Lo que hace con cada aviso en vivo: lo que cambia el estado del aparato se guarda, y cada aviso pide una vuelta.
	 * @param evento El aviso.
	 */
	async function alEvento(evento: EventoEnVivo): Promise<void> {
		if (evento.nombre === "hola") {
			const minima = datosDeHola.safeParse(evento.datos).data?.version_minima;
			if (minima !== undefined && (compararVersiones(versionDeLaTablet, minima) ?? 0) < 0)
				await guardarDato(base, "estado", "actualizar");
		} else if (evento.nombre === "resincronizar") await guardarDato(base, "estado", "preparando");
		else if (evento.nombre === "dispositivo_revocado") await guardarDato(base, "estado", "revocada");
		else if (evento.nombre === "actualizar") await guardarDato(base, "estado", "actualizar");
		await sincronizar();
	}

	/** Escucha los avisos en vivo mientras la tablet esté lista; se vuelve a conectar si se cae. */
	async function escuchar(): Promise<void> {
		const llamar = conexion.fetch ?? fetch;
		while (!cortar.signal.aborted) {
			const aparato = await estadoDelAparato(base);
			if (aparato === "lista" || aparato === "preparando") {
				try {
					const respuesta = await llamar(`${conexion.urlBase}/v1/eventos`, {
						headers: await encabezadosDeLaLlave(base),
						signal: cortar.signal,
					});
					if (respuesta.status === 426) await guardarDato(base, "estado", "actualizar");
					else if (respuesta.ok && respuesta.body !== null) {
						await escucharEventos(respuesta.body, alEvento);
					}
				} catch {
					// Sin red o cortada: los avisos son pistas; la pregunta de cada intervalo sigue.
				}
			}
			await new Promise((listo) => setTimeout(listo, esperaParaReconectar));
		}
	}

	/** Al volver la red, sube lo guardado; al irse, lo dice. */
	function alCambiarLaRed(): void {
		if (navigator.onLine) void sincronizar();
		else {
			estuvoSinInternet = true;
			cambiar({ conectada: false });
		}
	}

	return {
		estado: () => estado,
		suscribir: (alCambiar) => {
			escuchas.add(alCambiar);
			return () => escuchas.delete(alCambiar);
		},
		arrancar: async () => {
			// Si se quedó en «actualizar», al arrancar ya puede ser la versión nueva: prueba otra vez; con 426, regresa.
			if ((await estadoDelAparato(base)) === "actualizar") {
				const cursor = await leerDato(base, "cursor");
				await guardarDato(base, "estado", typeof cursor === "string" ? "lista" : "preparando");
			}
			await refrescar();
			globalThis.addEventListener?.("online", alCambiarLaRed);
			globalThis.addEventListener?.("offline", alCambiarLaRed);
			await sincronizar();
			await programar();
			void escuchar();
		},
		sincronizar,
		refrescar,
		avisoVisto: () => cambiar({ enviadasAlVolver: 0 }),
		detener: () => {
			clearTimeout(reloj);
			cortar.abort();
			globalThis.removeEventListener?.("online", alCambiarLaRed);
			globalThis.removeEventListener?.("offline", alCambiarLaRed);
		},
	};
}
