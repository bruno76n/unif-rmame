/**
 * Prueba de `compras.orden` con los datos de la muestra: lo pedido contra lo recibido y lo que falta, el total al precio
 * vigente, lo que se puede hacer según el estado (el borrador se edita, la enviada se cancela, la recibida en parte se
 * cierra con faltante) y «Capturar nota o factura» solo con algo recibido y si la cuenta tiene Contaduría; y que solo la
 * piden las cuentas con Compras.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { aMilesimosConSigno } from "@uniformame/compartido/calculos/cuenta-material";
import { ordenDeCompra } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El cajón de una orden de compra: lo pedido, lo recibido y lo que se puede hacer", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide una orden. */
	async function orden(id: string, quien = "compras") {
		const respuesta = await pedirConsulta(servidor, "compras.orden", { orden_compra_id: id }, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return ordenDeCompra.resultado.parse(respuesta.cuerpo.resultado);
	}

	it("cada orden: lo que falta es lo pedido menos lo recibido, y lo que se puede hacer va con su estado", async () => {
		const { rows } = await servidor.base.dueno.query("SELECT id, estado FROM ordenes_compra ORDER BY folio");
		for (const fila of rows as { id: string; estado: string }[]) {
			const leida = await orden(fila.id);
			expect(leida.orden.estado).toBe(fila.estado);
			for (const linea of leida.lineas) {
				const falta = aMilesimosConSigno(linea.pedido) - aMilesimosConSigno(linea.recibido);
				expect(aMilesimosConSigno(linea.falta)).toBe(falta > 0n ? falta : 0n);
			}
			expect(leida.total_centavos).toBe(leida.lineas.reduce((suma, linea) => suma + (linea.importe_centavos ?? 0), 0));
			expect(leida.puede).toMatchObject({
				editar: fila.estado === "borrador",
				cancelar: fila.estado === "enviada",
				cerrar_con_faltante: fila.estado === "recibida_en_parte",
			});
			// Compras sin Contaduría nunca ve «Capturar nota o factura».
			expect(leida.puede.capturar_factura).toBe(false);
			if (leida.orden.estado_armado.texto === "Atrasada") expect(leida.orden.avisos[0]).toMatch(/^Debía llegar el /);
		}
	});

	it("con algo recibido, la dueña (que tiene Contaduría) ve «Capturar nota o factura»", async () => {
		const { rows } = await servidor.base.dueno.query(
			"SELECT id FROM ordenes_compra WHERE estado IN ('recibida_en_parte', 'recibida') ORDER BY folio LIMIT 1",
		);
		const id = String(rows[0]?.id);
		expect((await orden(id, "duena")).puede.capturar_factura).toBe(true);
	});

	it("solo la piden las cuentas con Compras: Aduana no ve precios", async () => {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM ordenes_compra LIMIT 1");
		for (const quien of ["aduana", "bodega", "contaduria"]) {
			const respuesta = await pedirConsulta(servidor, "compras.orden", { orden_compra_id: String(rows[0]?.id) }, quien);
			expect(respuesta.estado, quien).toBe(403);
			expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos/);
		}
	});
});
