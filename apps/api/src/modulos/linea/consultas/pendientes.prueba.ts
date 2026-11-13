/**
 * Prueba de `linea.pendientes` y de la pastilla de Tienda en línea: los tres indicadores, los W- por surtir, esperando
 * prendas y listos para empacar (del pagado hace más tiempo al más nuevo, rojos desde `linea.dias_pedido_rojo`), lo
 * que falta de cada uno y dónde está, la pastilla que cuenta los por surtir, y que solo Tienda en línea la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver» y «El menú solo muestra los departamentos de la cuenta, cada
 * pastilla cuenta lo que dice su archivo…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { meterPiezas, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import {
	comoElSitio,
	pedidoDelSitio,
	pedidoLineaDePrueba,
	pedidoLineaEnBodega,
	prendaEnLinea,
	recibirCompletoEnAduana,
	surtirPedidoLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
interface Pendientes {
	cifras: {
		pedidos: { abiertos: number; tono: string | null; contexto: { texto: string; tono: string }[] };
		ventas: { semana_centavos?: number; serie_centavos?: number[]; contexto: { texto: string }[] };
		disponibilidad: { salen_hoy: number; contexto: { texto: string; tono: string }[] };
	};
	renglones: {
		pedido_linea_id: string;
		titulo: string;
		detalle: string;
		fecha: { fecha: string; texto: string };
		total_centavos?: number;
		estado: { texto: string; color: string };
	}[];
	pastilla: { conteo: number; rojo: boolean };
}

describe("Pendientes de Tienda en línea: indicadores, los W- abiertos y la pastilla", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Pendientes como Tienda en línea. */
	async function pendientes(): Promise<Pendientes> {
		const respuesta = await pedirConsulta(servidor, "linea.pendientes", {}, "linea");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Pendientes;
	}

	/**
	 * Un W- pagado hace unos días, de una prenda con su pieza en Bodega.
	 * @param dias Hace cuántos días se pagó.
	 */
	async function pagadoHace(dias: number) {
		const [variante = ""] = await prendaEnLinea(servidor);
		const { BOD = "" } = await ubicacionesPorCodigo(servidor);
		await meterPiezas(servidor, BOD, variante, 1);
		const pedido = pedidoDelSitio([{ variante_id: variante, cantidad: 1 }], {
			pago: { pagado_en: new Date(Date.now() - dias * 86_400_000).toISOString() },
		});
		const respuesta = await comoElSitio(servidor, "linea.recibir_pedido", pedido);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return { id: pedido.id, folio: String(respuesta.cuerpo.resultado.folio), total: Number(pedido.total_centavos) };
	}

	/** El nombre de la prenda de una variante. */
	async function prendaDe(variante: string): Promise<string> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT p.nombre FROM variantes v JOIN productos p ON p.id = v.producto_id WHERE v.id = $1",
			[variante],
		);
		return String(rows[0]?.nombre);
	}

	it("los W- abiertos salen del pagado hace más tiempo al más nuevo: rojos desde linea.dias_pedido_rojo, ámbar antes, con lo que falta y dónde está", async () => {
		const viejo = await pagadoHace(3);
		const nuevo = await pedidoLineaEnBodega(servidor);
		const { renglones } = await pendientes();
		const suyos = renglones.filter((renglon) => [viejo.id, nuevo.id].includes(renglon.pedido_linea_id));
		expect(suyos.map((renglon) => renglon.pedido_linea_id)).toEqual([viejo.id, nuevo.id]);
		expect(suyos[0]).toMatchObject({
			titulo: `${viejo.folio} · Laura Méndez`,
			estado: { texto: "Por surtir", color: "rojo" },
			total_centavos: viejo.total,
		});
		expect(suyos[0]?.fecha.texto).toMatch(/^Pagado \d{1,2} [a-z]{3}$/);
		expect(suyos[1]).toMatchObject({ estado: { texto: "Por surtir", color: "ambar" } });
		const prenda = await prendaDe(nuevo.variante);
		expect(suyos[1]?.detalle).toMatch(new RegExp(`^${prenda} \\S+ · Bodega la surte$`));
	});

	it("surtido queda «Esperando prendas» en camino a aduana; recibido, «Listo para empacar» completo en aduana; esperando pago no sale aquí", async () => {
		const pedido = await pedidoLineaEnBodega(servidor);
		const { traspasoId } = await surtirPedidoLinea(servidor, pedido.id);
		let renglon = (await pendientes()).renglones.find((suyo) => suyo.pedido_linea_id === pedido.id);
		expect(renglon?.estado.texto).toBe("Esperando prendas");
		expect(renglon?.detalle).toMatch(/ · En camino a aduana$/);
		await recibirCompletoEnAduana(servidor, traspasoId ?? "");
		renglon = (await pendientes()).renglones.find((suyo) => suyo.pedido_linea_id === pedido.id);
		expect(renglon).toMatchObject({
			estado: { texto: "Listo para empacar" },
			detalle: "Completo en aduana · listo para empacar",
		});
		const esperando = await pedidoLineaDePrueba(servidor);
		const despues = await pendientes();
		expect(despues.renglones.some((suyo) => suyo.pedido_linea_id === esperando)).toBe(false);
		expect(despues.cifras.pedidos.contexto[0]?.texto).toMatch(/^\d+ esperando pago$/);
	});

	it("los indicadores: abiertos con su tono, las ventas de la semana sin los cancelados, y las tallas que salen hoy", async () => {
		const cancelado = await pedidoLineaEnBodega(servidor);
		const motivo = { pedido_linea_id: cancelado.id, motivo: "La clienta pidió cancelar" };
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM pedidos_linea WHERE id = $1", [
			cancelado.id,
		]);
		expect(
			(await mandarAccion(servidor, "linea.cancelar_pedido", { datos: motivo, version: rows[0]?.v }, "linea")).estado,
		).toBe(200);
		const { cifras } = await pendientes();
		const { rows: cuenta } = await servidor.base.dueno.query(
			`SELECT count(*) FILTER (WHERE estado IN ('por_surtir', 'esperando_prendas', 'listo_para_empacar'))::int AS abiertos,
				count(*) FILTER (WHERE estado = 'por_surtir')::int AS por_surtir,
				coalesce(sum(total_centavos) FILTER (WHERE estado <> 'cancelado' AND pago_estado = 'pagado'
					AND (pagado_en AT TIME ZONE 'America/Mexico_City')::date
						> (now() AT TIME ZONE 'America/Mexico_City')::date - 7), 0)::int AS semana
			 FROM pedidos_linea`,
		);
		expect(cifras.pedidos.abiertos).toBe(cuenta[0]?.abiertos);
		expect(cifras.pedidos.tono).toBe(cuenta[0]?.por_surtir > 0 ? "rojo" : "ambar");
		expect(cifras.ventas.semana_centavos).toBe(cuenta[0]?.semana);
		expect(cifras.ventas.serie_centavos).toHaveLength(14);
		expect(cifras.ventas.serie_centavos?.slice(-7).reduce((suma, dia) => suma + dia, 0)).toBe(cuenta[0]?.semana);
		const disponibilidad = await pedirConsulta(servidor, "inventario.disponibilidad_linea", {}, "linea");
		const tallas = (
			disponibilidad.cuerpo.resultado as { productos: { tallas: { promesa: string }[] }[] }
		).productos.flatMap((producto) => producto.tallas);
		expect(cifras.disponibilidad.salen_hoy).toBe(tallas.filter((talla) => talla.promesa === "sale_hoy").length);
		const agotadas = tallas.filter((talla) => talla.promesa === "agotado").length;
		expect(cifras.disponibilidad.contexto[0]?.texto).toBe(
			agotadas === 0 ? "Ninguna agotada" : `${agotadas} ${agotadas === 1 ? "agotada" : "agotadas"}`,
		);
	});

	it("la pastilla de Tienda en línea cuenta los W- por surtir y va roja si alguno abierto se pagó hace linea.dias_pedido_rojo días o más", async () => {
		await pagadoHace(2);
		const { pastilla } = await pendientes();
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM pedidos_linea WHERE estado = 'por_surtir'",
		);
		expect(pastilla).toEqual({ conteo: rows[0]?.n, rojo: true });
		const armazon = await pedirConsulta(servidor, "admin.armazon", {}, "linea");
		const departamentos = (
			armazon.cuerpo.resultado as { departamentos: { clave: string; conteo: number; rojo: boolean }[] }
		).departamentos;
		expect(departamentos).toEqual([expect.objectContaining({ clave: "linea", conteo: rows[0]?.n, rojo: true })]);
	});

	it("solo Tienda en línea la pide", async () => {
		expect((await pedirConsulta(servidor, "linea.pendientes", {}, "bodega")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "linea.pendientes", {}, "aduana")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "linea.pendientes", {}, "ventas")).estado).toBe(403);
	});
});
