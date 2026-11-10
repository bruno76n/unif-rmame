/**
 * Prueba de la revisión de las migraciones y de las llaves pendientes.
 * Fase 2 · docs/fases/02-base-de-datos-y-pruebas.md (partes 2 y 3)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git } from "./archivos.ts";
import { revisarLlavesPendientes, revisarMigracionesDeLaRama } from "./migraciones.ts";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba, escribir } from "./repositorio-de-prueba.ts";

describe("la revisión completa falla si cambió una migración que ya está en la rama principal, o si una marca @llavePendiente apunta a una tabla que ya existe", () => {
	let raiz = "";
	beforeEach(() => {
		raiz = crearRepositorioDePrueba();
		escribir(raiz, "apps/api/migraciones/0000_base.sql", "CREATE SEQUENCE version_global;\n");
		escribir(raiz, "apps/api/migraciones/meta/_journal.json", "{}\n");
		git(raiz, ["add", "-A"]);
		git(raiz, ["commit", "-q", "-m", "la primera migración, en main"]);
		git(raiz, ["checkout", "-q", "-b", "fase"]);
	});
	afterEach(() => borrarRepositorioDePrueba(raiz));

	it("sin cambios en las migraciones de main, sale en verde", () => {
		expect(revisarMigracionesDeLaRama(raiz)).toEqual([]);
	});

	it("una migración nueva sale en verde, y su registro en meta/ puede cambiar", () => {
		escribir(raiz, "apps/api/migraciones/0001_otra.sql", "SELECT 1;\n");
		escribir(raiz, "apps/api/migraciones/meta/_journal.json", '{"entries":[]}\n');
		expect(revisarMigracionesDeLaRama(raiz)).toEqual([]);
	});

	it("falla si cambió una migración que ya está en main", () => {
		escribir(raiz, "apps/api/migraciones/0000_base.sql", "CREATE SEQUENCE version_global START 10;\n");
		expect(revisarMigracionesDeLaRama(raiz).map((p) => p.archivo)).toEqual(["apps/api/migraciones/0000_base.sql"]);
	});

	it("falla si se borró una migración que ya está en main", () => {
		git(raiz, ["rm", "-q", "apps/api/migraciones/0000_base.sql"]);
		expect(revisarMigracionesDeLaRama(raiz)).toHaveLength(1);
	});

	it("compara también contra origin/main, y falla si no hay rama principal con qué comparar", () => {
		git(raiz, ["update-ref", "refs/remotes/origin/main", "main"]);
		git(raiz, ["branch", "-D", "main"]);
		escribir(raiz, "apps/api/migraciones/0000_base.sql", "CREATE SEQUENCE version_global START 10;\n");
		expect(revisarMigracionesDeLaRama(raiz)).toHaveLength(1);
		git(raiz, ["update-ref", "-d", "refs/remotes/origin/main"]);
		expect(revisarMigracionesDeLaRama(raiz)[0]?.que).toContain("git fetch origin main");
	});

	it("falla si cambió una entrada del registro de migraciones que ya está en main", () => {
		escribir(raiz, "apps/api/migraciones/meta/_journal.json", '{"entries":[{"idx":0,"tag":"0000_base"}]}\n');
		git(raiz, ["add", "-A"]);
		git(raiz, ["-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", "registro"]);
		git(raiz, ["branch", "-f", "main", "HEAD"]);
		escribir(raiz, "apps/api/migraciones/meta/_journal.json", '{"entries":[{"idx":0,"tag":"0000_otra"}]}\n');
		expect(revisarMigracionesDeLaRama(raiz).map((p) => p.archivo)).toEqual(["apps/api/migraciones/meta/_journal.json"]);
	});

	it("reconoce las tablas creadas de otras formas en SQL", () => {
		escribir(
			raiz,
			"apps/api/migraciones/0001_varias.sql",
			'CREATE  UNLOGGED TABLE\n  "intentos" (id uuid);\nCREATE TABLE Bitacora (id uuid);\nCREATE TABLE IF NOT EXISTS public."eventos" (id uuid);\n',
		);
		escribir(
			raiz,
			"apps/api/src/modulos/admin/tablas.ts",
			"/** @llavePendiente intentos.id */\n/** @llavePendiente bitacora */\n/** @llavePendiente eventos.id */\n",
		);
		expect(revisarLlavesPendientes(raiz)).toHaveLength(3);
	});

	it("falla si una migración nueva tiene fecha anterior a la última de main", () => {
		escribir(raiz, "apps/api/migraciones/meta/_journal.json", '{"entries":[{"idx":0,"when":200,"tag":"0000_base"}]}\n');
		git(raiz, ["add", "-A"]);
		git(raiz, ["-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", "registro"]);
		git(raiz, ["branch", "-f", "main", "HEAD"]);
		escribir(
			raiz,
			"apps/api/migraciones/meta/_journal.json",
			'{"entries":[{"idx":0,"when":200,"tag":"0000_base"},{"idx":1,"when":100,"tag":"0001_vieja"}]}\n',
		);
		expect(revisarMigracionesDeLaRama(raiz)[0]?.que).toContain("fecha anterior");
	});

	it("una tabla creada a mano en una migración cuenta como existente, y la marca sin columna también se revisa", () => {
		escribir(raiz, "apps/api/migraciones/0001_bitacora.sql", 'CREATE TABLE "bitacora_2026_11" (id uuid);\n');
		escribir(raiz, "apps/api/src/modulos/admin/tablas.ts", "/** @llavePendiente bitacora_2026_11 */\n");
		expect(revisarLlavesPendientes(raiz)).toHaveLength(1);
	});

	it("una marca que apunta a una tabla que todavía no existe sale en verde", () => {
		escribir(
			raiz,
			"apps/api/src/modulos/admin/tablas.ts",
			'/** @llavePendiente usuarios.id */\nconst x = pgTable("bitacora", {});\n',
		);
		expect(revisarLlavesPendientes(raiz)).toEqual([]);
	});

	it("falla si una marca apunta a una tabla que ya existe", () => {
		escribir(
			raiz,
			"apps/api/src/modulos/admin/tablas.ts",
			'/** @llavePendiente usuarios.id */\nconst x = pgTable("bitacora", {});\n',
		);
		escribir(raiz, "apps/api/src/modulos/acceso/tablas.ts", 'const y = pgTable("usuarios", {});\n');
		const problemas = revisarLlavesPendientes(raiz);
		expect(problemas).toHaveLength(1);
		expect(problemas[0]?.que).toContain("usuarios");
	});
});
