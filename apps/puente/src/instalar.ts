/**
 * Dejar el puente arrancando solo: en Linux, un servicio de systemd que corre como el usuario que lo instala y se
 * reinicia si se cae; en Windows, una tarea programada que lo arranca al iniciar la sesión de ese usuario, para que lea
 * su configuración, que solo él puede leer.
 * Fase 20 · docs/apps/puente-de-impresion.md («La instalación», paso 6)
 */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

/** El nombre del servicio y de la tarea. */
const nombreDelServicio = "uniformame-puente";

/** Dónde va la unidad de systemd. */
const unidadDeSystemdEn = `/etc/systemd/system/${nombreDelServicio}.service`;

/**
 * La unidad de systemd del puente.
 * @param ejecutable La ruta del ejecutable.
 * @param usuario El usuario que lo corre: el dueño de su configuración.
 */
export function unidadDeSystemd(ejecutable: string, usuario: string): string {
	return [
		"[Unit]",
		"Description=Unifórmame · puente de impresión",
		"Wants=network-online.target",
		"After=network-online.target",
		"",
		"[Service]",
		`ExecStart="${ejecutable}"`,
		`User=${usuario}`,
		"Restart=on-failure",
		"RestartSec=10",
		"",
		"[Install]",
		"WantedBy=multi-user.target",
		"",
	].join("\n");
}

/**
 * Los argumentos de `schtasks` para la tarea de Windows: al iniciar la sesión del usuario, sin pedir nada.
 * @param ejecutable La ruta del ejecutable.
 * @param usuario El usuario que lo corre.
 */
export function argumentosDeSchtasks(ejecutable: string, usuario: string): string[] {
	return ["/Create", "/F", "/TN", nombreDelServicio, "/TR", `"${ejecutable}"`, "/SC", "ONLOGON", "/RU", usuario, "/IT"];
}

/**
 * Instala el arranque solo en este sistema.
 * @param ejecutable La ruta del ejecutable.
 * @param usuario El usuario que lo corre.
 * @param plataforma `process.platform`.
 * @returns Lo que se hizo, para decirlo en pantalla.
 */
export async function instalar(
	ejecutable: string,
	usuario: string,
	plataforma: NodeJS.Platform = process.platform,
): Promise<string> {
	const correr = promisify(execFile);
	if (plataforma === "win32") {
		await correr("schtasks", argumentosDeSchtasks(ejecutable, usuario));
		return `Listo: la tarea «${nombreDelServicio}» lo arranca al iniciar la sesión de ${usuario}.`;
	}
	await writeFile(unidadDeSystemdEn, unidadDeSystemd(ejecutable, usuario));
	await correr("systemctl", ["daemon-reload"]);
	await correr("systemctl", ["enable", "--now", nombreDelServicio]);
	return `Listo: el servicio ${nombreDelServicio} arranca solo al prender la computadora.`;
}
