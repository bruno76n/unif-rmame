/**
 * Prueba de llamar con la llave que vale mientras el aparato la cambia: si guardó una nueva sin saber si el cambio se
 * aplicó, prueba la nueva; si la API no la conoce, usa la vieja y olvida la nueva; si entra, la nueva queda.
 * Fase 20 · docs/modulos/admin/dispositivos.md («`admin.rotar_llave`»: «prueba primero la llave nueva y luego la vieja»)
 */

import { describe, expect, it } from "vitest";
import { ErrorDeLaApi } from "./cliente.ts";
import { conLaLlaveQueVale } from "./llave.ts";

/** El error de una llave que la API no conoce. */
const desconocida = new ErrorDeLaApi(401, {
	ok: false,
	error: "sin_sesion",
	codigo: "llave_invalida",
	mensaje: "Tu sesión se cerró. Vuelve a entrar.",
});

describe("la llave que vale mientras cambia", () => {
	it("si el cambio se aplicó, la nueva entra y queda como la que vale", async () => {
		const guardadas: string[] = [];
		const usadas: string[] = [];
		const hecho = await conLaLlaveQueVale(
			{ secreto: "vieja", secretoNuevo: "nueva" },
			async (secreto) => {
				usadas.push(secreto);
				return "ok";
			},
			async (secreto) => {
				guardadas.push(secreto);
			},
		);
		expect(hecho).toBe("ok");
		expect(usadas).toEqual(["nueva"]);
		expect(guardadas).toEqual(["nueva"]);
	});

	it("si no se aplicó, la API no conoce la nueva: usa la vieja y olvida la nueva", async () => {
		const guardadas: string[] = [];
		const usadas: string[] = [];
		const hecho = await conLaLlaveQueVale(
			{ secreto: "vieja", secretoNuevo: "nueva" },
			async (secreto) => {
				usadas.push(secreto);
				if (secreto === "nueva") throw desconocida;
				return "ok";
			},
			async (secreto) => {
				guardadas.push(secreto);
			},
		);
		expect(hecho).toBe("ok");
		expect(usadas).toEqual(["nueva", "vieja"]);
		expect(guardadas).toEqual(["vieja"]);
	});

	it("sin una nueva, usa la que vale; otro error de la nueva no la olvida", async () => {
		const usadas: string[] = [];
		await conLaLlaveQueVale(
			{ secreto: "vieja" },
			async (secreto) => usadas.push(secreto),
			async () => undefined,
		);
		expect(usadas).toEqual(["vieja"]);
		const guardadas: string[] = [];
		await expect(
			conLaLlaveQueVale(
				{ secreto: "vieja", secretoNuevo: "nueva" },
				async () => {
					throw new Error("sin red");
				},
				async (secreto) => {
					guardadas.push(secreto);
				},
			),
		).rejects.toThrow("sin red");
		expect(guardadas).toEqual([]);
	});
});
