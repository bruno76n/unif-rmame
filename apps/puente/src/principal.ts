/**
 * La entrada del puente, `uniformame-puente`:
 * - sin orden, corre: termina lo de su diario, escucha sus avisos e imprime sus trabajos hasta que lo detengan;
 * - `registrar` pide la dirección del sistema, el código y la dirección de la Zebra, se registra y manda la etiqueta de
 *   prueba (también con `--api`, `--codigo` y `--zebra`);
 * - `impresora {dirección}` cambia la Zebra sin volver a registrar;
 * - `instalar` lo deja arrancando solo;
 * - `version` dice su versión.
 * Fase 20 · docs/apps/puente-de-impresion.md («La instalación», «La configuración» y «Cómo trabaja»)
 */

import { userInfo } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { crearApiDelPuente } from "./api.ts";
import {
	type Configuracion,
	carpetaDeDatos,
	guardarConfiguracion,
	leerConfiguracion,
	leerDireccionDeZebra,
} from "./configuracion.ts";
import { crearDiario } from "./diario.ts";
import { instalar } from "./instalar.ts";
import { registrar } from "./registrar.ts";
import { crearRegistro } from "./registro.ts";
import { arrancarPuente } from "./senal.ts";
import { versionDelPuente } from "./version.ts";
import { etiquetaDePrueba, mandarZpl } from "./zebra.ts";

/**
 * Pregunta en la terminal lo que no vino en la orden.
 * @param pregunta Lo que se pregunta.
 * @param dado Lo que vino en la orden, si vino.
 */
async function preguntar(pregunta: string, dado: string | undefined): Promise<string> {
	if (dado !== undefined) return dado;
	const terminal = createInterface({ input: process.stdin, output: process.stdout });
	try {
		return (await terminal.question(`${pregunta}: `)).trim();
	} finally {
		terminal.close();
	}
}

/**
 * La configuración, o el aviso de que falta registrarse.
 * @param carpeta La carpeta de datos.
 */
async function configuracionDe(carpeta: string): Promise<Configuracion> {
	const configuracion = await leerConfiguracion(carpeta);
	if (configuracion === null) throw new Error("Primero registra el puente: uniformame-puente registrar");
	return configuracion;
}

/**
 * Registra el puente y manda la etiqueta de prueba.
 * @param carpeta La carpeta de datos.
 * @param opciones Lo que vino en la orden.
 */
async function ordenRegistrar(
	carpeta: string,
	opciones: { api?: string | undefined; codigo?: string | undefined; zebra?: string | undefined },
): Promise<number> {
	const api = (await preguntar("Dirección del sistema (https://…)", opciones.api)).replace(/\/+$/, "");
	const codigo = await preguntar("El código que te dio la dueña", opciones.codigo);
	const zebra = leerDireccionDeZebra(
		await preguntar("La dirección de la Zebra en la red (192.168.1.50)", opciones.zebra),
	);
	if (zebra === null) {
		console.error("Esa dirección no se entiende: escribe algo como 192.168.1.50 o 192.168.1.50:9100.");
		return 1;
	}
	const { registrado, mensaje } = await registrar({ api, codigo, zebra, carpeta });
	console.log(mensaje);
	if (!registrado) return 1;
	try {
		await mandarZpl(zebra, etiquetaDePrueba());
		console.log(`Etiqueta de prueba mandada a ${zebra.direccion}. Si no sale, revisa la dirección antes de seguir.`);
	} catch (error) {
		console.error(`${error instanceof Error ? error.message : String(error)}. Revisa la dirección antes de seguir.`);
	}
	return 0;
}

/**
 * Corre el puente hasta que lo detengan, lo revoquen o haya que actualizarlo.
 * @param carpeta La carpeta de datos.
 */
async function ordenCorrer(carpeta: string): Promise<number> {
	const inicial = await configuracionDe(carpeta);
	const registro = crearRegistro(join(carpeta, "registro.txt"));
	await registro.recortar();
	const puente = arrancarPuente({
		api: crearApiDelPuente({
			leer: () => configuracionDe(carpeta),
			guardar: (configuracion) => guardarConfiguracion(carpeta, configuracion),
		}),
		api_url: async () => (await configuracionDe(carpeta)).api,
		diario: crearDiario(join(carpeta, "diario.jsonl")),
		registro,
		zebra: async () => (await configuracionDe(carpeta)).zebra,
		intervaloSegundos: inicial.intervalo_segundos,
	});
	for (const senal of ["SIGINT", "SIGTERM"] as const) process.on(senal, () => puente.detener());
	const porque = await puente.terminado;
	if (porque !== "detenido") console.error(`Se detuvo: ${porque}. Ver ${join(carpeta, "registro.txt")}.`);
	return 0;
}

/**
 * Lee la orden y la cumple.
 * @param argumentos Los argumentos de la línea de órdenes.
 */
async function principal(argumentos: string[]): Promise<number> {
	const { positionals, values } = parseArgs({
		args: argumentos,
		allowPositionals: true,
		options: { api: { type: "string" }, codigo: { type: "string" }, zebra: { type: "string" } },
	});
	const [orden, valor] = positionals;
	const carpeta = carpetaDeDatos();
	if (orden === undefined) return ordenCorrer(carpeta);
	if (orden === "version") {
		console.log(versionDelPuente);
		return 0;
	}
	if (orden === "registrar") return ordenRegistrar(carpeta, values);
	if (orden === "impresora") {
		const zebra = leerDireccionDeZebra(valor ?? "");
		if (zebra === null) {
			console.error("Escribe la dirección de la Zebra: uniformame-puente impresora 192.168.1.60");
			return 1;
		}
		await guardarConfiguracion(carpeta, { ...(await configuracionDe(carpeta)), zebra });
		console.log(`La Zebra ahora es ${zebra.direccion}:${zebra.puerto}.`);
		return 0;
	}
	if (orden === "instalar") {
		console.log(await instalar(process.execPath, userInfo().username));
		return 0;
	}
	console.error("Órdenes: registrar · impresora {dirección} · instalar · version, o sin orden para correr.");
	return 1;
}

principal(process.argv.slice(2)).then(
	(salida) => {
		process.exitCode = salida;
	},
	(error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	},
);
