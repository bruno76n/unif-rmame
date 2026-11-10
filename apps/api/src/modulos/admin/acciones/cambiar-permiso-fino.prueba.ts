/**
 * Prueba de `admin.cambiar_permiso_fino`.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { escuchar, esperarA, procesarComoElWorker } from "../../../nucleo/pruebas/en-vivo.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("solo la dueña cambia los permisos finos, con «Confirmar con Google»; la casilla de la dueña no se quita; soporte nunca ve sueldos; a las sesiones les llega permisos_cambiados", () => {
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

	/** Los permisos finos vigentes de una cuenta. */
	async function permisosDe(usuarioId: string): Promise<string[]> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT permiso FROM permisos_finos WHERE usuario_id = $1 AND baja_en IS NULL ORDER BY permiso",
			[usuarioId],
		);
		return rows.map((renglon) => renglon.permiso);
	}

	/** Manda el cambio como `quien`, con Google confirmado ahora y la versión de ahora. */
	const cambiar = async (usuarioId: string, permiso: string, tiene: boolean, quien = "duena") =>
		mandarAccion(
			servidor,
			"admin.cambiar_permiso_fino",
			{ datos: { usuario_id: usuarioId, permiso, tiene }, version: await versionDe(usuarioId) },
			quien,
			conGoogle(),
		);

	it("sin ser la dueña responde 403; sin Google, 401 reautenticar; la casilla de la dueña, 422 es_la_duena; sueldos a soporte, 422 soporte_sin_dinero", async () => {
		const ventas = cuentaDePrueba("ventas");
		expect((await cambiar(ventas, "imprime_guias", true, "admin")).cuerpo).toMatchObject({ codigo: "solo_duena" });
		const sinGoogle = await mandarAccion(
			servidor,
			"admin.cambiar_permiso_fino",
			{ datos: { usuario_id: ventas, permiso: "imprime_guias", tiene: true }, version: await versionDe(ventas) },
			"duena",
		);
		expect(sinGoogle.cuerpo).toMatchObject({ error: "reautenticar", proposito: "cambiar_permiso_fino" });
		expect((await cambiar(cuentaDePrueba("duena"), "imprime_guias", false)).cuerpo).toMatchObject({
			codigo: "es_la_duena",
			mensaje: "La casilla de la dueña no se puede quitar.",
		});
		expect((await cambiar(cuentaDePrueba("soporte"), "ven_sueldos_y_tarifas", true)).cuerpo).toMatchObject({
			codigo: "soporte_sin_dinero",
		});
		expect(await permisosDe(ventas)).toEqual([]);
	});

	it("dar es un renglón nuevo y quitar, la baja del vigente; cada cambio sube la versión, deja su alerta y manda permisos_cambiados; lo mismo que ya tenía responde bien sin escribir", async () => {
		const ventas = cuentaDePrueba("ventas");
		const enVentas = await escuchar(direccion, "ventas");
		await esperarA(() => enVentas.eventos().some((evento) => evento.nombre === "hola"));
		const antes = await versionDe(ventas);
		const da = await cambiar(ventas, "ven_sueldos_y_tarifas", true);
		expect(da.estado).toBe(200);
		expect(da.cuerpo.resultado).toMatchObject({
			mensaje: "Dio acceso a sueldos y tarifas: Prueba ventas",
			version: await versionDe(ventas),
		});
		expect(await versionDe(ventas)).toBeGreaterThan(antes);
		expect(await permisosDe(ventas)).toEqual(["ven_sueldos_y_tarifas"]);
		await procesarComoElWorker(servidor);
		await esperarA(() => enVentas.eventos().some((evento) => evento.nombre === "permisos_cambiados"));
		const igual = await cambiar(ventas, "ven_sueldos_y_tarifas", true);
		expect(igual.estado).toBe(200);
		const quita = await cambiar(ventas, "ven_sueldos_y_tarifas", false);
		expect(quita.cuerpo.resultado).toMatchObject({
			mensaje: "Quitó acceso a sueldos y tarifas: Prueba ventas",
		});
		expect(await permisosDe(ventas)).toEqual([]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM permisos_finos WHERE usuario_id = $1 AND baja_en IS NOT NULL",
			[ventas],
		);
		expect(rows[0]?.n).toBe(1);
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion, es_alerta FROM bitacora WHERE accion = 'admin.cambiar_permiso_fino' ORDER BY ocurrido_en",
		);
		expect(bitacora.rows).toEqual([
			{ descripcion: "Dio acceso a sueldos y tarifas: Prueba ventas", es_alerta: true },
			{ descripcion: "Quitó acceso a sueldos y tarifas: Prueba ventas", es_alerta: true },
		]);
		enVentas.cerrar();
	});

	it("con una versión vieja responde 409", async () => {
		const aduana = cuentaDePrueba("aduana");
		const vieja = await mandarAccion(
			servidor,
			"admin.cambiar_permiso_fino",
			{
				datos: { usuario_id: aduana, permiso: "imprime_guias", tiene: true },
				version: (await versionDe(aduana)) - 1,
			},
			"duena",
			conGoogle(),
		);
		expect(vieja.estado).toBe(409);
		expect(await permisosDe(aduana)).toEqual([]);
	});
});
