/**
 * Prueba de `contaduria.abrir_credito_cliente`: el cliente nace sin crédito, con los días de su tipo y al corriente;
 * abrirlo dos veces, aun a la vez, no duplica.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { clienteDePrueba } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { llamarInterna } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un cliente nace sin crédito, con los días de su tipo y al corriente; abrirlo dos veces no duplica", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** El crédito de un cliente, como quedó. */
	async function credito(clienteId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT limite_centavos::int AS limite, dias_credito AS dias, semaforo, semaforo_cambiado_en, limite_cambiado_en
			 FROM credito_clientes WHERE cliente_id = $1`,
			[clienteId],
		);
		return rows;
	}

	it("un mayorista nace con 15 días y los demás con 30; sin crédito y al corriente, con su evento", async () => {
		const mayorista = await clienteDePrueba(servidor, { tipo: "mayorista" });
		const escuela = await clienteDePrueba(servidor, { tipo: "escuela" });
		const otro = await clienteDePrueba(servidor, { tipo: "empresa_otro" });
		const nacio = { limite: 0, semaforo: "al_corriente", semaforo_cambiado_en: null, limite_cambiado_en: null };
		expect(await credito(mayorista.clienteId)).toEqual([{ ...nacio, dias: 15 }]);
		expect(await credito(escuela.clienteId)).toEqual([{ ...nacio, dias: 30 }]);
		expect(await credito(otro.clienteId)).toEqual([{ ...nacio, dias: 30 }]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM eventos WHERE tipo = 'credito.abierto' AND entidad_id = $1",
			[mayorista.creditoId],
		);
		expect(rows).toEqual([{ n: 1 }]);
	});

	it("abrirlo otra vez regresa el mismo sin escribir; dos a la vez dejan uno solo", async () => {
		const cliente = await clienteDePrueba(servidor);
		const otraVez = await llamarInterna(servidor, "contaduria.abrir_credito_cliente", {
			cliente_id: cliente.clienteId,
			tercero_id: cliente.terceroId,
			tipo_cliente: "escuela",
		});
		expect(otraVez).toEqual({ credito_cliente_id: cliente.creditoId });
		expect(await credito(cliente.clienteId)).toMatchObject([{ dias: 15 }]);
		const nuevo = uuidv7();
		const abrir = () =>
			llamarInterna(servidor, "contaduria.abrir_credito_cliente", {
				cliente_id: nuevo,
				tercero_id: cliente.terceroId,
				tipo_cliente: "mayorista",
			});
		const [uno, dos] = await Promise.all([abrir(), abrir()]);
		const deUno = z.object({ credito_cliente_id: z.uuid() }).parse(uno);
		expect(dos).toEqual(deUno);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM credito_clientes WHERE cliente_id = $1",
			[nuevo],
		);
		expect(rows).toEqual([{ n: 1 }]);
	});
});
