/**
 * Registrar la tablet con el código que dio la dueña: hace su secreto (32 bytes con `crypto.getRandomValues`, en
 * base64url), canjea el código con el tipo `tablet_taller`, su aparato y su versión, y guarda su llave con el secreto
 * cifrado. Si el código no sirve, regresa el mensaje de la API; si se corta, repite con la misma clave y el mismo
 * secreto. Después la tablet baja su foto completa.
 * Fase 20 · docs/apps/tablet.md («El registro», pasos 1 a 3) y docs/modulos/admin/dispositivos.md («`admin.canjear_codigo`»)
 */

import { salidaDelCanje } from "@uniformame/compartido/contratos/admin/dispositivos";
import { respuestaDeError } from "@uniformame/compartido/contratos/protocolo";
import { v7 as uuidv7 } from "uuid";
import type { BaseDeLaTablet } from "../copia/base.ts";
import { type Conexion, secretoNuevo } from "../sincronizacion/api.ts";
import { guardarDato } from "../sincronizacion/estado.ts";
import { versionDeLaTablet } from "../version.ts";
import { cifrar, llaveDeCifrado } from "./cifrado.ts";

/** Cuántas veces repite el canje si se corta. */
const reintentosDelCanje = 4;

/**
 * El aparato como se lee en Dispositivos: «Android 14», o lo que diga el navegador.
 * @param agente El `userAgent` del navegador.
 */
export function nombreDelAparato(agente: string): string {
	const android = /Android [\d.]+/.exec(agente)?.[0];
	return (android ?? agente.split(" ")[0] ?? "Navegador").slice(0, 60);
}

/**
 * Canjea el código y guarda la llave.
 * @param base La base local.
 * @param conexion A dónde llama.
 * @param codigo Lo que escribió la persona.
 * @param espera La espera entre reintentos; las pruebas la bajan.
 * @returns Registrada, o el mensaje de por qué no.
 */
export async function registrarTablet(
	base: BaseDeLaTablet,
	conexion: Conexion,
	codigo: string,
	espera = 500,
): Promise<{ registrada: true } | { registrada: false; mensaje: string }> {
	const llamar = conexion.fetch ?? fetch;
	const secreto = secretoNuevo();
	const cuerpo = JSON.stringify({
		clave_idempotencia: uuidv7(),
		datos: {
			codigo: codigo.trim(),
			tipo: "tablet_taller",
			secreto,
			aparato: nombreDelAparato(navigator.userAgent),
			version_app: versionDeLaTablet,
		},
	});
	for (let intento = 0; ; intento++) {
		const respuesta = await llamar(`${conexion.urlBase}/v1/dispositivos/canjear`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-app-version": versionDeLaTablet },
			body: cuerpo,
		}).catch(() => null);
		const leido: unknown = respuesta === null ? null : await respuesta.json().catch(() => null);
		if (respuesta?.ok) {
			const canje = salidaDelCanje.parse(
				typeof leido === "object" && leido !== null && "resultado" in leido ? leido.resultado : undefined,
			);
			await base.aparato.put({
				id: "aparato",
				dispositivo_id: canje.dispositivo_id,
				folio: canje.folio,
				ubicacion_id: canje.ubicacion_id,
				llave_id: canje.llave_id,
				secreto: await cifrar(await llaveDeCifrado(base), secreto),
			});
			await guardarDato(base, "intervalo_segundos", canje.intervalo_segundos);
			await guardarDato(base, "estado", "preparando");
			return { registrada: true };
		}
		const error = respuestaDeError.safeParse(leido);
		if (error.success && (respuesta?.status ?? 500) < 500) return { registrada: false, mensaje: error.data.mensaje };
		if (intento >= reintentosDelCanje) return { registrada: false, mensaje: "No hay conexión con el sistema." };
		await new Promise((listo) => setTimeout(listo, espera * 2 ** intento));
	}
}
