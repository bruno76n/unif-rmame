/**
 * Prueba de `contaduria.tercero` con la muestra: la ficha de un tercero que es cliente y acreedor, con lo que nos debe,
 * lo que le debemos, sus deudas y lo que se puede compensar; abrirla deja «Consultó la ficha de {tercero}» en la
 * bitácora; y solo Contaduría la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Las consultas sensibles … dejan su renglón en la bitácora» y
 * «Cada consulta revisa el departamento … y no manda lo que la cuenta no debe ver») y
 * docs/interfaz/fabrica/contaduria.md («El tercero (ancho)»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const ficha = z.object({
	nombre: z.string(),
	relacion: z.string(),
	cliente_id: z.string().nullable(),
	nos_debe_centavos: z.number(),
	le_debemos_centavos: z.number(),
	maximo_compensar_centavos: z.number(),
	deudas: z.array(z.object({ folio: z.string(), mensualidades: z.string(), cancelable: z.boolean() })),
	le_debemos: z.array(z.object({ documento: z.string() })),
});

describe("El cajón del tercero", () => {
	let servidor: ServidorDePrueba;
	let zamora: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const { rows } = await servidor.base.dueno.query(
			"SELECT id FROM terceros WHERE nombre = 'Distribuidora Escolar Zamora'",
		);
		zamora = String(rows[0]?.id);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("un cliente que también es acreedor: lo que nos debe, lo que le debemos, su deuda y lo que se compensa", async () => {
		const pedida = await pedirConsulta(servidor, "contaduria.tercero", { tercero_id: zamora }, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		const datos = ficha.parse(pedida.cuerpo.resultado);
		expect(datos.relacion).toBe("Cliente y Acreedor");
		expect(datos.cliente_id).not.toBeNull();
		expect(datos.le_debemos_centavos).toBe(2_850_000);
		expect(datos.deudas).toHaveLength(1);
		expect(datos.deudas[0]?.mensualidades).toBe("0 de 1 pagadas");
		expect(datos.deudas[0]?.cancelable).toBe(true);
		expect(datos.maximo_compensar_centavos).toBe(Math.min(datos.nos_debe_centavos, datos.le_debemos_centavos));
	});

	it("abrirla deja «Consultó la ficha de {tercero}» en la bitácora, como consulta sensible", async () => {
		await pedirConsulta(servidor, "contaduria.tercero", { tercero_id: zamora }, "contaduria_sueldos");
		const { rows } = await servidor.base.dueno.query(
			"SELECT tipo, entidad, entidad_id FROM bitacora WHERE descripcion = 'Consultó la ficha de Distribuidora Escolar Zamora'",
		);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows[0]).toMatchObject({ tipo: "consulta_sensible", entidad: "terceros", entidad_id: zamora });
	});

	it("solo Contaduría la pide: Ventas recibe 403", async () => {
		expect((await pedirConsulta(servidor, "contaduria.tercero", { tercero_id: zamora }, "ventas")).estado).toBe(403);
	});
});
