/**
 * Prueba de `admin.bitacora`: lo más reciente arriba con «Ver más», el buscador sin importar acentos ni mayúsculas,
 * los filtros con su conteo, las fechas, el aparato con su persona y el recorte de los sueldos sin su permiso.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»: sueldos y tarifas sin su permiso)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { escribirAlertaDePrueba } from "./de-prueba.ts";

/** Un renglón, como lo lee la prueba. */
interface RenglonLeido {
	id: string;
	tipo: string;
	es_alerta: boolean;
	revisada: boolean;
	quien: string;
	descripcion: string;
	folio: string | null;
}

/** Una página, como la lee la prueba. */
interface Pagina {
	renglones: RenglonLeido[];
	cursor: string | null;
	hay_mas: boolean;
	conteos: Record<string, number>;
}

describe("admin.bitacora: la bitácora para leer", () => {
	let servidor: ServidorDePrueba;
	/** Una palabra que solo llevan los renglones de esta prueba. */
	const marca = `Zapateria${Date.now()}`;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const escribir = (descripcion: string, extra: { tipo?: string; recortada?: string; tablet?: boolean } = {}) =>
			servidor.base.dueno.query(
				`INSERT INTO bitacora (id, tipo, modulo, origen, accion, descripcion, descripcion_recortada, sensible_sueldos,
					usuario_id, dispositivo_id, persona_id, entidad_folio)
				 VALUES ($1, $2, 'admin', 'fabrica', 'prueba.bitacora', $3, $4, $5, $6, $7, $8, 'PE-0150')`,
				[
					uuidv7(),
					extra.tipo ?? "cambio",
					descripcion,
					extra.recortada ?? null,
					extra.recortada !== undefined,
					extra.tablet === true ? null : "01936f2e-0000-7000-8000-000000000001",
					extra.tablet === true ? "01936f2e-0000-7000-8000-000000000021" : null,
					extra.tablet === true ? "01936f2e-0000-7000-8000-0000000000e1" : null,
				],
			);
		await escribir(`Cambió la ${marca} de Ánimo`);
		await escribir(`Consultó la ${marca}`, { tipo: "consulta_sensible" });
		await escribir(`Pagó a Ana $500 ${marca}`, { recortada: `Pagó a Ana •••• ${marca}` });
		await escribir(`Reportó bultos ${marca}`, { tablet: true });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la bitácora. */
	async function bitacora(parametros: Record<string, string>, quien = "admin"): Promise<Pagina> {
		const respuesta = await pedirConsulta(servidor, "admin.bitacora", parametros, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Pagina;
	}

	it("solo la piden las cuentas de Administración del sistema", async () => {
		expect((await pedirConsulta(servidor, "admin.bitacora", {}, "ventas")).estado).toBe(403);
	});

	it("el buscador no importa acentos ni mayúsculas; los conteos van con lo buscado", async () => {
		const leida = await bitacora({ buscar: `${marca.toLowerCase()} de animo` });
		expect(leida.renglones.map((renglon) => renglon.descripcion)).toEqual([`Cambió la ${marca} de Ánimo`]);
		const todos = await bitacora({ buscar: marca });
		expect(todos.conteos).toMatchObject({ todo: 4, cambio: 3, consulta_sensible: 1, acceso: 0, alertas: 0 });
		const sensibles = await bitacora({ buscar: marca, tipo: "consulta_sensible" });
		expect(sensibles.renglones).toHaveLength(1);
		// Por el nombre de quien lo hizo también.
		expect((await bitacora({ buscar: "Villasenor" })).renglones.length).toBeGreaterThan(0);
	});

	it("sin «ven sueldos y tarifas», lo que lleva sueldos sale recortado; con él, completo", async () => {
		const sinPermiso = await bitacora({ buscar: `pagó a ana` });
		expect(sinPermiso.renglones.map((renglon) => renglon.descripcion)).toContain(`Pagó a Ana •••• ${marca}`);
		expect(JSON.stringify(sinPermiso)).not.toContain("$500");
		const deLaDuena = await bitacora({ buscar: `pagó a ana` }, "duena");
		expect(deLaDuena.renglones.map((renglon) => renglon.descripcion)).toContain(`Pagó a Ana $500 ${marca}`);
	});

	it("un aparato sale con su persona; el folio viaja; lo más reciente arriba, con «Ver más»", async () => {
		const primera = await bitacora({ buscar: marca, limite: "2" });
		expect(primera.renglones[0]).toMatchObject({ quien: "Tablet del taller · Carmen Villaseñor", folio: "PE-0150" });
		expect(primera).toMatchObject({ hay_mas: true });
		const segunda = await bitacora({ buscar: marca, limite: "2", cursor: primera.cursor ?? "" });
		expect(segunda.renglones.map((renglon) => renglon.descripcion)).toEqual([
			`Consultó la ${marca}`,
			`Cambió la ${marca} de Ánimo`,
		]);
		expect(segunda.hay_mas).toBe(false);
	});

	it("las alertas: el filtro, y si ya se revisó; las fechas", async () => {
		const alerta = await escribirAlertaDePrueba(servidor, `${marca.toLowerCase()}@gmail.invalid`);
		const alertas = await bitacora({ buscar: marca, solo_alertas: "si" });
		expect(alertas.renglones).toEqual([expect.objectContaining({ id: alerta, es_alerta: true, revisada: false })]);
		expect(alertas.conteos.alertas).toBe(1);
		const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
		expect((await bitacora({ buscar: marca, desde: manana })).renglones).toEqual([]);
		expect((await bitacora({ buscar: marca, hasta: manana })).renglones.length).toBe(5);
	});
});
