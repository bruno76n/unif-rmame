/**
 * Prueba de `inventario.resolver_excepcion`: una excepción no deshace lo aplicado; resolver pide qué se hizo y no
 * se resuelve dos veces; Producción solo resuelve las del taller y Contaduría las de su bandeja.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	llamarInterna,
	meterPiezas,
	ubicacionesPorCodigo,
	variantesLibres,
} from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Una excepción no deshace lo aplicado; resolver pide qué se hizo y no se resuelve dos veces; Producción solo resuelve las del taller y Contaduría las de su bandeja", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Abre una excepción y regresa su id y su versión. */
	async function abrir(tipo: string, extra: Record<string, unknown> = {}) {
		const { excepcion_id } = (await llamarInterna(servidor, "inventario.registrar_excepcion", {
			tipo,
			descripcion: `Prueba de ${tipo}`,
			...extra,
		})) as { excepcion_id: string };
		return excepcion_id;
	}

	/** Resuelve una excepción como `quien`, con la versión que tiene. */
	async function resolver(excepcionId: string, resolucion: string, quien: string) {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS version FROM excepciones WHERE id = $1", [
			excepcionId,
		]);
		return mandarAccion(
			servidor,
			"inventario.resolver_excepcion",
			{ datos: { excepcion_id: excepcionId, resolucion }, version: rows[0]?.version },
			quien,
		);
	}

	it("abrir y resolver no mueven nada; sin decir qué se hizo, 400; dos veces, ya_resuelta", async () => {
		const ubicacion = await ubicacionesPorCodigo(servidor);
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 4);
		const id = await abrir("sin_confirmar", { ubicacion_id: ubicacion.BOD, variante_id: variante });
		const { rows: abierta } = await servidor.base.dueno.query(
			"SELECT area, estado, detectada_en IS NOT NULL AS detectada FROM excepciones WHERE id = $1",
			[id],
		);
		expect(abierta).toEqual([{ area: "bodega", estado: "por_revisar", detectada: true }]);
		expect((await resolver(id, "Ya", "bodega")).cuerpo).toMatchObject({
			campos: { resolucion: "Escribe qué se hizo" },
		});
		const resuelta = await resolver(id, "Se contó y estaba completo", "bodega");
		expect(resuelta.cuerpo).toMatchObject({ resultado: { mensaje: "Excepción resuelta: queda en Resueltas" } });
		expect((await resolver(id, "Otra vez lo mismo", "duena")).cuerpo).toMatchObject({
			codigo: "ya_resuelta",
			mensaje: "Ya la resolvió Prueba bodega",
		});
		// Lo aplicado sigue como estaba.
		const { rows } = await servidor.base.dueno.query(
			"SELECT piezas FROM existencias WHERE ubicacion_id = $1 AND variante_id = $2",
			[ubicacion.BOD, variante],
		);
		expect(rows).toEqual([{ piezas: 4 }]);
		const { rows: bitacora } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'inventario.resolver_excepcion' AND entidad_id = $1",
			[id],
		);
		expect(bitacora).toEqual([{ descripcion: "Resolvió la excepción sin_confirmar" }]);
	});

	it("Producción resuelve las del taller y no las demás; Contaduría las de dinero y Bodega no; un tipo desconocido es un error", async () => {
		const delTaller = await abrir("pasa_tope_bulto");
		const deBodega = await abrir("cuadre_proyeccion");
		const deDinero = await abrir("totales_no_cuadran");
		expect((await resolver(deBodega, "Lo resolví yo", "produccion")).estado).toBe(403);
		expect((await resolver(delTaller, "Se canceló el registro repetido", "produccion")).estado).toBe(200);
		const { rows } = await servidor.base.dueno.query("SELECT area FROM excepciones WHERE id = $1", [deDinero]);
		expect(rows).toEqual([{ area: "contaduria" }]);
		expect((await resolver(deDinero, "Se revisó el corte", "bodega")).estado).toBe(403);
		expect((await resolver(deDinero, "Se revisó el corte", "contaduria")).estado).toBe(200);
		await expect(abrir("no_existe")).rejects.toThrow("tipo_desconocido: no_existe");
	});
});
