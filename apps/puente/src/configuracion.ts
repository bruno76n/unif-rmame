/**
 * La configuración local del puente (`puente.json`): la dirección de la API, su llave (`llave_id` y su secreto) y la
 * dirección y el puerto de su Zebra. Vive en la carpeta de datos del usuario que lo corre, y solo ese usuario la lee.
 * Fase 20 · docs/apps/puente-de-impresion.md («La configuración» y «La llave»)
 *
 * El secreto nunca sale de este archivo salvo en el encabezado de cada llamada. Mientras cambia su llave guarda también
 * `secreto_nuevo`: si no supo si el cambio se aplicó, la siguiente llamada prueba primero la nueva y luego la vieja.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

/** El puerto de la Zebra si no se escribe otro. */
const puertoDeLaZebra = 9100;

/** Una Zebra en la red local. */
const zebra = z.object({
	direccion: z.string().min(1),
	puerto: z.number().int().min(1).max(65_535),
});

/** Una Zebra en la red local: su dirección y su puerto. */
export type DireccionDeZebra = z.infer<typeof zebra>;

/** Lo que guarda `puente.json`. */
const esquemaDeConfiguracion = z
	.object({
		api: z.url(),
		llave_id: z.string().min(1),
		secreto: z.string().min(1),
		secreto_nuevo: z.string().min(1).optional(),
		zebra,
		intervalo_segundos: z.number().int().positive(),
	})
	.strict();

/** Lo que guarda `puente.json`. */
export type Configuracion = z.infer<typeof esquemaDeConfiguracion>;

/**
 * La carpeta de datos del puente: la de `UNIFORMAME_PUENTE_DATOS` si se da; si no, la del usuario que lo corre
 * (`%APPDATA%\Uniformame Puente` en Windows, `~/.config/uniformame-puente` en Linux).
 * @param entorno Las variables de entorno.
 * @param plataforma `process.platform`.
 * @param casa La carpeta del usuario.
 */
export function carpetaDeDatos(
	entorno: NodeJS.ProcessEnv = process.env,
	plataforma: NodeJS.Platform = process.platform,
	casa: string = homedir(),
): string {
	const dada = entorno.UNIFORMAME_PUENTE_DATOS;
	if (dada !== undefined && dada !== "") return dada;
	if (plataforma === "win32") return join(entorno.APPDATA ?? join(casa, "AppData", "Roaming"), "Uniformame Puente");
	return join(entorno.XDG_CONFIG_HOME ?? join(casa, ".config"), "uniformame-puente");
}

/**
 * Lee la dirección de una Zebra como la escribe quien instala: `192.168.1.50`, o con otro puerto, `192.168.1.50:9200`.
 * @param texto Lo que escribió.
 * @returns La dirección y el puerto, o `null` si no se entiende.
 */
export function leerDireccionDeZebra(texto: string): DireccionDeZebra | null {
	const partes = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(texto.trim());
	if (partes === null) return null;
	const leida = zebra.safeParse({ direccion: partes[1], puerto: Number(partes[2] ?? puertoDeLaZebra) });
	return leida.success ? leida.data : null;
}

/**
 * Lee `puente.json`.
 * @param carpeta La carpeta de datos.
 * @returns La configuración, o `null` si el puente no se ha registrado.
 */
export async function leerConfiguracion(carpeta: string): Promise<Configuracion | null> {
	const texto = await readFile(join(carpeta, "puente.json"), "utf8").catch(() => null);
	return texto === null ? null : esquemaDeConfiguracion.parse(JSON.parse(texto));
}

/**
 * Guarda `puente.json` de un jalón (un archivo nuevo que reemplaza al anterior), legible solo por su usuario.
 * @param carpeta La carpeta de datos.
 * @param configuracion Lo que se guarda.
 */
export async function guardarConfiguracion(carpeta: string, configuracion: Configuracion): Promise<void> {
	await mkdir(carpeta, { recursive: true, mode: 0o700 });
	const archivo = join(carpeta, "puente.json");
	const temporal = `${archivo}.nuevo`;
	await writeFile(temporal, `${JSON.stringify(esquemaDeConfiguracion.parse(configuracion), null, "\t")}\n`, {
		mode: 0o600,
	});
	await rename(temporal, archivo);
}
