/**
 * Prueba de las hojas de Ventas con la muestra: el pedido (PE-0013) con su cliente, su entrega, su forma de pago, su
 * tabla por prenda con las tallas especiales en su renglón, su total y lo entregado; la nota (NV-0010) con sus precios,
 * su nota de crédito y «Por cobrar» para Ventas y Contaduría, y sin un solo peso para Aduana. Las cuentas sin el
 * departamento reciben `403`; un borrador no tiene hoja.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «Cada hoja lleva lo que dice su archivo;
 * la nota de entrega sale sin precios para quien no los ve…») y docs/impresos/hojas.md («El pedido», «La nota de
 * entrega», «Cómo se prueba»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { notaDeLaMuestra, pedidoDeLaMuestra } from "../../modulos/ventas/consultas/de-la-muestra.ts";
import { leerPdf } from "../../nucleo/pruebas/leer-impresos.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../nucleo/pruebas/servidor-de-prueba.ts";
import { notaCreditoDePrueba } from "../../nucleo/pruebas/ventas-de-prueba.ts";

describe("las hojas del pedido y de la nota de entrega", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide una hoja como una cuenta de la web. */
	function pedir(tipo: string, id: string, quien: string) {
		return servidor.app.inject({
			method: "GET",
			url: `/v1/etiquetas/${tipo}/${id}?formato=pdf`,
			headers: encabezadosDeLaWeb(quien),
		});
	}

	/** El texto de todas las páginas de una hoja, en una línea. */
	async function textoDe(tipo: string, id: string, quien: string): Promise<string> {
		const respuesta = await pedir(tipo, id, quien);
		expect(respuesta.statusCode, respuesta.body).toBe(200);
		return leerPdf(respuesta.rawPayload)
			.flatMap((pagina) => pagina.textos)
			.join(" ")
			.replace(/\s+/g, " ");
	}

	it("cada hoja lleva lo que dice su archivo: el pedido, con las tallas especiales en su renglón y lo entregado", async () => {
		const pedido = await pedidoDeLaMuestra(servidor, "PE-0013");
		// La talla 16 de la playera, especial: $40 de recargo.
		await servidor.base.dueno.query(
			`UPDATE pedido_renglones r SET recargo_especial_centavos = 4000, precio_unitario_centavos = 25000
			 FROM variantes v JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
			 WHERE r.variante_id = v.id AND r.pedido_id = $1 AND r.hasta_version IS NULL
			   AND p.nombre = 'Playera polo blanca con escudo' AND t.nombre = '16'`,
			[pedido],
		);
		const texto = await textoDe("pedido", pedido, "ventas");
		// El lector de PDF puede partir «(especiales)» en dos pedazos.
		expect(texto).toMatch(/Playera polo blanca con escudo 16 \( ?especiales\) 25 \$250/);
		for (const dice of [
			"Uniformes Alameda",
			"RFC",
			"Pedido",
			"PE-0013",
			"versión 1",
			"Instituto Juan Pablo II",
			"Tel. 452 000 0002",
			"Entregar en: Domicilio conocido, La Piedad",
			"Para el 12 oct 2026",
			"Crédito 30 días",
			"Prenda Tallas Piezas Precio Importe",
			"Conjunto deportivo azul rey 8 a 16 80 $690 $55,200",
			"Playera polo blanca con escudo 8 a 14 ",
			"$250 $6,250",
			"Total 200",
			"70 de 200 piezas entregadas",
			"Hoja 1 de 1",
			"por Prueba ventas",
		]) {
			expect(texto).toContain(dice);
		}
		for (const quien of ["contaduria", "aduana", "produccion"]) {
			expect((await pedir("pedido", pedido, quien)).statusCode, quien).toBe(403);
		}
	});

	it("un pedido en borrador no tiene hoja", async () => {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM pedidos WHERE estado = 'borrador' LIMIT 1");
		const borrador = String(rows[0]?.id);
		const respuesta = await pedir("pedido", borrador, "ventas");
		expect(respuesta.statusCode).toBe(422);
		expect(respuesta.json()).toMatchObject({ codigo: "pedido_no_confirmado" });
	});

	it("la nota de entrega sale con precios para Ventas y Contaduría y sin un solo peso para Aduana", async () => {
		const nota = await notaDeLaMuestra(servidor, "NV-0010");
		await notaCreditoDePrueba(servidor, nota, { folio: "NC-0901", montoCentavos: 42_000 });
		const comunes = [
			"Nota de entrega",
			"NV-0010",
			"Nota 1 de 1 del pedido PE-0013",
			"Instituto Juan Pablo II",
			"Entregar en: Domicilio conocido, La Piedad",
			"Armada el",
			"Salió el 10 oct 2026 con D-0015",
			"Playera polo blanca con escudo 8 20",
			"Total 70",
			"Recibí completo",
			"Nombre",
			"Firma",
			"Fecha",
		];
		for (const quien of ["ventas", "contaduria"]) {
			const texto = await textoDe("nota_entrega", nota, quien);
			for (const dice of [
				...comunes,
				"Prenda Talla Piezas Precio Importe",
				"Playera polo blanca con escudo 8 20 $210 $4,200",
				"Subtotal $14,700",
				"Nota de crédito NC-0901 -$420",
				"Por cobrar $14,280",
				"Crédito 30 días · Vence el 9 nov 2026",
			]) {
				expect(texto, quien).toContain(dice);
			}
		}
		const deAduana = await textoDe("nota_entrega", nota, "aduana");
		for (const dice of [...comunes, "Prenda Talla Piezas"]) expect(deAduana).toContain(dice);
		for (const nunca of ["$", "Precio", "Importe", "Subtotal", "Por cobrar", "NC-0901", "Vence"]) {
			expect(deAduana).not.toContain(nunca);
		}
		for (const quien of ["bodega", "produccion"]) {
			expect((await pedir("nota_entrega", nota, quien)).statusCode, quien).toBe(403);
		}
	});
});
