/**
 * Prueba de `contaduria.cambiar_semaforo_credito`: Contaduría pone el semáforo, con quién y cuándo, y su evento va en
 * vivo; con el mismo no escribe.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clienteDePrueba, versionDelCredito } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Cambiar el semáforo guarda quién y cuándo y no escribe si no cambió", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Contaduría (u otra cuenta) pone el semáforo de un cliente con su versión actual. */
	async function poner(clienteId: string, semaforo: string, quien = "contaduria") {
		return mandarAccion(
			servidor,
			"contaduria.cambiar_semaforo_credito",
			{ datos: { cliente_id: clienteId, semaforo }, version: await versionDelCredito(servidor, clienteId) },
			quien,
		);
	}

	it("a Detenido: guarda quién y cuándo, su bitácora y su evento; con el mismo, nada", async () => {
		const cliente = await clienteDePrueba(servidor);
		expect((await poner(cliente.clienteId, "detenido")).cuerpo.resultado).toMatchObject({
			mensaje: `Semáforo de crédito de ${cliente.nombre}: detenido`,
		});
		const version = await versionDelCredito(servidor, cliente.clienteId);
		expect((await poner(cliente.clienteId, "detenido")).cuerpo.resultado).toMatchObject({ version });
		const { rows } = await servidor.base.dueno.query(
			`SELECT c.semaforo, c.semaforo_cambiado_por = $2 AS por_contaduria, c.semaforo_cambiado_en IS NOT NULL AS con_hora,
				b.descripcion, b.antes, b.despues,
				(SELECT count(*)::int FROM eventos e WHERE e.entidad_id = c.id AND e.tipo = 'credito.semaforo_cambiado'
					AND e.tablas = ARRAY['credito_clientes']) AS eventos
			 FROM credito_clientes c JOIN bitacora b ON b.entidad_id = c.id WHERE c.cliente_id = $1`,
			[cliente.clienteId, cuentaDePrueba("contaduria")],
		);
		expect(rows).toEqual([
			{
				semaforo: "detenido",
				por_contaduria: true,
				con_hora: true,
				descripcion: `Semáforo de ${cliente.nombre}: al corriente → detenido`,
				antes: { semaforo: "al_corriente" },
				despues: { semaforo: "detenido" },
				eventos: 1,
			},
		]);
		expect((await poner(cliente.clienteId, "cerca_del_limite")).cuerpo.resultado).toMatchObject({
			mensaje: `Semáforo de crédito de ${cliente.nombre}: cerca del límite`,
		});
	});

	it("un semáforo que no existe no entra; Ventas no lo cambia", async () => {
		const cliente = await clienteDePrueba(servidor);
		expect((await poner(cliente.clienteId, "rojo")).estado).toBe(400);
		expect((await poner(cliente.clienteId, "detenido", "ventas")).estado).toBe(403);
	});
});
