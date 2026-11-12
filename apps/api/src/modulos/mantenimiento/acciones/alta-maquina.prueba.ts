/**
 * Prueba de `mantenimiento.alta_maquina`: una máquina nace con el folio de su tipo, y un tipo nuevo toma un prefijo que
 * no choca; el nombre y la serie no se repiten; la trae una persona activa del Taller.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { areaDePrueba, maquinaDePrueba } from "../../../nucleo/pruebas/mantenimiento-de-prueba.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { prefijosDe } from "../dominio/maquinas.ts";

describe("Una máquina nace con el folio de su tipo, y un tipo nuevo toma un prefijo que no choca", () => {
	let servidor: ServidorDePrueba;
	let persona: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		persona = await nuevaPersona(servidor.base.dueno, "taller");
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Mantenimiento da de alta una máquina con lo que se diga. */
	async function alta(datos: Record<string, unknown>) {
		return mandarAccion(
			servidor,
			"mantenimiento.alta_maquina",
			{
				datos: {
					nombre: `Máquina ${uuidv7().slice(-8)}`,
					area_id: await areaDePrueba(servidor),
					persona_id: persona,
					...datos,
				},
			},
			"mantenimiento",
		);
	}

	it("los prefijos posibles: las iniciales y, si chocan, la siguiente letra del nombre", () => {
		expect(prefijosDe("Overlock").slice(0, 3)).toEqual(["O", "OV", "OVE"]);
		expect(prefijosDe("Collareta doble").slice(0, 3)).toEqual(["CD", "CDO", "CDOL"]);
		expect(prefijosDe("Ojaladora")[0]).toBe("O");
	});

	it("el folio sigue al de su tipo; un tipo nuevo que choca toma otra letra; uno que ya existe se usa", async () => {
		const primera = await maquinaDePrueba(servidor, persona, { tipo_nuevo: "Recta" });
		const segunda = await maquinaDePrueba(servidor, persona, { tipo_nuevo: "recta" });
		expect(primera.folio).toMatch(/^R-\d+$/);
		expect(Number(segunda.folio.slice(2))).toBe(Number(primera.folio.slice(2)) + 1);
		// Dos tipos nuevos que la muestra no trae y que chocan: el segundo toma la siguiente letra de su nombre.
		const fusionadora = await maquinaDePrueba(servidor, persona, { tipo_nuevo: "Fusionadora" });
		const festoneadora = await maquinaDePrueba(servidor, persona, { tipo_nuevo: "Festoneadora" });
		expect(fusionadora.folio).toMatch(/^F-\d+$/);
		expect(festoneadora.folio).toMatch(/^FE-\d+$/);
		const { rows } = await servidor.base.dueno.query(
			"SELECT nombre, prefijo FROM tipos_maquina WHERE nombre IN ('Fusionadora', 'Festoneadora', 'Recta') ORDER BY prefijo",
		);
		expect(rows).toEqual([
			{ nombre: "Fusionadora", prefijo: "F" },
			{ nombre: "Festoneadora", prefijo: "FE" },
			{ nombre: "Recta", prefijo: "R" },
		]);
	});

	it("el nombre y la serie no se repiten; la trae una persona activa del Taller; sin tipo no entra", async () => {
		const serie = `S-${uuidv7().slice(-8)}`;
		const bien = await alta({ tipo_nuevo: "Recta", nombre: "La de Juana", serie });
		expect(bien.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^La de Juana \(R-\d+\) dada de alta en Costura$/),
		});
		expect((await alta({ tipo_nuevo: "Recta", nombre: "la de juana" })).cuerpo).toMatchObject({
			codigo: "maquina_repetida",
		});
		expect((await alta({ tipo_nuevo: "Recta", serie })).cuerpo).toMatchObject({ codigo: "serie_repetida" });
		const deOficina = await nuevaPersona(servidor.base.dueno, "oficina");
		expect((await alta({ tipo_nuevo: "Recta", persona_id: deOficina })).cuerpo).toMatchObject({
			codigo: "persona_no_valida",
		});
		expect((await alta({})).estado).toBe(400);
		expect((await alta({ tipo_nuevo: "Recta", area_id: uuidv7() })).estado).toBe(400);
	});

	it("dos altas a la vez con tipos nuevos que chocan toman prefijos distintos; con el mismo nombre, entra una", async () => {
		const [zurcidora, zigzag] = await Promise.all([
			alta({ tipo_nuevo: "Zurcidora" }),
			alta({ tipo_nuevo: "Zigzagueadora" }),
		]);
		expect([zurcidora.estado, zigzag.estado]).toEqual([200, 200]);
		// El que toma el candado primero se queda con «Z»; el otro, con la siguiente letra de su nombre.
		const { rows } = await servidor.base.dueno.query(
			"SELECT nombre, prefijo FROM tipos_maquina WHERE nombre IN ('Zurcidora', 'Zigzagueadora')",
		);
		const conZ = rows.find((fila) => fila.prefijo === "Z");
		const otro = rows.find((fila) => fila.prefijo !== "Z");
		expect(conZ).toBeDefined();
		expect(otro?.prefijo).toBe(prefijosDe(String(otro?.nombre))[1]);
		const nombre = `La gemela ${uuidv7().slice(-6)}`;
		const gemelas = await Promise.all([alta({ tipo_nuevo: "Recta", nombre }), alta({ tipo_nuevo: "Recta", nombre })]);
		expect(gemelas.map((respuesta) => respuesta.estado).sort()).toEqual([200, 422]);
	});
});
