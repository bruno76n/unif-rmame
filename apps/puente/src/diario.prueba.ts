/**
 * Prueba del diario: lo que quedó a medias al apagarse lo termina al arrancar (lo recibido sin imprimir se imprime; lo
 * impreso sin confirmar se confirma sin imprimirlo otra vez), un trabajo recibido dos veces se anota una, y un renglón
 * cortado por un apagón no rompe el diario.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «… y lo que quedó a medias al apagarse lo
 * termina al arrancar») y docs/apps/puente-de-impresion.md (regla 5 y «El diario»)
 */

import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { levantarPuenteDePrueba, type PuenteDePrueba } from "./de-prueba.ts";
import { crearDiario } from "./diario.ts";
import { terminarPendientes } from "./trabajos.ts";

/** Un trabajo como lo recibe el puente. */
function trabajoDePrueba(id = uuidv7()) {
	return { id, tipo: "prueba", ids: [uuidv7()], copias: 1, ruta: `/v1/etiquetas/prueba/${id}?formato=zpl&copias=1` };
}

describe("lo que quedó a medias al apagarse lo termina al arrancar", () => {
	let prueba: PuenteDePrueba;
	beforeAll(async () => {
		prueba = await levantarPuenteDePrueba();
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	it("al arrancar imprime lo recibido sin imprimir y confirma lo impreso sin confirmar, sin imprimirlo otra vez", async () => {
		const recibidoId = await prueba.pedirTrabajo(["01936f2e-0000-7000-8000-0000000000d1"], 2);
		const impresoId = await prueba.pedirTrabajo(["01936f2e-0000-7000-8000-0000000000d2"], 1);
		const zpl = await prueba.zplDe(recibidoId);
		// El puente los recibió y se apagó: el primero sin imprimir, el segundo impreso pero sin confirmar.
		const { trabajos } = await prueba.piezas.api.trabajos(uuidv7());
		for (const trabajo of trabajos) await prueba.piezas.diario.recibido(trabajo);
		await prueba.piezas.diario.impreso(impresoId, { resultado: "impreso", clave: uuidv7() });
		const antes = prueba.zebra.recibido.length;
		// Arranca otra vez con el mismo diario.
		const diario = crearDiario(join(prueba.carpeta, "diario.jsonl"));
		await terminarPendientes({ ...prueba.piezas, diario });
		expect(prueba.zebra.recibido.slice(antes)).toEqual([zpl]);
		expect(await prueba.trabajo(recibidoId)).toEqual({ estado: "impreso", error: null });
		expect(await prueba.trabajo(impresoId)).toEqual({ estado: "impreso", error: null });
		expect(await diario.pendientes()).toEqual([]);
	});

	it("un trabajo recibido dos veces se anota una; un renglón cortado no rompe el diario; confirmado, sale de él", async () => {
		const carpeta = await mkdtemp(join(tmpdir(), "diario-"));
		try {
			const archivo = join(carpeta, "diario.jsonl");
			const diario = crearDiario(archivo);
			const [uno, dos] = [trabajoDePrueba(), trabajoDePrueba()];
			await diario.recibido(uno);
			await diario.recibido(uno);
			await diario.recibido(dos);
			await diario.impreso(uno.id, { resultado: "fallo", error: "Sin etiquetas en la impresora", clave: uuidv7() });
			await appendFile(archivo, '{"paso":"recibido","en":"2026-11-14T10:4');
			expect(await diario.pendientes()).toEqual([
				expect.objectContaining({ trabajo: uno, estado: "por_confirmar", error: "Sin etiquetas en la impresora" }),
				{ trabajo: dos, estado: "por_imprimir" },
			]);
			await diario.confirmado(uno.id);
			expect(await diario.pendientes()).toEqual([{ trabajo: dos, estado: "por_imprimir" }]);
			expect(await readFile(archivo, "utf8")).not.toContain(uno.id);
		} finally {
			await rm(carpeta, { recursive: true, force: true });
		}
	});
});
