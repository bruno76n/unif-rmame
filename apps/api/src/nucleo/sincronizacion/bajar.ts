/**
 * `GET /v1/sync/bajar` y `GET /v1/sync/foto`: el aparato baja lo que cambió y le toca, hasta un tope seguro,
 * o la foto completa de lo vigente.
 * Fase 6 · docs/cimientos/SINCRONIZACION.md («Bajar», «Foto»)
 *
 * Cada tabla que baja a un tipo de aparato la declara su módulo (`bajada.ts`) con su filtro, sus columnas y
 * su orden. La bajada recorre una ventana de `xid_escritura` (de `desde` al tope seguro de cuando se abrió),
 * tabla por tabla en el orden de dependencias y por (`xid_escritura`, `id`): lo que cumple el filtro baja
 * como `cambio` y lo que no, como `quitar`. Toda transacción con un número menor que el tope ya terminó, así
 * que nada se salta. La foto entrega lo vigente, tabla por tabla y por id, y al terminar da el cursor para
 * seguir bajando desde su inicio.
 */

import {
	parametrosDeBajada,
	parametrosDeFoto,
	respuestaDeBajada,
	respuestaDeFoto,
} from "@uniformame/compartido/contratos/sincronizacion";
import type { App } from "@uniformame/compartido/contratos/versiones";
import { eq, type SQL, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { leTocaRotarLaLlave } from "../../modulos/admin/dominio/dispositivos.ts";
import { dispositivos, dispositivosSync } from "../../modulos/admin/tablas.ts";
import type { AparatoQueLlama } from "../acceso/quien.ts";
import { parametroEntero } from "../acceso/sesion.ts";
import type { Base } from "../base/conexion.ts";
import { ErrorDeApi } from "../http/errores.ts";
import type { AparatoQueBaja, RegistroDeModulos, TablaQueBaja } from "../modulos.ts";
import { identificarAparato } from "./aparato.ts";
import {
	type CursorDeBajada,
	type CursorDeFoto,
	esquemaDe,
	firmarCursor,
	leerCursorDeBajada,
	leerCursorDeFoto,
} from "./cursor.ts";
import type { AlcanceDelAparato } from "./eventos-en-vivo.ts";

/** Lo que necesitan la bajada y la foto. */
export interface DependenciasDeLaBajada {
	base: Base;
	registro: RegistroDeModulos;
	reloj: () => Temporal.Instant;
	/** La versión mínima del parámetro de la dueña para una app. */
	versionMinimaDelParametro: (app: App) => Promise<string>;
	/** La llave del HMAC de los cursores (`llaveDelCursor`). */
	llave: Buffer;
}

/** Un renglón que baja. */
interface CambioQueBaja {
	tabla: string;
	op: "cambio" | "quitar";
	id: string;
	datos: Record<string, unknown> | null;
}

/** Un renglón leído de una tabla que baja: su id, su número de transacción, si cumple el filtro y su contenido. */
const renglonLeido = z.object({
	id: z.string(),
	xid: z.string(),
	cumple: z.boolean().nullable(),
	fila: z.record(z.string(), z.unknown()),
});

/** Lo que el servidor sabe del aparato para su bajada. */
interface AparatoDeLaBajada {
	aparato: AparatoQueBaja;
	tablas: readonly TablaQueBaja[];
	esquema: number;
	fotoPedidaEn: string | null;
}

/**
 * El plugin de Fastify con las rutas de la bajada y la foto.
 * @param dependencias La base, los módulos, la hora, la versión mínima y la llave de los cursores.
 */
export function bajadaDeAparatos(dependencias: DependenciasDeLaBajada): FastifyPluginAsync {
	return async (raiz) => registrarBajada(raiz, dependencias);
}

/** Registra las rutas de la bajada y de la foto en el plugin. */
function registrarBajada(raiz: FastifyInstance, dependencias: DependenciasDeLaBajada): void {
	const { base, llave } = dependencias;
	const app = raiz.withTypeProvider<ZodTypeProvider>();

	/** El paso 1: la llave del aparato, su versión, sus tablas y su esquema; y el tamaño de la página. */
	async function prepararLlamada(peticion: FastifyRequest, limite: number | undefined) {
		const ahora = dependencias.reloj();
		const conLlave = await identificarAparato(base, dependencias.versionMinimaDelParametro, peticion, ahora);
		const deLaBajada = await leerAparato(base, dependencias.registro, conLlave.quien.dispositivoId);
		const maximo = await parametroEntero(base, "sync.pagina_max_renglones");
		return { ahora, deLaBajada, limite: Math.min(limite ?? maximo, maximo) };
	}

	app.get(
		"/v1/sync/bajar",
		{
			schema: {
				description:
					"El aparato baja lo que cambió y le toca, hasta un tope seguro, con su cursor firmado.\n\nPermiso: un aparato con su llave.",
				tags: ["sync"],
				querystring: parametrosDeBajada,
				response: { 200: respuestaDeBajada },
			},
		},
		async (peticion, respuesta) => {
			const { ahora, deLaBajada, limite } = await prepararLlamada(peticion, peticion.query.limite);
			const { aparato } = deLaBajada;
			respuesta.header("cache-control", "no-store");
			const comun = {
				ok: true as const,
				rotar_llave: await leTocaRotarLaLlave(base, aparato.dispositivoId, ahora),
				servidor_en: ahora.toString(),
			};
			const desde = peticion.query.desde;
			const cursor = desde === undefined ? undefined : leerCursorDeBajada(llave, desde);
			if (cursor === undefined || !(await cursorSirve(base, deLaBajada, cursor, ahora))) {
				return { ...comun, cambios: [], cursor: null, hay_mas: false, requiere_foto: true };
			}
			const pagina = await paginaDeBajada(base, deLaBajada, cursor, limite);
			const siguiente = firmarCursor(llave, {
				...pagina.siguiente,
				emitido_en: ahora.toString(),
				foto_pedida_en: deLaBajada.fotoPedidaEn,
			});
			await anotarBajada(base, aparato.dispositivoId, {
				ahora,
				cursor,
				esquema: deLaBajada.esquema,
				completa: !pagina.hayMas && peticion.headers["x-pendientes"] === "0",
			});
			return { ...comun, cambios: pagina.cambios, cursor: siguiente, hay_mas: pagina.hayMas, requiere_foto: false };
		},
	);

	app.get(
		"/v1/sync/foto",
		{
			schema: {
				description:
					"El aparato baja todo lo vigente que le toca, en páginas; al terminar, el cursor para seguir bajando.\n\nPermiso: un aparato con su llave.",
				tags: ["sync"],
				querystring: parametrosDeFoto,
				response: { 200: respuestaDeFoto },
			},
		},
		async (peticion, respuesta) => {
			const { ahora, deLaBajada, limite } = await prepararLlamada(peticion, peticion.query.limite);
			const { aparato, esquema } = deLaBajada;
			const opaca = peticion.query.parte;
			const parte: CursorDeFoto | undefined =
				opaca === undefined
					? {
							tipo: "foto",
							dispositivo_id: aparato.dispositivoId,
							esquema,
							emitido_en: ahora.toString(),
							foto_pedida_en: deLaBajada.fotoPedidaEn,
							inicio: await topeSeguro(base),
							tabla: 0,
							ultimo_id: null,
						}
					: leerCursorDeFoto(llave, opaca);
			if (parte === undefined || parte.dispositivo_id !== aparato.dispositivoId || parte.esquema !== esquema) {
				throw new ErrorDeApi("validacion", null, undefined, { campos: { parte: "Empieza la foto otra vez." } });
			}
			respuesta.header("cache-control", "no-store");
			const pagina = await paginaDeFoto(base, deLaBajada, parte, limite);
			// Al terminar, la bajada sigue desde el inicio de la foto: lo que cambió durante la foto vuelve a bajar.
			const alTerminar: CursorDeBajada = {
				tipo: "bajar",
				dispositivo_id: aparato.dispositivoId,
				esquema,
				emitido_en: parte.emitido_en,
				foto_pedida_en: parte.foto_pedida_en,
				desde: parte.inicio,
				tope: null,
				tabla: 0,
				posicion: null,
			};
			return {
				ok: true as const,
				cambios: pagina.cambios,
				parte: pagina.siguiente === undefined ? null : firmarCursor(llave, pagina.siguiente),
				hay_mas: pagina.siguiente !== undefined,
				cursor_bajar: pagina.siguiente === undefined ? firmarCursor(llave, alTerminar) : null,
				servidor_en: ahora.toString(),
			};
		},
	);
}

/**
 * Lee el aparato para su bajada: su tipo, su ubicación, si se le pidió la foto, y sus tablas con su esquema.
 * @param base La base.
 * @param registro Lo que declararon los módulos.
 * @param dispositivoId El aparato.
 */
async function leerAparato(base: Base, registro: RegistroDeModulos, dispositivoId: string): Promise<AparatoDeLaBajada> {
	const [leido] = await base
		.select({
			tipo: dispositivos.tipo,
			ubicacionId: dispositivos.ubicacionId,
			fotoPedidaEn: dispositivosSync.fotoPedidaEn,
		})
		.from(dispositivos)
		.leftJoin(dispositivosSync, eq(dispositivosSync.dispositivoId, dispositivos.id))
		.where(eq(dispositivos.id, dispositivoId));
	if (leido === undefined) throw new ErrorDeApi("sin_sesion", "llave_invalida");
	const tablas = registro.bajada.get(leido.tipo) ?? [];
	return {
		aparato: { dispositivoId, tipo: leido.tipo, ubicacionId: leido.ubicacionId },
		tablas,
		esquema: esquemaDe(tablas, leido.tipo),
		fotoPedidaEn: leido.fotoPedidaEn,
	};
}

/**
 * El alcance de un aparato para los avisos en vivo: las tablas que le bajan y su ubicación. Así le llega
 * «hay cambios» solo de lo que le toca.
 * @param base La base.
 * @param registro Lo que declararon los módulos.
 */
export function alcanceDeLaBajada(
	base: Base,
	registro: RegistroDeModulos,
): (aparato: AparatoQueLlama) => Promise<AlcanceDelAparato> {
	return async (aparato) => {
		const deLaBajada = await leerAparato(base, registro, aparato.dispositivoId);
		const { ubicacionId } = deLaBajada.aparato;
		return {
			tablas: deLaBajada.tablas.map((tabla) => tabla.tabla),
			ubicacionIds: ubicacionId === null ? [] : [ubicacionId],
		};
	};
}

/**
 * Dice si el cursor sirve: es de este aparato y de su esquema, no es más viejo que `sync.dias_cursor_viejo`
 * y el servidor no le pidió la foto después de emitirlo (el cursor guarda la petición que vio, y tiene que
 * ser la misma: una hora no alcanza, porque una bajada que leyó antes de que se pidiera la foto emite después).
 */
async function cursorSirve(
	base: Base,
	deLaBajada: AparatoDeLaBajada,
	cursor: CursorDeBajada,
	ahora: Temporal.Instant,
): Promise<boolean> {
	if (cursor.dispositivo_id !== deLaBajada.aparato.dispositivoId || cursor.esquema !== deLaBajada.esquema) return false;
	if (cursor.foto_pedida_en !== deLaBajada.fotoPedidaEn) return false;
	const dias = await parametroEntero(base, "sync.dias_cursor_viejo");
	return Temporal.Instant.compare(Temporal.Instant.from(cursor.emitido_en).add({ hours: dias * 24 }), ahora) >= 0;
}

/**
 * El tope seguro: toda transacción con un número menor ya terminó.
 * @param base La base.
 * @returns El número, como texto.
 */
export async function topeSeguro(base: Base): Promise<string> {
	const { rows } = await base.execute(sql`SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS tope`);
	return z.object({ tope: z.string() }).parse(rows[0]).tope;
}

/**
 * Lee renglones de una tabla que baja.
 * @param base La base.
 * @param tabla La tabla, con su filtro.
 * @param aparato El aparato.
 * @param donde La condición de la ventana o de la foto (sobre el alias `t`).
 * @param orden El orden de los renglones.
 * @param limite Cuántos, a lo más.
 */
async function leerRenglones(
	base: Base,
	tabla: TablaQueBaja,
	aparato: AparatoQueBaja,
	donde: SQL,
	orden: SQL,
	limite: number,
) {
	const { rows } = await base.execute(sql`
		SELECT t.id::text AS id, t.xid_escritura::text AS xid, (${tabla.filtro(aparato)}) AS cumple, to_jsonb(t) AS fila
		FROM ${sql.identifier(tabla.tabla)} t
		WHERE ${donde}
		ORDER BY ${orden}
		LIMIT ${limite}`);
	return z.array(renglonLeido).parse(rows);
}

/**
 * El renglón como baja: con sus columnas si cumple el filtro, o solo su id para quitarlo.
 * @param tabla La tabla.
 * @param renglon El renglón leído.
 */
function comoBaja(tabla: TablaQueBaja, renglon: z.infer<typeof renglonLeido>): CambioQueBaja {
	if (renglon.cumple !== true) return { tabla: tabla.tabla, op: "quitar", id: renglon.id, datos: null };
	const datos = Object.fromEntries(tabla.columnas.map((columna) => [columna, renglon.fila[columna] ?? null]));
	return { tabla: tabla.tabla, op: "cambio", id: renglon.id, datos };
}

/**
 * Una página de la bajada: abre la ventana si no hay una a medias, y recorre sus tablas en orden.
 * @param base La base.
 * @param deLaBajada El aparato, sus tablas y su esquema.
 * @param cursor El cursor que mandó el aparato.
 * @param limite Cuántos renglones, a lo más.
 * @returns Los cambios, si queda algo en la ventana, y el cursor siguiente (sin su emisión).
 */
async function paginaDeBajada(
	base: Base,
	deLaBajada: AparatoDeLaBajada,
	cursor: CursorDeBajada,
	limite: number,
): Promise<{
	cambios: CambioQueBaja[];
	hayMas: boolean;
	siguiente: Omit<CursorDeBajada, "emitido_en" | "foto_pedida_en">;
}> {
	const { tablas, aparato } = deLaBajada;
	const { desde } = cursor;
	// Una ventana nueva va de `desde` al tope de este momento (nunca hacia atrás).
	const nueva = cursor.tope === null;
	const tope = nueva ? mayor(desde, await topeSeguro(base)) : (cursor.tope ?? desde);
	let tabla = nueva ? 0 : cursor.tabla;
	let posicion = nueva ? null : cursor.posicion;
	const cambios: CambioQueBaja[] = [];
	while (tabla < tablas.length && cambios.length < limite) {
		const deEsta = tablas[tabla];
		if (deEsta === undefined) break;
		const faltan = limite - cambios.length;
		const despues =
			posicion === null ? sql`true` : sql`(t.xid_escritura, t.id) > (${posicion.xid}::xid8, ${posicion.id}::uuid)`;
		const renglones = await leerRenglones(
			base,
			deEsta,
			aparato,
			sql`t.xid_escritura >= ${desde}::xid8 AND t.xid_escritura < ${tope}::xid8 AND ${despues}`,
			sql`t.xid_escritura, t.id`,
			faltan,
		);
		cambios.push(...renglones.map((renglon) => comoBaja(deEsta, renglon)));
		const ultimo = renglones.at(-1);
		if (renglones.length < faltan || ultimo === undefined) {
			tabla++;
			posicion = null;
		} else {
			posicion = { xid: ultimo.xid, id: ultimo.id };
		}
	}
	const comun = { tipo: "bajar" as const, dispositivo_id: aparato.dispositivoId, esquema: deLaBajada.esquema };
	// Al acabar la ventana, la siguiente empieza en su tope.
	if (tabla >= tablas.length) {
		return { cambios, hayMas: false, siguiente: { ...comun, desde: tope, tope: null, tabla: 0, posicion: null } };
	}
	return { cambios, hayMas: true, siguiente: { ...comun, desde, tope, tabla, posicion } };
}

/**
 * El mayor de dos números de transacción.
 * @param uno Un número, como texto.
 * @param otro Otro número, como texto.
 */
function mayor(uno: string, otro: string): string {
	return BigInt(uno) >= BigInt(otro) ? uno : otro;
}

/**
 * Una página de la foto: lo vigente que cumple el filtro, tabla por tabla y por id.
 * @param base La base.
 * @param deLaBajada El aparato y sus tablas.
 * @param parte Dónde va la foto.
 * @param limite Cuántos renglones, a lo más.
 * @returns Los renglones y la parte siguiente, o `undefined` si ya terminó.
 */
async function paginaDeFoto(
	base: Base,
	deLaBajada: AparatoDeLaBajada,
	parte: CursorDeFoto,
	limite: number,
): Promise<{ cambios: CambioQueBaja[]; siguiente: CursorDeFoto | undefined }> {
	const { tablas, aparato } = deLaBajada;
	let tabla = parte.tabla;
	let ultimoId = parte.ultimo_id;
	const cambios: CambioQueBaja[] = [];
	while (tabla < tablas.length && cambios.length < limite) {
		const deEsta = tablas[tabla];
		if (deEsta === undefined) break;
		const faltan = limite - cambios.length;
		const despues = ultimoId === null ? sql`true` : sql`t.id > ${ultimoId}::uuid`;
		const renglones = await leerRenglones(
			base,
			deEsta,
			aparato,
			sql`(${deEsta.filtro(aparato)}) AND ${despues}`,
			sql`t.id`,
			faltan,
		);
		cambios.push(...renglones.map((renglon) => comoBaja(deEsta, renglon)));
		const ultimo = renglones.at(-1);
		if (renglones.length < faltan || ultimo === undefined) {
			tabla++;
			ultimoId = null;
		} else {
			ultimoId = ultimo.id;
		}
	}
	if (tabla >= tablas.length) return { cambios, siguiente: undefined };
	return { cambios, siguiente: { ...parte, tabla, ultimo_id: ultimoId } };
}

/**
 * Paso 5 de la bajada: guarda en `dispositivos_sync` lo que el aparato ya aplicó (el `desde` del cursor que
 * mandó), su esquema y la bajada; si ya no hay más y dijo `X-Pendientes: 0`, la sincronización completa, y
 * limpia el aviso de sin sincronizar.
 */
async function anotarBajada(
	base: Base,
	dispositivoId: string,
	bajada: { ahora: Temporal.Instant; cursor: CursorDeBajada; esquema: number; completa: boolean },
): Promise<void> {
	await base
		.update(dispositivosSync)
		.set({
			cursorXid: bajada.cursor.desde,
			esquemaSync: bajada.esquema,
			ultimaBajadaEn: bajada.ahora.toString(),
			...(bajada.completa ? { ultimaSincronizacionEn: bajada.ahora.toString(), avisoSinSincronizarEn: null } : {}),
			actualizadoEn: sql`now()`,
		})
		.where(eq(dispositivosSync.dispositivoId, dispositivoId));
}
