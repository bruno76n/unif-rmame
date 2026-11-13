/**
 * Prueba de `admin.pendientes` y de la pastilla de Administración del sistema: las altas por confirmar solo para la
 * dueña, los aparatos sin sincronizar, las alertas sin revisar (que salen al marcarlas revisadas) y la prueba de
 * restauración por probar; las cuatro cifras; y que solo la pide Administración del sistema.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver» y «El menú solo muestra los departamentos de la cuenta, cada
 * pastilla cuenta lo que dice su archivo…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	escribirAlertaDePrueba,
	pedirAltaDePrueba,
	registrarRespaldoDePrueba,
	registrarRestauracionDePrueba,
} from "./de-prueba.ts";

/** Un renglón de Pendientes, como lo lee la prueba. */
interface Renglon {
	tipo: string;
	grupo: string;
	titulo: string;
	detalle: string;
	tiempo: string | null;
	estado: { texto: string; color: string };
	accion: { tipo: string; texto: string; id: string | null };
}

/** Lo que lee la prueba de la consulta. */
interface Pendientes {
	cifras: Record<string, { numero: number | null; tono: string | null; contexto: { texto: string; tono: string }[] }>;
	renglones: Renglon[];
	conteos: Record<string, number>;
}

describe("admin.pendientes: lo que Administración del sistema tiene que hacer ya", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Pendientes como una cuenta. */
	async function pendientes(quien: string): Promise<Pendientes> {
		const respuesta = await pedirConsulta(servidor, "admin.pendientes", {}, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Pendientes;
	}

	/** La pastilla de Administración del sistema en el menú de una cuenta. */
	async function pastilla(quien: string) {
		const armazon = await pedirConsulta(servidor, "admin.armazon", {}, quien);
		const departamentos = (
			armazon.cuerpo.resultado as { departamentos: { clave: string; conteo: number | null; rojo: boolean }[] }
		).departamentos;
		return departamentos.find((departamento) => departamento.clave === "admin");
	}

	it("solo la pide Administración del sistema", async () => {
		expect((await pedirConsulta(servidor, "admin.pendientes", {}, "ventas")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "admin.pendientes", {}, "admin")).estado).toBe(200);
	});

	it("el alta por confirmar solo le sale a la dueña, con «Revisar», y cuenta en su pastilla y en la cifra de usuarios", async () => {
		const alta = await pedirAltaDePrueba(servidor, 0);
		const deLaDuena = await pendientes("duena");
		const suya = deLaDuena.renglones.find((renglon) => renglon.accion.id === alta.autorizacionId);
		expect(suya).toMatchObject({
			tipo: "alta_usuario",
			grupo: "usuarios",
			titulo: "Prueba admin",
			estado: { texto: "Por confirmar", color: "ambar" },
			accion: { tipo: "revisar", texto: "Revisar" },
		});
		expect(suya?.detalle).toContain(`Dar cuenta a ${alta.persona} con Calidad, para revisar lotes`);
		expect(deLaDuena.cifras.usuarios).toMatchObject({ tono: "ambar" });
		expect(deLaDuena.cifras.usuarios?.contexto[0]).toMatchObject({ tono: "ambar" });
		expect(deLaDuena.cifras.usuarios?.contexto[0]?.texto).toMatch(/^\d+ altas? por confirmar$/);
		// La oficina no la decide: no le sale.
		const deLaOficina = await pendientes("admin");
		expect(deLaOficina.renglones.some((renglon) => renglon.tipo === "alta_usuario")).toBe(false);
		const deLaDuenaEnMenu = await pastilla("duena");
		const deLaOficinaEnMenu = await pastilla("admin");
		expect((deLaDuenaEnMenu?.conteo ?? 0) - (deLaOficinaEnMenu?.conteo ?? 0)).toBeGreaterThanOrEqual(1);
	});

	it("un aparato sin sincronizar desde `admin.horas_sin_sincronizar_aviso` sale en rojo y lleva a su renglón", async () => {
		await servidor.base.dueno.query(
			`UPDATE dispositivos_sync SET ultima_sincronizacion_en = now() - interval '5 hours'
			 WHERE dispositivo_id = '01936f2e-0000-7000-8000-000000000021'`,
		);
		const leidos = await pendientes("admin");
		const tablet = leidos.renglones.find((renglon) => renglon.tipo === "dispositivo");
		expect(tablet).toMatchObject({
			grupo: "dispositivos",
			titulo: "Tablet del taller",
			tiempo: "hace 5 h",
			estado: { texto: "Sin sincronizar", color: "rojo" },
			accion: { tipo: "ver_dispositivo", texto: "Ver dispositivo", id: "01936f2e-0000-7000-8000-000000000021" },
		});
		expect(tablet?.detalle).toMatch(/ · sin sincronizar$/);
		expect(leidos.cifras.dispositivos).toMatchObject({
			tono: "rojo",
			contexto: [{ texto: "Tablet del taller sin sincronizar", tono: "rojo" }],
		});
		// El puente y la credencial no sincronizan: no cuentan como registrados de la lista, ni salen.
		expect(leidos.renglones.filter((renglon) => renglon.tipo === "dispositivo")).toHaveLength(1);
		await servidor.base.dueno.query(
			`UPDATE dispositivos_sync SET ultima_sincronizacion_en = now() WHERE dispositivo_id = '01936f2e-0000-7000-8000-000000000021'`,
		);
		expect((await pendientes("admin")).cifras.dispositivos?.contexto).toEqual([
			{ texto: "Todos sincronizan", tono: "normal" },
		]);
	});

	it("una alerta sin revisar sale en rojo, pone roja la pastilla, y al marcarla revisada ya no sale", async () => {
		const correo = "intruso@gmail.invalid";
		const alerta = await escribirAlertaDePrueba(servidor, correo);
		const deLaDuena = await pendientes("duena");
		const suya = deLaDuena.renglones.find((renglon) => renglon.accion.id === alerta);
		expect(suya).toMatchObject({
			tipo: "alerta",
			grupo: "seguridad",
			titulo: `Intentó entrar una cuenta de Google sin acceso: ${correo}`,
			detalle: "—",
			estado: { texto: "Por revisar", color: "rojo" },
			accion: { tipo: "marcar_revisada", texto: "Marcar revisada" },
		});
		// Las demás cuentas la ven y van a la bitácora.
		const deLaOficina = await pendientes("admin");
		expect(deLaOficina.renglones.find((renglon) => renglon.tipo === "alerta")?.accion).toMatchObject({
			tipo: "ver_bitacora",
			texto: "Ver bitácora",
		});
		expect(deLaOficina.cifras.bitacora?.contexto.some((linea) => linea.tono === "rojo")).toBe(true);
		expect((await pastilla("admin"))?.rojo).toBe(true);
		const revisada = await mandarAccion(
			servidor,
			"admin.marcar_alerta_revisada",
			{ datos: { bitacora_id: alerta } },
			"duena",
		);
		expect(revisada.estado, JSON.stringify(revisada.cuerpo)).toBe(200);
		expect((await pendientes("duena")).renglones.some((renglon) => renglon.accion.id === alerta)).toBe(false);
	});

	it("la prueba de restauración por probar sale en ámbar desde `admin.restauracion_aviso_dias`", async () => {
		const respaldo = await registrarRespaldoDePrueba(servidor, 3);
		await registrarRestauracionDePrueba(servidor, respaldo, 85);
		const leidos = await pendientes("admin");
		expect(leidos.renglones.find((renglon) => renglon.tipo === "respaldo")).toMatchObject({
			grupo: "seguridad",
			titulo: "Prueba de restauración",
			detalle: "Última prueba hace 85 días",
			estado: { texto: "Por probar", color: "ambar" },
			accion: { tipo: "ver_respaldos", texto: "Ver respaldos" },
		});
		expect(leidos.cifras.respaldos).toMatchObject({ numero: 85, tono: "ambar" });
		expect(leidos.cifras.respaldos?.contexto[0]?.texto).toMatch(/^Respaldo semanal: \d+ \w+$/);
		// Una prueba reciente que cuadró la quita.
		await registrarRestauracionDePrueba(servidor, respaldo, 2);
		const despues = await pendientes("admin");
		expect(despues.renglones.some((renglon) => renglon.tipo === "respaldo")).toBe(false);
		expect(despues.cifras.respaldos).toMatchObject({ numero: 2, tono: null });
		expect(despues.conteos.todos).toBe(despues.renglones.length);
	});
});
