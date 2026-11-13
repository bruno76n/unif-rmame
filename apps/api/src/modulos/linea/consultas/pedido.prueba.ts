/**
 * Prueba de `linea.pedido`, el cajón del W-: se abre por su id o por su folio, con el cliente, el envío, el pago, cada
 * prenda con dónde está, los totales, el camino y lo que se puede hacer; con sus excepciones abiertas en rojo; ya
 * cancelado, el camino dice quién, cuándo y por qué. Solo Tienda en línea lo abre.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	comoElSitio,
	pedidoDelSitio,
	pedidoLineaEnBodega,
	prendaEnLinea,
	surtirPedidoLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
interface Pedido {
	pedido_linea_id: string;
	folio: string;
	version: number;
	etapa: { texto: string; color: string };
	cliente: { nombre: string; correo: string; telefono: string | null };
	relacionados: { en_aduana: number; prendas: number; por_surtir_bodega: number };
	cifras: { total_linea: string; municipio: string; promesa: { texto: string; linea: string } };
	envio: { destinatario: string; direccion: string[]; metodo: string; costo_centavos?: number };
	pago: { metodo: string; referencia: string; pagado: string | null; comision_centavos?: number | null };
	avisos: string[];
	prendas: {
		prenda: string;
		talla: string;
		piezas: number;
		donde: { texto: string; color: string }[];
		precio_unitario_centavos?: number;
		importe_centavos?: number;
	}[];
	totales: { subtotal_centavos?: number; envio_centavos?: number; total_centavos?: number };
	camino: { texto: string; hecho: boolean }[];
	cierre: string | null;
	puede: { cancelar: boolean; ver_en_aduana: boolean };
}

describe("El cajón del pedido en línea", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Abre el cajón. */
	async function pedido(parametros: Record<string, string>): Promise<Pedido> {
		const respuesta = await pedirConsulta(servidor, "linea.pedido", parametros, "linea");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Pedido;
	}

	it("por su id o por su folio: cliente, envío, pago, prendas con dónde están, totales, camino y lo que se puede hacer", async () => {
		const suyo = await pedidoLineaEnBodega(servidor, 2);
		const porId = await pedido({ pedido_linea_id: suyo.id });
		expect(await pedido({ folio: suyo.folio })).toEqual(porId);
		expect(porId).toMatchObject({
			folio: suyo.folio,
			etapa: { texto: "Por surtir", color: "azul" },
			cliente: { nombre: "Laura Méndez", correo: "laura@correo.invalid", telefono: "3511234567" },
			relacionados: { en_aduana: 0, prendas: 2, por_surtir_bodega: 2 },
			cifras: {
				total_linea: "pagó, con envío",
				municipio: "Zamora",
				promesa: { texto: "Sale hoy", linea: "lo que se le prometió" },
			},
			envio: {
				destinatario: "Laura Méndez",
				direccion: ["Hidalgo 120, Centro", "59600 Zamora, Michoacán"],
				metodo: "estandar · Estafeta",
				costo_centavos: 9_900,
			},
			pago: { metodo: "mercado_pago · tarjeta", comision_centavos: 1_500 },
			avisos: [],
			totales: { subtotal_centavos: 50_000, envio_centavos: 9_900, total_centavos: 59_900 },
			cierre: null,
			puede: { cancelar: true, ver_en_aduana: false },
		});
		expect(porId.pago.pagado).toMatch(/^Pagado el \d{1,2} [a-z]{3} \d{2}:\d{2}$/);
		expect(porId.prendas).toEqual([
			expect.objectContaining({
				piezas: 2,
				donde: [{ texto: "Bodega la surte", color: "ambar" }],
				precio_unitario_centavos: 25_000,
				importe_centavos: 50_000,
			}),
		]);
		expect(porId.camino.map((paso) => paso.hecho)).toEqual([true, false, false]);
		await surtirPedidoLinea(servidor, suyo.id);
		const surtido = await pedido({ pedido_linea_id: suyo.id });
		expect(surtido.prendas[0]?.donde[0]).toMatchObject({ color: "ambar" });
		expect(surtido.prendas[0]?.donde[0]?.texto).toMatch(/^En camino a aduana · A-/);
		expect(surtido.camino.map((paso) => paso.hecho)).toEqual([true, true, false]);
	});

	it("sin pieza en ningún lado: la prenda en rojo y el aviso de su excepción, con quién la resuelve", async () => {
		const [variante = ""] = await prendaEnLinea(servidor);
		const datos = pedidoDelSitio([{ variante_id: variante, cantidad: 1 }]);
		expect((await comoElSitio(servidor, "linea.recibir_pedido", datos)).estado).toBe(200);
		const suyo = await pedido({ pedido_linea_id: datos.id });
		expect(suyo.avisos).toEqual(["Sin pieza: Bodega la busca"]);
		expect(suyo.prendas[0]?.donde).toEqual([{ texto: "Sin pieza: Bodega la busca", color: "rojo" }]);
	});

	it("cancelado: el camino dice quién, cuándo y por qué, y ya no se cancela", async () => {
		const suyo = await pedidoLineaEnBodega(servidor);
		const antes = await pedido({ pedido_linea_id: suyo.id });
		const respuesta = await mandarAccion(
			servidor,
			"linea.cancelar_pedido",
			{ datos: { pedido_linea_id: suyo.id, motivo: "La clienta pidió cancelar" }, version: antes.version },
			"linea",
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const cancelado = await pedido({ pedido_linea_id: suyo.id });
		expect(cancelado.etapa).toEqual({ texto: "Cancelado", color: "rojo" });
		expect(cancelado.cierre).toMatch(/^Cancelado el \d{1,2} [a-z]{3} por .+: La clienta pidió cancelar$/);
		expect(cancelado.puede.cancelar).toBe(false);
		expect(cancelado.cifras.promesa).toEqual({ texto: "Cancelado", linea: "estado" });
	});

	it("solo Tienda en línea lo abre; uno que no existe, 404", async () => {
		const suyo = await pedidoLineaEnBodega(servidor);
		for (const quien of ["bodega", "aduana", "ventas"]) {
			expect((await pedirConsulta(servidor, "linea.pedido", { pedido_linea_id: suyo.id }, quien)).estado).toBe(403);
		}
		expect((await pedirConsulta(servidor, "linea.pedido", { pedido_linea_id: uuidv7() }, "linea")).estado).toBe(404);
		expect((await pedirConsulta(servidor, "linea.pedido", { folio: "W-NO-EXISTE" }, "linea")).estado).toBe(404);
	});
});
