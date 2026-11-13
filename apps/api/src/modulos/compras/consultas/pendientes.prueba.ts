/**
 * Prueba de `compras.pendientes` y de la pastilla de Compras con los datos de la muestra: los renglones de materiales,
 * órdenes y facturas con su estado armado; los conteos por grupo y el filtro; la pastilla, que es la misma del menú; y
 * que solo la piden las cuentas con Compras (Aduana y Bodega nunca reciben precios).
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver» y «El menú solo muestra los departamentos de la cuenta, cada
 * pastilla cuenta lo que dice su archivo…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta, en lo que se revisa. */
interface Pendientes {
	renglones: { grupo: string; tipo: string; estado: { texto: string; color: string }; abre: { cajon: string } }[];
	conteos: { todos: number; materiales: number; ordenes: number; facturas: number };
	indicadores: { por_pedir: { sin_tiempo: number; esta_semana: number }; ordenes: { por_semana: number[] } };
	pastilla: { conteo: number; rojo: boolean };
}

describe("Pendientes de Compras: materiales por pedir, órdenes que llegan y facturas que no cuadran", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("trae los renglones con su estado y sus conteos; el filtro deja solo su grupo", async () => {
		const respuesta = await pedirConsulta(servidor, "compras.pendientes", {}, "compras");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const { renglones, conteos, indicadores } = respuesta.cuerpo.resultado as Pendientes;
		expect(conteos.todos).toBe(renglones.length);
		expect(conteos.materiales + conteos.ordenes + conteos.facturas).toBe(conteos.todos);
		// Los materiales que salen son los sin tiempo de entrega y los de esta semana.
		expect(conteos.materiales).toBe(indicadores.por_pedir.sin_tiempo + indicadores.por_pedir.esta_semana);
		expect(indicadores.ordenes.por_semana).toHaveLength(4);
		for (const renglon of renglones) {
			if (renglon.tipo === "material") {
				expect(renglon.estado.texto).toMatch(/^(Faltará material \d+ días?|Pedir esta semana)$/);
				expect(renglon.abre.cajon).toBe("material");
			}
			if (renglon.tipo === "orden") expect(renglon.estado.texto).toMatch(/^(Atrasada \d+ días?|Llega esta semana)$/);
			if (renglon.tipo === "factura") expect(renglon.estado.texto).toMatch(/^(No cuadra|Esperando factura)$/);
		}
		const soloOrdenes = await pedirConsulta(servidor, "compras.pendientes", { grupo: "ordenes" }, "compras");
		const filtrado = soloOrdenes.cuerpo.resultado as Pendientes;
		expect(filtrado.renglones.every((renglon) => renglon.grupo === "ordenes")).toBe(true);
		expect(filtrado.renglones).toHaveLength(conteos.ordenes);
		expect(filtrado.conteos).toEqual(conteos);
	});

	it("la pastilla del menú es la que cuenta Compras: por pedir más atrasadas, roja con algo sin tiempo", async () => {
		const pendientes = (await pedirConsulta(servidor, "compras.pendientes", {}, "compras")).cuerpo
			.resultado as Pendientes;
		const atrasadas = pendientes.renglones.filter((renglon) => renglon.estado.texto.startsWith("Atrasada")).length;
		const { sin_tiempo, esta_semana } = pendientes.indicadores.por_pedir;
		expect(pendientes.pastilla).toEqual({
			conteo: sin_tiempo + esta_semana + atrasadas,
			rojo: sin_tiempo > 0 || atrasadas > 0,
		});
		const armazon = await pedirConsulta(servidor, "admin.armazon", {}, "compras");
		const compras = (
			armazon.cuerpo.resultado as { departamentos: { clave: string; conteo: number | null; rojo: boolean }[] }
		).departamentos.find((departamento) => departamento.clave === "compras");
		expect(compras).toMatchObject({
			conteo: pendientes.pastilla.conteo === 0 ? null : pendientes.pastilla.conteo,
			rojo: pendientes.pastilla.rojo,
		});
	});

	it("solo la piden las cuentas con Compras: Aduana, Bodega y Ventas no", async () => {
		for (const quien of ["aduana", "bodega", "ventas"]) {
			const respuesta = await pedirConsulta(servidor, "compras.pendientes", {}, quien);
			expect(respuesta.estado, quien).toBe(403);
			expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|\$/);
		}
		expect((await pedirConsulta(servidor, "compras.pendientes", {}, "duena")).estado).toBe(200);
	});
});
