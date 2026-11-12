/**
 * Prueba de `contaduria.registrar_pago_recibido`: un pago a una nota baja su saldo y cambia su estado; nunca pasa del
 * saldo, aun con dos pagos al mismo tiempo; un monto con centavos no entra.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	clienteDePrueba,
	cuentaComoQuedo,
	internaDeContaduria,
	notaEntregadaDePrueba,
	pagarDePrueba,
} from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un pago a una nota baja su saldo y cambia su estado; nunca pasa del saldo, aun con dos pagos al mismo tiempo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("Zamora paga $8,000 de $13,400: PG-, pagada en parte con $5,400, su aplicación y su bitácora; el resto la deja pagada", async () => {
		const zamora = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, zamora, { totalCentavos: 1_340_000, diasCredito: 15 });
		const pago = await pagarDePrueba(servidor, zamora, nota, 800_000, {
			medio: "cuenta_fabrica",
			referencia: "SPEI 77821",
		});
		expect(pago.estado).toBe(200);
		expect(pago.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(new RegExp(`^PG-\\d{4}: \\$8,000 de ${zamora.nombre}$`)),
			saldo_centavos: 540_000,
		});
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toEqual({
			saldo: 540_000,
			estado: "pagada_en_parte",
			con_pagada_en: false,
		});
		const { rows } = await servidor.base.dueno.query(
			`SELECT p.direccion, p.concepto, p.medio, p.cuenta_fabrica_id IS NOT NULL AS con_cuenta, p.referencia,
				p.tercero_id = $2 AS del_tercero, a.monto_centavos::int AS aplicado, a.estado AS aplicacion,
				b.descripcion, b.antes, b.despues
			 FROM pagos p JOIN aplicaciones_pago a ON a.pago_id = p.id AND a.cuenta_por_cobrar_id = $3
			 JOIN bitacora b ON b.entidad_id = p.id WHERE p.nota_entrega_id = $1`,
			[nota.notaId, zamora.terceroId, nota.cuentaId],
		);
		expect(rows).toEqual([
			{
				direccion: "recibido",
				concepto: "nota",
				medio: "cuenta_fabrica",
				con_cuenta: true,
				referencia: "SPEI 77821",
				del_tercero: true,
				aplicado: 800_000,
				aplicacion: "vigente",
				descripcion: expect.stringMatching(new RegExp(`^Registró el pago PG-\\d{4} de ${zamora.nombre} por \\$8,000$`)),
				antes: { saldo_centavos: 1_340_000 },
				despues: { saldo_centavos: 540_000, monto_centavos: 800_000 },
			},
		]);
		expect((await pagarDePrueba(servidor, zamora, nota, 540_000)).cuerpo.resultado).toMatchObject({
			saldo_centavos: 0,
		});
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toEqual({ saldo: 0, estado: "pagada", con_pagada_en: true });
	});

	it("nunca pasa del saldo; con centavos no entra; sin referencia fuera de efectivo no entra; la nota sin entregar o de otro cliente, no", async () => {
		const cliente = await clienteDePrueba(servidor);
		const otro = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 300_000 });
		expect((await pagarDePrueba(servidor, cliente, nota, 300_100)).cuerpo).toMatchObject({
			codigo: "monto_mayor_que_saldo",
			mensaje: `El saldo de ${nota.folio} es $3,000.`,
		});
		expect((await pagarDePrueba(servidor, cliente, nota, 100_050)).cuerpo).toMatchObject({
			campos: { monto_centavos: "Escribe el monto en pesos" },
		});
		expect((await pagarDePrueba(servidor, cliente, nota, 100_000, { medio: "cuenta_fabrica" })).cuerpo).toMatchObject({
			campos: { referencia: "Escribe la referencia del depósito" },
		});
		expect((await pagarDePrueba(servidor, otro, nota, 100_000)).cuerpo).toMatchObject({
			codigo: "documento_de_otro_cliente",
			mensaje: `${nota.folio} no es de ${otro.nombre}.`,
		});
		const sinEntregar = { ...nota, notaId: crypto.randomUUID(), folio: "NV-sin" };
		expect((await pagarDePrueba(servidor, cliente, sinEntregar, 100_000)).cuerpo).toMatchObject({
			codigo: "nota_sin_entregar",
		});
		expect((await pagarDePrueba(servidor, cliente, nota, 100_000, { medio: "efectivo" }, "ventas")).estado).toBe(403);
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toMatchObject({ saldo: 300_000, estado: "sin_pagar" });
	});

	it("dos pagos al mismo tiempo que juntos pasan del saldo: entra uno y el otro ve el saldo nuevo", async () => {
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 1_000_000 });
		const [uno, dos] = await Promise.all([
			pagarDePrueba(servidor, cliente, nota, 700_000),
			pagarDePrueba(servidor, cliente, nota, 700_000),
		]);
		expect([uno.estado, dos.estado].sort()).toEqual([200, 422]);
		expect([uno, dos].find((respuesta) => respuesta.estado === 422)?.cuerpo).toMatchObject({
			mensaje: `El saldo de ${nota.folio} es $3,000.`,
		});
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toMatchObject({ saldo: 300_000 });
	});

	it("la misma referencia con el mismo monto avisa sin detener", async () => {
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 1_000_000 });
		const conReferencia = { medio: "cuenta_fabrica", referencia: `REF-${nota.notaId.slice(-6)}` };
		const primero = await pagarDePrueba(servidor, cliente, nota, 200_000, conReferencia);
		const otraVez = await pagarDePrueba(servidor, cliente, nota, 200_000, conReferencia);
		expect(otraVez.estado).toBe(200);
		expect(otraVez.cuerpo.avisos).toEqual([
			`Ya hay un pago con la referencia ${conReferencia.referencia}: ${String((primero.cuerpo.resultado as { folio: string }).folio)}`,
		]);
	});

	it("una NC con centavos deja $5.50: el saldo se dice con centavos, el pago exacto lo liquida y uno con centavos que no liquida no entra", async () => {
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 100_000 });
		await internaDeContaduria(servidor, "aplicar_nota_credito", {
			nota_credito_id: uuidv7(),
			nota_entrega_id: nota.notaId,
			monto_centavos: 99_450,
		});
		expect((await pagarDePrueba(servidor, cliente, nota, 600)).cuerpo).toMatchObject({
			codigo: "monto_mayor_que_saldo",
			mensaje: `El saldo de ${nota.folio} es $5.50.`,
		});
		expect((await pagarDePrueba(servidor, cliente, nota, 250)).cuerpo).toMatchObject({
			campos: { monto_centavos: "Escribe el monto en pesos" },
		});
		expect((await pagarDePrueba(servidor, cliente, nota, 550)).cuerpo.resultado).toMatchObject({ saldo_centavos: 0 });
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toEqual({ saldo: 0, estado: "pagada", con_pagada_en: true });
	});
});
