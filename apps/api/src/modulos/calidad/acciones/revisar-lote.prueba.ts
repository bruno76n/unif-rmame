/**
 * Prueba de `calidad.revisar_lote`, `calidad.agregar_defecto` y `calidad.aprobar_reproceso`: revisar un lote terminado
 * congela sus aprobadas por talla, crea un reproceso por rechazo y deja el lote revisado; no se rechazan más piezas que
 * las listas; un registro de la tablet a media revisión da `409`; quien cosió puede revisar y queda marcado; un
 * reproceso se aprueba completo y solo con su lote en aduana.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	defectoDePrueba,
	registrarEnBulto,
	loteTerminado as terminado,
} from "../../../nucleo/pruebas/calidad-de-prueba.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { cuentaDePrueba, personaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { type LoteCortado, loteCortado } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Revisar un lote terminado congela sus aprobadas por talla, crea un reproceso por rechazo y deja el lote revisado", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** La tablet registra en un bulto, con la persona que se diga (por omisión, la del lote). */
	function registrar(lote: LoteCortado, bulto: number, operacion: number, buenas: number, personaId = lote.personaId) {
		return registrarEnBulto(servidor, lote, bulto, operacion, buenas, personaId);
	}

	/** Un lote con 3 piezas de la talla 4 y 2 de la 6, terminado. */
	async function loteTerminado(): Promise<LoteCortado> {
		const lote = await terminado(servidor, siembra);
		expect(await consultar("SELECT estado FROM lotes WHERE id = $1", [lote.loteId])).toEqual([{ estado: "terminado" }]);
		return lote;
	}

	/** Calidad agrega un defecto que suele causar la primera operación después del corte. */
	function defecto(lote: LoteCortado, nombre?: string): Promise<string> {
		return defectoDePrueba(servidor, lote, nombre);
	}

	/** La versión de un lote. */
	async function versionDelLote(loteId: string): Promise<number> {
		return Number((await consultar("SELECT version::int AS v FROM lotes WHERE id = $1", [loteId]))[0]?.v);
	}

	/** Calidad revisa un lote, con la versión que leyó (por omisión, la de ahora). */
	async function revisar(lote: LoteCortado, rechazos: unknown[], version?: number) {
		return mandarAccion(
			servidor,
			"calidad.revisar_lote",
			{ datos: { lote_id: lote.loteId, rechazos }, version: version ?? (await versionDelLote(lote.loteId)) },
			"calidad",
		);
	}

	it("congela las aprobadas por talla, crea un reproceso por rechazo con el folio del lote y deja el lote revisado", async () => {
		const lote = await loteTerminado();
		const defectoId = await defecto(lote);
		const talla4 = lote.prenda.variantes["4"];
		const respuesta = await revisar(lote, [
			{
				defecto_id: defectoId,
				flujo_operacion_id: lote.prenda.flujo.operaciones[1]?.flujoOperacionId,
				persona_id: lote.personaId,
				variante_id: talla4,
				piezas: 2,
			},
		]);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: `${lote.folio}: 3 aprobadas pasan a aduana, 2 regresan al taller`,
			piezas_aprobadas: 3,
			reprocesos: [{ folio: `${lote.folio}-R1`, piezas: 2 }],
		});
		expect(respuesta.cuerpo.avisos).toEqual([]);
		expect(await consultar("SELECT estado FROM lotes WHERE id = $1", [lote.loteId])).toEqual([{ estado: "revisado" }]);
		const aprobadas = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura("calidad.aprobadas_del_lote", { lote_id: lote.loteId }),
		);
		expect(aprobadas).toMatchObject({
			tallas: expect.arrayContaining([
				{ variante_id: talla4, piezas_aprobadas: 1 },
				{ variante_id: lote.prenda.variantes["6"], piezas_aprobadas: 2 },
			]),
			reprocesos: [{ folio: `${lote.folio}-R1`, variante_id: talla4, estado: "en_reproceso", piezas: 2 }],
		});
		expect(
			await consultar(
				"SELECT piezas_revisadas, piezas_aprobadas, reviso_quien_coso FROM revisiones WHERE lote_id = $1",
				[lote.loteId],
			),
		).toEqual([{ piezas_revisadas: 5, piezas_aprobadas: 3, reviso_quien_coso: false }]);
		// Ya revisado, no se revisa otra vez.
		expect((await revisar(lote, [])).cuerpo).toMatchObject({ codigo: "lote_no_terminado" });
	});

	it("no se rechazan más piezas que las listas de una talla, ni una operación fuera del flujo, ni un renglón repetido", async () => {
		const lote = await loteTerminado();
		const defectoId = await defecto(lote);
		const rechazo = {
			defecto_id: defectoId,
			flujo_operacion_id: lote.prenda.flujo.operaciones[1]?.flujoOperacionId,
			persona_id: lote.personaId,
			variante_id: lote.prenda.variantes["6"],
			piezas: 3,
		};
		expect((await revisar(lote, [rechazo])).cuerpo).toMatchObject({
			codigo: "rechazos_mas_que_listas",
			mensaje: "En la talla 6 hay 2 piezas listas: no se pueden rechazar más.",
		});
		const otraOperacion = (await loteCortado(servidor, siembra, [1, 0, 0])).prenda.flujo.operaciones[1];
		expect(
			(await revisar(lote, [{ ...rechazo, piezas: 1, flujo_operacion_id: otraOperacion?.flujoOperacionId }])).cuerpo,
		).toMatchObject({ codigo: "operacion_fuera_del_flujo" });
		expect(
			(
				await revisar(lote, [
					{ ...rechazo, piezas: 1 },
					{ ...rechazo, piezas: 1 },
				])
			).cuerpo,
		).toMatchObject({
			codigo: "renglon_repetido",
		});
		expect((await consultar("SELECT estado FROM lotes WHERE id = $1", [lote.loteId]))[0]).toEqual({
			estado: "terminado",
		});
	});

	it("si llega un registro de la tablet mientras se revisa, la revisión recibe 409", async () => {
		const lote = await loteTerminado();
		const leida = await versionDelLote(lote.loteId);
		// La tablet registra de más en la primera operación: sube la versión del lote.
		await registrar(lote, 0, 1, 1);
		const respuesta = await revisar(lote, [], leida);
		expect(respuesta.estado).toBe(409);
		expect(await consultar("SELECT count(*)::int AS n FROM revisiones WHERE lote_id = $1", [lote.loteId])).toEqual([
			{ n: 0 },
		]);
	});

	it("quien cosió puede revisar, y la revisión queda marcada", async () => {
		const lote = await loteCortado(servidor, siembra, [2, 0, 0]);
		// La persona de la cuenta de Calidad cose en el taller.
		const suya = personaDePrueba(cuentaDePrueba("calidad"));
		await consultar("UPDATE personas SET area = 'taller' WHERE id = $1", [suya]);
		await registrar(lote, 0, 1, 2, suya);
		await registrar(lote, 0, 2, 2);
		const respuesta = await revisar(lote, []);
		expect(respuesta.estado).toBe(200);
		expect(respuesta.cuerpo.avisos).toEqual(["Cosiste en este lote: la revisión queda marcada"]);
		expect(await consultar("SELECT reviso_quien_coso FROM revisiones WHERE lote_id = $1", [lote.loteId])).toEqual([
			{ reviso_quien_coso: true },
		]);
		expect(
			await consultar(
				"SELECT descripcion FROM bitacora WHERE entidad = 'revisiones' AND entidad_folio = $1 AND accion = 'calidad.revisar_lote'",
				[lote.folio],
			),
		).toEqual([{ descripcion: `Revisó ${lote.folio}: 2 aprobadas, 0 a reproceso · revisó quien cosió en el lote` }]);
	});

	it("un reproceso solo se aprueba con su lote en aduana, y se aprueba completo; mientras, cuenta para su pedido en producción", async () => {
		const lote = await loteTerminado();
		// El lote es de un pedido (los pedidos llegan en la fase 16).
		const pedidoId = uuidv7();
		await consultar("UPDATE lotes SET destino = 'pedido', pedido_id = $2, ubicacion_destino_id = NULL WHERE id = $1", [
			lote.loteId,
			pedidoId,
		]);
		const enProduccion = async () =>
			z
				.object({ variantes: z.array(z.object({ variante_id: z.uuid(), piezas: z.number() })) })
				.parse(
					await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
						contexto.lectura("produccion.piezas_en_produccion", { pedido_id: pedidoId }),
					),
				)
				.variantes.filter((variante) => variante.piezas !== 0);
		const defectoId = await defecto(lote);
		const revisado = await revisar(lote, [
			{
				defecto_id: defectoId,
				flujo_operacion_id: lote.prenda.flujo.operaciones[2]?.flujoOperacionId,
				persona_id: lote.personaId,
				variante_id: lote.prenda.variantes["4"],
				piezas: 1,
			},
		]);
		const [reproceso] = z
			.object({ reprocesos: z.array(z.object({ reproceso_id: z.uuid() })) })
			.parse(revisado.cuerpo.resultado).reprocesos;
		const aprobar = async () =>
			mandarAccion(
				servidor,
				"calidad.aprobar_reproceso",
				{
					datos: { reproceso_id: reproceso?.reproceso_id },
					version: Number(
						(await consultar("SELECT version::int AS v FROM reprocesos WHERE id = $1", [reproceso?.reproceso_id]))[0]
							?.v,
					),
				},
				"calidad",
			);
		// Revisado y todavía en el Taller: el reproceso sigue contado en su lote.
		const talla4 = lote.prenda.variantes["4"] ?? "";
		const talla6 = lote.prenda.variantes["6"] ?? "";
		expect(await enProduccion()).toEqual(
			expect.arrayContaining([
				{ variante_id: talla4, piezas: 3 },
				{ variante_id: talla6, piezas: 2 },
			]),
		);
		expect((await aprobar()).cuerpo).toMatchObject({
			codigo: "lote_no_recibido",
			mensaje: `Aduana todavía no recibe ${lote.folio}: el reproceso se aprueba después.`,
		});
		// La prueba pone el lote en aduana (Aduana lo recibe en la fase 14).
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("produccion.marcar_lote_en_aduana", { lote_id: lote.loteId }),
		);
		// En aduana: el lote ya no cuenta, su reproceso sí.
		expect(await enProduccion()).toEqual([{ variante_id: talla4, piezas: 1 }]);
		expect((await aprobar()).cuerpo.resultado).toMatchObject({
			mensaje: `1 pieza de ${lote.folio} aprobadas: pasan a aduana`,
			piezas: 1,
		});
		expect(
			await consultar("SELECT estado, piezas_aprobadas, piezas_merma FROM reprocesos WHERE id = $1", [
				reproceso?.reproceso_id,
			]),
		).toEqual([{ estado: "listo", piezas_aprobadas: 1, piezas_merma: 0 }]);
		expect(await enProduccion()).toEqual([]);
		expect((await aprobar()).cuerpo).toMatchObject({ codigo: "reproceso_ya_listo" });
	});

	it("el catálogo de defectos: un nombre único sin importar mayúsculas, con al menos una operación vigente", async () => {
		const lote = await loteCortado(servidor, siembra, [1, 0, 0]);
		const nombre = `Hilo suelto ${uuidv7().slice(-6)}`;
		await defecto(lote, nombre);
		const otra = await mandarAccion(
			servidor,
			"calidad.agregar_defecto",
			{ datos: { nombre: nombre.toUpperCase(), operacion_ids: [lote.prenda.flujo.operaciones[1]?.operacionId] } },
			"calidad",
		);
		expect(otra.cuerpo).toMatchObject({ codigo: "defecto_repetido" });
		const sinOperacion = await mandarAccion(
			servidor,
			"calidad.agregar_defecto",
			{ datos: { nombre: "Mancha de aceite", operacion_ids: [] } },
			"calidad",
		);
		expect(sinOperacion.estado).toBe(400);
		const sinPermiso = await mandarAccion(
			servidor,
			"calidad.agregar_defecto",
			{ datos: { nombre: "Mancha de grasa", operacion_ids: [lote.prenda.flujo.operaciones[1]?.operacionId] } },
			"produccion",
		);
		expect(sinPermiso.estado).toBe(403);
	});
});
