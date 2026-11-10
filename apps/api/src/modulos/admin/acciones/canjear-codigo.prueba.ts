/**
 * Prueba del registro de un aparato: generar el código, cancelarlo y canjearlo.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md (parte 1)
 */

import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { conGoogle, mandarAccion, nuevaClave } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa generar un código, en la primera respuesta. */
const codigoGenerado = z.object({ codigo_registro_id: z.uuid(), codigo: z.string() });

/** Un secreto de llave como lo hace un aparato: 32 bytes al azar en base64url. */
function secretoNuevo(): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

describe("un código de registro vale sus minutos, se canjea una vez, no dice si no existe o venció, y con demasiados equivocados responde 429; al canjear, el aparato queda con su llave y el servidor guarda solo el hash", () => {
	let servidor: ServidorDePrueba;
	const ubicacion: Record<string, string> = {};
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const { rows } = await servidor.base.dueno.query("SELECT codigo, id FROM ubicaciones");
		for (const fila of rows) ubicacion[fila.codigo] = fila.id;
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La dueña genera un código, con «Confirmar con Google». */
	async function generar(datos: Record<string, unknown>) {
		return mandarAccion(servidor, "admin.generar_codigo_registro", { datos }, "duena", conGoogle());
	}

	/** Un código vigente para una tablet del Taller: su id y el código en claro. */
	async function codigoDeTablet(): Promise<{ id: string; codigo: string }> {
		const generado = await generar({ nombre: "Tablet nueva", tipo: "tablet_taller", ubicacion_id: ubicacion.TAL });
		expect(generado.estado).toBe(200);
		const resultado = codigoGenerado.parse(generado.cuerpo.resultado);
		return { id: resultado.codigo_registro_id, codigo: resultado.codigo };
	}

	/** El aparato canjea su código. */
	async function canjear(
		datos: Record<string, unknown>,
		opciones: { clave?: string; ip?: string; version?: string } = {},
	) {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/dispositivos/canjear",
			remoteAddress: opciones.ip ?? "203.0.113.50",
			headers: { "x-app-version": opciones.version ?? "1.0.0" },
			payload: { clave_idempotencia: opciones.clave ?? nuevaClave(), datos },
		});
		return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
	}

	it("generar pide ser la dueña con Google; la tablet va en el Taller; el código sale una vez, la base guarda su hash y el reintento no lo trae", async () => {
		const datos = { tipo: "tablet_taller", ubicacion_id: ubicacion.TAL };
		expect(
			(await mandarAccion(servidor, "admin.generar_codigo_registro", { datos }, "admin", conGoogle())).cuerpo,
		).toMatchObject({
			codigo: "solo_duena",
		});
		expect((await mandarAccion(servidor, "admin.generar_codigo_registro", { datos }, "duena")).estado).toBe(401);
		const enAduana = await generar({ tipo: "tablet_taller", ubicacion_id: ubicacion.ADU });
		expect(enAduana.cuerpo).toMatchObject({
			codigo: "ubicacion_no_corresponde",
			mensaje: "Un tablet del taller no va en Aduana.",
		});
		const clave = nuevaClave();
		const primero = await mandarAccion(
			servidor,
			"admin.generar_codigo_registro",
			{ clave, datos },
			"duena",
			conGoogle(),
		);
		const resultado = codigoGenerado.parse(primero.cuerpo.resultado);
		expect(resultado.codigo).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{3}-[ACDEFGHJKMNPQRTUVWXY34679]{3}$/);
		const { rows } = await servidor.base.dueno.query(
			"SELECT codigo_hash, estado, vence_en FROM codigos_registro WHERE id = $1",
			[resultado.codigo_registro_id],
		);
		expect(rows[0]?.codigo_hash).toBe(createHash("sha256").update(resultado.codigo.replace("-", "")).digest("hex"));
		expect(rows[0]?.estado).toBe("vigente");
		const otraVez = await mandarAccion(
			servidor,
			"admin.generar_codigo_registro",
			{ clave, datos },
			"duena",
			conGoogle(),
		);
		expect(otraVez.cuerpo).toMatchObject({ secreto_entregado: true });
		expect(JSON.stringify(otraVez.cuerpo)).not.toContain(resultado.codigo);
		const guardada = await servidor.base.dueno.query(
			"SELECT respuesta::text AS r FROM comandos_recibidos WHERE clave_idempotencia = $1",
			[clave],
		);
		expect(guardada.rows[0]?.r).not.toContain(resultado.codigo);
	});

	it("al canjear nace el aparato con su folio y su llave; la base guarda solo el hash del secreto; el reintento con la misma clave contesta lo mismo; con otros datos, clave_usada", async () => {
		const { id, codigo } = await codigoDeTablet();
		const secreto = secretoNuevo();
		const clave = nuevaClave();
		const datos = {
			codigo: codigo.toLowerCase().replace("-", ""),
			tipo: "tablet_taller",
			secreto,
			version_app: "1.0.0",
		};
		const canje = await canjear(datos, { clave });
		expect(canje.estado).toBe(200);
		expect(canje.cuerpo.resultado).toMatchObject({
			folio: expect.stringMatching(/^DV-\d{2}$/),
			tipo: "tablet_taller",
			ubicacion_id: ubicacion.TAL,
			llave_id: expect.stringMatching(/^[a-z0-9]{8}$/),
			intervalo_segundos: 60,
			mensaje: "Tablet nueva registrado con su propia llave",
		});
		const dispositivoId = canje.cuerpo.resultado.dispositivo_id;
		const { rows } = await servidor.base.dueno.query(
			"SELECT llave_hash, codigo_registro_id, creado_por FROM dispositivos WHERE id = $1",
			[dispositivoId],
		);
		expect(rows[0]).toEqual({
			llave_hash: createHash("sha256").update(secreto).digest("hex"),
			codigo_registro_id: id,
			creado_por: "01936f2e-0000-7000-8000-000000000001",
		});
		const codigoCanjeado = await servidor.base.dueno.query(
			"SELECT estado, dispositivo_id FROM codigos_registro WHERE id = $1",
			[id],
		);
		expect(codigoCanjeado.rows[0]).toEqual({ estado: "canjeado", dispositivo_id: dispositivoId });
		// El secreto no queda en ninguna parte: ni en la respuesta guardada, ni en la bitácora.
		const enLaBase = await servidor.base.dueno.query(
			`SELECT (SELECT count(*)::int FROM comandos_recibidos WHERE respuesta::text LIKE $1 OR carga::text LIKE $1) +
			        (SELECT count(*)::int FROM bitacora WHERE descripcion LIKE $1 OR despues::text LIKE $1 OR despues::text LIKE $2) AS n`,
			[`%${secreto}%`, `%${rows[0]?.llave_hash}%`],
		);
		expect(enLaBase.rows[0]?.n).toBe(0);
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion, usuario_id FROM bitacora WHERE accion = 'admin.canjear_codigo'",
		);
		expect(bitacora.rows).toEqual([
			{ descripcion: "Registró el dispositivo Tablet nueva", usuario_id: "01936f2e-0000-7000-8000-000000000001" },
		]);
		const otraVez = await canjear(datos, { clave });
		expect(otraVez).toEqual(canje);
		expect((await canjear({ ...datos, secreto: secretoNuevo() }, { clave })).cuerpo).toMatchObject({
			codigo: "clave_usada",
		});
		const evento = await servidor.base.dueno.query("SELECT datos FROM eventos WHERE tipo = 'dispositivo.registrado'");
		expect(evento.rows[0]?.datos).toMatchObject({
			dispositivo_id: dispositivoId,
			usuario_id: "01936f2e-0000-7000-8000-000000000001",
		});
	});

	it("un código se canjea una sola vez; uno vencido, uno cancelado y uno que no existe responden lo mismo; el de otro tipo, tipo_no_coincide; con una versión vieja, 426", async () => {
		const noValido = { codigo: "codigo_no_valido", mensaje: "Ese código no existe o ya venció. Pide otro a la dueña." };
		const datosDe = (codigo: string, tipo = "tablet_taller") => ({
			codigo,
			tipo,
			secreto: secretoNuevo(),
			version_app: "1.0.0",
		});
		const usado = await codigoDeTablet();
		expect((await canjear(datosDe(usado.codigo), { ip: "198.51.100.1" })).estado).toBe(200);
		expect((await canjear(datosDe(usado.codigo), { ip: "198.51.100.1" })).cuerpo).toMatchObject(noValido);
		const vencido = await codigoDeTablet();
		await servidor.base.dueno.query(
			"UPDATE codigos_registro SET vence_en = now() - interval '1 second' WHERE id = $1",
			[vencido.id],
		);
		expect((await canjear(datosDe(vencido.codigo), { ip: "198.51.100.1" })).cuerpo).toMatchObject(noValido);
		expect((await canjear(datosDe("ZZZ-ZZZ"), { ip: "198.51.100.1" })).cuerpo).toMatchObject(noValido);
		const cancelado = await codigoDeTablet();
		const cancelar = await mandarAccion(
			servidor,
			"admin.cancelar_codigo_registro",
			{ datos: { codigo_registro_id: cancelado.id } },
			"duena",
		);
		expect(cancelar.estado).toBe(200);
		expect((await canjear(datosDe(cancelado.codigo), { ip: "198.51.100.2" })).cuerpo).toMatchObject(noValido);
		expect(
			(
				await mandarAccion(
					servidor,
					"admin.cancelar_codigo_registro",
					{ datos: { codigo_registro_id: usado.id } },
					"duena",
				)
			).cuerpo,
		).toMatchObject({ codigo: "codigo_no_vigente" });
		const otroTipo = await codigoDeTablet();
		expect((await canjear(datosDe(otroTipo.codigo, "puente_impresion"), { ip: "198.51.100.2" })).cuerpo).toMatchObject({
			codigo: "tipo_no_coincide",
			mensaje: "Este código es para tablet del taller: escríbelo en ese aparato.",
		});
		expect((await canjear(datosDe(otroTipo.codigo), { ip: "198.51.100.2", version: "0.9.0" })).estado).toBe(426);
	});

	it("después de 5 códigos equivocados desde una IP responde 429, aunque el siguiente sea bueno; desde otra IP, entra", async () => {
		const ip = "198.51.100.77";
		for (let i = 0; i < 5; i++) {
			expect(
				(
					await canjear(
						{ codigo: "QQQ-QQQ", tipo: "tablet_taller", secreto: secretoNuevo(), version_app: "1.0.0" },
						{ ip },
					)
				).estado,
			).toBe(422);
		}
		const bueno = await codigoDeTablet();
		const datos = { codigo: bueno.codigo, tipo: "tablet_taller", secreto: secretoNuevo(), version_app: "1.0.0" };
		const bloqueado = await canjear(datos, { ip });
		expect(bloqueado.estado).toBe(429);
		expect(bloqueado.cuerpo).toMatchObject({ error: "demasiados_intentos" });
		expect((await canjear(datos, { ip: "198.51.100.78" })).estado).toBe(200);
	});

	it("una ráfaga de códigos equivocados a la vez desde una IP no se brinca el 429: pasan 5 y los demás responden 429", async () => {
		const ip = "198.51.100.79";
		const respuestas = await Promise.all(
			Array.from({ length: 20 }, () =>
				canjear({ codigo: "QQQ-QQQ", tipo: "tablet_taller", secreto: secretoNuevo(), version_app: "1.0.0" }, { ip }),
			),
		);
		const porEstado = respuestas.reduce<Record<number, number>>((cuenta, respuesta) => {
			cuenta[respuesta.estado] = (cuenta[respuesta.estado] ?? 0) + 1;
			return cuenta;
		}, {});
		expect(porEstado).toEqual({ 422: 5, 429: 15 });
	});

	it("dos canjes a la vez del mismo código dejan un solo aparato", async () => {
		const { id, codigo } = await codigoDeTablet();
		const respuestas = await Promise.all(
			[1, 2].map((n) =>
				canjear(
					{ codigo, tipo: "tablet_taller", secreto: secretoNuevo(), version_app: "1.0.0" },
					{ ip: `198.51.100.9${n}` },
				),
			),
		);
		expect(respuestas.map((respuesta) => respuesta.estado).sort()).toEqual([200, 422]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM dispositivos WHERE codigo_registro_id = $1",
			[id],
		);
		expect(rows[0]?.n).toBe(1);
	});

	it("el canje mal formado responde 400 con sus campos", async () => {
		const malo = await canjear({ codigo: "12", tipo: "tablet_taller", secreto: "corto", version_app: "1.0.0" });
		expect(malo.estado).toBe(400);
		expect(Object.keys(malo.cuerpo.campos)).toEqual(expect.arrayContaining(["codigo", "secreto"]));
	});
});
