/**
 * Prueba del puente andando contra la API real: sin avisos en vivo igual imprime con la pregunta de cada intervalo, y su
 * impresora no deja de contar como conectada; con avisos, el aviso `impresion` lo hace imprimir en seguida; con versión
 * vieja deja de pedir trabajos y su impresora deja de contar; revocado, se detiene.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «Sin avisos en vivo, el puente igual
 * imprime y su impresora no deja de contar como conectada; con versión vieja, deja de contar») y
 * docs/apps/puente-de-impresion.md («Cómo trabaja», «La llave» y «Cómo se actualiza»)
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { esperarA, procesarComoElWorker } from "../../api/src/nucleo/pruebas/en-vivo.ts";
import { conGoogle, mandarAccion } from "../../api/src/nucleo/pruebas/llamadas.ts";
import { levantarPuenteDePrueba, type PuenteDePrueba, puenteDeAduana } from "./de-prueba.ts";
import { arrancarPuente, type PuenteAndando } from "./senal.ts";

/** Una nota de prueba: lo que imprime la etiqueta de prueba. */
const nota = "01936f2e-0000-7000-8000-0000000000e1";

/**
 * Arranca el puente del arnés.
 * @param prueba El arnés.
 * @param opciones Cada cuánto pregunta y si escucha los avisos en vivo.
 */
function arrancar(prueba: PuenteDePrueba, opciones: { intervaloSegundos: number; avisosEnVivo: boolean }) {
	return arrancarPuente({
		...prueba.piezas,
		api_url: async () => prueba.api,
		fetch: prueba.fetch,
		...opciones,
	});
}

/**
 * Espera a que un trabajo quede impreso.
 * @param prueba El arnés.
 * @param trabajo El trabajo.
 */
async function hastaImpreso(prueba: PuenteDePrueba, trabajo: string): Promise<void> {
	for (let vuelta = 0; vuelta < 100; vuelta++) {
		if ((await prueba.trabajo(trabajo)).estado === "impreso") return;
		await new Promise((listo) => setTimeout(listo, 100));
	}
	throw new Error(`el trabajo ${trabajo} no se imprimió`);
}

/**
 * Si el puente de Aduana dio señales en el último minuto.
 * @param prueba El arnés.
 */
async function contactoReciente(prueba: PuenteDePrueba): Promise<boolean> {
	const { rows } = await prueba.servidor.base.dueno.query(
		"SELECT ultimo_contacto_en > now() - interval '1 minute' AS reciente FROM dispositivos_sync WHERE dispositivo_id = $1",
		[puenteDeAduana()],
	);
	return rows[0]?.reciente === true;
}

describe("sin avisos en vivo el puente igual imprime y su impresora sigue conectada; con versión vieja deja de contar", () => {
	let prueba: PuenteDePrueba;
	let puente: PuenteAndando | undefined;
	beforeAll(async () => {
		prueba = await levantarPuenteDePrueba();
	});
	afterEach(async () => {
		puente?.detener();
		await puente?.terminado;
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	it("sin avisos en vivo igual imprime con la pregunta de cada intervalo, y su impresora no deja de contar como conectada", async () => {
		// Lleva 10 minutos callado: su impresora no cuenta como conectada hasta que pregunte.
		await prueba.servidor.base.dueno.query(
			"UPDATE dispositivos_sync SET ultimo_contacto_en = now() - interval '10 minutes' WHERE dispositivo_id = $1",
			[puenteDeAduana()],
		);
		await expect(prueba.pedirTrabajo([nota], 1)).rejects.toThrow(/impresora_sin_puente/);
		puente = arrancar(prueba, { intervaloSegundos: 1, avisosEnVivo: false });
		// Su pregunta es su señal de vida: el servidor anota su contacto.
		for (let vuelta = 0; vuelta < 100 && !(await contactoReciente(prueba)); vuelta++) {
			await new Promise((listo) => setTimeout(listo, 100));
		}
		const trabajo = await prueba.pedirTrabajo([nota], 2);
		await hastaImpreso(prueba, trabajo);
		expect(await contactoReciente(prueba)).toBe(true);
		expect(prueba.llamadas).not.toContain("GET /v1/eventos");
		expect(puente.estado()).toBe("trabajando");
	});

	it("con versión vieja deja de pedir trabajos, lo anota y su impresora deja de contar como conectada", async () => {
		// La mínima sube: la del paso 2 de cada llamada y la del parámetro, con la que cuenta la impresora conectada.
		prueba.servidor.parametros.versionMinima = "2.0.0";
		await prueba.servidor.base.dueno.query(
			"UPDATE parametros SET valor_texto = '2.0.0' WHERE clave = 'admin.version_minima_puente'",
		);
		try {
			puente = arrancar(prueba, { intervaloSegundos: 1, avisosEnVivo: false });
			expect(await puente.terminado).toBe("actualizar");
			expect(await prueba.registro()).toContain("Hay una versión nueva. Actualiza para seguir.");
			const pedidas = prueba.llamadas.length;
			await new Promise((listo) => setTimeout(listo, 1500));
			expect(prueba.llamadas).toHaveLength(pedidas);
			// Ventas sigue entrando; la impresora no cuenta: su puente tiene una versión menor que la del parámetro.
			prueba.servidor.parametros.versionMinima = "1.0.0";
			await expect(prueba.pedirTrabajo([nota], 1)).rejects.toThrow(/impresora_sin_puente/);
		} finally {
			prueba.servidor.parametros.versionMinima = "1.0.0";
			await prueba.servidor.base.dueno.query(
				"UPDATE parametros SET valor_texto = '1.0.0' WHERE clave = 'admin.version_minima_puente'",
			);
		}
	});
});

describe("con avisos en vivo el puente imprime en cuanto le avisan; revocado, se detiene", () => {
	let prueba: PuenteDePrueba;
	let puente: PuenteAndando | undefined;
	beforeAll(async () => {
		prueba = await levantarPuenteDePrueba({ avisosEnVivo: true });
	});
	afterAll(async () => {
		puente?.detener();
		await prueba.cerrar();
	});

	it("el aviso impresion lo hace imprimir sin esperar la pregunta de cada intervalo; revocado, deja de pedir y lo anota", async () => {
		puente = arrancar(prueba, { intervaloSegundos: 3600, avisosEnVivo: true });
		await esperarA(() => prueba.llamadas.includes("GET /v1/eventos"));
		await esperarA(() => prueba.llamadas.includes("POST /v1/acciones/admin.trabajos_impresion"));
		const trabajo = await prueba.pedirTrabajo([nota], 1);
		await procesarComoElWorker(prueba.servidor);
		await hastaImpreso(prueba, trabajo);
		const version = Number(
			(await prueba.servidor.base.dueno.query("SELECT version FROM dispositivos WHERE id = $1", [puenteDeAduana()]))
				.rows[0]?.version,
		);
		const revocado = await mandarAccion(
			prueba.servidor,
			"admin.revocar_dispositivo",
			{ datos: { dispositivo_id: puenteDeAduana(), motivo: "Se cambió la computadora" }, version },
			"duena",
			conGoogle(),
		);
		expect(revocado.estado).toBe(200);
		await procesarComoElWorker(prueba.servidor);
		expect(await puente.terminado).toBe("revocado");
		expect(await prueba.registro()).toContain("Este aparato fue revocado: ya no entra.");
	});
});
