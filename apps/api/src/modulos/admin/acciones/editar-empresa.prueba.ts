/**
 * Prueba de `admin.editar_empresa`.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 2)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("la empresa nunca tiene dos renglones", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Los datos de una empresa válida. */
	const datos = {
		razon_social: "Uniformes Alameda SA de CV",
		nombre_comercial: "Uniformes Alameda",
		rfc: "ual 010101 9x2",
		domicilio: "Av. Alameda 200, Centro, Ciudad de México",
	};

	/** La versión de la empresa. */
	async function version(): Promise<number> {
		const { rows } = await servidor.base.dueno.query("SELECT version FROM empresa");
		return Number(rows[0]?.version);
	}

	it("la dueña la cambia con su versión; el RFC se guarda en mayúsculas y sin espacios", async () => {
		const respuesta = await mandarAccion(
			servidor,
			"admin.editar_empresa",
			{ datos, version: await version() },
			"duena",
		);
		expect(respuesta.estado).toBe(200);
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: "Datos de la empresa guardados" });
		const { rows } = await servidor.base.dueno.query("SELECT rfc, domicilio FROM empresa");
		expect(rows).toEqual([{ rfc: "UAL0101019X2", domicilio: datos.domicilio }]);
	});

	it("un RFC que no lleva 12 caracteres responde 400 con su mensaje; con versión vieja, 409", async () => {
		const corto = await mandarAccion(
			servidor,
			"admin.editar_empresa",
			{ datos: { ...datos, rfc: "UAL01" }, version: await version() },
			"duena",
		);
		expect(corto.cuerpo).toMatchObject({
			error: "validacion",
			campos: { rfc: "El RFC de una empresa lleva 12 caracteres." },
		});
		const vieja = await mandarAccion(servidor, "admin.editar_empresa", { datos, version: 1 }, "duena");
		expect(vieja.estado).toBe(409);
	});

	it("un segundo renglón no entra, ni siquiera con el rol dueño", async () => {
		await expect(
			servidor.base.dueno.query(
				"INSERT INTO empresa (id, razon_social, nombre_comercial, rfc, domicilio) VALUES ('01936f2e-0000-7000-8000-0000000000c1', 'Otra', 'Otra', 'XXX010101XX1', 'Otro domicilio largo')",
			),
		).rejects.toMatchObject({ code: "23505" });
		await expect(
			servidor.base.dueno.query(
				"INSERT INTO empresa (id, unica, razon_social, nombre_comercial, rfc, domicilio) VALUES ('01936f2e-0000-7000-8000-0000000000c2', false, 'Otra', 'Otra', 'XXX010101XX1', 'Otro domicilio largo')",
			),
		).rejects.toMatchObject({ code: "23514" });
	});
});
