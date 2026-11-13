/**
 * Prueba de `personal.tarifas` con los datos de la muestra: solo con «ven sueldos y tarifas» (sin él, ni las tarifas
 * ni la consulta), cada flujo con sus operaciones en orden, quién las hace, la tarifa vigente desde cuándo y su versión,
 * las que están «Sin tarifa», el historial con las anteriores, y su renglón en la bitácora como consulta sensible.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: … sueldos y tarifas sin su permiso» y «Las consultas sensibles
 * (… las tarifas) dejan su renglón en la bitácora»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { flujoSinTarifas, valorDe } from "./de-prueba.ts";

/** Una operación de un flujo, como la regresa la consulta. */
interface Operacion {
	flujo_operacion_id: string;
	nombre: string;
	la_hace: string;
	tarifa_centavos?: number | null;
	desde: string | null;
	version: number | null;
	anteriores: { tarifa_centavos?: number; desde: string; hasta: string }[];
}

/** Lo que se revisa de la respuesta. */
interface Tarifas {
	sin_tarifa: number;
	flujos: { flujo_id: string; nombre: string; operaciones: Operacion[] }[];
}

describe("Personal · Tarifas: solo con el permiso de sueldos, y su consulta queda en la bitácora", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como una cuenta. */
	async function tarifas(quien: string, parametros: Record<string, string> = {}) {
		return pedirConsulta(servidor, "personal.tarifas", parametros, quien);
	}

	/** Cuántos renglones «Consultó las tarifas del personal» hay de una cuenta. */
	async function renglonesDeBitacora(usuarioId: string): Promise<number> {
		return Number(
			await valorDe(
				servidor,
				`SELECT count(*) FROM bitacora WHERE descripcion = 'Consultó las tarifas del personal'
				AND entidad = 'tarifas_operacion' AND usuario_id = $1`,
				usuarioId,
			),
		);
	}

	it("sin «ven sueldos y tarifas» no sale (403 sin_permiso_fino), ni para otro departamento", async () => {
		expect((await tarifas("personal")).cuerpo).toMatchObject({ codigo: "sin_permiso_fino" });
		expect((await tarifas("produccion")).estado).toBe(403);
		expect((await tarifas("contaduria_sueldos")).estado).toBe(403);
	});

	it("con el permiso: cada flujo con sus operaciones en orden, quién la hace y su tarifa vigente; y queda en la bitácora", async () => {
		const antes = await renglonesDeBitacora("01936f2e-0000-7000-8000-00000000000b");
		const respuesta = await tarifas("personal_sueldos");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const { flujos, sin_tarifa } = respuesta.cuerpo.resultado as Tarifas;
		const polo = flujos.find((flujo) => flujo.nombre === "Playera polo");
		expect(polo?.operaciones.map((operacion) => operacion.nombre).slice(0, 3)).toEqual(["Corte", "Hombros", "Cuello"]);
		expect(polo?.operaciones[1]).toMatchObject({ la_hace: "Lupita Ramos", tarifa_centavos: 120, anteriores: [] });
		expect(polo?.operaciones[1]?.desde).toEqual(expect.any(String));
		expect(polo?.operaciones[1]?.version).toEqual(expect.any(Number));
		expect(sin_tarifa).toBe(0);
		expect(await renglonesDeBitacora("01936f2e-0000-7000-8000-00000000000b")).toBe(antes + 1);
		// La dueña siempre las ve.
		expect((await tarifas("duena")).estado).toBe(200);
	});

	it("una operación nueva sale «Sin tarifa» y se cuenta; al ponerle una y cambiarla, el historial trae la anterior", async () => {
		const flujo = await flujoSinTarifas(servidor, "Flujo de prueba de tarifas");
		const sinTarifa = (await tarifas("personal_sueldos")).cuerpo.resultado as Tarifas;
		expect(sinTarifa.sin_tarifa).toBe(flujo.operaciones.length);
		const nuevo = sinTarifa.flujos.find((uno) => uno.flujo_id === flujo.flujo_id);
		expect(nuevo?.operaciones[0]).toMatchObject({ tarifa_centavos: null, desde: null, version: null });
		const operacion = flujo.operaciones[0] ?? "";
		const primera = await mandarAccion(
			servidor,
			"personal.poner_tarifa_operacion",
			{ datos: { flujo_operacion_id: operacion, tarifa_centavos: 150 } },
			"personal_sueldos",
		);
		expect(primera.estado, JSON.stringify(primera.cuerpo)).toBe(200);
		const version = (primera.cuerpo.resultado as { version: number }).version;
		const segunda = await mandarAccion(
			servidor,
			"personal.poner_tarifa_operacion",
			{ datos: { flujo_operacion_id: operacion, tarifa_centavos: 180, version } },
			"personal_sueldos",
		);
		expect(segunda.estado, JSON.stringify(segunda.cuerpo)).toBe(200);
		const conHistorial = (await tarifas("personal_sueldos", { flujo_id: flujo.flujo_id, historial: "si" })).cuerpo
			.resultado as Tarifas;
		expect(conHistorial.flujos).toHaveLength(1);
		const cambiada = conHistorial.flujos[0]?.operaciones[0];
		expect(cambiada).toMatchObject({ tarifa_centavos: 180 });
		expect(cambiada?.anteriores).toHaveLength(1);
		expect(cambiada?.anteriores[0]).toMatchObject({ tarifa_centavos: 150 });
		// Sin el historial, no viajan las anteriores.
		const sinHistorial = (await tarifas("personal_sueldos", { flujo_id: flujo.flujo_id })).cuerpo.resultado as Tarifas;
		expect(sinHistorial.flujos[0]?.operaciones[0]?.anteriores).toEqual([]);
	});

	it("la cuenta de soporte no recibe ninguna tarifa, aunque la consulta le responda", async () => {
		const respuesta = await tarifas("soporte");
		if (respuesta.estado === 200) expect(JSON.stringify(respuesta.cuerpo.resultado)).not.toContain("tarifa_centavos");
		else expect(respuesta.estado).toBe(403);
	});
});
