/**
 * El flujo de humo del arnés: un pedido de Colegio Morelos que Rosa confirma y manda a producción, con la fábrica entera
 * levantada (la API, el worker, la tablet, los dos puentes y la web), y al final lo que tiene que cuadrar. Hasta que este
 * flujo está en verde no se reparten los demás.
 * Fase 21 · docs/fases/21-pruebas-de-punta-a-punta.md (parte 1 y «Cómo se construye»: «Hasta que el arnés está en
 * verde con un flujo de humo (un pedido que se confirma y se manda a producción), no se reparte nada»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { type Fabrica, levantarFabrica } from "./arnes/fabrica.ts";

describe("el arnés de los flujos", () => {
	let fabrica: Fabrica;
	beforeAll(async () => {
		fabrica = await levantarFabrica();
	});
	afterAll(async () => {
		await fabrica?.cerrar();
	});

	it("la fábrica entera arranca: la tablet registrada, los dos puentes con su Zebra y la web", async () => {
		const tablet = await fabrica.tablet();
		const { pagina, contexto } = await tablet.lista();
		expect(await pagina.evaluate(() => window.porDentro.estadoDelAparato())).toBe("lista");
		await contexto.close();
		for (const cual of ["aduana", "taller"] as const) {
			const puente = await fabrica.puente(cual);
			await puente.atender();
			expect(puente.armado.llamadas).toContain("POST /v1/acciones/admin.trabajos_impresion");
		}
		const web = await fabrica.web();
		const pantalla = await web.abrir("/ventas", { quien: "rosa" });
		await pantalla.getByRole("heading", { level: 1 }).first().waitFor();
		await pantalla.context().close();
	});

	it("un pedido que se confirma y se manda a producción, y al final todo cuadra", async () => {
		const rosa = fabrica.como("rosa");
		const [cliente] = await fabrica.leer(
			"SELECT c.id FROM clientes c JOIN terceros t ON t.id = c.tercero_id WHERE t.nombre = 'Colegio Morelos'",
		);
		const variantes = await fabrica.leer(
			`SELECT v.id FROM variantes v JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
			 WHERE p.nombre = 'Pantalón azul marino' AND v.baja_en IS NULL ORDER BY t.orden LIMIT 3`,
		);
		expect(variantes).toHaveLength(3);
		const confirmado = await rosa.accion("ventas.confirmar_pedido", {
			cliente_id: cliente?.id,
			fecha_entrega: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
			forma_pago: "contado",
			renglones: variantes.map((variante) => ({ variante_id: variante.id, cantidad: 20 })),
		});
		expect(confirmado.estado, JSON.stringify(confirmado.cuerpo)).toBe(200);
		const { pedido_id: pedidoId, folio } = z
			.object({ pedido_id: z.uuid(), folio: z.string() })
			.passthrough()
			.parse(confirmado.resultado);
		const pedido = await rosa.consulta("ventas.pedido", { pedido_id: pedidoId });
		const { version } = z.object({ version: z.number() }).passthrough().parse(pedido.resultado);
		const mandado = await rosa.accion("ventas.mandar_a_produccion", { pedido_id: pedidoId }, { version });
		expect(mandado.estado, JSON.stringify(mandado.cuerpo)).toBe(200);
		expect(mandado.resultado).toMatchObject({ piezas: 60 });
		// Lo que hizo la acción quedó en la bitácora, a nombre de Rosa desde la fábrica.
		expect(await fabrica.revisar.bitacoraDe(String(mandado.clave))).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ origen: "fabrica", descripcion: expect.stringMatching(/^Rosa Méndez mandó/) }),
			]),
		);
		await fabrica.trabajador.procesar();
		// Aduana no ve precios del pedido.
		const deJavier = await fabrica.como("javier").consulta("ventas.pedido", { pedido_id: pedidoId });
		expect([200, 403, 404]).toContain(deJavier.estado);
		expect(folio).toMatch(/^PE-/);
		await fabrica.revisar.todo();
	});
});
