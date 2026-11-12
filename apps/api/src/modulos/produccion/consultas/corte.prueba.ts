/**
 * Prueba de `produccion.corte` con los datos de la muestra: los lotes por cortar por fecha de corte con la etiqueta de
 * su tela y de su receta, y la captura del L-2026-019 (Pantalón azul marino, 190 piezas) con su receta, los rollos que
 * sugirió Bodega primero y quién corta. Con lo que manda, las cuentas del paquete compartido dan lo mismo que guarda
 * `produccion.cerrar_corte` al cerrar. Solo Producción, sin dinero.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver» y «Lo que la pantalla calcula mientras se escribe sale del paquete
 * compartido y da lo mismo que la acción al guardar»)
 */

import { rollosAutomaticos } from "@uniformame/compartido/calculos/corte";
import { aMilesimos, deMilesimos, pideLaReceta } from "@uniformame/compartido/calculos/cuenta-material";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** La captura, lo que se usa. */
interface Captura {
	lote_id: string;
	version: number;
	folio: string;
	receta_version_id: string;
	desperdicio_pct: string;
	tallas: { variante_id: string; talla_id: string; planeadas: number }[];
	telas: {
		material_id: string;
		papel: string;
		receta: {
			cantidad: string | null;
			por_talla: { talla_id: string; cantidad: string }[];
			receta_por_unidad_inventario: string;
		};
		rollos: { rollo_id: string; folio: string; metros: string; sugerido: boolean }[];
	}[];
	personas: { persona_id: string; nombre: string }[];
}

describe("produccion.corte: los lotes por cortar y la captura del corte", () => {
	let servidor: ServidorDePrueba;
	let pantalon: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const { rows } = await servidor.base.dueno.query("SELECT id FROM lotes WHERE folio = 'L-2026-019'");
		pantalon = String(rows[0]?.id);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("los lotes por cortar salen por fecha de corte, con su receta; sin lote, la captura es la del primero", async () => {
		const respuesta = await pedirConsulta(servidor, "produccion.corte", {}, "produccion");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|costo/);
		const { lotes, captura } = respuesta.cuerpo.resultado as {
			lotes: { lote_id: string; folio: string; receta: string; tela: { texto: string } | null }[];
			captura: Captura;
		};
		expect(lotes).toHaveLength(19);
		expect(captura.lote_id).toBe(lotes[0]?.lote_id);
		expect(lotes.find((lote) => lote.folio === "L-2026-019")?.tela).toMatchObject({ texto: "Tela por entregar" });
	});

	it("la captura del L-2026-019: su receta, los rollos que sugirió Bodega primero y quien corta de base primero", async () => {
		const respuesta = await pedirConsulta(servidor, "produccion.corte", { lote_id: pantalon }, "produccion");
		const { captura } = respuesta.cuerpo.resultado as { captura: Captura };
		expect(captura.folio).toBe("L-2026-019");
		expect(captura.tallas.reduce((suma, talla) => suma + talla.planeadas, 0)).toBe(190);
		const [gabardina] = captura.telas;
		expect(gabardina?.papel).toBe("tela_principal");
		expect(gabardina?.rollos.slice(0, 3).every((rollo) => rollo.sugerido)).toBe(true);
		expect(gabardina?.rollos.map((rollo) => rollo.folio)).toEqual(
			expect.arrayContaining(["R-0001", "R-0002", "R-0005"]),
		);
		expect(captura.personas[0]?.nombre).toBe("Beto Aguilar");
	});

	it("con lo que manda, la cuenta del paquete compartido da lo mismo que guarda la acción al cerrar", async () => {
		const respuesta = await pedirConsulta(servidor, "produccion.corte", { lote_id: pantalon }, "produccion");
		const { captura } = respuesta.cuerpo.resultado as { captura: Captura };
		// Las piezas: las planeadas menos 3 de la primera talla, como si se hubieran escrito.
		const piezas = captura.tallas.map((talla, i) => ({ ...talla, piezas: talla.planeadas - (i === 0 ? 3 : 0) }));
		const lineas = captura.telas.map((tela) => ({
			materialId: tela.material_id,
			esTelaPrincipal: tela.papel === "tela_principal",
			cantidad: tela.receta.cantidad,
			porTalla: Object.fromEntries(tela.receta.por_talla.map((talla) => [talla.talla_id, talla.cantidad])),
			recetaPorUnidadInventario: tela.receta.receta_por_unidad_inventario,
			seCuentaEntera: false,
		}));
		const pide = pideLaReceta(
			lineas,
			Object.fromEntries(piezas.map((talla) => [talla.talla_id, talla.piezas])),
			captura.desperdicio_pct,
		);
		const telas = captura.telas.map((tela) => ({
			material_id: tela.material_id,
			rollos: rollosAutomaticos(
				tela.rollos.map((rollo) => ({ rolloId: rollo.rollo_id, milesimos: aMilesimos(rollo.metros) })),
				pide[tela.material_id] ?? 0n,
			).map((rollo) => ({ rollo_id: rollo.rolloId })),
		}));
		const cerrado = await mandarAccion(
			servidor,
			"produccion.cerrar_corte",
			{
				datos: {
					lote_id: captura.lote_id,
					receta_version_id: captura.receta_version_id,
					telas,
					tallas: piezas.map((talla) => ({ variante_id: talla.variante_id, piezas: talla.piezas })),
					corto_persona_id: captura.personas[0]?.persona_id,
				},
				version: captura.version,
			},
			"produccion",
		);
		expect(cerrado.estado, JSON.stringify(cerrado.cuerpo)).toBe(200);
		const { rows } = await servidor.base.dueno.query(
			"SELECT ct.material_id, ct.metros_receta::text AS metros FROM corte_telas ct JOIN cortes c ON c.id = ct.corte_id WHERE c.lote_id = $1",
			[captura.lote_id],
		);
		for (const fila of rows) {
			expect(fila.metros).toBe(deMilesimos(pide[String(fila.material_id)] ?? 0n));
		}
		expect(rows).toHaveLength(captura.telas.length);
	});

	it("solo Producción la pide; un lote que no está por cortar, 404", async () => {
		expect((await pedirConsulta(servidor, "produccion.corte", {}, "bodega")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "produccion.corte", { lote_id: pantalon }, "produccion")).estado).toBe(404);
	});
});
