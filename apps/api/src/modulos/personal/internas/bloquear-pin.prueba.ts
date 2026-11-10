/**
 * Prueba de las internas del PIN y de lo que baja a la tablet: el bloqueo que llega de la tablet avisa a
 * Personal, un bloqueo tardío no vuelve a bloquear, anular los PIN del Taller deja a todos «Sin PIN», y la
 * tablet baja la persona con sus iniciales y su PIN, y la quita al anularse.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 3)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { bajarHasta, fotoCompleta } from "../../../nucleo/pruebas/bajada-de-prueba.ts";
import { quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { procesarEventos, repartirConLosModulos } from "../../../nucleo/trabajos/procesar-eventos.ts";

describe("el bloqueo de la tablet avisa a Personal y uno tardío no vuelve a bloquear; la tablet baja las personas con PIN", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una persona del Taller con su PIN recién asignado. */
	async function conPin(nombre = "Persona de prueba"): Promise<{ personaId: string; pinId: string }> {
		const personaId = await nuevaPersona(servidor.base.dueno, "taller");
		await servidor.base.dueno.query("UPDATE personas SET nombre = $2 WHERE id = $1", [personaId, nombre]);
		const asignado = await mandarAccion(
			servidor,
			"personal.asignar_pin",
			{ datos: { persona_id: personaId } },
			"personal",
		);
		const { pin_id } = asignado.cuerpo.resultado as { pin_id: string };
		return { personaId, pinId: pin_id };
	}

	/** Llama una interna de `personal` dentro de una acción de prueba. */
	function interna(nombre: string, datos: Record<string, unknown>) {
		return enAccionDePrueba(
			crearBase(servidor.base.app),
			servidor.modulos,
			(contexto) => contexto.interna(nombre, datos),
			{ guardarEventos: true },
		);
	}

	/** El id de la tablet de prueba. */
	const tabletId = quienesDePrueba.tablet?.tipo === "aparato" ? quienesDePrueba.tablet.dispositivoId : "";

	/** El PIN como está en la base. */
	async function pin(id: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, intentos_fallidos, motivo_anulacion FROM pines WHERE id = $1",
			[id],
		);
		return rows[0];
	}

	it("el bloqueo que llega de la tablet bloquea el PIN y avisa a Personal", async () => {
		const { personaId, pinId } = await conPin("Lupita Bloqueo");
		const resultado = await interna("personal.bloquear_pin", {
			pin_id: pinId,
			persona_id: personaId,
			intentos: 5,
			ocurrido_en: Temporal.Now.instant().toString(),
			dispositivo_id: tabletId,
		});
		expect(resultado).toEqual({ estado: "bloqueado" });
		expect(await pin(pinId)).toEqual({ estado: "bloqueado", intentos_fallidos: 5, motivo_anulacion: null });
		await procesarEventos({
			base: crearBase(servidor.base.app),
			repartir: repartirConLosModulos(servidor.modulos, () => Temporal.Now.instant()),
			avisarFalla: async () => undefined,
			ahora: () => Temporal.Now.instant(),
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT DISTINCT texto, enlace FROM avisos WHERE tipo = 'pin_bloqueado' AND entidad_id = $1",
			[pinId],
		);
		expect(rows).toEqual([
			{ texto: "Lupita Bloqueo se bloqueó en la tablet por 5 PIN equivocados", enlace: "personal/pin" },
		]);
	});

	it("el resumen del PIN cuenta los activos, lista los bloqueados y a quien le falta, sin el hash", async () => {
		const { personaId, pinId } = await conPin("Rosa Resumen");
		const falta = await nuevaPersona(servidor.base.dueno, "taller");
		await interna("personal.bloquear_pin", {
			pin_id: pinId,
			persona_id: personaId,
			intentos: 5,
			ocurrido_en: Temporal.Now.instant().toString(),
			dispositivo_id: tabletId,
		});
		const resumen = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura("personal.resumen_pin", {}),
		);
		expect(resumen).toMatchObject({
			personas_activas: expect.any(Number),
			pines_activos: expect.any(Number),
			bloqueados: expect.arrayContaining([{ persona_id: personaId, nombre: "Rosa Resumen", desde: expect.anything() }]),
			sin_pin: expect.arrayContaining([{ persona_id: falta, nombre: "Persona de prueba", puesto: "Prueba" }]),
		});
		const { sin_pin } = resumen as { sin_pin: { persona_id: string }[] };
		expect(sin_pin.some((persona) => persona.persona_id === personaId)).toBe(false);
		expect(JSON.stringify(resumen)).not.toContain("argon2id");
	});

	it("un bloqueo que pasó antes de que Personal desbloqueara no vuelve a bloquear; uno anulado tampoco", async () => {
		const { personaId, pinId } = await conPin();
		const antes = Temporal.Now.instant().subtract({ minutes: 5 }).toString();
		await servidor.base.dueno.query("UPDATE pines SET desbloqueado_en = now() WHERE id = $1", [pinId]);
		const tardio = await interna("personal.bloquear_pin", {
			pin_id: pinId,
			persona_id: personaId,
			intentos: 5,
			ocurrido_en: antes,
			dispositivo_id: tabletId,
		});
		expect(tardio).toEqual({ estado: "activo" });
		expect(await pin(pinId)).toMatchObject({ estado: "activo", intentos_fallidos: 0 });
		await interna("personal.anular_pin", { persona_id: personaId, motivo: "cuenta_google" });
		const anulado = await interna("personal.bloquear_pin", {
			pin_id: pinId,
			persona_id: personaId,
			intentos: 5,
			ocurrido_en: Temporal.Now.instant().toString(),
			dispositivo_id: tabletId,
		});
		expect(anulado).toEqual({ estado: "anulado" });
		expect(await pin(pinId)).toEqual({ estado: "anulado", intentos_fallidos: 0, motivo_anulacion: "cuenta_google" });
	});

	it("la tablet baja la persona con su nombre e iniciales y su PIN; al anularse, la quita y baja el PIN anulado", async () => {
		const { personaId, pinId } = await conPin("Guadalupe Ramos Díaz");
		const { cambios, cursor } = await fotoCompleta(servidor);
		const persona = cambios.find((cambio) => cambio.id === personaId);
		expect(persona).toEqual({
			tabla: "personas",
			op: "cambio",
			id: personaId,
			datos: { nombre: "Guadalupe Ramos Díaz", iniciales: "GD" },
		});
		const suPin = cambios.find((cambio) => cambio.id === pinId);
		expect(suPin?.datos).toMatchObject({ persona_id: personaId, estado: "activo", intentos_fallidos: 0 });
		expect(String(suPin?.datos?.pin_hash)).toMatch(/^\$argon2id\$/);
		expect(Object.keys(suPin?.datos ?? {}).sort()).toEqual(
			["desbloqueado_en", "estado", "intentos_fallidos", "persona_id", "pin_hash"].sort(),
		);
		// Las personas, antes que sus PIN.
		const tablas = cambios.map((cambio) => cambio.tabla);
		expect(tablas.lastIndexOf("personas")).toBeLessThan(tablas.indexOf("pines"));
		// Nadie sin PIN vivo baja.
		const sinPin = await nuevaPersona(servidor.base.dueno, "taller");
		expect(cambios.some((cambio) => cambio.id === sinPin)).toBe(false);

		await interna("personal.anular_pines_ubicacion", {
			ubicacion_id: (await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE tipo = 'taller'")).rows[0]?.id,
		});
		const despues = await bajarHasta(servidor, cursor, [personaId, pinId], (bajados) =>
			bajados.some((cambio) => cambio.id === personaId && cambio.op === "quitar"),
		);
		expect(despues.cambios.filter((cambio) => cambio.id === personaId).at(-1)).toMatchObject({ op: "quitar" });
		expect(despues.cambios.filter((cambio) => cambio.id === pinId).at(-1)).toMatchObject({
			op: "cambio",
			datos: { estado: "anulado" },
		});
		expect(await pin(pinId)).toMatchObject({ estado: "anulado", motivo_anulacion: "restablecido" });
	});
});
