/**
 * `pnpm puente:empaquetar`: arma el ejecutable del puente con las single executable applications de Node. Vite junta el
 * puente y sus dependencias en un solo archivo de CommonJS (`dist/puente.cjs`) y `node --build-sea` lo mete en una copia
 * de Node: `dist/uniformame-puente` para Linux con el Node que corre esto, y `dist/uniformame-puente.exe` para Windows
 * con el `node.exe` de la misma versión que se le dé en `--node-windows`.
 * Fase 20 · docs/apps/puente-de-impresion.md («La instalación», paso 1) y docs/cimientos/ARQUITECTURA.md («Puente de
 * impresión»)
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { build } from "vite";

/** La carpeta del puente. */
const puente = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Donde quedan el archivo junto y los ejecutables. */
const salida = join(puente, "dist");

/** Junta el puente y sus dependencias en `dist/puente.cjs`, sin nada de fuera salvo Node. */
async function juntar(): Promise<string> {
	await build({
		configFile: false,
		root: puente,
		logLevel: "warn",
		ssr: { noExternal: true },
		build: {
			ssr: join(puente, "src", "principal.ts"),
			outDir: salida,
			emptyOutDir: true,
			target: "node26",
			minify: false,
			rollupOptions: { output: { format: "cjs", entryFileNames: "puente.cjs" } },
		},
	});
	return join(salida, "puente.cjs");
}

/**
 * Arma un ejecutable con `node --build-sea`.
 * @param principal El archivo junto.
 * @param ejecutable Cómo se llama el que sale.
 * @param node El Node en que se mete; sin él, el que corre esto.
 */
async function armar(principal: string, ejecutable: string, node?: string): Promise<string> {
	const configuracion = join(salida, `${ejecutable}.sea.json`);
	await writeFile(
		configuracion,
		JSON.stringify({
			main: principal,
			output: join(salida, ejecutable),
			disableExperimentalSEAWarning: true,
			...(node === undefined ? {} : { executable: node }),
		}),
	);
	await promisify(execFile)(process.execPath, ["--build-sea", configuracion]);
	return join(salida, ejecutable);
}

const { values } = parseArgs({ options: { "node-windows": { type: "string" } } });
await mkdir(salida, { recursive: true });
const principal = await juntar();
console.log(`Listo: ${await armar(principal, "uniformame-puente")}`);
const nodeWindows = values["node-windows"];
if (nodeWindows === undefined) {
	console.log("Para Windows: pnpm puente:empaquetar --node-windows {ruta del node.exe de la misma versión}");
} else {
	console.log(`Listo: ${await armar(principal, "uniformame-puente.exe", nodeWindows)}`);
}
