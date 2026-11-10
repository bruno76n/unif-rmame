/**
 * Prueba de que una conexión en vivo no vale más que su sesión.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (partes 2 y 4)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashDe, nuevoIdentificador } from "../acceso/cookies.ts";
import { crearBase } from "../base/conexion.ts";
import { enAccionDePrueba } from "../pruebas/accion-de-prueba.ts";
import { cuentaDePrueba, quienesDePrueba } from "../pruebas/cuentas-de-prueba.ts";
import { escuchar, esperarA, procesarComoElWorker } from "../pruebas/en-vivo.ts";
import { nuevaPersona } from "../pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, dominios, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";
import { crearAvisosEnVivo } from "./eventos-en-vivo.ts";

describe("quitar el acceso corta al momento las conexiones en vivo de la cuenta; cambiar sus departamentos cambia lo que les llega; una sesión inactiva se corta con el latido", () => {
	let servidor: ServidorDePrueba;
	let direccion: string;
	let sesionDeLaDuena = "";
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ sesionReal: true, avisosEnVivo: { latidoMs: 100 } });
		direccion = await servidor.app.listen({ port: 0, host: "127.0.0.1" });
		sesionDeLaDuena = await abrirSesion(cuentaDePrueba("duena"), { confirmada: true });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Abre una sesión de una cuenta y regresa su cookie. */
	async function abrirSesion(usuarioId: string, opciones: { confirmada?: true; actividad?: string } = {}) {
		const identificador = nuevoIdentificador();
		await servidor.base.dueno.query(
			`INSERT INTO sesiones (id, usuario_id, token_hash, ultima_actividad_en, vence_en, google_confirmado_en)
			 VALUES ($1, $2, $3, now() - $4::interval, now() + interval '1 hour', $5)`,
			[
				uuidv7(),
				usuarioId,
				hashDe(identificador),
				opciones.actividad ?? "0 minutes",
				opciones.confirmada === true ? new Date().toISOString() : null,
			],
		);
		return identificador;
	}

	/** Una cuenta nueva con un departamento. */
	async function cuentaCon(departamento: string): Promise<string> {
		const usuarioId = uuidv7();
		await servidor.base.dueno.query(
			"INSERT INTO usuarios (id, persona_id, correo, estado) VALUES ($1, $2, $3, 'activa')",
			[usuarioId, await nuevaPersona(servidor.base.dueno), `${usuarioId}@alameda.invalid`],
		);
		await servidor.base.dueno.query(
			`INSERT INTO usuario_departamentos (id, usuario_id, departamento_id)
			 SELECT $1, $2, id FROM departamentos WHERE clave = $3`,
			[uuidv7(), usuarioId, departamento],
		);
		return usuarioId;
	}

	/** La dueña manda una acción con su sesión de verdad. */
	async function comoLaDuena(accion: string, datos: unknown, version?: number) {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: `/v1/acciones/${accion}`,
			headers: { "x-app-version": "1.0.0", origin: dominios.DOMINIO_WEB },
			cookies: { ua_sesion: sesionDeLaDuena },
			payload: { clave_idempotencia: uuidv7(), datos, ...(version === undefined ? {} : { version }) },
		});
		expect(respuesta.statusCode).toBe(200);
	}

	/** La versión de una cuenta. */
	async function versionDe(usuarioId: string): Promise<number> {
		const { rows } = await servidor.base.dueno.query("SELECT version FROM usuarios WHERE id = $1", [usuarioId]);
		return Number(rows[0]?.version);
	}

	/** Crea un aviso para una cuenta, como lo haría cualquier módulo. */
	async function avisarA(usuarioId: string, texto: string): Promise<void> {
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("admin.crear_aviso", {
				tipo: "alerta_direccion",
				destinatarios: { cuentas: [usuarioId] },
				texto,
			}),
		);
	}

	it("al quitar el acceso, la conexión recibe sesion_cerrada y el servidor la corta: ya no le llega nada", async () => {
		const usuarioId = await cuentaCon("ventas");
		const conexion = await escuchar(direccion, { sesion: await abrirSesion(usuarioId) });
		await esperarA(() => conexion.eventos().some((evento) => evento.nombre === "hola"));
		await comoLaDuena("admin.quitar_acceso", { usuario_id: usuarioId }, await versionDe(usuarioId));
		await procesarComoElWorker(servidor);
		await esperarA(() => conexion.cortada());
		// Una sola vez, aunque la mande el evento y la revisión que corta la conexión.
		expect(conexion.eventos().filter((evento) => evento.nombre === "sesion_cerrada")).toEqual([
			{ nombre: "sesion_cerrada", datos: { motivo: "acceso_quitado" } },
		]);
		const antes = conexion.bloques.length;
		await avisarA(usuarioId, "Un aviso que ya no le debe llegar");
		await new Promise((listo) => setTimeout(listo, 200));
		expect(conexion.bloques.length).toBe(antes);
	});

	it("al quitarle Ventas y darle Aduana, deja de recibir los cambios de Ventas", async () => {
		const usuarioId = await cuentaCon("ventas");
		const conexion = await escuchar(direccion, { sesion: await abrirSesion(usuarioId) });
		await esperarA(() => conexion.eventos().some((evento) => evento.nombre === "hola"));
		await comoLaDuena("admin.cambiar_departamentos", {
			cambios: [{ usuario_id: usuarioId, version: await versionDe(usuarioId), recibe: ["aduana"], deja: ["ventas"] }],
		});
		await procesarComoElWorker(servidor);
		await esperarA(() => conexion.eventos().some((evento) => evento.nombre === "permisos_cambiados"));
		const ventas = await abrirSesion(cuentaDePrueba("ventas"));
		const nota = await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/prueba.crear_nota",
			headers: { "x-app-version": "1.0.0", origin: dominios.DOMINIO_WEB },
			cookies: { ua_sesion: ventas },
			payload: { clave_idempotencia: uuidv7(), datos: { texto: "Nota de Ventas", monto_centavos: 100 } },
		});
		expect(nota.statusCode).toBe(200);
		await procesarComoElWorker(servidor);
		await new Promise((listo) => setTimeout(listo, 200));
		const cambios = conexion.eventos().filter((evento) => evento.nombre === "cambios");
		expect(JSON.stringify(cambios)).not.toContain("prueba_notas");
		expect(conexion.cortada()).toBe(false);
		conexion.cerrar();
	});

	it("una sesión que se queda sin actividad se corta con el latido, aunque la conexión siga abierta", async () => {
		const usuarioId = await cuentaCon("ventas");
		const conexion = await escuchar(direccion, { sesion: await abrirSesion(usuarioId) });
		await esperarA(() => conexion.eventos().some((evento) => evento.nombre === "hola"));
		// Pasan 31 minutos sin que la persona haga nada: la conexión abierta no cuenta como actividad.
		await servidor.base.dueno.query(
			"UPDATE sesiones SET ultima_actividad_en = now() - interval '31 minutes' WHERE usuario_id = $1",
			[usuarioId],
		);
		await esperarA(() => conexion.cortada());
		conexion.cerrar();
		const { rows } = await servidor.base.dueno.query("SELECT motivo_cierre FROM sesiones WHERE usuario_id = $1", [
			usuarioId,
		]);
		expect(rows[0]?.motivo_cierre).toBe("inactividad");
	});

	it("los latidos no cuentan como actividad: la última actividad no se mueve", async () => {
		const usuarioId = await cuentaCon("ventas");
		const conexion = await escuchar(direccion, { sesion: await abrirSesion(usuarioId) });
		await esperarA(() => conexion.eventos().some((evento) => evento.nombre === "hola"));
		await servidor.base.dueno.query(
			"UPDATE sesiones SET ultima_actividad_en = now() - interval '5 minutes' WHERE usuario_id = $1",
			[usuarioId],
		);
		const { rows: antes } = await servidor.base.dueno.query(
			"SELECT ultima_actividad_en FROM sesiones WHERE usuario_id = $1",
			[usuarioId],
		);
		await new Promise((listo) => setTimeout(listo, 350));
		const { rows: despues } = await servidor.base.dueno.query(
			"SELECT ultima_actividad_en FROM sesiones WHERE usuario_id = $1",
			[usuarioId],
		);
		expect(despues[0]?.ultima_actividad_en).toEqual(antes[0]?.ultima_actividad_en);
		expect(conexion.cortada()).toBe(false);
		conexion.cerrar();
	});

	it("aunque las revisiones se encimen (un latido tras otro mientras la base tarda), la conexión se corta una sola vez", async () => {
		let terminadas = 0;
		const escritos: string[] = [];
		const avisos = crearAvisosEnVivo({
			conexiones: servidor.base.app,
			base: crearBase(servidor.base.app),
			registro: servidor.modulos,
			alcanceDelAparato: async () => ({ tablas: [], ubicacionIds: [] }),
			intervaloDeSincronizacion: async () => 30,
			anotarError: () => undefined,
			latidoMs: 5,
		});
		await avisos.iniciar();
		try {
			const quien = quienesDePrueba.ventas;
			if (quien === undefined) throw new Error("falta la cuenta de prueba");
			await avisos.conectar(
				quien,
				{ escribir: (texto) => escritos.push(texto), terminar: () => terminadas++ },
				{},
				() => new Promise((listo) => setTimeout(() => listo(undefined), 30)),
			);
			await esperarA(() => terminadas > 0);
			await new Promise((listo) => setTimeout(listo, 100));
			expect(terminadas).toBe(1);
			expect(escritos.filter((texto) => texto.startsWith("event: sesion_cerrada"))).toHaveLength(1);
		} finally {
			await avisos.cerrar();
		}
	});
});
