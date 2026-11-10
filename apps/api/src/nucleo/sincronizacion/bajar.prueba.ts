/**
 * Prueba de la bajada: cada aparato baja solo lo suyo, lo que sale de su filtro baja como `quitar`, y un
 * cursor que no sirve (o un parámetro que cambia el filtro) pide la foto.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md (parte 3)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enVivoDeAdmin } from "../../modulos/admin/en-vivo.ts";
import {
	bajar,
	bajarHasta,
	bajarHastaTener,
	bajarTodo,
	cursorFirmado,
	fotoCompleta,
} from "../pruebas/bajada-de-prueba.ts";
import { llaveDePrueba, quienesDePrueba } from "../pruebas/cuentas-de-prueba.ts";
import { conGoogle, mandarAccion } from "../pruebas/llamadas.ts";
import {
	crearServidorDePrueba,
	type ServidorDePrueba,
	secretoDeLosCursoresDePrueba,
} from "../pruebas/servidor-de-prueba.ts";
import { type CursorDeBajada, leerCursorDeBajada, llaveDelCursor } from "./cursor.ts";

/** El id de la tablet de prueba. */
function tablet(): string {
	const quien = quienesDePrueba.tablet;
	if (quien?.tipo !== "aparato") throw new Error("no hay tablet de prueba");
	return quien.dispositivoId;
}

/**
 * Lee lo que lleva un cursor bueno, con la llave de las pruebas: para armar uno viejo o ajeno.
 * @param opaco El cursor.
 */
function contenidoDe(opaco: string): CursorDeBajada {
	const cursor = leerCursorDeBajada(llaveDelCursor(secretoDeLosCursoresDePrueba), opaco);
	if (cursor === undefined) throw new Error("el cursor de la prueba no se pudo leer");
	return cursor;
}

describe("cada aparato baja solo lo suyo, hasta un tope seguro, con su cursor firmado", () => {
	let servidor: ServidorDePrueba;
	let taller: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const { rows } = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'TAL'");
		taller = String(rows[0]?.id);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Ventas abre un lote en el Taller. */
	async function abrirLote(nombre: string): Promise<string> {
		const id = uuidv7();
		const { estado } = await mandarAccion(servidor, "prueba.abrir_lote", { datos: { id, nombre } });
		expect(estado).toBe(200);
		return id;
	}

	it("sin cursor, o con uno que no sirve (cambiado, ajeno, viejo o de otro esquema), pide la foto y no baja nada", async () => {
		const sinCursor = await bajar(servidor, undefined);
		expect(sinCursor).toMatchObject({ cambios: [], cursor: null, hay_mas: false, requiere_foto: true });
		const { cursor } = await fotoCompleta(servidor);
		expect((await bajar(servidor, cursor)).requiere_foto).toBe(false);
		const [texto = "", firma = ""] = cursor.split(".");
		const cambiado = `${texto.slice(0, -2)}AA.${firma}`;
		const contenido = contenidoDe(cursor);
		const viejo = cursorFirmado({
			...contenido,
			emitido_en: new Date(Date.now() - 31 * 24 * 3_600_000).toISOString(),
		});
		const ajeno = cursorFirmado({ ...contenido, dispositivo_id: uuidv7() });
		const otroEsquema = cursorFirmado({ ...contenido, esquema: contenido.esquema + 1 });
		for (const malo of [cambiado, viejo, ajeno, otroEsquema, "basura", `${texto}.${firma}.mas`]) {
			expect([malo, (await bajar(servidor, malo)).requiere_foto]).toEqual([malo, true]);
		}
		// El que sirve sigue sirviendo.
		expect((await bajar(servidor, cursor)).requiere_foto).toBe(false);
	});

	it("lo que cambió y le toca baja como cambio, con sus columnas; lo de otra ubicación, como quitar, solo con su id", async () => {
		const { cursor } = await fotoCompleta(servidor);
		const nuestro = await abrirLote("L-2026-200");
		const ajeno = uuidv7();
		await servidor.base.dueno.query(
			"INSERT INTO prueba_lotes (id, nombre, ubicacion_id) SELECT $1, 'L-ADU', id FROM ubicaciones WHERE codigo = 'ADU'",
			[ajeno],
		);
		const { cambios } = await bajarHastaTener(servidor, cursor, [nuestro, ajeno]);
		expect(cambios).toEqual([
			{ tabla: "prueba_lotes", op: "cambio", id: nuestro, datos: { nombre: "L-2026-200", ubicacion_id: taller } },
			{ tabla: "prueba_lotes", op: "quitar", id: ajeno, datos: null },
		]);
		// Nunca baja una columna que no está en su lista (`cerrado`, `version`, `xid_escritura`).
		expect(Object.keys(cambios[0]?.datos ?? {})).toEqual(["nombre", "ubicacion_id"]);
	});

	it("un renglón que sale del filtro baja como quitar; el que depende de otra tabla, también, porque la acción lo toca", async () => {
		const lote = await abrirLote("L-2026-201");
		const bulto = uuidv7();
		const { cursor: inicio } = await fotoCompleta(servidor);
		const subida = await servidor.app.inject({
			method: "POST",
			url: "/v1/sync/subir",
			headers: { authorization: llaveDePrueba("tablet"), "x-app-version": "1.0.0" },
			payload: {
				enviado_en: new Date().toISOString(),
				pendientes_por_subir: 1,
				comandos: [
					{
						clave_idempotencia: uuidv7(),
						accion: "prueba.registrar_bulto",
						datos: { id: bulto, lote_id: lote, piezas: 12 },
						ocurrido_en: new Date().toISOString(),
					},
				],
			},
		});
		expect(subida.json().respuestas[0].resultado).toBe("aplicado");
		const { cambios: alta, cursor } = await bajarHastaTener(servidor, inicio, [bulto]);
		expect(alta).toEqual([
			{ tabla: "prueba_bultos", op: "cambio", id: bulto, datos: { lote_id: lote, piezas: 12, atendido: false } },
		]);
		await mandarAccion(servidor, "prueba.cerrar_lote", { datos: { lote_id: lote } });
		const { cambios: cierre } = await bajarHastaTener(servidor, cursor, [lote, bulto]);
		// Las tablas en el orden de dependencias: el lote antes que sus bultos.
		expect(cierre).toEqual([
			{ tabla: "prueba_lotes", op: "quitar", id: lote, datos: null },
			{ tabla: "prueba_bultos", op: "quitar", id: bulto, datos: null },
		]);
	});

	it("en páginas de `limite` renglones, con hay_mas, sin repetir ni saltar ninguno", async () => {
		const { cursor } = await fotoCompleta(servidor);
		const lotes = [];
		for (let i = 0; i < 5; i++) lotes.push(await abrirLote(`L-2026-21${i}`));
		const { cambios, cursor: alFinal } = await bajarHastaTener(servidor, cursor, lotes, 2);
		expect(cambios.map((cambio) => cambio.id)).toEqual(lotes);
		// Ya en la ventana: en páginas de dos, con hay_mas.
		const primera = await bajar(servidor, cursor, { limite: 2 });
		expect(primera).toMatchObject({ hay_mas: true, requiere_foto: false });
		expect(primera.cambios).toHaveLength(2);
		// Con el cursor de la ventana ya acabada, no baja nada hasta que algo cambia.
		expect((await bajarTodo(servidor, alFinal)).cambios).toEqual([]);
	});

	it("un renglón que cambia otra vez vuelve a bajar, con lo último", async () => {
		const { cursor } = await fotoCompleta(servidor);
		const lote = await abrirLote("L-2026-220");
		const { cursor: despues } = await bajarHastaTener(servidor, cursor, [lote]);
		await servidor.base.dueno.query("UPDATE prueba_lotes SET nombre = 'L-2026-220-B' WHERE id = $1", [lote]);
		await servidor.base.dueno.query("UPDATE prueba_lotes SET nombre = 'L-2026-220-C' WHERE id = $1", [lote]);
		// Baja con lo último; si el tope cayó entre los dos cambios, el primero bajó en su propia ventana.
		const { cambios } = await bajarHasta(servidor, despues, [lote], (bajados) =>
			bajados.some((cambio) => cambio.datos?.nombre === "L-2026-220-C"),
		);
		expect(cambios.at(-1)).toEqual({
			tabla: "prueba_lotes",
			op: "cambio",
			id: lote,
			datos: { nombre: "L-2026-220-C", ubicacion_id: taller },
		});
		expect(cambios.length).toBeLessThanOrEqual(2);
	});

	it("un parámetro que cambia el filtro pide la foto (con `resincronizar` en vivo): el cursor de antes ya no sirve, el de la foto nueva sí", async () => {
		const { cursor } = await fotoCompleta(servidor);
		expect((await bajar(servidor, cursor)).requiere_foto).toBe(false);
		const version = Number(
			(await servidor.base.dueno.query("SELECT version FROM parametros WHERE clave = 'prueba.atendidos_bajan'")).rows[0]
				?.version,
		);
		const cambiado = await mandarAccion(
			servidor,
			"admin.cambiar_parametro",
			{ datos: { clave: "prueba.atendidos_bajan", valor: true }, version },
			"duena",
			conGoogle(),
		);
		expect(cambiado.estado).toBe(200);
		const { rows } = await servidor.base.dueno.query(
			"SELECT foto_pedida_en FROM dispositivos_sync WHERE dispositivo_id = $1",
			[tablet()],
		);
		expect(rows[0]?.foto_pedida_en).toEqual(expect.any(Date));
		// El aviso en vivo `resincronizar`, a cada aparato al que se le pidió la foto.
		const evento = await servidor.base.dueno.query(
			"SELECT id, tipo, datos FROM eventos WHERE tipo = 'dispositivo.foto_pedida' ORDER BY creado_en DESC LIMIT 1",
		);
		const guardado = evento.rows[0];
		expect(guardado?.datos).toEqual({ dispositivo_ids: tablet(), motivo: "parametro" });
		expect(enVivoDeAdmin["dispositivo.foto_pedida"]?.(guardado)).toEqual([
			{ para: { dispositivoId: tablet() }, nombre: "resincronizar", datos: { motivo: "parametro" } },
		]);
		expect(await bajar(servidor, cursor)).toMatchObject({ requiere_foto: true, cursor: null });
		const { cursor: nuevo } = await fotoCompleta(servidor);
		expect((await bajar(servidor, nuevo)).requiere_foto).toBe(false);
	});

	it("guarda lo que el aparato ya aplicó y la bajada; sin más que bajar y sin pendientes, la sincronización completa", async () => {
		await servidor.base.dueno.query(
			"UPDATE dispositivos_sync SET ultima_sincronizacion_en = NULL, aviso_sin_sincronizar_en = now() WHERE dispositivo_id = $1",
			[tablet()],
		);
		const { cursor } = await fotoCompleta(servidor);
		await bajar(servidor, cursor, { pendientes: 3 });
		const conPendientes = await servidor.base.dueno.query(
			"SELECT cursor_xid::text AS cursor, ultima_bajada_en, ultima_sincronizacion_en, aviso_sin_sincronizar_en FROM dispositivos_sync WHERE dispositivo_id = $1",
			[tablet()],
		);
		expect(conPendientes.rows[0]).toMatchObject({
			cursor: contenidoDe(cursor).desde,
			ultima_bajada_en: expect.any(Date),
			ultima_sincronizacion_en: null,
			aviso_sin_sincronizar_en: expect.any(Date),
		});
		await bajar(servidor, cursor, { pendientes: 0 });
		const completa = await servidor.base.dueno.query(
			"SELECT ultima_sincronizacion_en, aviso_sin_sincronizar_en FROM dispositivos_sync WHERE dispositivo_id = $1",
			[tablet()],
		);
		expect(completa.rows[0]).toEqual({ ultima_sincronizacion_en: expect.any(Date), aviso_sin_sincronizar_en: null });
	});

	it("le dice al aparato cuándo le toca cambiar su llave; sin llave, 401", async () => {
		const { cursor } = await fotoCompleta(servidor);
		expect((await bajar(servidor, cursor)).rotar_llave).toBe(false);
		await servidor.base.dueno.query(
			"UPDATE dispositivos SET llave_rotada_en = now() - interval '91 days' WHERE id = $1",
			[tablet()],
		);
		expect((await bajar(servidor, cursor)).rotar_llave).toBe(true);
		const sinLlave = await servidor.app.inject({
			method: "GET",
			url: "/v1/sync/bajar",
			headers: { "x-app-version": "1.0.0" },
		});
		expect(sinLlave.statusCode).toBe(401);
	});

	it("el puente no tiene tablas que bajar; la tablet no baja lo del puente", async () => {
		const { cursor } = await fotoCompleta(servidor);
		const otro = await bajar(servidor, cursor, { llave: llaveDePrueba("puente") });
		expect(otro).toMatchObject({ requiere_foto: true, cambios: [] });
		const { cambios } = await fotoCompleta(servidor);
		expect(cambios.filter((cambio) => cambio.tabla === "dispositivos")).toEqual([
			expect.objectContaining({ id: tablet(), op: "cambio" }),
		]);
	});
});
