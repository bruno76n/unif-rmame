/**
 * Prueba del script de las carpetas: un trabajador que solo tocó las suyas pasa; uno que tocó el sistema de diseño u
 * otro departamento no, y el script dice cuáles; sin encargo, no revisa nada. En la fase 21, el trabajador de un flujo es
 * dueño de su archivo de prueba y de su archivo de flujo, y no del arnés.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Ningún trabajador tocó carpetas que no son suyas») y fase 21 ·
 * docs/fases/21-pruebas-de-punta-a-punta.md («Cada una es dueña de su archivo en `pruebas/flujos/`»)
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git } from "./archivos.ts";
import { archivoDelEncargo, carpetasDe, fueraDeSusCarpetas, revisarCarpetas } from "./carpetas.ts";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba, escribir } from "./repositorio-de-prueba.ts";

describe("Ningún trabajador tocó carpetas que no son suyas", () => {
	let raiz: string;
	let desde: string;
	beforeEach(() => {
		raiz = crearRepositorioDePrueba();
		desde = git(raiz, ["rev-parse", "HEAD"]).trim();
	});
	afterEach(() => borrarRepositorioDePrueba(raiz));

	it("Bodega toca su ruta, su carpeta, sus consultas de Inventario y su archivo de pantallas: pasa", () => {
		escribir(raiz, "apps/web/src/rutas/bodega/existencias.tsx", "export {};\n");
		escribir(raiz, "apps/web/src/departamentos/bodega/pestanas/existencias.tsx", "export {};\n");
		escribir(raiz, "apps/api/src/modulos/inventario/consultas/existencias.ts", "export {};\n");
		escribir(raiz, "packages/compartido/src/contratos/inventario/existencias.ts", "export {};\n");
		git(raiz, ["add", "-A"]);
		git(raiz, ["commit", "-q", "--no-verify", "-m", "bodega"]);
		escribir(raiz, "docs/interfaz/fabrica/bodega.md", "# Bodega\n");
		expect(fueraDeSusCarpetas(raiz, { departamento: "bodega", desde })).toEqual([]);
	});

	it("tocar el sistema de diseño, lo común o la carpeta de otro departamento no pasa, y dice cuáles", () => {
		escribir(raiz, "apps/web/src/rutas/bodega/index.tsx", "export {};\n");
		escribir(raiz, "packages/interfaz/src/botones/boton.tsx", "export {};\n");
		escribir(raiz, "apps/web/src/comun/menu.ts", "export {};\n");
		escribir(raiz, "apps/web/src/departamentos/aduana/menu.ts", "export {};\n");
		expect(fueraDeSusCarpetas(raiz, { departamento: "bodega", desde })).toEqual([
			"apps/web/src/comun/menu.ts",
			"apps/web/src/departamentos/aduana/menu.ts",
			"packages/interfaz/src/botones/boton.tsx",
		]);
	});

	it("lo que el capataz le dio en «tambien» cuenta como suyo; un departamento que no existe es un error", () => {
		escribir(raiz, "apps/api/src/modulos/inventario/consultas/disponibilidad-linea.ts", "export {};\n");
		expect(fueraDeSusCarpetas(raiz, { departamento: "linea", desde })).toEqual([
			"apps/api/src/modulos/inventario/consultas/disponibilidad-linea.ts",
		]);
		expect(
			fueraDeSusCarpetas(raiz, {
				departamento: "linea",
				desde,
				tambien: ["apps/api/src/modulos/inventario/consultas/disponibilidad-linea.ts"],
			}),
		).toEqual([]);
		expect(() => carpetasDe({ departamento: "tiendas", desde })).toThrow("no existe el departamento tiendas");
	});

	it("el flujo 04 es dueño de su archivo de prueba y de su archivo de flujo; tocar el arnés u otro flujo no pasa", () => {
		escribir(raiz, "pruebas/flujos/04-compra-de-material.prueba.ts", "export {};\n");
		escribir(raiz, "docs/flujos/fabrica/04-compra-de-material.md", "# Flujo 04\n");
		expect(fueraDeSusCarpetas(raiz, { flujo: "04-compra-de-material", desde })).toEqual([]);
		escribir(raiz, "pruebas/flujos/arnes/fabrica.ts", "export {};\n");
		escribir(raiz, "pruebas/flujos/01-pedido-externo.prueba.ts", "export {};\n");
		expect(fueraDeSusCarpetas(raiz, { flujo: "04-compra-de-material", desde })).toEqual([
			"pruebas/flujos/01-pedido-externo.prueba.ts",
			"pruebas/flujos/arnes/fabrica.ts",
		]);
		expect(() => carpetasDe({ flujo: "../arnes/fabrica", desde })).toThrow("no existe el flujo ../arnes/fabrica");
	});

	it("con su encargo en el worktree, la revisión de carpetas lo lee; sin encargo, no revisa", () => {
		expect(revisarCarpetas(raiz)).toBe(true);
		writeFileSync(join(raiz, archivoDelEncargo), JSON.stringify({ departamento: "bodega", desde }));
		escribir(raiz, "apps/web/src/comun/menu.ts", "export {};\n");
		expect(revisarCarpetas(raiz)).toBe(false);
	});
});
