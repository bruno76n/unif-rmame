/**
 * Prueba del desarrollo sin escuela: solo lo aprueba Dirección, con su autorización; si la rechaza, regresa a
 * muestra con el motivo; pedir cambios o descartarlo con la autorización esperando la cancela.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	type MaterialesDeReceta,
	materialesDeReceta,
	nuevoDesarrollo,
	pasoDelDesarrollo,
} from "../../../nucleo/pruebas/patronaje-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un desarrollo sin escuela solo lo aprueba Dirección; si lo rechaza, regresa a muestra con el motivo; pedir cambios o descartarlo cancela su autorización", () => {
	let servidor: ServidorDePrueba;
	let materiales: MaterialesDeReceta;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		materiales = await materialesDeReceta(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Un desarrollo sin escuela con su muestra lista para aprobar, y su AU-. */
	async function listoParaAprobar() {
		const ds = await nuevoDesarrollo(servidor, materiales.gabardina, null);
		await pasoDelDesarrollo(servidor, "empezar_muestra", ds.id);
		const entregada = await pasoDelDesarrollo(servidor, "entregar_muestra", ds.id);
		const autorizacionId = (entregada.cuerpo.resultado as { autorizacion_id: string }).autorizacion_id;
		return { ...ds, autorizacionId };
	}

	/** La autorización como quedó. */
	async function autorizacion(id: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT folio, estado, tipo, resumen, detalle, motivo_cancelacion, version::int AS version FROM autorizaciones WHERE id = $1",
			[id],
		);
		return rows[0];
	}

	/** Dirección decide, con Google. */
	async function decidir(id: string, datos: { decision: "autorizar" | "rechazar"; motivo?: string }) {
		return mandarAccion(
			servidor,
			"direccion.decidir_autorizacion",
			{ datos: { autorizacion_id: id, desde: "direccion", ...datos }, version: (await autorizacion(id))?.version },
			"direccion",
			conGoogle(),
		);
	}

	it("entregar la muestra pide la AU-; Patronaje no la aprueba; Dirección la autoriza y pasa a ficha técnica", async () => {
		const ds = await listoParaAprobar();
		const au = await autorizacion(ds.autorizacionId);
		expect(au).toMatchObject({
			estado: "por_autorizar",
			tipo: "aprobar_desarrollo",
			resumen: `Aprobar la muestra de ${ds.folio} · Chamarra con escudo`,
			detalle: expect.stringMatching(/^Básico o general · Gabardina azul marino .+ · tallas 10 a 16$/),
		});
		expect((await pasoDelDesarrollo(servidor, "registrar_aprobacion_cliente", ds.id)).cuerpo).toMatchObject({
			codigo: "aprueba_direccion",
			mensaje: `Sin escuela la aprueba Dirección: está en sus autorizaciones (${au?.folio}).`,
		});
		expect((await decidir(ds.autorizacionId, { decision: "autorizar" })).estado).toBe(200);
		const { rows } = await servidor.base.dueno.query(
			"SELECT etapa, aprobado_por_tipo, aprobado_por FROM desarrollos WHERE id = $1",
			[ds.id],
		);
		expect(rows).toEqual([
			{ etapa: "ficha_tecnica", aprobado_por_tipo: "direccion", aprobado_por: "01936f2e-0000-7000-8000-000000000009" },
		]);
		const { rows: paso } = await servidor.base.dueno.query(
			"SELECT accion, autorizacion_id FROM desarrollo_eventos WHERE desarrollo_id = $1 ORDER BY creado_en DESC, id DESC LIMIT 1",
			[ds.id],
		);
		expect(paso).toEqual([{ accion: "aprobado", autorizacion_id: ds.autorizacionId }]);
	});

	it("si Dirección la rechaza, regresa a muestra con el motivo como cambios pedidos", async () => {
		const ds = await listoParaAprobar();
		expect((await decidir(ds.autorizacionId, { decision: "rechazar", motivo: "Falta la talla 16" })).estado).toBe(200);
		const { rows } = await servidor.base.dueno.query("SELECT etapa, motivo_cambios FROM desarrollos WHERE id = $1", [
			ds.id,
		]);
		expect(rows).toEqual([{ etapa: "muestra", motivo_cambios: "Falta la talla 16" }]);
	});

	it("pedir cambios o descartarlo con la AU- esperando la cancela, con su motivo", async () => {
		const conCambios = await listoParaAprobar();
		await pasoDelDesarrollo(servidor, "pedir_cambios_muestra", conCambios.id, { motivo: "El cierre más largo" });
		expect(await autorizacion(conCambios.autorizacionId)).toMatchObject({
			estado: "cancelada",
			motivo_cancelacion: "Patronaje regresó la muestra con cambios",
		});
		const descartado = await listoParaAprobar();
		await pasoDelDesarrollo(servidor, "descartar_desarrollo", descartado.id, { motivo: "Se canceló el pedido" });
		expect(await autorizacion(descartado.autorizacionId)).toMatchObject({
			estado: "cancelada",
			motivo_cancelacion: "Patronaje descartó el desarrollo",
		});
	});
});
