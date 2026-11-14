/**
 * Prueba del service worker de la tablet: al construirla, `sw.js` guarda todo lo que armó Vite y lo de `public/` (el
 * manifiesto que la hace instalable y su ícono), nunca nada de `/v1`, y su versión cambia cuando cambia lo armado.
 * Fase 20 · docs/apps/tablet.md (regla 1: «trabaja sin red con su service worker») · decisión 813
 */

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { codigoDelServiceWorker } from "./plugin.ts";

/** La carpeta de la tablet. */
const tablet = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("el service worker de la tablet", () => {
	it("trabaja sin red: guarda todo lo que armó Vite y lo de public, y abre la tablet desde ahí", async () => {
		const salida = await mkdtemp(join(tmpdir(), "tablet-"));
		try {
			await build({
				root: tablet,
				configFile: join(tablet, "vite.config.ts"),
				logLevel: "error",
				build: { outDir: salida },
			});
			const codigo = await readFile(join(salida, "sw.js"), "utf8");
			const lista = z.array(z.string()).parse(JSON.parse(/const archivos = (\[.*\]);/.exec(codigo)?.[1] ?? "[]"));
			const armados = (await readdir(salida, { recursive: true, withFileTypes: true }))
				.filter((entrada) => entrada.isFile() && entrada.name !== "sw.js")
				.map((entrada) => `/${join(entrada.parentPath, entrada.name).slice(salida.length + 1)}`);
			expect(lista.toSorted()).toEqual(armados.toSorted());
			expect(lista).toEqual(expect.arrayContaining(["/index.html", "/manifest.webmanifest", "/icono.svg"]));
			expect(codigo).toContain('url.pathname.startsWith("/v1/")');
		} finally {
			await rm(salida, { recursive: true, force: true });
		}
	});

	it("su versión es la de lo que guarda: otra lista, otro nombre de caché", () => {
		expect(codigoDelServiceWorker(["/index.html"], "aaa")).toContain('const nombre = "puerta-del-taller-aaa";');
		expect(codigoDelServiceWorker(["/index.html"], "bbb")).toContain('const nombre = "puerta-del-taller-bbb";');
	});
});
