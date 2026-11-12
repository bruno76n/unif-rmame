/**
 * Prueba de `contaduria.cambiar_dias_credito`: guarda los días, avisa que los pedidos guardados conservan los suyos y
 * con los mismos días no escribe.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clienteDePrueba, versionDelCredito } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Cambiar los días guarda el cambio, no escribe si no cambió y el semáforo nunca cambia solo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Contaduría cambia los días de un cliente con su versión actual. */
	async function cambiar(clienteId: string, dias: unknown) {
		return mandarAccion(
			servidor,
			"contaduria.cambiar_dias_credito",
			{ datos: { cliente_id: clienteId, dias_credito: dias }, version: await versionDelCredito(servidor, clienteId) },
			"contaduria",
		);
	}

	it("de 15 a 21 días: los guarda con su aviso y su bitácora; con los mismos, nada", async () => {
		const cliente = await clienteDePrueba(servidor);
		const respuesta = await cambiar(cliente.clienteId, 21);
		expect(respuesta.cuerpo).toMatchObject({
			resultado: { mensaje: `Crédito de ${cliente.nombre}: 21 días` },
			avisos: ["Los pedidos ya guardados conservan sus días"],
		});
		const version = await versionDelCredito(servidor, cliente.clienteId);
		const igual = await cambiar(cliente.clienteId, 21);
		expect(igual.cuerpo).toMatchObject({ resultado: { version }, avisos: [] });
		const { rows } = await servidor.base.dueno.query(
			`SELECT c.dias_credito, c.semaforo, b.descripcion, b.antes, b.despues FROM credito_clientes c
			 JOIN bitacora b ON b.entidad_id = c.id WHERE c.cliente_id = $1`,
			[cliente.clienteId],
		);
		expect(rows).toEqual([
			{
				dias_credito: 21,
				semaforo: "al_corriente",
				descripcion: `Días de crédito de ${cliente.nombre}: 15 → 21`,
				antes: { dias_credito: 15 },
				despues: { dias_credito: 21 },
			},
		]);
	});

	it("sin días o con 0 no entra", async () => {
		const cliente = await clienteDePrueba(servidor);
		for (const dias of [0, 2.5, null]) {
			expect((await cambiar(cliente.clienteId, dias)).cuerpo).toMatchObject({
				campos: { dias_credito: "Escribe los días de crédito." },
			});
		}
	});
});
