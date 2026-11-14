/**
 * Prueba de `admin.respaldos`: sin datos, «Sin dato del proveedor» y nada que mostrar; con un respaldo y sus pruebas,
 * el último respaldo, la última prueba que cuadró con cuándo toca la siguiente, y el historial con su evidencia.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { registrarRespaldoDePrueba, registrarRestauracionDePrueba } from "./de-prueba.ts";

describe("admin.respaldos: los respaldos y sus pruebas de restauración", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("solo la piden las cuentas de Administración del sistema; sin datos, no hay nada que mostrar", async () => {
		expect((await pedirConsulta(servidor, "admin.respaldos", {}, "ventas")).estado).toBe(403);
		const respuesta = await pedirConsulta(servidor, "admin.respaldos", {}, "admin");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			puede_registrar_restauracion: false,
			recuperacion_dias: null,
			semanal: null,
			ultima_prueba: null,
			pruebas: [],
			respaldos_correctos: [],
		});
	});

	it("el último respaldo, la última prueba que cuadró en ámbar desde el aviso, y el historial", async () => {
		const respaldo = await registrarRespaldoDePrueba(servidor, 2);
		const buena = await registrarRestauracionDePrueba(servidor, respaldo, 85);
		await registrarRestauracionDePrueba(servidor, respaldo, 1, false);
		const respuesta = await pedirConsulta(servidor, "admin.respaldos", {}, "duena");
		const leido = respuesta.cuerpo.resultado as {
			puede_registrar_restauracion: boolean;
			semanal: { correcto: boolean; tamano: string };
			ultima_prueba: { texto: string; tono: string; siguiente: string };
			cada_dias: number;
			pruebas: { restauracion_id: string; cuadro: boolean; evidencia: string; que: string }[];
			respaldos_correctos: { respaldo_id: string }[];
		};
		expect(leido.puede_registrar_restauracion).toBe(true);
		expect(leido.semanal).toMatchObject({ correcto: true, tamano: "1.8 GB" });
		// La que no cuadró no cuenta como última prueba buena.
		expect(leido.ultima_prueba.texto).toMatch(/ · hace 85 días$/);
		expect(leido.ultima_prueba.tono).toBe("ambar");
		expect(leido.ultima_prueba.siguiente).toMatch(
			new RegExp(
				`^Se prueba cada ${leido.cada_dias} días en el ambiente de pruebas · la siguiente toca a más tardar el \\d+ \\w+$`,
			),
		);
		expect(leido.pruebas).toHaveLength(2);
		expect(leido.pruebas[0]).toMatchObject({ cuadro: false, evidencia: "conteos.pdf" });
		expect(leido.pruebas[1]).toMatchObject({ restauracion_id: buena, cuadro: true });
		expect(leido.pruebas[1]?.que).toMatch(/^Respaldo semanal del \d+ \w+$/);
		expect(leido.respaldos_correctos.map((uno) => uno.respaldo_id)).toEqual([respaldo]);
	});
});
