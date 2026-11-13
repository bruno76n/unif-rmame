/**
 * Prueba de las consultas de Configuración: `admin.configuracion` (las tres secciones de parámetros en el orden de cada
 * módulo, los permisos finos con la dueña fija, las listas con las secciones del catálogo, la empresa, las impresoras y
 * los folios; un parámetro en pesos no le llega a soporte) y `admin.historial_parametro`.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Un parámetro, como lo lee la prueba. */
interface ParametroLeido {
	clave: string;
	tipo: string;
	valor: unknown;
	valor_centavos?: number | null;
	opciones: { valor: string; texto: string }[];
	por_decidir: boolean;
	version: number;
}

/** Lo que lee la prueba de Configuración. */
interface Configuracion {
	es_duena: boolean;
	decisiones: ParametroLeido[];
	parametros: ParametroLeido[];
	tecnicos: ParametroLeido[];
	permisos_finos: { nombre: string; es_duena: boolean; permisos: string[] }[];
	listas: { clave: string; nombre: string; valores: string[]; puede_agregar: boolean }[];
	ubicaciones: { nombre: string; responsable: string; que_es: string }[];
	empresa: { rfc: string } | null;
	impresoras: unknown[];
	folios: { nombre: string; folio: string }[];
	codigo_barras: string;
}

describe("Las consultas de Configuración", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lee Configuración como una cuenta. */
	async function configuracion(quien: string): Promise<Configuracion> {
		const respuesta = await pedirConsulta(servidor, "admin.configuracion", {}, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Configuracion;
	}

	it("solo la piden las cuentas de Administración del sistema", async () => {
		expect((await pedirConsulta(servidor, "admin.configuracion", {}, "ventas")).estado).toBe(403);
		expect(
			(await pedirConsulta(servidor, "admin.historial_parametro", { clave: "produccion.lote_atorado_dias" }, "ventas"))
				.estado,
		).toBe(403);
	});

	it("las tres secciones con todos los parámetros de cada módulo; las opciones para leer; los mínimos van aparte", async () => {
		const leida = await configuracion("admin");
		expect(leida.es_duena).toBe(false);
		const { rows } = await servidor.base.dueno.query(
			"SELECT seccion, count(*)::int AS cuantos FROM parametros WHERE ubicacion_id IS NULL GROUP BY seccion",
		);
		const cuantos = Object.fromEntries(rows.map((renglon) => [renglon.seccion, renglon.cuantos]));
		expect(leida.decisiones).toHaveLength(cuantos.decision_operacion);
		expect(leida.parametros).toHaveLength(cuantos.parametro);
		expect(leida.tecnicos).toHaveLength(cuantos.tecnico);
		const dia = leida.decisiones.find((parametro) => parametro.clave === "nomina.dia_pago");
		expect(dia).toMatchObject({ tipo: "opcion", valor: "martes" });
		expect(dia?.opciones).toContainEqual({ valor: "martes", texto: "Martes" });
		const paro = leida.decisiones.find((parametro) => parametro.clave === "mantenimiento.costo_hora_paro");
		expect(paro).toMatchObject({ tipo: "centavos", valor: null, valor_centavos: 45_000 });
	});

	it("un parámetro en pesos no le llega a la cuenta de soporte", async () => {
		const deSoporte = await configuracion("soporte");
		const paro = deSoporte.decisiones.find((parametro) => parametro.clave === "mantenimiento.costo_hora_paro");
		expect(paro).toBeDefined();
		expect(paro?.valor_centavos).toBeUndefined();
	});

	it("los permisos finos de cada cuenta, la dueña fija; las listas y las secciones; empresa, ubicaciones y folios", async () => {
		const leida = await configuracion("duena");
		expect(leida.es_duena).toBe(true);
		expect(leida.permisos_finos[0]).toMatchObject({ es_duena: true });
		const rosa = leida.permisos_finos.find((cuenta) => cuenta.nombre.startsWith("Rosa"));
		expect(rosa?.permisos).toEqual(["ven_sueldos_y_tarifas"]);
		expect(leida.permisos_finos.some((cuenta) => cuenta.nombre === "Soporte técnico")).toBe(false);
		const claves = leida.listas.map((lista) => lista.clave);
		expect(claves).toEqual(expect.arrayContaining(["categorias_gasto", "unidades_material", "secciones_catalogo"]));
		expect(leida.listas.every((lista) => lista.puede_agregar)).toBe(true);
		expect(leida.ubicaciones.map((ubicacion) => ubicacion.nombre)).toEqual(
			expect.arrayContaining(["Aduana", "Bodega", "Taller"]),
		);
		expect(leida.empresa?.rfc).toHaveLength(12);
		expect(leida.folios.map((folio) => folio.folio.slice(0, 3))).toEqual(["PE-", "NV-", "OC-", "G-0"]);
		expect(leida.codigo_barras).toMatch(/^\d{6} · fábrica 100001–499999$/);
		// Las demás cuentas no agregan a las listas que solo agrega la dueña.
		const deLaOficina = await configuracion("admin");
		expect(deLaOficina.listas.find((lista) => lista.clave === "secciones_catalogo")?.puede_agregar).toBe(false);
	});

	it("el historial de un parámetro: el valor inicial y cada cambio, el más nuevo arriba, con quién", async () => {
		const leida = await configuracion("duena");
		const atorado = leida.decisiones.find((parametro) => parametro.clave === "produccion.lote_atorado_dias");
		const cambio = await mandarAccion(
			servidor,
			"admin.cambiar_parametro",
			{ datos: { clave: "produccion.lote_atorado_dias", valor: 3 }, version: atorado?.version ?? 0 },
			"duena",
		);
		expect(cambio.estado, JSON.stringify(cambio.cuerpo)).toBe(200);
		const respuesta = await pedirConsulta(
			servidor,
			"admin.historial_parametro",
			{ clave: "produccion.lote_atorado_dias" },
			"admin",
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const historial = respuesta.cuerpo.resultado as { renglones: { valor: string; quien: string }[] };
		expect(historial.renglones[0]).toMatchObject({ valor: "3 días de trabajo", quien: "Carmen Villaseñor" });
		expect(historial.renglones.at(-1)).toMatchObject({ valor: "2 días de trabajo", quien: "Valor inicial" });
		expect((await pedirConsulta(servidor, "admin.historial_parametro", { clave: "no.existe" }, "admin")).estado).toBe(
			404,
		);
	});
});
