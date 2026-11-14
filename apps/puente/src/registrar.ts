/**
 * Registrar el puente con el código que dio la dueña: hace su secreto (32 bytes al azar en base64url), canjea el código
 * con el tipo `puente_impresion` y guarda su configuración con la dirección de la Zebra. Si el código no sirve, regresa
 * el mensaje de la API. Si se corta antes de la respuesta, repite con la misma clave y el mismo secreto.
 * Fase 20 · docs/apps/puente-de-impresion.md («La instalación», paso 3) y docs/modulos/admin/dispositivos.md
 * («`admin.canjear_codigo`»)
 */

import { randomBytes } from "node:crypto";
import { release, type as tipoDeSistema } from "node:os";
import { setTimeout as esperar } from "node:timers/promises";
import { salidaDelCanje } from "@uniformame/compartido/contratos/admin/dispositivos";
import { respuestaDeError } from "@uniformame/compartido/contratos/protocolo";
import { v7 as uuidv7 } from "uuid";
import { type DireccionDeZebra, guardarConfiguracion } from "./configuracion.ts";
import { versionDelPuente } from "./version.ts";

/** Cuántas veces repite el canje si se corta. */
const reintentosDelCanje = 4;

/** Lo que pide el registro. */
export interface DatosDelRegistro {
	/** La dirección de la API, sin la diagonal final. */
	api: string;
	codigo: string;
	zebra: DireccionDeZebra;
	/** La carpeta de datos donde guarda su configuración. */
	carpeta: string;
	fetch?: typeof fetch;
	/** La espera entre reintentos; las pruebas la bajan. */
	espera?: number;
}

/**
 * Canjea el código y guarda la configuración.
 * @param datos La API, el código, la Zebra y la carpeta.
 * @returns El mensaje de la API: registrado, o por qué no.
 */
export async function registrar(datos: DatosDelRegistro): Promise<{ registrado: boolean; mensaje: string }> {
	const llamar = datos.fetch ?? fetch;
	const secreto = randomBytes(32).toString("base64url");
	const cuerpo = JSON.stringify({
		clave_idempotencia: uuidv7(),
		datos: {
			codigo: datos.codigo.trim(),
			tipo: "puente_impresion",
			secreto,
			aparato: `${tipoDeSistema()} ${release()}`.slice(0, 60),
			version_app: versionDelPuente,
		},
	});
	for (let intento = 0; ; intento++) {
		const respuesta = await llamar(`${datos.api}/v1/dispositivos/canjear`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-app-version": versionDelPuente },
			body: cuerpo,
		}).catch(() => null);
		const leido: unknown = respuesta === null ? null : await respuesta.json().catch(() => null);
		const error = respuestaDeError.safeParse(leido);
		if (respuesta?.ok) {
			const canje = salidaDelCanje.parse(
				typeof leido === "object" && leido !== null && "resultado" in leido ? leido.resultado : undefined,
			);
			await guardarConfiguracion(datos.carpeta, {
				api: datos.api,
				llave_id: canje.llave_id,
				secreto,
				zebra: datos.zebra,
				intervalo_segundos: canje.intervalo_segundos,
			});
			return { registrado: true, mensaje: `Registrado como ${canje.folio}` };
		}
		if (error.success && (respuesta?.status ?? 500) < 500) return { registrado: false, mensaje: error.data.mensaje };
		if (intento >= reintentosDelCanje) return { registrado: false, mensaje: "No hay conexión con el sistema." };
		await esperar((datos.espera ?? 500) * 2 ** intento);
	}
}
