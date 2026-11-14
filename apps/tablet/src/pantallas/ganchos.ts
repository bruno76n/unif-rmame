/**
 * Los ganchos de las pantallas de la tablet: leer de la copia y volver a pintar cuando cambia (con `liveQuery` de
 * Dexie), el estado del motor, la hora al minuto y el cierre de la sesión por inactividad.
 * Fase 20 · docs/interfaz/tablet.md («El encabezado») y docs/apps/tablet.md («El PIN sin internet»)
 */

import { textoDeHora } from "@uniformame/compartido/calculos/fechas";
import { liveQuery } from "dexie";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Temporal } from "temporal-polyfill";
import type { EstadoDeLaTablet, MotorDeLaTablet } from "../sincronizacion/motor.ts";

/**
 * Lee de la copia y vuelve a leer cuando cambia lo que leyó.
 * @param leer La lectura.
 * @param dependencias Lo que hace que se lea de nuevo.
 * @returns Lo leído, o nada mientras lee la primera vez.
 */
export function useCopia<T>(leer: () => Promise<T>, dependencias: readonly unknown[]): T | undefined {
	const [valor, setValor] = useState<T>();
	// La lectura de cada pintada se guarda aparte: se vuelve a suscribir solo cuando cambian sus dependencias.
	const lectura = useRef(leer);
	lectura.current = leer;
	const clave = JSON.stringify(dependencias);
	// biome-ignore lint/correctness/useExhaustiveDependencies: «clave» no se usa adentro, pero cambiarla vuelve a suscribir.
	useEffect(() => {
		const suscripcion = liveQuery(() => lectura.current()).subscribe({ next: setValor, error: () => undefined });
		return () => suscripcion.unsubscribe();
	}, [clave]);
	return valor;
}

/**
 * El estado del motor, que se vuelve a pintar con cada cambio.
 * @param motor El motor de la tablet.
 */
export function useEstadoDelMotor(motor: MotorDeLaTablet): EstadoDeLaTablet {
	return useSyncExternalStore(motor.suscribir, motor.estado);
}

/** La hora de México al minuto: «10:42». */
export function useHora(): string {
	const [hora, setHora] = useState(() => textoDeHora(Temporal.Now.instant()));
	useEffect(() => {
		const reloj = setInterval(() => setHora(textoDeHora(Temporal.Now.instant())), 15_000);
		return () => clearInterval(reloj);
	}, []);
	return hora;
}

/**
 * Cierra la sesión si nadie toca la pantalla en tantos segundos.
 * @param activa Si hay alguien adentro.
 * @param segundos `personal.tablet_inactividad_seg`.
 * @param alCerrar Qué hacer al cerrarla.
 */
export function useInactividad(activa: boolean, segundos: number | undefined, alCerrar: () => void): void {
	useEffect(() => {
		if (!activa || segundos === undefined) return;
		let reloj = setTimeout(alCerrar, segundos * 1000);
		const alTocar = () => {
			clearTimeout(reloj);
			reloj = setTimeout(alCerrar, segundos * 1000);
		};
		globalThis.addEventListener("pointerdown", alTocar);
		globalThis.addEventListener("keydown", alTocar);
		return () => {
			clearTimeout(reloj);
			globalThis.removeEventListener("pointerdown", alTocar);
			globalThis.removeEventListener("keydown", alTocar);
		};
	}, [activa, segundos, alCerrar]);
}
