/**
 * Prueba de `linea.pedidos`: el tablero por etapa con sus tarjetas (la fecha de pago o de vencimiento, cada prenda con
 * dónde está, la promesa y el total), el buscador por folio o cliente, los cerrados del más reciente al más viejo con
 * su cursor, solo las etapas que se piden con `estados`, y el recorte: Bodega y Aduana ven los W- sin el total (regla 8 de pedidos en línea); los demás, 403.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	pedidoLineaDePrueba,
	pedidoLineaEnBodega,
	recibirCompletoEnAduana,
	surtirPedidoLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una tarjeta del tablero. */
interface Tarjeta {
	pedido_linea_id: string;
	folio: string;
	fecha: string;
	cliente: string;
	municipio: string;
	estado: string;
	promesa: { texto: string; color: string } | null;
	prendas: { prenda: string; talla: string; piezas: number; en_aduana: boolean; donde: string | null }[];
	falta: string | null;
	total_centavos?: number;
	version: number;
}

/** Lo que se lee de la respuesta. */
interface Pedidos {
	columnas: { estado: string; texto: string; color: string; pedidos: Tarjeta[] }[];
	cerrados: { pedido_linea_id: string; folio: string; estado: string; detalle: string; total_centavos?: number }[];
	cursor: string | null;
	hay_mas: boolean;
}

describe("Pedidos de Tienda en línea: el tablero, el buscador, los cerrados y el recorte", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Pedidos. */
	async function pedidos(parametros: Record<string, string> = {}, quien = "linea") {
		const respuesta = await pedirConsulta(servidor, "linea.pedidos", parametros, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return { ...(respuesta.cuerpo.resultado as Pedidos), recortado: respuesta.cuerpo.recortado };
	}

	/** La tarjeta de un W-, en la columna que esté. */
	function tarjetaDe(tablero: Pedidos, id: string) {
		for (const columna of tablero.columnas) {
			const suya = columna.pedidos.find((tarjeta) => tarjeta.pedido_linea_id === id);
			if (suya !== undefined) return { columna: columna.estado, tarjeta: suya };
		}
		return undefined;
	}

	/** Cancela un W- como Tienda en línea. */
	async function cancelar(id: string, motivo: string) {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM pedidos_linea WHERE id = $1", [id]);
		const respuesta = await mandarAccion(
			servidor,
			"linea.cancelar_pedido",
			{ datos: { pedido_linea_id: id, motivo }, version: rows[0]?.v },
			"linea",
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
	}

	it("cada W- abierto va en la columna de su etapa, con la fecha de pago, sus prendas con dónde está, la promesa y el total", async () => {
		const pedido = await pedidoLineaEnBodega(servidor, 2);
		let tablero = await pedidos();
		expect(tablero.columnas.map((columna) => columna.estado)).toEqual(
			expect.arrayContaining(["por_surtir", "esperando_prendas", "listo_para_empacar"]),
		);
		expect(tablero.columnas.find((columna) => columna.estado === "por_surtir")).toMatchObject({
			texto: "Por surtir",
			color: "azul",
		});
		const enBodega = tarjetaDe(tablero, pedido.id);
		expect(enBodega?.columna).toBe("por_surtir");
		expect(enBodega?.tarjeta).toMatchObject({
			folio: pedido.folio,
			cliente: "Laura Méndez",
			municipio: "Zamora",
			promesa: { texto: "Sale hoy", color: "verde" },
			total_centavos: 2 * 25_000 + 9_900,
		});
		expect(enBodega?.tarjeta.fecha).toMatch(/^Pagado \d{1,2} [a-z]{3}$/);
		expect(enBodega?.tarjeta.prendas).toEqual([
			expect.objectContaining({ piezas: 2, en_aduana: false, donde: "Bodega la surte" }),
		]);
		const { traspasoId } = await surtirPedidoLinea(servidor, pedido.id);
		tablero = await pedidos();
		expect(tarjetaDe(tablero, pedido.id)?.columna).toBe("esperando_prendas");
		expect(tarjetaDe(tablero, pedido.id)?.tarjeta.prendas[0]?.donde).toMatch(/^En camino a aduana · A-/);
		// Esperando prendas, la tarjeta ya dice cuántas faltan (Empaque en línea de Aduana no cuenta nada).
		expect(tarjetaDe(tablero, pedido.id)?.tarjeta.falta).toBe("Falta 2 de 2");
		await recibirCompletoEnAduana(servidor, traspasoId ?? "");
		tablero = await pedidos();
		const listo = tarjetaDe(tablero, pedido.id);
		expect(listo?.columna).toBe("listo_para_empacar");
		expect(listo?.tarjeta).toMatchObject({
			promesa: null,
			falta: null,
			prendas: [expect.objectContaining({ en_aduana: true })],
		});
	});

	it("«Esperando pago» sale solo si hay alguno, con su vencimiento", async () => {
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM pedidos_linea WHERE estado = 'esperando_pago'",
		);
		const antes = await pedidos();
		expect(antes.columnas.some((columna) => columna.estado === "esperando_pago")).toBe(rows[0]?.n > 0);
		const esperando = await pedidoLineaDePrueba(servidor);
		const tablero = await pedidos();
		expect(tablero.columnas[0]).toMatchObject({ estado: "esperando_pago", texto: "Esperando pago", color: "gris" });
		expect(tarjetaDe(tablero, esperando)?.tarjeta.fecha).toMatch(/^Vence \d{1,2} [a-z]{3} \d{2}:\d{2}$/);
	});

	it("los cerrados, del más reciente al más viejo: cancelados con su motivo y vencidos sin pago, con su cursor", async () => {
		const viejo = await pedidoLineaEnBodega(servidor);
		await cancelar(viejo.id, "La clienta pidió cancelar");
		const vencido = await pedidoLineaDePrueba(servidor);
		await servidor.base.dueno.query(
			"UPDATE pedidos_linea SET estado = 'vencido', estado_en = now() + interval '1 second', pago_estado = 'vencido', pago_vence_en = NULL WHERE id = $1",
			[vencido],
		);
		const primera = await pedidos({ limite: "1" });
		expect(primera.cerrados).toHaveLength(1);
		expect(primera.cerrados[0]).toMatchObject({ pedido_linea_id: vencido, estado: "vencido" });
		expect(primera.cerrados[0]?.detalle).toMatch(/ · Venció sin pago$/);
		expect(primera.hay_mas).toBe(true);
		const segunda = await pedidos({ limite: "1", cursor: primera.cursor ?? "" });
		expect(segunda.cerrados[0]).toMatchObject({
			pedido_linea_id: viejo.id,
			estado: "cancelado",
			detalle: "Laura Méndez · Zamora · La clienta pidió cancelar",
		});
		// La página siguiente solo trae cerrados: los abiertos llegan completos en la primera.
		expect(segunda.columnas).toEqual([]);
	});

	it("el buscador encuentra por folio o por cliente, sin importar acentos ni mayúsculas", async () => {
		const pedido = await pedidoLineaEnBodega(servidor);
		const porFolio = await pedidos({ buscar: pedido.folio.toLowerCase() });
		expect(porFolio.columnas.flatMap((columna) => columna.pedidos.map((tarjeta) => tarjeta.folio))).toEqual([
			pedido.folio,
		]);
		const porCliente = await pedidos({ buscar: "laura mendez" });
		expect(tarjetaDe(porCliente, pedido.id)).toBeDefined();
		const nada = await pedidos({ buscar: "zzzz" });
		expect(nada.columnas.every((columna) => columna.pedidos.length === 0)).toBe(true);
		expect(nada.cerrados).toEqual([]);
	});

	it("Bodega y Aduana ven los W- sin su total; Ventas no los pide", async () => {
		const pedido = await pedidoLineaEnBodega(servidor);
		for (const quien of ["bodega", "aduana"]) {
			const tablero = await pedidos({}, quien);
			const suya = tarjetaDe(tablero, pedido.id)?.tarjeta;
			expect(suya?.folio).toBe(pedido.folio);
			expect(suya).not.toHaveProperty("total_centavos");
			expect(tablero.recortado).toContain("total_centavos");
		}
		expect((await pedidos()).recortado ?? []).not.toContain("total_centavos");
		expect((await pedirConsulta(servidor, "linea.pedidos", {}, "ventas")).estado).toBe(403);
	});

	it("con `estados`, solo viajan esas etapas: Empaque en línea pide lo que espera prendas y lo listo, sin cerrados", async () => {
		await pedidoLineaEnBodega(servidor);
		const deAduana = await pedidos({ estados: "esperando_prendas,listo_para_empacar" }, "aduana");
		for (const columna of deAduana.columnas) {
			expect(["esperando_prendas", "listo_para_empacar"]).toContain(columna.estado);
		}
		expect(deAduana.cerrados).toEqual([]);
		const todas = await pedidos({}, "aduana");
		expect(todas.columnas.some((columna) => columna.estado === "por_surtir")).toBe(true);
		const mal = await pedirConsulta(servidor, "linea.pedidos", { estados: "esperando_prendas,otro" }, "aduana");
		expect(mal.estado).toBe(400);
	});
});
