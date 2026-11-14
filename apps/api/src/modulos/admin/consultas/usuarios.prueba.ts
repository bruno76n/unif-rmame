/**
 * Prueba de las consultas de las cuentas: `admin.usuarios` (las cuentas con sus sesiones, su última entrada y sus
 * departamentos, soporte aparte y las altas pendientes), `admin.cuenta_nueva` (solo personas sin cuenta y que no son
 * de tienda; sin la Puerta del taller), `admin.alta_usuario` (solo la dueña) y `admin.pantalla_acceso`.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedirAltaDePrueba } from "./de-prueba.ts";

/** Una cuenta de Usuarios y accesos, como la lee la prueba. */
interface CuentaLeida {
	usuario_id: string;
	nombre: string;
	es_duena: boolean;
	ubicacion: string;
	ultima_entrada: string;
	sesiones_abiertas: number;
	puede_cerrar_sesiones: boolean;
	departamentos: string[];
}

describe("Las consultas de las cuentas en Administración del sistema", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lee Usuarios y accesos como una cuenta. */
	async function usuarios(quien: string) {
		const respuesta = await pedirConsulta(servidor, "admin.usuarios", {}, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as {
			puede: Record<string, boolean>;
			cuentas: CuentaLeida[];
			soporte: { nombre: string } | null;
			altas_pendientes: { autorizacion_id: string; texto: string }[];
			departamentos: { clave: string; grupo: string | null }[];
		};
	}

	it("solo las piden las cuentas de Administración del sistema; el cajón Alta de usuario, solo la dueña", async () => {
		for (const consulta of ["admin.usuarios", "admin.cuenta_nueva", "admin.pantalla_acceso"]) {
			expect((await pedirConsulta(servidor, consulta, {}, "ventas")).estado, consulta).toBe(403);
		}
		const alta = await pedirAltaDePrueba(servidor, 0);
		const parametros = { autorizacion_id: alta.autorizacionId };
		expect((await pedirConsulta(servidor, "admin.alta_usuario", parametros, "admin")).estado).toBe(403);
		const deLaDuena = await pedirConsulta(servidor, "admin.alta_usuario", parametros, "duena");
		expect(deLaDuena.estado, JSON.stringify(deLaDuena.cuerpo)).toBe(200);
		expect(deLaDuena.cuerpo.resultado).toMatchObject({
			folio: alta.folio,
			por_autorizar: true,
			pidio: "Prueba admin",
			persona: alta.persona,
			correo: alta.correo,
			departamentos: "Calidad",
			para_que: `Dar cuenta a ${alta.persona} con Calidad, para revisar lotes`,
		});
		expect((deLaDuena.cuerpo.resultado as { liga: string }).liga).toMatch(
			new RegExp(`^Se liga a E-\\d+ · ${alta.persona}, .+\\.$`),
		);
		// Las altas pendientes salen en Usuarios y accesos, para todas las cuentas.
		const leidos = await usuarios("admin");
		expect(leidos.altas_pendientes).toContainEqual({
			autorizacion_id: alta.autorizacionId,
			texto: `Prueba admin pidió: Dar cuenta a ${alta.persona} con Calidad, para revisar lotes.`,
		});
	});

	it("Usuarios y accesos: la dueña primero, «Todas»; soporte aparte; las sesiones de la dueña solo las cierra ella; solo ella cambia accesos", async () => {
		await servidor.base.dueno.query(
			`UPDATE sesiones SET cerrada_en = now(), motivo_cierre = 'salio' WHERE token_hash = 'sesion-de-prueba-calidad'`,
		);
		const deLaOficina = await usuarios("admin");
		// Solo la dueña cambia accesos: la consulta dice qué botones lleva cada quien.
		expect(deLaOficina.puede).toEqual({
			crear_cuenta: false,
			revisar_altas: false,
			quitar_acceso: false,
			cambiar_departamentos: false,
		});
		const [primera] = deLaOficina.cuentas;
		expect(primera).toMatchObject({ es_duena: true, ubicacion: "Todas", puede_cerrar_sesiones: false });
		expect(deLaOficina.cuentas.some((cuenta) => cuenta.nombre === "Soporte técnico")).toBe(false);
		expect(deLaOficina.soporte?.nombre).toBe("Soporte técnico");
		const rosa = deLaOficina.cuentas.find((cuenta) => cuenta.usuario_id === "01936f2e-0000-7000-8000-000000000006");
		expect(rosa).toMatchObject({ ubicacion: "Oficina", puede_cerrar_sesiones: true });
		expect(rosa?.departamentos).toContain("contaduria");
		const aduana = deLaOficina.cuentas.find((cuenta) => cuenta.usuario_id === "01936f2e-0000-7000-8000-000000000003");
		expect(aduana).toMatchObject({ ubicacion: "Aduana y bodega", sesiones_abiertas: 1 });
		expect(aduana?.ultima_entrada).toMatch(/^hoy \d{1,2}:\d{2}$/);
		const calidad = deLaOficina.cuentas.find((cuenta) => cuenta.usuario_id === "01936f2e-0000-7000-8000-000000000060");
		expect(calidad?.sesiones_abiertas).toBe(0);
		// La matriz no lleva la Puerta del taller, y va en el orden del menú.
		expect(deLaOficina.departamentos.map((departamento) => departamento.clave)).not.toContain("puerta_taller");
		expect(deLaOficina.departamentos[0]).toEqual({ clave: "direccion", nombre: "Dirección", grupo: null });
		// La dueña sí cierra las suyas.
		const deLaDuena = await usuarios("duena");
		expect(deLaDuena.puede).toEqual({
			crear_cuenta: true,
			revisar_altas: true,
			quitar_acceso: true,
			cambiar_departamentos: true,
		});
		expect(deLaDuena.cuentas[0]?.puede_cerrar_sesiones).toBe(true);
	});

	it("Cuenta nueva: solo personas activas sin cuenta que no son de tienda, y sin la Puerta del taller", async () => {
		const respuesta = await pedirConsulta(servidor, "admin.cuenta_nueva", {}, "admin");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const { personas, departamentos, puede_crear_cuenta } = respuesta.cuerpo.resultado as {
			puede_crear_cuenta: boolean;
			personas: { persona_id: string; texto: string }[];
			departamentos: { clave: string }[];
		};
		expect(puede_crear_cuenta).toBe(false);
		const deLaDuena = await pedirConsulta(servidor, "admin.cuenta_nueva", {}, "duena");
		expect((deLaDuena.cuerpo.resultado as { puede_crear_cuenta: boolean }).puede_crear_cuenta).toBe(true);
		expect(departamentos.map((departamento) => departamento.clave)).not.toContain("puerta_taller");
		expect(departamentos).toHaveLength(14);
		const { rows } = await servidor.base.dueno.query(
			`SELECT p.id, p.area, p.baja_en IS NOT NULL AS baja,
			        EXISTS (SELECT 1 FROM usuarios u WHERE u.persona_id = p.id AND u.estado IN ('solicitada', 'activa')) AS con_cuenta
			 FROM personas p`,
		);
		const ofrecidas = new Set(personas.map((persona) => persona.persona_id));
		for (const persona of rows) {
			const puede = persona.area !== "tienda" && !persona.baja && !persona.con_cuenta;
			expect(ofrecidas.has(String(persona.id)), JSON.stringify(persona)).toBe(puede);
		}
		expect(personas[0]?.texto).toMatch(/^E-\d+ · .+ · .+$/);
	});

	it("Pantalla de acceso: la marca, los minutos sin actividad del saludo y las cuentas con acceso", async () => {
		const respuesta = await pedirConsulta(servidor, "admin.pantalla_acceso", {}, "duena");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const leido = respuesta.cuerpo.resultado as {
			marca: string;
			inactividad_min: number;
			cuentas: { correo: string }[];
		};
		const { rows } = await servidor.base.dueno.query("SELECT nombre_comercial FROM empresa");
		expect(leido.marca).toBe(rows[0]?.nombre_comercial);
		expect(leido.inactividad_min).toBeGreaterThan(0);
		expect(leido.cuentas.map((cuenta) => cuenta.correo)).toContain("carmen@uniformesalameda.mx");
	});
});
