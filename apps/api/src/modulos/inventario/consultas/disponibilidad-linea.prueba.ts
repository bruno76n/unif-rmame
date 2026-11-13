/**
 * Prueba de `inventario.disponibilidad_linea`: por talla de los productos activos que se venden en línea (sin las de
 * pedido especial), «sale hoy» si tiene libres en Bodega o en Aduana yendo a Bodega, «sale mañana» si solo tiene libres
 * en una tienda del orden de surtido (antes del POS, ninguna cuenta), y «agotado» si no; lo apartado no cuenta. Se
 * filtra por producto o por variantes. La piden Tienda en línea y Bodega.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/tienda-en-linea.md («Disponibilidad»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { meterPiezas, nuevoTraspaso, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { comoElSitio, pedidoDelSitio, prendaEnLinea } from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
interface Disponibilidad {
	productos: {
		producto_id: string;
		nombre: string;
		tallas: { variante_id: string; talla: string; promesa: string; texto: string }[];
	}[];
}

describe("La disponibilidad en línea, por talla", () => {
	let servidor: ServidorDePrueba;
	let lugar: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		lugar = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la disponibilidad. */
	async function disponibilidad(parametros: Record<string, string> = {}, quien = "linea"): Promise<Disponibilidad> {
		const respuesta = await pedirConsulta(servidor, "inventario.disponibilidad_linea", parametros, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Disponibilidad;
	}

	/** La promesa de cada variante, en su orden. */
	async function promesas(variantes: readonly string[]): Promise<(string | undefined)[]> {
		const { productos } = await disponibilidad({ variante_ids: variantes.join(",") });
		const tallas = productos.flatMap((producto) => producto.tallas);
		return variantes.map((variante) => tallas.find((talla) => talla.variante_id === variante)?.promesa);
	}

	it("sale hoy con libres en Bodega o en Aduana yendo a Bodega; agotado si lo libre ya está apartado", async () => {
		const [enBodega = "", enAduana = "", apartada = ""] = await prendaEnLinea(servidor);
		await meterPiezas(servidor, lugar.BOD ?? "", enBodega, 2);
		await meterPiezas(servidor, lugar.ADU ?? "", enAduana, 1);
		await nuevoTraspaso(servidor, {
			tipo: "solicitud_tienda",
			estado: "en_aduana",
			origen: { ubicacionId: lugar.T2 ?? "" },
			destino: { ubicacionId: lugar.BOD ?? "" },
			renglones: [{ varianteId: enAduana, piezas: 1 }],
		});
		await meterPiezas(servidor, lugar.BOD ?? "", apartada, 1);
		const pedido = pedidoDelSitio([{ variante_id: apartada, cantidad: 1 }]);
		expect((await comoElSitio(servidor, "linea.recibir_pedido", pedido)).estado).toBe(200);
		expect(await promesas([enBodega, enAduana, apartada])).toEqual(["sale_hoy", "sale_hoy", "agotado"]);
		const { productos } = await disponibilidad({ variante_ids: enBodega });
		expect(productos[0]?.tallas[0]?.texto).toBe("Sale hoy: hay en bodega");
	});

	it("una tienda solo cuenta si surte en línea y ya lleva su existencia (con el POS): entonces sale mañana", async () => {
		const [enTienda = ""] = await prendaEnLinea(servidor);
		await meterPiezas(servidor, lugar.T1 ?? "", enTienda, 3);
		expect(await promesas([enTienda])).toEqual(["agotado"]);
		await servidor.base.dueno.query("UPDATE ubicaciones SET existencia_desde = now() WHERE codigo = 'T1'");
		try {
			expect(await promesas([enTienda])).toEqual(["sale_manana"]);
		} finally {
			await servidor.base.dueno.query("UPDATE ubicaciones SET existencia_desde = NULL WHERE codigo = 'T1'");
		}
	});

	it("solo los productos activos que se venden en línea, sin las tallas de pedido especial; se filtra por producto", async () => {
		const enLinea = await prendaEnLinea(servidor);
		const soloMostrador = await prendaEnLinea(servidor, false);
		const todas = (await disponibilidad()).productos.flatMap((producto) => producto.tallas.map((t) => t.variante_id));
		expect(todas).toEqual(expect.arrayContaining(enLinea));
		expect(todas.some((variante) => soloMostrador.includes(variante))).toBe(false);
		const { rows } = await servidor.base.dueno.query(
			`SELECT v.id FROM variantes v JOIN productos p ON p.id = v.producto_id
			 WHERE v.es_pedido_especial OR p.baja_en IS NOT NULL OR NOT p.canal_en_linea`,
		);
		const fuera = new Set(rows.map((fila: { id: string }) => fila.id));
		expect(todas.some((variante) => fuera.has(variante))).toBe(false);
		const { rows: producto } = await servidor.base.dueno.query("SELECT producto_id FROM variantes WHERE id = $1", [
			enLinea[0],
		]);
		const suyo = await disponibilidad({ producto_id: producto[0]?.producto_id });
		expect(suyo.productos.map((uno) => uno.producto_id)).toEqual([producto[0]?.producto_id]);
		expect(suyo.productos[0]?.tallas.map((talla) => talla.variante_id)).toEqual(enLinea);
	});

	it("la piden Tienda en línea y Bodega; Ventas no", async () => {
		await disponibilidad({}, "bodega");
		expect((await pedirConsulta(servidor, "inventario.disponibilidad_linea", {}, "ventas")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "inventario.disponibilidad_linea", {}, "aduana")).estado).toBe(403);
	});
});
