/**
 * Prueba de `ventas.dar_baja_cliente`, `ventas.reactivar_cliente` y `ventas.editar_cliente`: un cliente con saldo no
 * se da de baja y el monto solo lo ve quien tiene Contaduría; con la baja va su lista, y vuelve con la reactivación;
 * cambiar el nombre renombra su tercero, su lista y su escuela.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { llamarInterna } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	nombreDeClienteNuevo,
	pedidoDePrueba,
} from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Un cliente con saldo no se da de baja, y el monto solo se ve con Contaduría", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La versión de un cliente. */
	async function version(clienteId: string) {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM clientes WHERE id = $1", [
			clienteId,
		]);
		return z.number().parse(rows[0]?.v);
	}

	/** Una acción sobre un cliente, con su versión actual. */
	async function sobre(accion: string, clienteId: string, datos: Record<string, unknown> = {}, quien = "ventas") {
		return mandarAccion(
			servidor,
			`ventas.${accion}`,
			{ datos: { cliente_id: clienteId, ...datos }, version: await version(clienteId) },
			quien,
		);
	}

	it("con saldo por cobrar: Ventas no ve el monto, la dueña sí; ya pagado, se da de baja con su lista y regresa al reactivar", async () => {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const nota = crypto.randomUUID();
		const pedido = await pedidoDePrueba(servidor, cliente.cliente_id);
		await llamarInterna(servidor, "contaduria.crear_cuenta_por_cobrar", {
			nota_entrega_id: nota,
			pedido_id: pedido,
			cliente_id: cliente.cliente_id,
			fecha_entrega: "2026-11-09",
			dias_credito: 0,
			total_nota_centavos: 1_340_000,
		});
		const { rows: nombre } = await servidor.base.dueno.query(
			"SELECT t.nombre FROM clientes c JOIN terceros t ON t.id = c.tercero_id WHERE c.id = $1",
			[cliente.cliente_id],
		);
		const suNombre = String(nombre[0]?.nombre);
		// Con su pedido abierto no se da de baja; ya entregado, lo detiene su saldo.
		expect((await sobre("dar_baja_cliente", cliente.cliente_id, { motivo: "Ya no compra" })).cuerpo).toMatchObject({
			codigo: "cliente_con_pedidos",
			mensaje: `${suNombre} tiene 1 pedido(s) abierto(s): no se puede dar de baja.`,
		});
		await servidor.base.dueno.query("UPDATE pedidos SET estado = 'entregado', entregado_en = now() WHERE id = $1", [
			pedido,
		]);
		expect((await sobre("dar_baja_cliente", cliente.cliente_id, { motivo: "Ya no compra" })).cuerpo).toMatchObject({
			codigo: "cliente_con_saldo",
			mensaje: `${suNombre} tiene saldo por cobrar: no se puede dar de baja hasta que pague.`,
		});
		expect(
			(await sobre("dar_baja_cliente", cliente.cliente_id, { motivo: "Ya no compra" }, "duena")).cuerpo,
		).toMatchObject({
			mensaje: `${suNombre} nos debe $13,400: no se puede dar de baja hasta que pague.`,
		});
		await mandarAccion(
			servidor,
			"contaduria.registrar_pago_recibido",
			{
				datos: {
					cliente_id: cliente.cliente_id,
					nota_entrega_id: nota,
					monto_centavos: 1_340_000,
					medio: "efectivo",
				},
			},
			"contaduria",
		);
		const baja = await sobre("dar_baja_cliente", cliente.cliente_id, { motivo: "Ya no compra" });
		expect(baja.cuerpo.resultado).toMatchObject({ mensaje: `${suNombre} dado de baja. Su historial se conserva` });
		const lista = async () =>
			(
				await servidor.base.dueno.query(
					"SELECT l.baja_en IS NOT NULL AS de_baja, c.baja_en IS NOT NULL AS cliente_de_baja FROM listas_precios l JOIN clientes c ON c.id = l.cliente_id WHERE c.id = $1",
					[cliente.cliente_id],
				)
			).rows;
		expect(await lista()).toEqual([{ de_baja: true, cliente_de_baja: true }]);
		// Dado de baja, su crédito ya no cambia.
		const { rows: credito } = await servidor.base.dueno.query(
			"SELECT version::int AS v FROM credito_clientes WHERE cliente_id = $1",
			[cliente.cliente_id],
		);
		expect(
			(
				await mandarAccion(
					servidor,
					"contaduria.cambiar_limite_credito",
					{ datos: { cliente_id: cliente.cliente_id, limite_centavos: 100_000 }, version: credito[0]?.v },
					"contaduria",
				)
			).cuerpo,
		).toMatchObject({ codigo: "cliente_dado_de_baja", mensaje: `${suNombre} está dado de baja.` });
		expect((await sobre("reactivar_cliente", cliente.cliente_id)).cuerpo.resultado).toMatchObject({
			mensaje: `${suNombre} vuelve a estar activo`,
		});
		expect(await lista()).toEqual([{ de_baja: false, cliente_de_baja: false }]);
		expect((await sobre("reactivar_cliente", cliente.cliente_id)).cuerpo).toMatchObject({ codigo: "cliente_activo" });
	});

	it("cambiar el nombre renombra su tercero, su lista y su escuela; sin cambios, «Sin cambios»; un nombre de otro cliente, repetido", async () => {
		const nombre = nombreDeClienteNuevo("Colegio");
		const cliente = await darDeAltaClienteDePrueba(servidor, { nombre, tipo: "escuela" });
		const nuevo = nombreDeClienteNuevo("Colegio renombrado");
		const editado = await sobre("editar_cliente", cliente.cliente_id, { nombre: nuevo, municipio: "Silao" });
		expect(editado.cuerpo.resultado).toMatchObject({ mensaje: `Datos de ${nuevo} guardados` });
		const { rows } = await servidor.base.dueno.query(
			`SELECT t.nombre AS tercero, l.nombre AS lista, e.nombre AS escuela, c.municipio FROM clientes c
			 JOIN terceros t ON t.id = c.tercero_id JOIN listas_precios l ON l.cliente_id = c.id
			 JOIN escuelas e ON e.id = c.escuela_id WHERE c.id = $1`,
			[cliente.cliente_id],
		);
		expect(rows).toEqual([{ tercero: nuevo, lista: nuevo, escuela: nuevo, municipio: "Silao" }]);
		const { rows: bitacora } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE entidad_id = $1 AND accion = 'ventas.editar_cliente' ORDER BY descripcion",
			[cliente.cliente_id],
		);
		expect(bitacora).toEqual([
			{ descripcion: `${nuevo}: municipio León → Silao` },
			{ descripcion: `${nuevo}: nombre ${nombre} → ${nuevo}` },
		]);
		expect((await sobre("editar_cliente", cliente.cliente_id, { municipio: "Silao" })).cuerpo).toMatchObject({
			codigo: "sin_cambios",
		});
		const otro = await darDeAltaClienteDePrueba(servidor);
		expect((await sobre("editar_cliente", otro.cliente_id, { nombre: nuevo })).cuerpo).toMatchObject({
			codigo: "cliente_repetido",
		});
	});

	it("la escuela de un cliente activo no se da de baja en Catálogo; dado de baja el cliente, sí", async () => {
		const nombre = nombreDeClienteNuevo("Colegio con baja");
		const cliente = await darDeAltaClienteDePrueba(servidor, { nombre, tipo: "escuela" });
		const escuelaId = z.uuid().parse(cliente.escuela_id);
		const darBajaEscuela = async () => {
			const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM escuelas WHERE id = $1", [
				escuelaId,
			]);
			return mandarAccion(
				servidor,
				"catalogo.dar_baja_escuela",
				{ datos: { escuela_id: escuelaId, motivo: "Cerró la escuela" }, version: rows[0]?.v },
				"catalogo",
				conGoogle(),
			);
		};
		expect((await darBajaEscuela()).cuerpo).toMatchObject({
			codigo: "escuela_de_cliente",
			mensaje: `${nombre} es de ${nombre}, que sigue activo: se da de baja con el cliente en Ventas a externos.`,
		});
		await sobre("dar_baja_cliente", cliente.cliente_id, { motivo: "Cerró la escuela" });
		expect((await darBajaEscuela()).estado).toBe(200);
	});
});
