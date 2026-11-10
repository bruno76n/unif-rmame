/**
 * Configuración de drizzle-kit: de dónde lee las tablas y dónde escribe las migraciones.
 * Fase 2 · docs/cimientos/BASE-DE-DATOS.md («Migraciones»)
 *
 * Cada módulo define sus tablas en su `tablas.ts`; las migraciones quedan en `apps/api/migraciones/`.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: ["./src/nucleo/base/tablas.ts", "./src/modulos/*/tablas.ts"],
	out: "./migraciones",
});
