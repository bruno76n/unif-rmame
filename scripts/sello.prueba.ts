/**
 * Prueba del sello de la revisión completa.
 * Fase 1 · docs/fases/01-repositorio-reglas-y-paquete-compartido.md (parte 2)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba, escribir, git } from "./repositorio-de-prueba.ts";
import { correrRevision } from "./revision.ts";
import { huellaDelArbol, huellaDelIndice, leerSello } from "./sello.ts";

describe("la revisión completa en verde guarda el sello con la huella de lo revisado, y escribir en docs/registros/ no cambia la huella", () => {
	let raiz = "";
	beforeEach(() => {
		raiz = crearRepositorioDePrueba();
		escribir(raiz, "docs/registros/BITACORA.md", "# Bitácora\n");
		escribir(raiz, "docs/otro.md", "# Otro\n");
	});
	afterEach(() => borrarRepositorioDePrueba(raiz));

	it("con todos los pasos en verde guarda el sello con la huella de lo revisado", () => {
		const pasa = correrRevision(raiz, [{ nombre: "uno", correr: () => true }]);
		expect(pasa).toBe(true);
		expect(existsSync(join(raiz, ".revision/sello.json"))).toBe(true);
		expect(leerSello(raiz)).toBe(huellaDelArbol(raiz));
	});

	it("con un paso en rojo no guarda el sello", () => {
		const pasa = correrRevision(raiz, [
			{ nombre: "uno", correr: () => true },
			{ nombre: "dos", correr: () => false },
		]);
		expect(pasa).toBe(false);
		expect(leerSello(raiz)).toBeUndefined();
	});

	it("si algo cambia mientras corre la revisión, no sella", () => {
		const pasa = correrRevision(raiz, [
			{
				nombre: "cambia un archivo",
				correr: () => {
					escribir(raiz, "scripts/nuevo.ts", "export const a = 1;\n");
					return true;
				},
			},
		]);
		expect(pasa).toBe(false);
		expect(leerSello(raiz)).toBeUndefined();
	});

	it("escribir en docs/registros/ no cambia la huella", () => {
		const antes = huellaDelArbol(raiz);
		escribir(raiz, "docs/registros/BITACORA.md", "# Bitácora\n\n| una línea |\n");
		escribir(raiz, "docs/registros/sesiones/2026-11-10-fase-01.md", "# Sesión\n");
		expect(huellaDelArbol(raiz)).toBe(antes);
	});

	it("cambiar cualquier otro archivo sí cambia la huella", () => {
		const antes = huellaDelArbol(raiz);
		escribir(raiz, "docs/otro.md", "# Otro, cambiado\n");
		expect(huellaDelArbol(raiz)).not.toBe(antes);
	});

	it("la huella de lo que se va a guardar (el índice) es la misma que la del árbol cuando todo está agregado", () => {
		git(raiz, ["add", "-A"]);
		expect(huellaDelIndice(raiz)).toBe(huellaDelArbol(raiz));
		escribir(raiz, "scripts/sin-agregar.ts", "export const b = 2;\n");
		expect(huellaDelIndice(raiz)).not.toBe(huellaDelArbol(raiz));
	});

	it("el sello no entra a git", () => {
		correrRevision(raiz, [{ nombre: "uno", correr: () => true }]);
		expect(readFileSync(join(raiz, ".gitignore"), "utf8")).toContain(".revision/");
		expect(git(raiz, ["status", "--porcelain", "--", ".revision"])).toBe("");
	});
});
