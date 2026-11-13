/**
 * Prueba de `contaduria.estado_pago_notas` con la muestra: el estado del pago de las notas entregadas (sin pagar,
 * pagada en parte y pagada); el saldo solo a Contaduría; Bodega no la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: … saldos sin Contaduría…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
interface Pagos {
	notas: { nota_entrega_id: string; estado: string; texto: string; saldo_centavos?: number }[];
}

describe("El estado del pago de las notas: a Ventas sin el saldo, a Contaduría con él", () => {
	let servidor: ServidorDePrueba;
	let ids: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const { rows } = await servidor.base.dueno.query(
			"SELECT folio, id FROM notas_entrega WHERE folio IN ('NV-0001', 'NV-0009', 'NV-0010')",
		);
		ids = Object.fromEntries(rows.map((fila: { folio: string; id: string }) => [fila.folio, fila.id]));
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide el pago de las tres notas. */
	function pedir(quien: string) {
		return pedirConsulta(
			servidor,
			"contaduria.estado_pago_notas",
			{ nota_ids: [ids["NV-0001"], ids["NV-0009"], ids["NV-0010"]].join(",") },
			quien,
		);
	}

	it("Ventas ve si cada nota está sin pagar, pagada en parte o pagada, sin su saldo", async () => {
		const respuesta = await pedir("ventas");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const { notas } = respuesta.cuerpo.resultado as Pagos;
		const textoDe = (folio: string) => notas.find((nota) => nota.nota_entrega_id === ids[folio])?.texto;
		// En la muestra, la primera nota se pagó en parte, la novena completa y la décima nada.
		expect([textoDe("NV-0001"), textoDe("NV-0009"), textoDe("NV-0010")]).toEqual([
			"Pagada en parte",
			"Pagada",
			"Sin pagar",
		]);
		expect(notas.every((nota) => nota.saldo_centavos === undefined)).toBe(true);
		expect(respuesta.cuerpo.recortado).toEqual(["saldo_centavos"]);
	});

	it("Contaduría ve el saldo de cada una; Bodega no la pide; un id mal escrito no pasa", async () => {
		const { notas } = (await pedir("contaduria")).cuerpo.resultado as Pagos;
		expect(notas.find((nota) => nota.nota_entrega_id === ids["NV-0009"])?.saldo_centavos).toBe(0);
		expect(notas.find((nota) => nota.nota_entrega_id === ids["NV-0010"])?.saldo_centavos).toBe(1_470_000);
		expect((await pedir("bodega")).estado).toBe(403);
		expect(
			(await pedirConsulta(servidor, "contaduria.estado_pago_notas", { nota_ids: "no-es-un-id" }, "ventas")).estado,
		).toBe(400);
	});
});
