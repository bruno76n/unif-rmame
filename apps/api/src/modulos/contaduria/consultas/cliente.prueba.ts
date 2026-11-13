/**
 * Prueba de `contaduria.cliente` con la muestra: lo que nos debe un cliente cuadra con sus notas con saldo, lo que le
 * debemos si también es acreedor, su crédito y su semáforo; abrirlo deja «Consultó el saldo de {cliente}» en la
 * bitácora como consulta sensible; y solo Contaduría lo pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Las consultas sensibles (el saldo de un cliente, …) dejan su
 * renglón en la bitácora» y «Cada consulta revisa el departamento … y no manda lo que la cuenta no debe ver: … saldos
 * sin Contaduría») y docs/interfaz/fabrica/contaduria.md («El cliente (ancho)»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const cliente = z.object({
	nombre: z.string(),
	contexto: z.string(),
	nos_debe_centavos: z.number(),
	le_debemos_centavos: z.number(),
	semaforo: z.object({ texto: z.string() }),
	notas: z.array(z.object({ folio: z.string(), saldo_centavos: z.number() })),
	pagos: z.array(z.object({ folio: z.string() })),
	notas_con_saldo: z.number(),
});

describe("El cajón del cliente", () => {
	let servidor: ServidorDePrueba;
	let zamora: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const { rows } = await servidor.base.dueno.query(
			"SELECT c.id FROM clientes c JOIN terceros t ON t.id = c.tercero_id WHERE t.nombre = 'Distribuidora Escolar Zamora'",
		);
		zamora = String(rows[0]?.id);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("lo que nos debe es la suma de sus notas con saldo; lo que le debemos, su deuda como acreedor", async () => {
		const pedida = await pedirConsulta(servidor, "contaduria.cliente", { cliente_id: zamora }, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		const datos = cliente.parse(pedida.cuerpo.resultado);
		expect(datos.nombre).toBe("Distribuidora Escolar Zamora");
		expect(datos.contexto).toMatch(/^Mayorista · /);
		expect(datos.nos_debe_centavos).toBe(datos.notas.reduce((suma, nota) => suma + nota.saldo_centavos, 0));
		expect(datos.notas_con_saldo).toBe(datos.notas.length);
		const { rows } = await servidor.base.dueno.query(
			`SELECT sum(c.saldo_centavos) AS suma FROM cuentas_por_pagar c JOIN clientes cl ON cl.tercero_id = c.tercero_id
			 WHERE cl.id = $1 AND c.estado NOT IN ('pagada', 'cancelada')`,
			[zamora],
		);
		expect(datos.le_debemos_centavos).toBe(Number(rows[0]?.suma));
		expect(datos.le_debemos_centavos).toBeGreaterThan(0);
	});

	it("abrirlo deja «Consultó el saldo de {cliente}» en la bitácora, como consulta sensible", async () => {
		const antes = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM bitacora WHERE descripcion = 'Consultó el saldo de Distribuidora Escolar Zamora'",
		);
		await pedirConsulta(servidor, "contaduria.cliente", { cliente_id: zamora }, "contaduria_sueldos");
		const { rows } = await servidor.base.dueno.query(
			`SELECT tipo, entidad, entidad_id FROM bitacora WHERE descripcion = 'Consultó el saldo de Distribuidora Escolar Zamora'
			 ORDER BY id DESC LIMIT 1`,
		);
		const despues = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM bitacora WHERE descripcion = 'Consultó el saldo de Distribuidora Escolar Zamora'",
		);
		expect(Number(despues.rows[0]?.n)).toBe(Number(antes.rows[0]?.n) + 1);
		expect(rows[0]).toMatchObject({ tipo: "consulta_sensible", entidad: "clientes", entidad_id: zamora });
	});

	it("solo Contaduría ve el saldo del cliente: Ventas recibe 403; un cliente que no existe, 404", async () => {
		expect((await pedirConsulta(servidor, "contaduria.cliente", { cliente_id: zamora }, "ventas")).estado).toBe(403);
		expect(
			(
				await pedirConsulta(
					servidor,
					"contaduria.cliente",
					{ cliente_id: "0190a000-0000-7000-8000-000000000000" },
					"contaduria",
				)
			).estado,
		).toBe(404);
	});
});
