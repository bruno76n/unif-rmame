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
