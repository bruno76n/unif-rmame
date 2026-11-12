/**
 * Prueba de `contaduria.crear_cuenta_por_cobrar`: la cuenta nace con su vencimiento y su importe; con importe 0 nace
 * pagada; una sola por nota, aun a la vez.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { ErrorDeApi } from "../../../nucleo/http/errores.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { clienteDePrueba, notaEntregadaDePrueba } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { foliosDePrueba } from "../../../nucleo/pruebas/modulos/ventas/index.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("La cuenta por cobrar nace con su vencimiento y su importe; con importe 0 nace pagada; una sola por nota", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Crea la cuenta de una nota; regresa lo que regresó o el cuerpo de su error. */
	function crear(datos: Record<string, unknown>) {
		return enAccionDePrueba(
			crearBase(servidor.base.app),
			servidor.modulos,
			(contexto) => contexto.interna("contaduria.crear_cuenta_por_cobrar", datos),
			{ guardarEventos: true },
		).catch((error: unknown) => (error instanceof ErrorDeApi ? error.cuerpo() : Promise.reject(error)));
	}

	it("la NV-0151 de Zamora, entregada el 9 de noviembre a 15 días: $18,400 que vencen el 24", async () => {
		const zamora = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, zamora, {
			totalCentavos: 1_840_000,
			diasCredito: 15,
			fechaEntrega: "2026-11-09",
		});
		const { rows } = await servidor.base.dueno.query(
			`SELECT c.vence::text, c.importe_centavos::int AS importe, c.saldo_centavos::int AS saldo, c.estado, c.pagada_en,
				c.tercero_id = $2 AS del_tercero, c.cliente_id = $3 AS del_cliente,
				(SELECT count(*)::int FROM eventos e WHERE e.tipo = 'cuenta_por_cobrar.creada' AND e.entidad_id = c.id) AS eventos
			 FROM cuentas_por_cobrar c WHERE c.id = $1`,
			[nota.cuentaId, zamora.terceroId, zamora.clienteId],
		);
		expect(rows).toEqual([
			{
				vence: "2026-11-24",
				importe: 1_840_000,
				saldo: 1_840_000,
				estado: "sin_pagar",
				pagada_en: null,
				del_tercero: true,
				del_cliente: true,
				eventos: 1,
			},
		]);
	});

	it("con importe 0 nace pagada, con su hora", async () => {
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 0 });
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, saldo_centavos::int AS saldo, pagada_en IS NOT NULL AS con_hora FROM cuentas_por_cobrar WHERE id = $1",
			[nota.cuentaId],
		);
		expect(rows).toEqual([{ estado: "pagada", saldo: 0, con_hora: true }]);
	});

	it("una sola por nota: otra vez da `cuenta_ya_existe` con su folio; dos a la vez dejan una", async () => {
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 500_000 });
		const datos = (notaId: string) => ({
			nota_entrega_id: notaId,
			pedido_id: nota.pedidoId,
			cliente_id: cliente.clienteId,
			fecha_entrega: "2026-11-10",
			dias_credito: 0,
			total_nota_centavos: 500_000,
		});
		expect(await crear(datos(nota.notaId))).toMatchObject({
			codigo: "cuenta_ya_existe",
			mensaje: `${nota.folio} ya tiene su cuenta por cobrar.`,
		});
		const otra = uuidv7();
		foliosDePrueba.set(otra, "NV-9001");
		const resultados = await Promise.all([crear(datos(otra)), crear(datos(otra))]);
		const con = (llave: string) =>
			resultados.filter((resultado) => typeof resultado === "object" && resultado !== null && llave in resultado);
		expect(con("cuenta_por_cobrar_id")).toHaveLength(1);
		expect(con("codigo")).toEqual([expect.objectContaining({ codigo: "cuenta_ya_existe" })]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM cuentas_por_cobrar WHERE nota_entrega_id = $1",
			[otra],
		);
		expect(rows).toEqual([{ n: 1 }]);
	});
});
