/**
 * Prueba de `admin.crear_cuenta`.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 3)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codigoDePostgres } from "../../../nucleo/base/transacciones.ts";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("solo la dueña crea cuentas, con «Confirmar con Google»; una persona y un correo, una cuenta viva; la Puerta del taller no se da", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Manda el alta como `quien`, con Google confirmado hace `haceMinutos` (`null`: sin confirmar). */
	const alta = (datos: Record<string, unknown>, quien = "duena", haceMinutos: number | null = 0) =>
		mandarAccion(servidor, "admin.crear_cuenta", { datos }, quien, haceMinutos === null ? {} : conGoogle(haceMinutos));

	it("Administración del sistema sin ser la dueña responde 403 solo_duena; la dueña sin Google, o con una confirmación de hace más de 5 minutos, 401 reautenticar", async () => {
		const datos = {
			persona_id: await nuevaPersona(servidor.base.dueno),
			correo: "luis@gmail.com",
			departamentos: ["ventas"],
		};
		const admin = await alta(datos, "admin");
		expect(admin.estado).toBe(403);
		expect(admin.cuerpo).toMatchObject({ error: "sin_permiso", codigo: "solo_duena" });
		const sinGoogle = await alta(datos, "duena", null);
		expect(sinGoogle.estado).toBe(401);
		expect(sinGoogle.cuerpo).toMatchObject({ error: "reautenticar", proposito: "crear_cuenta", minutos: 5 });
		expect((await alta(datos, "duena", 6)).estado).toBe(401);
	});

	it("sin persona, sin correo o sin departamentos responde 400 con el mensaje de cada campo", async () => {
		const malo = await alta({ correo: "", departamentos: [] });
		expect(malo.estado).toBe(400);
		expect(malo.cuerpo.campos).toMatchObject({
			persona_id: "Escoge a la persona.",
			correo: "Escribe su correo de Google.",
			departamentos: "Marca al menos un departamento.",
		});
	});

	it("da de alta la cuenta activa, con el correo en minúsculas, sus departamentos y su confirmación; deja su bitácora y cuenta.activada", async () => {
		const personaId = await nuevaPersona(servidor.base.dueno);
		const respuesta = await alta({
			persona_id: personaId,
			correo: "  Gloria.Rivas@Gmail.com ",
			departamentos: ["calidad", "produccion"],
		});
		expect(respuesta.estado).toBe(200);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: "gloria.rivas@gmail.com dada de alta: ya puede entrar con su cuenta de Google",
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, estado, correo, persona_id, activada_por, activada_en, confirmado_con_google_en, creado_por FROM usuarios WHERE correo = 'gloria.rivas@gmail.com'",
		);
		const duena = cuentaDePrueba("duena");
		expect(rows).toEqual([
			expect.objectContaining({
				estado: "activa",
				persona_id: personaId,
				activada_por: duena,
				creado_por: duena,
				confirmado_con_google_en: expect.any(Date),
			}),
		]);
		const usuarioId = rows[0]?.id;
		const deptos = await servidor.base.dueno.query(
			"SELECT d.clave, ud.confirmado_con_google_en FROM usuario_departamentos ud JOIN departamentos d ON d.id = ud.departamento_id WHERE ud.usuario_id = $1 ORDER BY d.clave",
			[usuarioId],
		);
		expect(deptos.rows.map((depto) => depto.clave)).toEqual(["calidad", "produccion"]);
		expect(deptos.rows.every((depto) => depto.confirmado_con_google_en !== null)).toBe(true);
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion, confirmado_con_google_en FROM bitacora WHERE accion = 'admin.crear_cuenta' AND entidad_id = $1",
			[usuarioId],
		);
		expect(bitacora.rows).toEqual([
			{
				descripcion: "Dio de alta a gloria.rivas@gmail.com con Producción, Calidad",
				confirmado_con_google_en: expect.any(Date),
			},
		]);
		const eventos = await servidor.base.dueno.query(
			"SELECT tipo FROM eventos WHERE entidad_id = $1 AND tipo = 'cuenta.activada'",
			[usuarioId],
		);
		expect(eventos.rows).toHaveLength(1);
	});

	it("la misma persona o el mismo correo con cuenta viva no se da de alta otra vez; una solicitud pendiente tampoco; la Puerta del taller no se da", async () => {
		const personaId = await nuevaPersona(servidor.base.dueno);
		expect((await alta({ persona_id: personaId, correo: "ana@gmail.com", departamentos: ["bodega"] })).estado).toBe(
			200,
		);
		const mismaPersona = await alta({ persona_id: personaId, correo: "ana.2@gmail.com", departamentos: ["bodega"] });
		expect(mismaPersona.cuerpo).toMatchObject({ codigo: "persona_con_cuenta" });
		const mismoCorreo = await alta({
			persona_id: await nuevaPersona(servidor.base.dueno),
			correo: "ANA@gmail.com",
			departamentos: ["bodega"],
		});
		expect(mismoCorreo.cuerpo).toMatchObject({ codigo: "correo_con_cuenta", mensaje: "Ese correo ya tiene cuenta." });
		await servidor.base.dueno.query(
			"INSERT INTO usuarios (id, persona_id, correo, estado) VALUES ($1, $2, 'pedida@gmail.com', 'solicitada')",
			[uuidv7(), await nuevaPersona(servidor.base.dueno)],
		);
		const solicitado = await alta({
			persona_id: await nuevaPersona(servidor.base.dueno),
			correo: "pedida@gmail.com",
			departamentos: ["bodega"],
		});
		expect(solicitado.cuerpo).toMatchObject({ codigo: "correo_solicitado" });
		const puerta = await alta({
			persona_id: await nuevaPersona(servidor.base.dueno),
			correo: "puerta@gmail.com",
			departamentos: ["puerta_taller"],
		});
		expect(puerta.estado).toBe(422);
		expect(puerta.cuerpo).toMatchObject({
			codigo: "departamento_no_asignable",
			mensaje: "La Puerta del taller entra con PIN.",
		});
	});

	it("dos altas a la vez con el mismo correo dejan una sola cuenta", async () => {
		const respuestas = await Promise.all(
			[0, 1].map(async () =>
				alta({
					persona_id: await nuevaPersona(servidor.base.dueno),
					correo: "doble@gmail.com",
					departamentos: ["ventas"],
				}),
			),
		);
		expect(respuestas.map((respuesta) => respuesta.estado).sort()).toEqual([200, 422]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM usuarios WHERE correo = 'doble@gmail.com'",
		);
		expect(rows[0]?.n).toBe(1);
	});

	it("el rol de la app no crea una dueña ni una cuenta de soporte, ni cambia esas marcas", async () => {
		const crearConMarca = (marca: string) =>
			servidor.base.app
				.query(`INSERT INTO usuarios (id, persona_id, correo, estado, ${marca}) VALUES ($1, $2, $3, 'activa', true)`, [
					uuidv7(),
					uuidv7(),
					`${marca}@gmail.com`,
				])
				.then(
					() => undefined,
					(error: unknown) => codigoDePostgres(error),
				);
		expect(await crearConMarca("es_duena")).toBe("42501");
		expect(await crearConMarca("es_soporte")).toBe("42501");
		const cambiar = await servidor.base.app
			.query("UPDATE usuarios SET es_soporte = true WHERE correo = 'ana@gmail.com'")
			.then(
				() => undefined,
				(error: unknown) => codigoDePostgres(error),
			);
		expect(cambiar).toBe("42501");
	});
});
