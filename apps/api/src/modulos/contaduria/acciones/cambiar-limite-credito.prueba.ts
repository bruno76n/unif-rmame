/**
 * Prueba de `contaduria.cambiar_limite_credito`: guarda el límite, quién y cuándo; con el mismo límite no escribe; el
 * semáforo no cambia solo, aunque el sugerido sí.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	clienteDePrueba,
	cuentaEscritaDePrueba,
	versionDelCredito,
} from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Cambiar el límite guarda quién y cuándo, no escribe si no cambió, y el semáforo nunca cambia solo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Contaduría (u otra cuenta) cambia el límite de un cliente con la versión que se diga o la actual. */
	async function cambiar(clienteId: string, limite: number, opciones: { version?: number; quien?: string } = {}) {
		return mandarAccion(
			servidor,
			"contaduria.cambiar_limite_credito",
			{
				datos: { cliente_id: clienteId, limite_centavos: limite },
				version: opciones.version ?? (await versionDelCredito(servidor, clienteId)),
			},
			opciones.quien ?? "contaduria",
		);
	}

	/** El crédito y sus renglones de bitácora. */
	async function comoQuedo(clienteId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT c.limite_centavos::int AS limite, c.semaforo, c.limite_cambiado_por = $2 AS por_contaduria,
				c.limite_cambiado_en IS NOT NULL AS con_hora,
				(SELECT count(*)::int FROM bitacora b WHERE b.entidad_id = c.id) AS bitacora
			 FROM credito_clientes c WHERE c.cliente_id = $1`,
			[clienteId, cuentaDePrueba("contaduria")],
		);
		return rows[0];
	}

	it("de sin crédito a $80,000: guarda el límite, quién y cuándo, y Ventas ya le puede vender a crédito", async () => {
		const cliente = await clienteDePrueba(servidor);
		const respuesta = await cambiar(cliente.clienteId, 8_000_000);
		expect(respuesta.estado).toBe(200);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: `Límite de crédito de ${cliente.nombre}: $80,000. Ventas ya le puede vender a crédito`,
			credito_cliente_id: cliente.creditoId,
			semaforo_sugerido: "al_corriente",
			version: await versionDelCredito(servidor, cliente.clienteId),
		});
		expect(await comoQuedo(cliente.clienteId)).toEqual({
			limite: 8_000_000,
			semaforo: "al_corriente",
			por_contaduria: true,
			con_hora: true,
			bitacora: 1,
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion, antes, despues FROM bitacora WHERE entidad_id = $1",
			[cliente.creditoId],
		);
		expect(rows).toEqual([
			{
				descripcion: `Límite de crédito de ${cliente.nombre}: sin crédito → $80,000`,
				antes: { limite_centavos: 0 },
				despues: { limite_centavos: 8_000_000 },
			},
		]);
		// A 0, queda sin crédito.
		expect((await cambiar(cliente.clienteId, 0)).cuerpo.resultado).toMatchObject({
			mensaje: `${cliente.nombre} queda sin crédito: de contado o con anticipo`,
		});
	});

	it("con el mismo límite responde bien sin escribir nada: ni versión nueva ni bitácora", async () => {
		const cliente = await clienteDePrueba(servidor);
		await cambiar(cliente.clienteId, 5_000_000);
		const version = await versionDelCredito(servidor, cliente.clienteId);
		const igual = await cambiar(cliente.clienteId, 5_000_000);
		expect(igual.estado).toBe(200);
		expect(igual.cuerpo.resultado).toMatchObject({
			mensaje: `Límite de crédito de ${cliente.nombre}: $50,000`,
			version,
		});
		expect(await versionDelCredito(servidor, cliente.clienteId)).toBe(version);
		expect(await comoQuedo(cliente.clienteId)).toMatchObject({ bitacora: 1 });
	});

	it("el semáforo no cambia solo: con $68,000 por cobrar, un límite de $80,000 sugiere «Cerca del límite» y de $60,000, «Detenido»", async () => {
		const cliente = await clienteDePrueba(servidor, { limiteCentavos: 20_000_000 });
		await cuentaEscritaDePrueba(servidor, cliente, {
			importeCentavos: 6_800_000,
			saldoCentavos: 6_800_000,
			venceEnDias: 10,
		});
		expect((await cambiar(cliente.clienteId, 8_000_000)).cuerpo.resultado).toMatchObject({
			semaforo_sugerido: "cerca_del_limite",
		});
		expect((await cambiar(cliente.clienteId, 6_000_000)).cuerpo.resultado).toMatchObject({
			semaforo_sugerido: "detenido",
		});
		expect(await comoQuedo(cliente.clienteId)).toMatchObject({ limite: 6_000_000, semaforo: "al_corriente" });
	});

	it("un límite con centavos no entra; una versión vieja da 409; Ventas no lo cambia", async () => {
		const cliente = await clienteDePrueba(servidor);
		expect((await cambiar(cliente.clienteId, 8_000_050)).cuerpo).toMatchObject({
			campos: { limite_centavos: "Escribe el límite en pesos, sin centavos." },
		});
		const vieja = await versionDelCredito(servidor, cliente.clienteId);
		await cambiar(cliente.clienteId, 100_000);
		expect((await cambiar(cliente.clienteId, 200_000, { version: vieja })).cuerpo).toMatchObject({
			error: "conflicto_version",
		});
		expect((await cambiar(cliente.clienteId, 300_000, { quien: "ventas" })).estado).toBe(403);
		expect(await comoQuedo(cliente.clienteId)).toMatchObject({ limite: 100_000 });
	});
});
