/**
 * Prueba de `calidad.registrar_reclamo`, `calidad.resolver_reclamo` y `catalogo.variante_por_codigo`: un reclamo llega
 * del código al lote revisado, con una operación del flujo ligada al defecto y la persona congelada; su rastreo dice el
 * lote, quién lo revisó, la operación, la persona y los rollos del corte; se marca resuelto una vez.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defectoDePrueba, loteTerminado } from "../../../nucleo/pruebas/calidad-de-prueba.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import type { LoteCortado } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un reclamo llega del código al lote revisado, con una operación del flujo ligada al defecto y la persona congelada", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Un lote terminado y revisado por Calidad, con su defecto y el código de su talla 4. */
	async function loteRevisado() {
		const lote = await loteTerminado(servidor, siembra);
		const defectoId = await defectoDePrueba(servidor, lote);
		const [{ v } = { v: 0 }] = await consultar("SELECT version::int AS v FROM lotes WHERE id = $1", [lote.loteId]);
		const revisado = await mandarAccion(
			servidor,
			"calidad.revisar_lote",
			{ datos: { lote_id: lote.loteId }, version: v },
			"calidad",
		);
		expect(revisado.estado).toBe(200);
		const codigos = await consultar("SELECT id, codigo FROM variantes WHERE id = ANY($1::uuid[])", [
			[lote.prenda.variantes["4"], lote.prenda.variantes["8"]],
		]);
		const codigoDe = (talla: string) =>
			String(codigos.find((fila) => fila.id === lote.prenda.variantes[talla])?.codigo);
		return { lote, defectoId, codigo4: codigoDe("4"), codigo8: codigoDe("8") };
	}

	/** Lo de un reclamo de un cliente externo, con lo que se cambie. */
	function reclamo(lote: LoteCortado, defectoId: string, codigo: string, cambios: Record<string, unknown> = {}) {
		return {
			origen: "cliente_externo",
			cliente_id: uuidv7(),
			codigo,
			lote_id: lote.loteId,
			defecto_id: defectoId,
			flujo_operacion_id: lote.prenda.flujo.operaciones[1]?.flujoOperacionId,
			piezas: 4,
			que_dice_cliente: "La costura del costado se abrió a la semana",
			...cambios,
		};
	}

	/** Calidad registra un reclamo. */
	function registrar(datos: Record<string, unknown>) {
		return mandarAccion(servidor, "calidad.registrar_reclamo", { datos }, "calidad");
	}

	it("del código al lote revisado: la persona se congela y el rastreo dice el lote, la operación, la persona y los rollos", async () => {
		const { lote, defectoId, codigo4 } = await loteRevisado();
		const respuesta = await registrar(reclamo(lote, defectoId, codigo4));
		expect(respuesta.estado).toBe(200);
		const resultado = z
			.object({
				reclamo_id: z.uuid(),
				folio: z.string(),
				mensaje: z.string(),
				rastreo: z.record(z.string(), z.unknown()),
			})
			.parse(respuesta.cuerpo.resultado);
		expect(resultado.folio).toMatch(/^RC-\d{3}$/);
		expect(resultado.mensaje).toBe(`${resultado.folio} registrado. Del código se llega al lote ${lote.folio}`);
		expect(resultado.rastreo).toMatchObject({
			lote: lote.folio,
			revisado_por: expect.any(String),
			operacion: lote.prenda.flujo.operaciones[1]?.nombre,
			persona: expect.any(String),
			rollos: [{ rollo: expect.any(String), tela: expect.any(String) }],
			lotes_de_la_prenda: 1,
		});
		// La persona que hizo esa operación en esa talla queda congelada.
		expect(
			await consultar("SELECT persona_id, variante_id, estado FROM reclamos WHERE id = $1", [resultado.reclamo_id]),
		).toEqual([{ persona_id: lote.personaId, variante_id: lote.prenda.variantes["4"], estado: "por_resolver" }]);
		// Se marca resuelto una vez.
		const resolver = async () =>
			mandarAccion(
				servidor,
				"calidad.resolver_reclamo",
				{
					datos: { reclamo_id: resultado.reclamo_id, resolucion: "Se repusieron las 4 piezas" },
					version: Number(
						(await consultar("SELECT version::int AS v FROM reclamos WHERE id = $1", [resultado.reclamo_id]))[0]?.v,
					),
				},
				"calidad",
			);
		expect((await resolver()).cuerpo.resultado).toEqual({ mensaje: `${resultado.folio} queda resuelto` });
		expect(await consultar("SELECT estado, resolucion FROM reclamos WHERE id = $1", [resultado.reclamo_id])).toEqual([
			{ estado: "resuelto", resolucion: "Se repusieron las 4 piezas" },
		]);
		expect((await resolver()).cuerpo).toMatchObject({ codigo: "reclamo_ya_resuelto" });
	});

	it("lo que no deja registrar: un código desconocido, una prenda sin lotes revisados, otro lote, una operación no ligada", async () => {
		const { lote, defectoId, codigo4, codigo8 } = await loteRevisado();
		expect((await registrar(reclamo(lote, defectoId, "499998"))).cuerpo).toMatchObject({
			codigo: "codigo_desconocido",
		});
		// La talla 8 no se cortó: el lote no la tiene revisada.
		expect((await registrar(reclamo(lote, defectoId, codigo8))).cuerpo).toMatchObject({
			codigo: "sin_lotes_revisados",
		});
		expect((await registrar(reclamo(lote, defectoId, codigo4, { lote_id: uuidv7() }))).cuerpo).toMatchObject({
			codigo: "lote_no_corresponde",
		});
		// El corte no suele causar ese defecto.
		expect(
			(
				await registrar(
					reclamo(lote, defectoId, codigo4, { flujo_operacion_id: lote.prenda.flujo.operaciones[0]?.flujoOperacionId }),
				)
			).cuerpo,
		).toMatchObject({
			codigo: "operacion_no_ligada",
			mensaje: expect.stringMatching(/^Esa operación no suele causar ese defecto en /),
		});
		expect((await registrar(reclamo(lote, defectoId, codigo4, { que_dice_cliente: "Rota" }))).estado).toBe(400);
		const sinCliente = await registrar(reclamo(lote, defectoId, codigo4, { cliente_id: undefined }));
		expect(sinCliente.cuerpo).toMatchObject({
			campos: { cliente_id: "Escoge el cliente." },
		});
		expect((await registrar(reclamo(lote, defectoId, codigo4, { codigo: "12345" }))).estado).toBe(400);
		expect((await registrar(reclamo(lote, defectoId, codigo4, { persona_id: uuidv7() }))).cuerpo).toMatchObject({
			campos: { persona_id: "Escoge quién lo hizo." },
		});
	});

	it("un reclamo de una tienda dice qué tienda; una ubicación que no es tienda no", async () => {
		const { lote, defectoId, codigo4 } = await loteRevisado();
		const deTienda = { origen: "tienda", cliente_id: undefined };
		expect(
			(await registrar(reclamo(lote, defectoId, codigo4, { ...deTienda, ubicacion_id: ubicacion.BOD }))).cuerpo,
		).toMatchObject({ codigo: "tienda_no_valida" });
		const bien = await registrar(reclamo(lote, defectoId, codigo4, { ...deTienda, ubicacion_id: ubicacion.T1 }));
		expect(bien.estado).toBe(200);
		expect(
			await consultar("SELECT origen, ubicacion_id, cliente_id FROM reclamos WHERE lote_id = $1", [lote.loteId]),
		).toEqual([{ origen: "tienda", ubicacion_id: ubicacion.T1, cliente_id: null }]);
	});
});
