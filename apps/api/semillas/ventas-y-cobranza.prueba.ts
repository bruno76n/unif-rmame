/**
 * Prueba de la carga de Ventas y cobranza de la muestra: los seis clientes con su crédito y su semáforo, sus pedidos
 * (entregados, abiertos con su versión y su anticipo, y borradores), las diez notas entregadas con su cuenta por
 * cobrar, los pagos a la cuenta de la fábrica y que una segunda carga no hace nada.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Cómo se construye»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../src/nucleo/base/conexion.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../src/nucleo/pruebas/servidor-de-prueba.ts";
import { cargarVentasYCobranzaDeLaMuestra } from "./ventas-y-cobranza.ts";

describe("Ventas y cobranza de la muestra", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	it("carga clientes, pedidos, notas y pagos como la muestra; otra vez, no hace nada", async () => {
		expect(
			await consultar(
				`SELECT t.nombre, c.tipo, cr.limite_centavos::int AS limite, cr.dias_credito AS dias, cr.semaforo
				 FROM clientes c JOIN terceros t ON t.id = c.tercero_id JOIN credito_clientes cr ON cr.cliente_id = c.id
				 ORDER BY t.nombre`,
			),
		).toEqual([
			{ nombre: "Colegio Morelos", tipo: "escuela", limite: 15_000_000, dias: 30, semaforo: "al_corriente" },
			{
				nombre: "Distribuidora Escolar Zamora",
				tipo: "mayorista",
				limite: 20_000_000,
				dias: 15,
				semaforo: "al_corriente",
			},
			{
				nombre: "Instituto Juan Pablo II",
				tipo: "escuela",
				limite: 12_000_000,
				dias: 30,
				semaforo: "cerca_del_limite",
			},
			{
				nombre: "Jardín de Niños Gabriela Mistral",
				tipo: "escuela",
				limite: 3_000_000,
				dias: 30,
				semaforo: "al_corriente",
			},
			{ nombre: "Secundaria Técnica 12", tipo: "escuela", limite: 10_000_000, dias: 30, semaforo: "al_corriente" },
			{ nombre: "Uniformes El Bajío", tipo: "mayorista", limite: 8_000_000, dias: 30, semaforo: "detenido" },
		]);
		expect(await consultar("SELECT estado, count(*)::int AS n FROM pedidos GROUP BY estado ORDER BY estado")).toEqual([
			{ estado: "borrador", n: 2 },
			{ estado: "confirmado", n: 6 },
			{ estado: "entregado", n: 9 },
		]);
		expect(await consultar("SELECT count(*)::int AS n FROM pedido_versiones WHERE numero = 2")).toEqual([{ n: 2 }]);
		expect(
			await consultar(
				"SELECT n.estado, count(*)::int AS n, count(c.id)::int AS con_cuenta FROM notas_entrega n LEFT JOIN cuentas_por_cobrar c ON c.nota_entrega_id = n.id GROUP BY n.estado",
			),
		).toEqual([{ estado: "entregada", n: 10, con_cuenta: 10 }]);
		expect(
			await consultar(
				"SELECT concepto, count(*)::int AS n FROM pagos WHERE direccion = 'recibido' GROUP BY concepto ORDER BY concepto",
			),
		).toEqual([
			{ concepto: "nota", n: 3 },
			{ concepto: "pedido", n: 2 },
		]);
		// Los abiertos van a producción con lo que les falta.
		expect(
			await consultar(
				"SELECT count(DISTINCT pedido_id)::int AS n FROM ordenes_produccion WHERE motivo = 'cliente_externo'",
			),
		).toEqual([{ n: 6 }]);
		await cargarVentasYCobranzaDeLaMuestra(crearBase(servidor.base.dueno));
		expect(await consultar("SELECT count(*)::int AS n FROM clientes")).toEqual([{ n: 6 }]);
	});
});
