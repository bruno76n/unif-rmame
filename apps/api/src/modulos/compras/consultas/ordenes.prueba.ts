/**
 * Prueba de `compras.ordenes` con los datos de la muestra: cada orden en su grupo (las atrasadas con «Atrasada» y sus
 * días, los borradores «Sin enviar»), su total como la suma de cada cantidad por su precio vigente, la búsqueda por
 * folio, proveedor o material, y que solo la piden las cuentas con Compras.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una orden de la lista, en lo que se revisa. */
interface OrdenDeLaLista {
	orden_compra_id: string;
	folio: string;
	grupo: string;
	proveedor: string;
	llega: { texto: string };
	estado: { texto: string; abajo: string | null };
	total_centavos: number;
}

describe("Órdenes de compra por grupo, con lo pedido contra lo recibido y su total", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la lista como Compras. */
	async function ordenes(parametros: Record<string, string> = {}): Promise<OrdenDeLaLista[]> {
		const respuesta = await pedirConsulta(servidor, "compras.ordenes", parametros, "compras");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return (respuesta.cuerpo.resultado as { ordenes: OrdenDeLaLista[] }).ordenes;
	}

	it("cada orden va en su grupo, con su estado y su total al precio vigente", async () => {
		const todas = await ordenes();
		const { rows } = await servidor.base.dueno.query(
			`SELECT o.id, o.estado, sum(round(l.cantidad * coalesce(l.precio_nota_centavos, l.precio_orden_centavos)))::bigint AS total
			 FROM ordenes_compra o JOIN orden_compra_lineas l ON l.orden_compra_id = o.id GROUP BY o.id, o.estado`,
		);
		expect(todas).toHaveLength(rows.length);
		for (const fila of rows as { id: string; estado: string; total: string }[]) {
			const orden = todas.find((una) => una.orden_compra_id === fila.id);
			expect(orden?.total_centavos, fila.id).toBe(Number(fila.total));
			if (fila.estado === "borrador")
				expect(orden).toMatchObject({ grupo: "borradores", llega: { texto: "Sin enviar" } });
		}
		for (const atrasada of todas.filter((orden) => orden.grupo === "atrasadas")) {
			expect(atrasada.estado.texto).toBe("Atrasada");
			expect(atrasada.estado.abajo).toMatch(/^\d+ días?$/);
		}
	});

	it("busca por folio, proveedor o material", async () => {
		const [una] = await ordenes();
		if (una === undefined) throw new Error("la muestra no trae órdenes");
		expect((await ordenes({ buscar: una.folio })).map((orden) => orden.folio)).toEqual([una.folio]);
		expect((await ordenes({ buscar: una.proveedor })).every((orden) => orden.proveedor === una.proveedor)).toBe(true);
		expect(await ordenes({ buscar: "ninguna orden así" })).toHaveLength(0);
	});

	it("solo la piden las cuentas con Compras: Aduana ve sus órdenes por recibir sin precios en otra parte", async () => {
		for (const quien of ["aduana", "bodega"]) {
			expect((await pedirConsulta(servidor, "compras.ordenes", {}, quien)).estado, quien).toBe(403);
		}
	});
});
