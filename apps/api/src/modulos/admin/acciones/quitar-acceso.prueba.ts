/**
 * Prueba de `admin.quitar_acceso`.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { escuchar, esperarA, procesarComoElWorker } from "../../../nucleo/pruebas/en-vivo.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("solo la dueña quita el acceso, con «Confirmar con Google»; nadie se lo quita a la dueña; quitarlo cierra todas las sesiones de la cuenta y les llega sesion_cerrada", () => {
	let servidor: ServidorDePrueba;
	let direccion: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ avisosEnVivo: { latidoMs: 100 } });
		direccion = await servidor.app.listen({ port: 0, host: "127.0.0.1" });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La versión de una cuenta. */
	async function versionDe(usuarioId: string): Promise<number> {
		const { rows } = await servidor.base.dueno.query("SELECT version FROM usuarios WHERE id = $1", [usuarioId]);
		return Number(rows[0]?.version);
	}

	/** Manda `admin.quitar_acceso` como `quien`, con Google confirmado ahora. */
	const quitar = async (usuarioId: string, quien = "duena", version?: number) =>
		mandarAccion(
			servidor,
			"admin.quitar_acceso",
			{
				datos: { usuario_id: usuarioId, motivo: "Ya no trabaja aquí" },
				version: version ?? (await versionDe(usuarioId)),
			},
			quien,
			conGoogle(),
		);

	it("Administración del sistema sin ser la dueña responde 403; sin Google, 401 reautenticar; a la dueña, 422 es_la_duena", async () => {
		expect((await quitar(cuentaDePrueba("aduana"), "admin")).cuerpo).toMatchObject({ codigo: "solo_duena" });
		const sinGoogle = await mandarAccion(
			servidor,
			"admin.quitar_acceso",
			{ datos: { usuario_id: cuentaDePrueba("aduana") }, version: await versionDe(cuentaDePrueba("aduana")) },
			"duena",
		);
		expect(sinGoogle.cuerpo).toMatchObject({ error: "reautenticar", proposito: "quitar_acceso" });
		const aLaDuena = await quitar(cuentaDePrueba("duena"));
		expect(aLaDuena.estado).toBe(422);
		expect(aLaDuena.cuerpo).toMatchObject({ codigo: "es_la_duena", mensaje: "La dueña no se quita el acceso." });
	});

	it("con una versión vieja responde 409 y no cambia nada", async () => {
		const vieja = (await versionDe(cuentaDePrueba("aduana"))) - 1;
		expect((await quitar(cuentaDePrueba("aduana"), "duena", vieja)).estado).toBe(409);
		const { rows } = await servidor.base.dueno.query("SELECT estado FROM usuarios WHERE id = $1", [
			cuentaDePrueba("aduana"),
		]);
		expect(rows[0]?.estado).toBe("activa");
	});

	it("la cuenta queda sin acceso con su confirmación; sus departamentos y permisos, de baja; sus sesiones, cerradas al momento, y a sus pantallas les llega sesion_cerrada; a otra cuenta, no", async () => {
		const ventas = cuentaDePrueba("ventas");
		await servidor.base.dueno.query(
			"INSERT INTO permisos_finos (id, usuario_id, permiso) VALUES (gen_random_uuid(), $1, 'imprime_guias')",
			[ventas],
		);
		await servidor.base.dueno.query(
			`INSERT INTO sesiones (id, usuario_id, token_hash, ultima_actividad_en, vence_en)
			 VALUES (gen_random_uuid(), $1, 'otra-sesion-de-ventas', now(), now() + interval '1 hour')`,
			[ventas],
		);
		const enVentas = await escuchar(direccion, "ventas");
		const enAduana = await escuchar(direccion, "aduana");
		await esperarA(() => enVentas.eventos().some((evento) => evento.nombre === "hola"));
		await esperarA(() => enAduana.eventos().some((evento) => evento.nombre === "hola"));
		const respuesta = await quitar(ventas);
		expect(respuesta.estado).toBe(200);
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: "Prueba ventas ya no entra al sistema" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, baja_en, baja_por, motivo_baja, baja_confirmado_con_google_en FROM usuarios WHERE id = $1",
			[ventas],
		);
		expect(rows[0]).toMatchObject({
			estado: "sin_acceso",
			baja_por: cuentaDePrueba("duena"),
			motivo_baja: "Ya no trabaja aquí",
			baja_confirmado_con_google_en: expect.any(Date),
		});
		const vigentes = await servidor.base.dueno.query(
			`SELECT (SELECT count(*)::int FROM usuario_departamentos WHERE usuario_id = $1 AND baja_en IS NULL) AS deptos,
			        (SELECT count(*)::int FROM permisos_finos WHERE usuario_id = $1 AND baja_en IS NULL) AS permisos`,
			[ventas],
		);
		expect(vigentes.rows[0]).toEqual({ deptos: 0, permisos: 0 });
		const sesiones = await servidor.base.dueno.query(
			"SELECT cerrada_en, motivo_cierre, cerrada_por FROM sesiones WHERE usuario_id = $1",
			[ventas],
		);
		expect(sesiones.rows).toHaveLength(2);
		for (const sesion of sesiones.rows) {
			expect(sesion).toMatchObject({ motivo_cierre: "acceso_quitado", cerrada_por: cuentaDePrueba("duena") });
		}
		const alerta = await servidor.base.dueno.query(
			"SELECT descripcion, es_alerta, confirmado_con_google_en FROM bitacora WHERE accion = 'admin.quitar_acceso'",
		);
		expect(alerta.rows).toEqual([
			{
				descripcion: "Quitó el acceso a Prueba ventas",
				es_alerta: true,
				confirmado_con_google_en: expect.any(Date),
			},
		]);
		await procesarComoElWorker(servidor);
		await esperarA(() => enVentas.eventos().some((evento) => evento.nombre === "sesion_cerrada"));
		expect(enVentas.eventos().find((evento) => evento.nombre === "sesion_cerrada")?.datos).toEqual({
			motivo: "acceso_quitado",
		});
		expect(enAduana.eventos().some((evento) => evento.nombre === "sesion_cerrada")).toBe(false);
		enVentas.cerrar();
		enAduana.cerrar();
	});

	it("una cuenta que ya no tiene acceso responde 422 cuenta_no_activa", async () => {
		const otraVez = await quitar(cuentaDePrueba("ventas"));
		expect(otraVez.estado).toBe(422);
		expect(otraVez.cuerpo).toMatchObject({
			codigo: "cuenta_no_activa",
			mensaje: "Prueba ventas ya no tiene acceso.",
		});
	});
});
