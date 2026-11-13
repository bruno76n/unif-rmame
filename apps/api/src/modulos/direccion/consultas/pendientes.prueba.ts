/**
 * Prueba de `direccion.pendientes` y de la pastilla de Dirección con la muestra: la barra de indicadores del periodo,
 * las autorizaciones por autorizar (rojas desde los días del parámetro) y las alertas en el panel, el filtro por grupo,
 * y que solo la ve Dirección, sin sueldos y sin llevar a departamentos que la cuenta no tiene.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»; y el menú: «cada pastilla cuenta lo que dice su archivo»)
 */

import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { pendientes } from "@uniformame/compartido/contratos/direccion/pendientes";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lecturasDeConsulta } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { consultaPendientes } from "./pendientes.ts";

/** Lo que regresa la consulta, para leerlo en la prueba. */
interface Resultado {
	periodo: string;
	cifras: {
		clave: string;
		numero: string;
		unidad: string;
		contexto: { texto: string; tono: string }[];
		lleva_a: string | null;
	}[];
	pendientes: {
		clave: string;
		grupo: string;
		titulo: string;
		detalle: string | null;
		fecha: string | null;
		cifra: string | null;
		estado: string;
		color: string;
		lleva_a: string | null;
	}[];
	conteos: { autorizaciones: number; alertas: number };
}

describe("Pendientes de Dirección: sus cifras, sus autorizaciones y sus alertas, solo para Dirección", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Pide Pendientes como una cuenta. */
	async function leer(quien = "direccion", parametros: Record<string, string> = {}): Promise<Resultado> {
		const respuesta = await pedirConsulta(servidor, "direccion.pendientes", parametros, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Resultado;
	}

	/** La pastilla de Dirección en el menú de la dueña. */
	async function pastilla() {
		const armazon = await pedirConsulta(servidor, "admin.armazon", {}, "duena");
		const { departamentos } = armazon.cuerpo.resultado as {
			departamentos: { clave: string; conteo: number | null; rojo: boolean }[];
		};
		return departamentos.find((departamento) => departamento.clave === "direccion");
	}

	it("solo Dirección la ve: otra cuenta recibe 403", async () => {
		for (const quien of ["ventas", "bodega", "contaduria"]) {
			expect((await pedirConsulta(servidor, "direccion.pendientes", {}, quien)).estado).toBe(403);
		}
	});

	it("la autorización de la muestra sale por autorizar, en ámbar, y la pastilla la cuenta sin rojo", async () => {
		const { pendientes, conteos } = await leer();
		const [esperando] = await consultar(
			"SELECT id, resumen FROM autorizaciones WHERE estado = 'por_autorizar' ORDER BY creado_en LIMIT 1",
		);
		const suya = pendientes.find((pendiente) => pendiente.clave === `autorizacion:${esperando?.id}`);
		expect(suya).toMatchObject({
			grupo: "autorizaciones",
			titulo: "Ajuste de inventario",
			estado: "Por autorizar",
			color: "ambar",
			cifra: null,
			lleva_a: "direccion/autorizaciones",
		});
		expect(suya?.detalle).toContain(`${esperando?.resumen} · Bodega`);
		expect(suya?.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(conteos.autorizaciones).toBe(pendientes.filter((uno) => uno.grupo === "autorizaciones").length);
		expect(await pastilla()).toMatchObject({ conteo: conteos.autorizaciones, rojo: false });
	});

	it("desde 2 días esperando dice «Por autorizar · {n} días» en rojo y va primero; desde 3, la pastilla va en rojo", async () => {
		await consultar(
			"UPDATE autorizaciones SET creado_en = now() - interval '2 days 1 hour' WHERE estado = 'por_autorizar'",
		);
		const dosDias = await leer();
		expect(dosDias.pendientes[0]).toMatchObject({ estado: "Por autorizar · 2 días", color: "rojo" });
		expect(await pastilla()).toMatchObject({ rojo: false });
		await consultar(
			"UPDATE autorizaciones SET creado_en = now() - interval '3 days 1 hour' WHERE estado = 'por_autorizar'",
		);
		expect((await leer()).pendientes[0]).toMatchObject({ estado: "Por autorizar · 3 días" });
		expect(await pastilla()).toMatchObject({ rojo: true });
		// El orden: rojo, luego ámbar; las alertas, sin fecha, al final de su color.
		const { pendientes } = await leer();
		const colores = pendientes.map((pendiente) => pendiente.color);
		expect(colores).toEqual([...colores].sort((uno, otro) => (uno === "rojo" ? 0 : 1) - (otro === "rojo" ? 0 : 1)));
	});

	it("las alertas salen como «Por revisar» en su color, y el filtro por grupo deja solo las de ese grupo", async () => {
		const alertas = await pedirConsulta(servidor, "direccion.alertas", {}, "direccion");
		const deLaPantalla = (alertas.cuerpo.resultado as { alertas: { clave: string; color: string }[] }).alertas;
		const todos = await leer();
		expect(todos.conteos.alertas).toBe(deLaPantalla.length);
		for (const alerta of deLaPantalla) {
			expect(todos.pendientes.find((pendiente) => pendiente.clave === alerta.clave)).toMatchObject({
				grupo: "alertas",
				estado: "Por revisar",
				color: alerta.color,
				fecha: null,
				cifra: null,
			});
		}
		const soloAlertas = await leer("direccion", { grupo: "alertas" });
		expect(soloAlertas.pendientes.every((pendiente) => pendiente.grupo === "alertas")).toBe(true);
		expect(soloAlertas.conteos).toEqual(todos.conteos);
		const soloAutorizaciones = await leer("direccion", { grupo: "autorizaciones" });
		expect(soloAutorizaciones.pendientes.every((pendiente) => pendiente.grupo === "autorizaciones")).toBe(true);
	});

	it("la barra trae Ventas, Producción, Existencias y Cuentas; lo de Contaduría solo lleva allá si la cuenta la tiene", async () => {
		const deDireccion = await leer("direccion");
		expect(deDireccion.periodo).toBe("semana");
		expect(deDireccion.cifras.map((cifra) => cifra.clave)).toEqual(["ventas", "produccion", "existencias", "cuentas"]);
		expect(deDireccion.cifras[0]).toMatchObject({ unidad: "última semana", lleva_a: "direccion/indicadores" });
		expect(deDireccion.cifras[2]?.unidad).toBe("piezas en total");
		const [existencia] = await consultar("SELECT coalesce(sum(piezas), 0)::int AS piezas FROM existencias");
		expect(deDireccion.cifras[2]?.numero).toBe(new Intl.NumberFormat("es-MX").format(Number(existencia?.piezas)));
		expect(deDireccion.cifras[3]).toMatchObject({ unidad: "por cobrar", lleva_a: null });
		expect(deDireccion.cifras[3]?.contexto[0]?.texto).toMatch(/^Por pagar \$/);
		// La cuenta que solo tiene Dirección no ve «Ver» en las alertas de otros departamentos; la dueña sí.
		expect(deDireccion.pendientes.filter((uno) => uno.grupo === "alertas").every((uno) => uno.lleva_a === null)).toBe(
			true,
		);
		const deLaDuena = await leer("duena");
		expect(deLaDuena.cifras[3]?.lleva_a).toBe("contaduria");
		expect(deLaDuena.pendientes.filter((uno) => uno.grupo === "alertas").every((uno) => uno.lleva_a !== null)).toBe(
			true,
		);
	});

	it("lo vendido en el periodo suma las notas entregadas y se compara con el anterior; con «día», es lo de hoy", async () => {
		const [nota] = await consultar(
			"SELECT id, subtotal_centavos::int AS centavos FROM notas_entrega WHERE estado = 'entregada' ORDER BY folio LIMIT 1",
		);
		await consultar(
			"UPDATE notas_entrega SET fecha_entrega = (now() AT TIME ZONE 'America/Mexico_City')::date WHERE id = $1",
			[nota?.id],
		);
		const pesos = `$${new Intl.NumberFormat("es-MX").format(Number(nota?.centavos) / 100)}`;
		expect((await leer()).cifras[0]?.numero).toBe(pesos);
		await consultar("UPDATE parametros SET valor_texto = 'dia' WHERE clave = 'direccion.primer_vistazo'");
		const delDia = await leer();
		expect(delDia.periodo).toBe("dia");
		expect(delDia.cifras[0]).toMatchObject({ numero: pesos, unidad: "hoy" });
		await consultar("UPDATE parametros SET valor_texto = 'semana' WHERE clave = 'direccion.primer_vistazo'");
	});

	it("la cuenta de soporte, aunque tuviera Dirección, no recibe montos escritos (la regla del recorte común)", async () => {
		const soporte = quienesDePrueba.soporte;
		if (soporte?.tipo !== "cuenta") throw new Error("no hay cuenta de soporte de prueba");
		const quien = { ...soporte, departamentos: ["direccion"] };
		const base = crearBase(servidor.base.app);
		const ahora = Temporal.Now.instant();
		const { resultado } = await consultaPendientes.leer(
			{
				base,
				quien,
				ahora,
				diaDeNegocio: diaDeNegocio(ahora),
				apuntarConsultaSensible: async () => undefined,
				registro: servidor.modulos,
				...lecturasDeConsulta(servidor.modulos, base, quien, "direccion.pendientes", ahora),
			},
			{},
		);
		const { cifras, pendientes: lista } = pendientes.resultado.parse(resultado);
		expect(cifras.find((cifra) => cifra.clave === "ventas")?.numero).toBe("—");
		expect(cifras.find((cifra) => cifra.clave === "cuentas")).toMatchObject({ numero: "—", contexto: [] });
		expect(
			lista
				.filter((uno) => uno.grupo === "autorizaciones")
				.every((uno) => uno.cifra === null || !uno.cifra.startsWith("$")),
		).toBe(true);
	});

	it("nunca manda sueldos, tarifas ni costos", async () => {
		const respuesta = await pedirConsulta(servidor, "direccion.pendientes", {}, "duena");
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/sueldo|tarifa|costo/i);
	});
});
