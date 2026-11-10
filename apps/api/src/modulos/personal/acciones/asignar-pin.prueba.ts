/**
 * Prueba del PIN del taller: se muestra una sola vez, en la base solo queda su hash Argon2id, el reintento no
 * lo trae, nunca va en la bitácora ni en los eventos; restablecer y desbloquear; y anular al dar de baja o
 * salir del Taller.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 3)
 */

import { argon2 } from "node:crypto";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, nuevaClave } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Argon2id con promesa, para revisar el hash como lo revisa la tablet. */
const argon2EnPromesa = promisify(argon2);

describe("el PIN del taller se entrega una sola vez y solo queda su hash Argon2id", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Asigna el PIN con Personal. */
	function asignar(personaId: string, clave = nuevaClave()) {
		return mandarAccion(servidor, "personal.asignar_pin", { clave, datos: { persona_id: personaId } }, "personal");
	}

	/** Los PIN de una persona, del más viejo al más nuevo. */
	async function pinesDe(personaId: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, pin_hash, estado, motivo_anulacion, version::int AS version FROM pines WHERE persona_id = $1 ORDER BY creado_en, id",
			[personaId],
		);
		return rows;
	}

	/** La versión de una persona. */
	async function versionDePersona(id: string): Promise<number> {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS version FROM personas WHERE id = $1", [
			id,
		]);
		return Number(rows[0]?.version);
	}

	/**
	 * Revisa el PIN contra su hash PHC con la sal y los parámetros que trae, como la tablet.
	 * @returns Si el PIN es el del hash.
	 */
	async function hashEsDe(hash: string, pin: string): Promise<boolean> {
		const [, algoritmo, , parametros, sal, esperado] = hash.split("$");
		const valores = Object.fromEntries((parametros ?? "").split(",").map((par) => par.split("=")));
		const calculado = await argon2EnPromesa(algoritmo === "argon2id" ? "argon2id" : "argon2i", {
			message: pin,
			nonce: Buffer.from(sal ?? "", "base64"),
			memory: Number(valores.m),
			passes: Number(valores.t),
			parallelism: Number(valores.p),
			tagLength: 32,
		});
		return calculado.toString("base64").replace(/=+$/, "") === esperado;
	}

	/** Todo lo que guardó el sistema sobre la persona y sus PIN, como texto. */
	async function loQueQuedoEscrito(personaId: string): Promise<string> {
		const { rows } = await servidor.base.dueno.query(
			`SELECT (SELECT coalesce(json_agg(b), '[]') FROM bitacora b WHERE b.entidad_id = $1)::text AS bitacora,
				(SELECT coalesce(json_agg(e), '[]') FROM eventos e WHERE e.datos->>'persona_id' = $1::text)::text AS eventos,
				(SELECT coalesce(json_agg(c), '[]') FROM comandos_recibidos c
					WHERE c.entidad_id IN (SELECT p.id FROM pines p WHERE p.persona_id = $1))::text AS comandos`,
			[personaId],
		);
		return JSON.stringify(rows[0]);
	}

	it("asigna un PIN de 4 cifras que se muestra una vez; en la base solo su hash; el reintento no lo trae", async () => {
		const id = await nuevaPersona(servidor.base.dueno, "taller");
		const clave = nuevaClave();
		const primera = await asignar(id, clave);
		expect(primera.estado).toBe(200);
		const resultado = primera.cuerpo.resultado as { pin_id: string; pin: string; mensaje: string };
		expect(resultado.pin).toMatch(/^\d{4}$/);
		expect(resultado.mensaje).toBe("Se muestra una sola vez: dáselo en persona.");
		const [pin] = await pinesDe(id);
		expect(pin).toMatchObject({ id: resultado.pin_id, estado: "activo" });
		expect(pin.pin_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
		expect(await hashEsDe(pin.pin_hash, resultado.pin)).toBe(true);
		expect(await hashEsDe(pin.pin_hash, resultado.pin === "0000" ? "0001" : "0000")).toBe(false);
		const reintento = await asignar(id, clave);
		expect(reintento.estado).toBe(200);
		expect(reintento.cuerpo.resultado).toEqual({ pin_id: resultado.pin_id, mensaje: resultado.mensaje });
		const escrito = await loQueQuedoEscrito(id);
		expect(escrito).toContain("Asignó el PIN del taller de Persona de prueba");
		expect(escrito).toContain("Se muestra una sola vez");
		expect(escrito).not.toContain(pin.pin_hash);
		// Ni el PIN (en ningún campo `pin`) ni su hash quedan en la bitácora, los eventos o las respuestas guardadas.
		expect(escrito).not.toContain('\\"pin\\"');
		const otra = await asignar(id);
		expect(otra.cuerpo).toMatchObject({ codigo: "ya_tiene_pin" });
	});

	it("solo para personas activas del Taller sin cuenta: pin_no_aplica", async () => {
		const oficina = await nuevaPersona(servidor.base.dueno, "oficina");
		expect((await asignar(oficina)).cuerpo).toMatchObject({ codigo: "pin_no_aplica" });
		const conCuenta = await nuevaPersona(servidor.base.dueno, "taller");
		await servidor.base.dueno.query(
			"INSERT INTO usuarios (id, persona_id, correo, nombre, estado) VALUES (gen_random_uuid(), $1, $2, 'Con cuenta', 'activa')",
			[conCuenta, `taller-${conCuenta.slice(-8)}@ejemplo.mx`],
		);
		expect((await asignar(conCuenta)).cuerpo).toMatchObject({ codigo: "pin_no_aplica" });
		const deBaja = await nuevaPersona(servidor.base.dueno, "taller");
		await servidor.base.dueno.query("UPDATE personas SET baja_en = now(), motivo_baja = 'Renunció' WHERE id = $1", [
			deBaja,
		]);
		expect((await asignar(deBaja)).cuerpo).toMatchObject({ codigo: "pin_no_aplica" });
		expect(await pinesDe(oficina)).toEqual([]);
	});

	it("restablecer da uno nuevo y anula el anterior; desbloquear solo a quien está bloqueada", async () => {
		const id = await nuevaPersona(servidor.base.dueno, "taller");
		const sinPin = await mandarAccion(
			servidor,
			"personal.restablecer_pin",
			{ datos: { persona_id: id }, version: 0 },
			"personal",
		);
		expect(sinPin.cuerpo).toMatchObject({ codigo: "sin_pin" });
		await asignar(id);
		const [anterior] = await pinesDe(id);
		const nuevo = await mandarAccion(
			servidor,
			"personal.restablecer_pin",
			{ datos: { persona_id: id }, version: anterior.version },
			"personal",
		);
		expect(nuevo.cuerpo).toMatchObject({
			resultado: { pin: expect.stringMatching(/^\d{4}$/), mensaje: "El anterior ya no entra." },
		});
		const [viejo, vigente] = await pinesDe(id);
		expect(viejo).toMatchObject({ id: anterior.id, estado: "anulado", motivo_anulacion: "restablecido" });
		expect(vigente).toMatchObject({ estado: "activo" });
		const noBloqueada = await mandarAccion(
			servidor,
			"personal.desbloquear_pin",
			{ datos: { persona_id: id }, version: vigente.version },
			"personal",
		);
		expect(noBloqueada.cuerpo).toMatchObject({ codigo: "no_esta_bloqueado" });
		await servidor.base.dueno.query(
			"UPDATE pines SET estado = 'bloqueado', bloqueado_en = now(), intentos_fallidos = 5 WHERE id = $1",
			[vigente.id],
		);
		const [bloqueado] = (await pinesDe(id)).slice(-1);
		const desbloqueo = await mandarAccion(
			servidor,
			"personal.desbloquear_pin",
			{ datos: { persona_id: id }, version: bloqueado.version },
			"personal",
		);
		expect(desbloqueo.cuerpo).toMatchObject({ resultado: { mensaje: "Persona de prueba ya puede entrar con su PIN" } });
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, intentos_fallidos, desbloqueado_en IS NOT NULL AS desbloqueado FROM pines WHERE id = $1",
			[vigente.id],
		);
		expect(rows[0]).toEqual({ estado: "activo", intentos_fallidos: 0, desbloqueado: true });
	});

	it("sin el departamento Personal no se asigna", async () => {
		const id = await nuevaPersona(servidor.base.dueno, "taller");
		const respuesta = await mandarAccion(servidor, "personal.asignar_pin", { datos: { persona_id: id } }, "ventas");
		expect(respuesta.estado).toBe(403);
		expect(await pinesDe(id)).toEqual([]);
	});

	it("dar de baja y salir del Taller anulan el PIN vivo; «Entra al sistema» dice «PIN del taller» o «Sin PIN»", async () => {
		const baja = await nuevaPersona(servidor.base.dueno, "taller");
		await asignar(baja);
		const respuesta = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: baja, motivo: "Renunció" }, version: await versionDePersona(baja) },
			"personal",
		);
		expect(respuesta.cuerpo).toMatchObject({
			resultado: { mensaje: "Persona de prueba dada de baja. Su PIN ya no entra" },
		});
		expect(await pinesDe(baja)).toEqual([
			expect.objectContaining({ estado: "anulado", motivo_anulacion: "baja_persona" }),
		]);

		const cambia = await nuevaPersona(servidor.base.dueno, "taller");
		await asignar(cambia);
		const ficha = await servidor.app.inject({
			method: "GET",
			url: `/v1/consultas/personal.persona?persona_id=${cambia}`,
			headers: encabezadosDeLaWeb("personal"),
		});
		expect(ficha.json()).toMatchObject({ resultado: { entra_al_sistema: "PIN del taller" } });
		const editada = await mandarAccion(
			servidor,
			"personal.editar_persona",
			{
				datos: {
					persona_id: cambia,
					nombre: "Persona de prueba",
					area: "oficina",
					puesto: "Prueba",
					forma_pago: "tiempo",
					fecha_ingreso: "2020-01-06",
				},
				version: await versionDePersona(cambia),
			},
			"personal",
		);
		expect(editada.cuerpo).toMatchObject({
			resultado: { mensaje: "Persona de prueba actualizada. Su PIN ya no entra" },
		});
		expect(await pinesDe(cambia)).toEqual([
			expect.objectContaining({ estado: "anulado", motivo_anulacion: "cambio_area" }),
		]);
	});
});
