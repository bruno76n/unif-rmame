/**
 * La Zebra en la red local: preguntarle su estado con `~HS` y mandarle el ZPL por TCP, al puerto 9100 si no se dice
 * otro, y la etiqueta de prueba del registro. Sin etiquetas, con la tapa abierta o en pausa no se imprime; si no contesta
 * en 10 segundos, tampoco.
 * Fase 20 · docs/apps/puente-de-impresion.md («Cómo trabaja», pasos 3 y 4, y «La instalación», paso 4)
 *
 * `~HS` contesta tres textos, cada uno entre STX y ETX. En el primero, el segundo campo dice si no hay etiquetas y el
 * tercero si está en pausa; en el segundo, el tercer campo dice si la cabeza está levantada (la tapa abierta). Así lo
 * describe el manual de programación ZPL de Zebra.
 */

import { connect } from "node:net";
import { diaDeNegocio, textoDeDiaConAnio, textoDeHora } from "@uniformame/compartido/calculos/fechas";
import { Temporal } from "temporal-polyfill";
import type { DireccionDeZebra } from "./configuracion.ts";

/** Lo que espera a la Zebra antes de darla por callada. */
const esperaDeLaZebra = 10_000;

/** Lo que dice el trabajo cuando la Zebra no imprime: lo ve quien lo pidió. */
export const textosDeLaZebra = {
	sinEtiquetas: "Sin etiquetas en la impresora",
	tapaAbierta: "La tapa de la impresora está abierta",
	enPausa: "La impresora está en pausa",
	noContesta: "La impresora no contesta: revisa que esté prendida y conectada",
} as const;

/** Cómo está la Zebra: lista, o lo que le impide imprimir. */
export type EstadoDeLaZebra = { lista: true } | { lista: false; error: string };

/** La Zebra no contestó o cortó: el trabajo queda en `fallo` con este texto. */
export class ZebraCallada extends Error {
	constructor() {
		super(textosDeLaZebra.noContesta);
	}
}

/**
 * Lee la respuesta de `~HS`.
 * @param respuesta Lo que contestó, con sus STX y ETX.
 * @returns Su estado; `null` si todavía no llegan los tres textos.
 */
export function leerEstado(respuesta: string): EstadoDeLaZebra | null {
	// Cada texto va entre STX (2) y ETX (3); lo que sigue al último ETX todavía no termina de llegar.
	const textos = respuesta
		.split(String.fromCharCode(3))
		.slice(0, -1)
		.map((pedazo) => (pedazo.split(String.fromCharCode(2)).at(-1) ?? "").split(","));
	const [primero, segundo] = textos;
	if (textos.length < 3 || primero === undefined || segundo === undefined) return null;
	if (primero[1] === "1") return { lista: false, error: textosDeLaZebra.sinEtiquetas };
	if (segundo[2] === "1") return { lista: false, error: textosDeLaZebra.tapaAbierta };
	if (primero[2] === "1") return { lista: false, error: textosDeLaZebra.enPausa };
	return { lista: true };
}

/**
 * Abre la conexión con la Zebra, le manda algo y regresa lo que conteste hasta que `terminar` diga que ya.
 * @param zebra Su dirección y su puerto.
 * @param envio Lo que se le manda.
 * @param terminar Con lo que lleva contestado, si ya acabó; sin ella, acaba al cerrar la Zebra su lado o al terminar de
 * mandar.
 * @param espera Cuánto espera a que conteste.
 * @throws `ZebraCallada` si no conecta, se corta o no termina a tiempo.
 */
function hablarConLaZebra(
	zebra: DireccionDeZebra,
	envio: string | Uint8Array,
	terminar: ((recibido: string) => boolean) | null,
	espera: number,
): Promise<string> {
	return new Promise((resolver, rechazar) => {
		let recibido = "";
		let listo = false;
		const conexion = connect({ host: zebra.direccion, port: zebra.puerto });
		const acabar = (error: boolean) => {
			if (listo) return;
			listo = true;
			clearTimeout(reloj);
			conexion.destroy();
			if (error) rechazar(new ZebraCallada());
			else resolver(recibido);
		};
		const reloj = setTimeout(() => acabar(true), espera);
		conexion.setEncoding("latin1");
		conexion.on("error", () => acabar(true));
		conexion.on("data", (pedazo: string) => {
			recibido += pedazo;
			if (terminar?.(recibido) === true) acabar(false);
		});
		conexion.on("close", () => acabar(terminar !== null));
		conexion.on("connect", () => {
			// Sin respuesta que esperar, basta con que todo salga: se cierra la conexión de este lado.
			if (terminar === null) conexion.end(envio, () => acabar(false));
			else conexion.write(envio);
		});
	});
}

/**
 * Le pregunta a la Zebra su estado con `~HS`.
 * @param zebra Su dirección y su puerto.
 * @param espera Cuánto espera a que conteste (10 segundos).
 * @returns Lista, o lo que le impide imprimir; callada, «La impresora no contesta…».
 */
export async function preguntarEstado(
	zebra: DireccionDeZebra,
	espera: number = esperaDeLaZebra,
): Promise<EstadoDeLaZebra> {
	try {
		const respuesta = await hablarConLaZebra(zebra, "~HS", (recibido) => leerEstado(recibido) !== null, espera);
		return leerEstado(respuesta) ?? { lista: false, error: textosDeLaZebra.noContesta };
	} catch {
		return { lista: false, error: textosDeLaZebra.noContesta };
	}
}

/**
 * Manda el ZPL a la Zebra por TCP y cierra la conexión.
 * @param zebra Su dirección y su puerto.
 * @param zpl El ZPL del trabajo, tal como lo dio la API.
 * @param espera Cuánto espera a terminar de mandarlo (10 segundos).
 * @throws `ZebraCallada` si no conecta o se corta.
 */
export async function mandarZpl(zebra: DireccionDeZebra, zpl: string, espera: number = esperaDeLaZebra): Promise<void> {
	await hablarConLaZebra(zebra, new TextEncoder().encode(zpl), null, espera);
}

/**
 * La etiqueta de prueba del registro, hecha ahí mismo sin pasar por la API: «Unifórmame · prueba de impresión ·
 * {fecha} {hora}», en hora de México.
 * @param momento Cuándo se imprime.
 */
export function etiquetaDePrueba(momento: Temporal.Instant = Temporal.Now.instant()): string {
	const cuando = `${textoDeDiaConAnio(diaDeNegocio(momento))} ${textoDeHora(momento)}`;
	return `^XA^CI28^PW406^LL203^FO20,30^A0N,30,30^FDUnifórmame^FS^FO20,80^A0N,24,24^FDprueba de impresión^FS^FO20,120^A0N,24,24^FD${cuando}^FS^XZ`;
}
