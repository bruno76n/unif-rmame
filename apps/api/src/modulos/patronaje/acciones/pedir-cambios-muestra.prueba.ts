/**
 * Prueba del desarrollo con escuela, de la solicitud a la ficha técnica: cada paso en su etapa y en su historial;
 * los cambios regresan a muestra con su motivo; se descarta con motivo, menos en catálogo.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	type MaterialesDeReceta,
	materialesDeReceta,
	nuevoDesarrollo,
	pasoDelDesarrollo,
} from "../../../nucleo/pruebas/patronaje-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Si rechaza, regresa a muestra con el motivo; pedir cambios o descartarlo cancela su autorización", () => {
	let servidor: ServidorDePrueba;
	let materiales: MaterialesDeReceta;
	let escuela: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		materiales = await materialesDeReceta(servidor);
		const respuesta = await mandarAccion(
			servidor,
			"catalogo.agregar_escuela",
			{ datos: { nombre: "Secundaria de los desarrollos", municipio: "Jacona" } },
			"catalogo",
		);
		escuela = (respuesta.cuerpo.resultado as { escuela_id: string }).escuela_id;
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** El historial de un desarrollo, en orden. */
	async function historial(id: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT accion, etapa_antes, etapa_despues, motivo FROM desarrollo_eventos WHERE desarrollo_id = $1 ORDER BY creado_en, id",
			[id],
		);
		return rows;
	}

	it("con escuela: solicitud, muestra, el cliente pide cambios, muestra otra vez, el cliente aprueba; todo en su historial", async () => {
		const ds = await nuevoDesarrollo(servidor, materiales.gabardina, escuela);
		expect(ds.folio).toMatch(/^DS-\d{3}$/);
		expect((await pasoDelDesarrollo(servidor, "entregar_muestra", ds.id)).cuerpo).toMatchObject({
			codigo: "etapa_no_permite",
			mensaje: `${ds.folio} está en Solicitud: este paso ya no aplica.`,
		});
		expect(
			(await pasoDelDesarrollo(servidor, "empezar_muestra", ds.id, { muestra_talla: "M" })).cuerpo.resultado,
		).toMatchObject({
			mensaje: `${ds.folio}: muestra`,
		});
		expect((await pasoDelDesarrollo(servidor, "entregar_muestra", ds.id)).cuerpo.resultado).toMatchObject({
			mensaje: `${ds.folio}: aprobación`,
			autorizacion_id: null,
		});
		expect((await pasoDelDesarrollo(servidor, "pedir_cambios_muestra", ds.id, { motivo: "ab" })).cuerpo).toMatchObject({
			campos: { motivo: "Escribe al menos 5 letras." },
		});
		expect(
			(await pasoDelDesarrollo(servidor, "pedir_cambios_muestra", ds.id, { motivo: "El cuello más alto" })).cuerpo
				.resultado,
		).toMatchObject({ mensaje: `${ds.folio} regresa a muestra` });
		await pasoDelDesarrollo(servidor, "entregar_muestra", ds.id);
		expect((await pasoDelDesarrollo(servidor, "registrar_aprobacion_cliente", ds.id)).cuerpo.resultado).toMatchObject({
			mensaje: `${ds.folio}: ficha técnica`,
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT etapa, muestra_talla, motivo_cambios, aprobado_por_tipo, aprobado_por IS NOT NULL AS con_quien FROM desarrollos WHERE id = $1",
			[ds.id],
		);
		expect(rows).toEqual([
			{
				etapa: "ficha_tecnica",
				muestra_talla: "M",
				motivo_cambios: "El cuello más alto",
				aprobado_por_tipo: "cliente",
				con_quien: true,
			},
		]);
		expect(await historial(ds.id)).toEqual([
			{ accion: "solicitud_registrada", etapa_antes: null, etapa_despues: "solicitud", motivo: null },
			{ accion: "muestra_empezada", etapa_antes: "solicitud", etapa_despues: "muestra", motivo: null },
			{ accion: "muestra_entregada", etapa_antes: "muestra", etapa_despues: "aprobacion", motivo: null },
			{ accion: "cambios_pedidos", etapa_antes: "aprobacion", etapa_despues: "muestra", motivo: "El cuello más alto" },
			{ accion: "muestra_entregada", etapa_antes: "muestra", etapa_despues: "aprobacion", motivo: null },
			{ accion: "aprobado", etapa_antes: "aprobacion", etapa_despues: "ficha_tecnica", motivo: null },
		]);
		// El historial solo crece.
		await expect(servidor.base.app.query("UPDATE desarrollo_eventos SET motivo = 'x'")).rejects.toMatchObject({
			code: "42501",
		});
	});

	it("la solicitud pide una tela de Compras y una escuela activa; se descarta con motivo, una sola vez", async () => {
		const sinTela = await mandarAccion(
			servidor,
			"patronaje.registrar_solicitud",
			{ datos: { escuela_id: escuela, prenda: "Chamarra", tela_material_id: materiales.cierre, tallas: "6 a 14" } },
			"patronaje",
		);
		expect(sinTela.cuerpo).toMatchObject({ codigo: "tela_no_es_tela", mensaje: "Escoge una tela." });
		const ds = await nuevoDesarrollo(servidor, materiales.gabardina, escuela);
		const descartado = await pasoDelDesarrollo(servidor, "descartar_desarrollo", ds.id, { motivo: "Ya no la quieren" });
		expect(descartado.cuerpo.resultado).toMatchObject({
			mensaje: `${ds.folio} descartada. Queda en el historial con su motivo`,
		});
		expect(
			(await pasoDelDesarrollo(servidor, "descartar_desarrollo", ds.id, { motivo: "Otra vez" })).cuerpo,
		).toMatchObject({
			codigo: "desarrollo_terminado",
			mensaje: `${ds.folio} ya está descartado.`,
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT etapa, motivo_cancelacion FROM desarrollos WHERE id = $1",
			[ds.id],
		);
		expect(rows).toEqual([{ etapa: "cancelado", motivo_cancelacion: "Ya no la quieren" }]);
		expect((await pasoDelDesarrollo(servidor, "empezar_muestra", ds.id, {}, "ventas")).estado).toBe(403);
	});
});
