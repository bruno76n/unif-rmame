/**
 * Prueba de `inventario.detalle_despachar`: lo que va a una tienda puede salir, con lo que se puede juntar para el
 * mismo destino y su botón; lo de un cliente sin nota no sale y dice por qué, con su tabla por talla y su pedido; el
 * material de la muestra lleva sus etiquetas; lo que no está en aduana da `404`; y solo la pide Aduana, sin precios.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…») y docs/interfaz/fabrica/aduana.md («Despachar»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { traspasoEnAduana } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { pedidoListoEnAduana } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { comoAduana, soloAduanaYSinPrecios, valorDe } from "./aduana-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Detalle {
	folio: string;
	destino: string;
	caso: string;
	aviso: string | null;
	salen: string;
	pedido: { folio: string } | null;
	por_talla: { prenda: string; tallas: { talla: string; piezas: number }[]; piezas: number }[];
	total: number;
	juntar: { traspaso_id: string }[];
	etiquetas: { estado: { texto: string; color: string }; impresas: boolean } | null;
	queda_en_camino: string | null;
	boton: string | null;
}

describe("El cajón Despachar", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	const detalle = async (traspasoId: string) =>
		(await comoAduana(servidor, "inventario.detalle_despachar", { traspaso_id: traspasoId })) as unknown as Detalle;

	it("a una tienda: puede salir, junta lo del mismo destino y dice su botón", async () => {
		const uno = await traspasoEnAduana(servidor, "T2");
		const otro = await traspasoEnAduana(servidor, "T2");
		const suyo = await detalle(uno.id);
		expect(suyo).toMatchObject({
			destino: "A Tienda 2",
			caso: "otro",
			aviso: null,
			salen: "salen",
			queda_en_camino: "Queda en camino hasta que Tienda 2 confirme que lo recibió.",
			boton: "Despachar a Tienda 2",
		});
		expect(suyo.juntar.map((junto) => junto.traspaso_id)).toContain(otro.id);
		expect(suyo.juntar.map((junto) => junto.traspaso_id)).not.toContain(uno.id);
		await soloAduanaYSinPrecios(servidor, "inventario.detalle_despachar", { traspaso_id: uno.id });
	});

	it("a un cliente sin nota: no sale, dice por qué, con su tabla por talla y su pedido", async () => {
		const { lote, pedido } = await pedidoListoEnAduana(servidor, 4);
		const suyo = await detalle(lote.traspasoId);
		expect(suyo.caso).toBe("sin_nota");
		expect(suyo.aviso).toBe("Sin nota de entrega no sale. La arma Ventas con lo que recibe el cliente.");
		expect(suyo.salen).toBe("esperan nota");
		expect(suyo.boton).toBeNull();
		expect(suyo.queda_en_camino).toBeNull();
		expect(suyo.pedido?.folio).toBe(await valorDe(servidor, "SELECT folio FROM pedidos WHERE id = $1", pedido));
		expect(suyo.total).toBe(4);
		expect(suyo.por_talla[0]?.piezas).toBe(4);
	});

	it("el material de la muestra lleva sus etiquetas; lo que no está en aduana da 404", async () => {
		const material = await valorDe(
			servidor,
			"SELECT id FROM traspasos WHERE tipo = 'material_proveedor' AND estado = 'en_aduana' ORDER BY folio LIMIT 1",
		);
		const suyo = await detalle(material);
		expect(suyo.etiquetas).toEqual({ estado: { texto: "Etiquetas por imprimir", color: "ambar" }, impresas: false });
		expect(suyo.destino).toBe("A Bodega");
		const respuesta = await pedirConsulta(
			servidor,
			"inventario.detalle_despachar",
			{ traspaso_id: "01936f2e-0000-7000-8000-00000000dead" },
			"aduana",
		);
		expect(respuesta.estado).toBe(404);
	});
});
