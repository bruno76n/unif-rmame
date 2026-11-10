/**
 * Prueba de `admin.escribir_bitacora`, del renglón de cada acción y de `admin.marcar_alerta_revisada`.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 3)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { contar, mandarAccion, nuevaClave } from "../../../nucleo/pruebas/llamadas.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("toda acción deja su renglón de bitácora; uno con un secreto falla; uno con sueldos guarda su descripción recortada; la misma consulta sensible se apunta una vez cada diez minutos; una alerta se vuelve aviso a la dueña", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Escribe un renglón con la interna, dentro de una acción de prueba. */
	function escribir(renglon: Record<string, unknown>, ahora?: Temporal.Instant): Promise<unknown> {
		return enAccionDePrueba(
			crearBase(servidor.base.app),
			servidor.modulos,
			(contexto) => contexto.interna("admin.escribir_bitacora", renglon),
			ahora === undefined ? {} : { ahora },
		);
	}

	it("una acción deja un renglón con quién, su comando, su módulo, su origen y su acción", async () => {
		const respuesta = await mandarAccion(servidor, "prueba.crear_nota", {
			datos: { texto: "con bitácora", monto_centavos: 1 },
		});
		const id = String((respuesta.cuerpo.resultado as { id: string }).id);
		const { rows } = await servidor.base.dueno.query(
			`SELECT b.tipo, b.usuario_id, b.sesion_id, b.modulo, b.origen, b.accion, b.descripcion, b.entidad, b.entidad_id,
			        b.comando_id = c.id AS del_comando
			 FROM bitacora b JOIN comandos_recibidos c ON c.id = b.comando_id WHERE b.entidad_id = $1`,
			[id],
		);
		expect(rows).toEqual([
			{
				tipo: "cambio",
				usuario_id: "01936f2e-0000-7000-8000-000000000002",
				sesion_id: "01936f2e-0000-7000-8000-000000000012",
				modulo: "prueba",
				origen: "fabrica",
				accion: "prueba.crear_nota",
				descripcion: "Creó la nota con bitácora",
				entidad: "prueba_notas",
				entidad_id: id,
				del_comando: true,
			},
		]);
	});

	it("una acción que no deja renglón, sin decir que su archivo lo permite, no se guarda", async () => {
		const antes = await contar(servidor, "prueba_notas");
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/prueba.crear_nota",
			headers: encabezadosDeLaWeb(),
			payload: {
				clave_idempotencia: nuevaClave(),
				datos: { texto: "sin renglón", monto_centavos: 1, fallar: "sin_bitacora" },
			},
		});
		expect(respuesta.statusCode).toBe(500);
		expect(await contar(servidor, "prueba_notas")).toBe(antes);
	});

	it("un renglón con un secreto en antes o despues falla como error del programa y no queda nada", async () => {
		const antes = await contar(servidor, "bitacora");
		await expect(
			escribir({ descripcion: "Cambió la llave", despues: { aparato: { llave_secreta: "x" } } }),
		).rejects.toThrow("secreto");
		expect(await contar(servidor, "bitacora")).toBe(antes);
	});

	it("un renglón con sueldos guarda su descripción completa y la recortada, marcado sensible", async () => {
		const { bitacora_id } = (await escribir({
			descripcion: {
				plantilla: "Cambió el sueldo de {persona}: {antes} → {nuevo}",
				valores: { persona: "Ana", antes: { sueldo: "$1,200" }, nuevo: { sueldo: "$1,350" } },
			},
			antes: { sueldo_centavos: 120_000 },
			despues: { sueldo_centavos: 135_000 },
		})) as { bitacora_id: string };
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion, descripcion_recortada, sensible_sueldos FROM bitacora WHERE id = $1",
			[bitacora_id],
		);
		expect(rows[0]).toEqual({
			descripcion: "Cambió el sueldo de Ana: $1,200 → $1,350",
			descripcion_recortada: "Cambió el sueldo de Ana: •••• → ••••",
			sensible_sueldos: true,
		});
	});

	it("la misma consulta sensible de la misma cuenta se apunta una vez cada 10 minutos; de otra cuenta, aparte", async () => {
		const creada = await mandarAccion(servidor, "prueba.crear_nota", {
			datos: { texto: "sensible", monto_centavos: 1 },
		});
		const id = String((creada.cuerpo.resultado as { id: string }).id);
		const consultar = (quien: string) =>
			servidor.app.inject({
				method: "GET",
				url: `/v1/consultas/prueba.ficha?id=${id}`,
				headers: encabezadosDeLaWeb(quien),
			});
		expect((await consultar("ventas")).statusCode).toBe(200);
		await consultar("ventas");
		await consultar("duena");
		const apuntadas = async () =>
			(
				await servidor.base.dueno.query(
					"SELECT usuario_id FROM bitacora WHERE tipo = 'consulta_sensible' AND entidad_id = $1 ORDER BY ocurrido_en",
					[id],
				)
			).rows.map((renglon) => renglon.usuario_id);
		expect(await apuntadas()).toEqual(["01936f2e-0000-7000-8000-000000000002", "01936f2e-0000-7000-8000-000000000001"]);
		// Pasados los 10 minutos, se vuelve a apuntar.
		await escribir(
			{ tipo: "consulta_sensible", descripcion: "Consultó otra vez", entidad: "prueba_notas", entidadId: id },
			Temporal.Now.instant().add({ minutes: 11 }),
		);
		expect(await apuntadas()).toHaveLength(3);
	});

	it("una alerta guarda alerta.registrada; la dueña la marca revisada una sola vez", async () => {
		const { bitacora_id } = (await escribir({
			tipo: "acceso",
			descripcion: "Intento de entrar sin acceso",
			esAlerta: true,
		})) as {
			bitacora_id: string;
		};
		const { rows } = await servidor.base.dueno.query("SELECT tipo, datos FROM eventos WHERE entidad_id = $1", [
			bitacora_id,
		]);
		expect(rows).toEqual([{ tipo: "alerta.registrada", datos: { bitacora_id } }]);
		const revisar = (id: string, quien = "duena") =>
			mandarAccion(servidor, "admin.marcar_alerta_revisada", { datos: { bitacora_id: id, nota: "Era yo" } }, quien);
		expect((await revisar(bitacora_id, "admin")).cuerpo).toMatchObject({ error: "sin_permiso", codigo: "solo_duena" });
		const revisada = await revisar(bitacora_id);
		expect(revisada.cuerpo.resultado).toMatchObject({ mensaje: "Alerta revisada" });
		expect((await revisar(bitacora_id)).cuerpo).toMatchObject({
			codigo: "ya_revisada",
			mensaje: "Esa alerta ya se revisó.",
		});
		const { rows: renglones } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'admin.marcar_alerta_revisada' AND entidad_id = $1",
			[bitacora_id],
		);
		expect(renglones).toEqual([{ descripcion: "Revisó la alerta: Intento de entrar sin acceso · Era yo" }]);
		const { bitacora_id: comun } = (await escribir({ descripcion: "Un cambio cualquiera" })) as { bitacora_id: string };
		expect((await revisar(comun)).cuerpo).toMatchObject({ codigo: "no_es_alerta" });
	});

	it("la app no puede cambiar ni borrar la bitácora, ni entrar directo a una partición", async () => {
		for (const sentencia of [
			"UPDATE bitacora SET descripcion = 'otra'",
			"DELETE FROM bitacora",
			`UPDATE bitacora_${Temporal.Now.plainDateISO("UTC").toString().slice(0, 7).replace("-", "_")} SET descripcion = 'otra'`,
		]) {
			await expect(servidor.base.app.query(sentencia)).rejects.toMatchObject({ code: "42501" });
		}
	});
});
