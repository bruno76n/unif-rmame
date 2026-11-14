/**
 * Prueba de `contaduria.pendientes` y de la pastilla de Contaduría con la muestra: las cuatro cifras cuadran con las
 * cuentas, cada pendiente sale con su estado y su botón, la nómina sin «ven sueldos y tarifas» no lleva su total (y
 * `ve_sueldos` lo dice para la pestaña Nómina), y solo Contaduría la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: … saldos sin Contaduría, sueldos y tarifas sin su permiso») y
 * docs/interfaz/fabrica/contaduria.md («Pendientes», «Pastilla del menú»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { semanaConNomina } from "../../../nucleo/pruebas/nomina-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const respuesta = z.object({
	cifras: z.object({
		por_cobrar: z.object({ total_centavos: z.number(), tramos: z.array(z.object({ monto_centavos: z.number() })) }),
		por_pagar: z.object({ total_centavos: z.number(), vencido_centavos: z.number() }),
		flujo: z.object({ entra_centavos: z.number(), sale_centavos: z.number(), neto_centavos: z.number() }),
		detenidos: z.object({ cuantos: z.number() }),
	}),
	renglones: z.array(
		z.object({
			tipo: z.string(),
			grupo: z.string(),
			titulo: z.string(),
			detalle: z.string(),
			total_nomina_centavos: z.number().optional(),
			estado: z.object({ texto: z.string(), color: z.string() }),
			accion: z.object({ tipo: z.string(), texto: z.string() }),
		}),
	),
	conteos: z.record(z.string(), z.number()),
	ve_sueldos: z.boolean(),
});

describe("Pendientes de Contaduría: cifras, renglones y pastilla", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una suma de la base de prueba. */
	async function suma(consulta: string): Promise<number> {
		const { rows } = await servidor.base.dueno.query(consulta);
		return Number(rows[0]?.suma ?? 0);
	}

	it("las cifras cuadran con las cuentas: lo que deben los clientes, lo que se debe (con lo detenido) y lo detenido", async () => {
		const pedida = await pedirConsulta(servidor, "contaduria.pendientes", {}, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		const { cifras } = respuesta.parse(pedida.cuerpo.resultado);
		expect(cifras.por_cobrar.total_centavos).toBe(
			await suma("SELECT sum(saldo_centavos) AS suma FROM cuentas_por_cobrar"),
		);
		expect(cifras.por_cobrar.tramos.reduce((total, tramo) => total + tramo.monto_centavos, 0)).toBe(
			cifras.por_cobrar.total_centavos,
		);
		expect(cifras.por_pagar.total_centavos).toBe(
			await suma(
				"SELECT sum(saldo_centavos) AS suma FROM cuentas_por_pagar WHERE estado NOT IN ('pagada', 'cancelada')",
			),
		);
		// Lo vencido no lleva lo detenido.
		expect(cifras.por_pagar.vencido_centavos).toBe(
			await suma(
				`SELECT sum(saldo_centavos) AS suma FROM cuentas_por_pagar
				 WHERE estado IN ('por_pagar', 'pagada_en_parte') AND vence < (now() AT TIME ZONE 'America/Mexico_City')::date`,
			),
		);
		expect(cifras.flujo.neto_centavos).toBe(cifras.flujo.entra_centavos - cifras.flujo.sale_centavos);
		expect(cifras.detenidos.cuantos).toBe(
			await suma(
				"SELECT count(*) AS suma FROM facturas_proveedor WHERE estado IN ('detenida', 'esperando_autorizacion')",
			),
		);
	});

	it("cada pendiente sale con su estado y su botón: el detenido de Contaduría pide pagar lo recibido, el de Aduana se revisa, los depósitos se aplican", async () => {
		const { renglones, conteos } = respuesta.parse(
			(await pedirConsulta(servidor, "contaduria.pendientes", {}, "contaduria")).cuerpo.resultado,
		);
		const detenidos = renglones.filter((renglon) => renglon.tipo === "pago_detenido");
		expect(detenidos.map((renglon) => [renglon.estado.texto, renglon.accion.texto]).sort()).toEqual([
			["Detenido · no cuadra", "Pagar lo recibido"],
			["Detenido · no cuadra", "Revisar"],
		]);
		const depositos = renglones.filter((renglon) => renglon.tipo === "deposito_tercero");
		expect(depositos).toHaveLength(2);
		expect(
			depositos.every((renglon) => renglon.estado.texto === "Por aplicar" && renglon.accion.texto === "Aplicar"),
		).toBe(true);
		expect(depositos.map((renglon) => renglon.detalle).join(" ")).toContain("depositado a Ing. Ramón Villaseñor");
		const cobranza = renglones.filter((renglon) => renglon.tipo === "cobranza");
		expect(cobranza.length).toBeGreaterThan(0);
		expect(cobranza.every((renglon) => renglon.accion.tipo === "ver_cliente")).toBe(true);
		// Los pagos que ya vencieron van en rojo y con su botón negro.
		const pagos = renglones.filter((renglon) => renglon.grupo === "pagos" && renglon.tipo !== "pago_detenido");
		expect(pagos.some((renglon) => renglon.estado.texto === "Vencido" && renglon.estado.color === "rojo")).toBe(true);
		expect(conteos.todos).toBe(renglones.length);
		expect(conteos.pagos).toBe(renglones.filter((renglon) => renglon.grupo === "pagos").length);
	});

	it("la nómina por pagar sale con su total solo con «ven sueldos y tarifas»; sin el permiso, con «Ver nómina» y sin total", async () => {
		await semanaConNomina(servidor, "2025-03-03");
		const conPermiso = respuesta.parse(
			(await pedirConsulta(servidor, "contaduria.pendientes", {}, "contaduria_sueldos")).cuerpo.resultado,
		);
		const nomina = conPermiso.renglones.find((renglon) => renglon.tipo === "nomina");
		expect(nomina?.estado.texto).toBe("Por pagar");
		expect(nomina?.accion.texto).toBe("Pagar nómina");
		expect(nomina?.total_nomina_centavos).toBeTypeOf("number");
		// La pestaña Nómina no decide quién ve sueldos: se lo dice la consulta.
		expect(conPermiso.ve_sueldos).toBe(true);
		const sinPermiso = await pedirConsulta(servidor, "contaduria.pendientes", {}, "contaduria");
		const suya = respuesta.parse(sinPermiso.cuerpo.resultado).renglones.find((renglon) => renglon.tipo === "nomina");
		expect(suya?.accion.texto).toBe("Ver nómina");
		expect(suya?.total_nomina_centavos).toBeUndefined();
		expect(sinPermiso.cuerpo.recortado).toContain("total_nomina_centavos");
		expect(respuesta.parse(sinPermiso.cuerpo.resultado).ve_sueldos).toBe(false);
	});

	it("solo Contaduría pide sus pendientes: Ventas y Bodega reciben 403", async () => {
		expect((await pedirConsulta(servidor, "contaduria.pendientes", {}, "ventas")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "contaduria.pendientes", {}, "bodega")).estado).toBe(403);
	});

	it("la pastilla cuenta las facturas detenidas sin autorización, los depósitos por aplicar y los pagos vencidos, en rojo con uno vencido de 7 días o más", async () => {
		const armazon = await pedirConsulta(servidor, "admin.armazon", {}, "contaduria");
		const departamentos = z
			.object({
				departamentos: z.array(z.object({ clave: z.string(), conteo: z.number().nullable(), rojo: z.boolean() })),
			})
			.parse(armazon.cuerpo.resultado).departamentos;
		const contaduria = departamentos.find((departamento) => departamento.clave === "contaduria");
		const esperado =
			(await suma("SELECT count(*) AS suma FROM facturas_proveedor WHERE estado = 'detenida'")) +
			2 +
			(await suma(
				`SELECT count(*) AS suma FROM cuentas_por_pagar WHERE estado IN ('por_pagar', 'pagada_en_parte')
				 AND vence < (now() AT TIME ZONE 'America/Mexico_City')::date`,
			));
		expect(contaduria?.conteo).toBe(esperado);
		// En la muestra, las mensualidades de octubre llevan semanas vencidas.
		expect(contaduria?.rojo).toBe(true);
	});
});
