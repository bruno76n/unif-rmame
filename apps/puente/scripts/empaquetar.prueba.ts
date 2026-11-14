/**
 * Prueba de `pnpm puente:empaquetar`: arma un solo ejecutable para este sistema que corre sin Node ni el repositorio,
 * dice su versión y, sin registrarse, pide registrarse.
 * Fase 20 · docs/apps/puente-de-impresion.md («La instalación», paso 1)
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { versionDelPuente } from "../src/version.ts";

/** La carpeta del puente. */
const puente = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("pnpm puente:empaquetar", () => {
	it("arma un solo ejecutable que corre por su cuenta: dice su versión y, sin registrarse, pide registrarse", async () => {
		const correr = promisify(execFile);
		await correr(process.execPath, [join(puente, "scripts", "empaquetar.ts")], { cwd: puente });
		const ejecutable = join(puente, "dist", "uniformame-puente");
		const datos = await mkdtemp(join(tmpdir(), "empaquetado-"));
		try {
			// Corre desde otra carpeta, sin el repositorio a la mano.
			const { stdout } = await correr(ejecutable, ["version"], { cwd: datos });
			expect(stdout.trim()).toBe(versionDelPuente);
			const sinRegistro = await correr(ejecutable, [], {
				cwd: datos,
				env: { UNIFORMAME_PUENTE_DATOS: datos },
			}).catch((error: { code: number; stderr: string }) => error);
			expect(sinRegistro).toMatchObject({
				code: 1,
				stderr: expect.stringContaining("Primero registra el puente: uniformame-puente registrar"),
			});
		} finally {
			await rm(datos, { recursive: true, force: true });
		}
	});
});
