/**
 * Prueba de `contaduria.gastos`: los gastos del mes por categoría contra el mes anterior, el registro (el más reciente
 * arriba, con el de un servicio que no se cancela aquí), las opciones de la ventana sin «Reparación de máquinas», y
 * solo Contaduría la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento … y no manda lo que la cuenta
 * no debe ver») y docs/interfaz/fabrica/contaduria.md («Gastos»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { registrarGastoDePrueba, servicioConCostoDePrueba } from "../../../nucleo/pruebas/gastos-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const gastos = z.object({
	mes: z.string(),
	al_dia: z.number().nullable(),
	hoy: z.string(),
	por_categoria: z.array(z.object({ categoria: z.string(), este_mes_centavos: z.number() })),
	renglones: z.array(
		z.object({ folio: z.string(), categoria: z.string(), de_mantenimiento: z.boolean(), monto_centavos: z.number() }),
	),
	categorias: z.array(z.object({ nombre: z.string() })),
	ubicaciones: z.array(z.object({ nombre: z.string() })),
});

describe("Gastos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("los gastos del mes por categoría y en el registro, el de un servicio con su máquina; la ventana sin «Reparación de máquinas»", async () => {
		await registrarGastoDePrueba(servidor);
		await servicioConCostoDePrueba(servidor, 120_000);
		const pedida = await pedirConsulta(servidor, "contaduria.gastos", {}, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		const datos = gastos.parse(pedida.cuerpo.resultado);
		expect(datos.al_dia).not.toBeNull();
		// «Registrar gasto» abre con el día de negocio que da la API, no con el reloj de la computadora.
		expect(datos.hoy.endsWith(`-${String(datos.al_dia).padStart(2, "0")}`)).toBe(true);
		expect(datos.hoy.startsWith(datos.mes.slice(0, 8))).toBe(true);
		expect(datos.renglones).toHaveLength(2);
		const deServicio = datos.renglones.find((renglon) => renglon.de_mantenimiento);
		expect(deServicio?.folio).toMatch(/^SM-/);
		expect(deServicio?.categoria).toMatch(/^Reparación de máquinas · máquina .+, de mantenimiento$/);
		const total = datos.por_categoria.reduce((suma, categoria) => suma + categoria.este_mes_centavos, 0);
		expect(total).toBe(datos.renglones.reduce((suma, renglon) => suma + renglon.monto_centavos, 0));
		expect(datos.categorias.map((categoria) => categoria.nombre)).not.toContain("Reparación de máquinas");
		expect(datos.categorias.map((categoria) => categoria.nombre)).toContain("Luz");
		expect(datos.ubicaciones.length).toBeGreaterThan(0);
	});

	it("un mes pasado no lleva «al día»; solo Contaduría la pide", async () => {
		const pasado = await pedirConsulta(servidor, "contaduria.gastos", { mes: "2026-01-01" }, "contaduria");
		expect(gastos.parse(pasado.cuerpo.resultado).al_dia).toBeNull();
		expect((await pedirConsulta(servidor, "contaduria.gastos", {}, "mantenimiento")).estado).toBe(403);
	});
});
