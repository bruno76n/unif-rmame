/**
 * Prueba de lo que deja instalado `uniformame-puente instalar`: el servicio de systemd que corre como el usuario que lo
 * instala y se reinicia si se cae, y la tarea de Windows que lo arranca al iniciar la sesión de ese usuario.
 * Fase 20 · docs/apps/puente-de-impresion.md («La instalación», paso 6)
 */

import { describe, expect, it } from "vitest";
import { argumentosDeSchtasks, unidadDeSystemd } from "./instalar.ts";

describe("dejarlo arrancando solo", () => {
	it("en Linux, un servicio de systemd con su usuario, después de la red, que se reinicia si se cae", () => {
		const unidad = unidadDeSystemd("/opt/uniformame/uniformame-puente", "aduana");
		expect(unidad).toContain('ExecStart="/opt/uniformame/uniformame-puente"');
		expect(unidad).toContain("User=aduana");
		expect(unidad).toContain("After=network-online.target");
		expect(unidad).toContain("Restart=on-failure");
		expect(unidad).toContain("WantedBy=multi-user.target");
	});

	it("en Windows, una tarea que lo arranca al iniciar la sesión del usuario", () => {
		expect(argumentosDeSchtasks("C:\\Uniformame\\uniformame-puente.exe", "Aduana")).toEqual([
			"/Create",
			"/F",
			"/TN",
			"uniformame-puente",
			"/TR",
			'"C:\\Uniformame\\uniformame-puente.exe"',
			"/SC",
			"ONLOGON",
			"/RU",
			"Aduana",
			"/IT",
		]);
	});
});
