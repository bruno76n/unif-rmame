/**
 * Ayudas para que las pruebas bajen como la tablet: una página de la bajada, la foto completa y un cursor
 * firmado a mano.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md (parte 3)
 */

import { respuestaDeBajada, respuestaDeFoto } from "@uniformame/compartido/contratos/sincronizacion";
import type { z } from "zod";
import { type CursorDeBajada, firmarCursor, llaveDelCursor } from "../sincronizacion/cursor.ts";
import { llaveDePrueba } from "./cuentas-de-prueba.ts";
import { type ServidorDePrueba, secretoDeLosCursoresDePrueba } from "./servidor-de-prueba.ts";

/** Lo que regresa una página de la bajada. */
export type PaginaDeBajada = z.infer<typeof respuestaDeBajada>;

/** Un renglón que bajó. */
export type CambioQueBajo = PaginaDeBajada["cambios"][number];

/**
 * La tablet baja una página.
 * @param servidor El servidor de prueba.
 * @param desde El cursor; sin él, pide la foto.
 * @param extra El límite y lo que dice tener sin subir.
 */
export async function bajar(
	servidor: ServidorDePrueba,
	desde: string | null | undefined,
	extra: { limite?: number; pendientes?: number; llave?: string } = {},
): Promise<PaginaDeBajada> {
	const busqueda = new URLSearchParams({
		...(desde === null || desde === undefined ? {} : { desde }),
		...(extra.limite === undefined ? {} : { limite: String(extra.limite) }),
	});
	const respuesta = await servidor.app.inject({
		method: "GET",
		url: `/v1/sync/bajar?${busqueda}`,
		headers: {
			authorization: extra.llave ?? llaveDePrueba("tablet"),
			"x-app-version": "1.0.0",
			...(extra.pendientes === undefined ? {} : { "x-pendientes": String(extra.pendientes) }),
		},
	});
	if (respuesta.statusCode !== 200) throw new Error(`la bajada respondió ${respuesta.statusCode}: ${respuesta.body}`);
	return respuestaDeBajada.parse(respuesta.json());
}

/**
 * La tablet baja todo lo que hay hasta que la ventana se acaba, página por página.
 * @returns Los renglones, en orden, y el cursor con que sigue.
 */
export async function bajarTodo(
	servidor: ServidorDePrueba,
	desde: string,
	limite?: number,
): Promise<{ cambios: CambioQueBajo[]; cursor: string }> {
	const cambios: CambioQueBajo[] = [];
	let cursor = desde;
	for (;;) {
		const pagina = await bajar(servidor, cursor, limite === undefined ? {} : { limite });
		if (pagina.requiere_foto || pagina.cursor === null) throw new Error("la bajada pidió la foto");
		cambios.push(...pagina.cambios);
		cursor = pagina.cursor;
		if (!pagina.hay_mas) return { cambios, cursor };
	}
}

/**
 * Una página de la foto.
 * @param servidor El servidor de prueba.
 * @param parte La parte siguiente; sin ella, empieza.
 * @param limite Cuántos renglones.
 */
export async function pedirFoto(servidor: ServidorDePrueba, parte?: string, limite?: number) {
	const busqueda = new URLSearchParams({
		...(parte === undefined ? {} : { parte }),
		...(limite === undefined ? {} : { limite: String(limite) }),
	});
	const respuesta = await servidor.app.inject({
		method: "GET",
		url: `/v1/sync/foto?${busqueda}`,
		headers: { authorization: llaveDePrueba("tablet"), "x-app-version": "1.0.0" },
	});
	return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
}

/**
 * La foto completa, página por página.
 * @param entrePaginas Lo que pasa en el servidor entre una página y la siguiente.
 * @returns Los renglones, en orden, y el cursor para seguir bajando.
 */
export async function fotoCompleta(
	servidor: ServidorDePrueba,
	limite?: number,
	entrePaginas: (pagina: number) => Promise<void> = async () => {},
): Promise<{ cambios: CambioQueBajo[]; cursor: string }> {
	const cambios: CambioQueBajo[] = [];
	let parte: string | undefined;
	for (let pagina = 0; ; pagina++) {
		const { estado, cuerpo } = await pedirFoto(servidor, parte, limite);
		if (estado !== 200) throw new Error(`la foto respondió ${estado}`);
		const leida = respuestaDeFoto.parse(cuerpo);
		cambios.push(...leida.cambios);
		if (leida.cursor_bajar !== null) return { cambios, cursor: leida.cursor_bajar };
		if (leida.parte === null) throw new Error("la foto no terminó ni dio su parte siguiente");
		parte = leida.parte;
		await entrePaginas(pagina);
	}
}

/**
 * Un cursor de la bajada firmado con la llave de las pruebas: para probar uno viejo, ajeno o de otro esquema.
 * @param cursor El cursor.
 */
export function cursorFirmado(cursor: CursorDeBajada): string {
	return firmarCursor(llaveDelCursor(secretoDeLosCursoresDePrueba), cursor);
}

/**
 * Baja como la tablet que vuelve a preguntar: ventana tras ventana, hasta que bajen los renglones de `ids`
 * que se esperan (o pasen `espera` milisegundos). El tope es de todo el servidor de Postgres: una
 * transacción abierta en otra base de prueba lo frena un momento, y lo que falta baja en una ventana
 * siguiente; y lo que estaba por encima del tope cuando empezó la foto vuelve a bajar. Por eso la prueba
 * mira solo sus renglones.
 * @param ids Los renglones que la prueba espera.
 * @param listo Cuándo ya bajó lo que espera, con lo que bajó de esos renglones.
 * @returns Lo que bajó de esos renglones, en orden, y el cursor con que sigue.
 */
export async function bajarHasta(
	servidor: ServidorDePrueba,
	desde: string,
	ids: readonly string[],
	listo: (cambios: CambioQueBajo[]) => boolean,
	limite?: number,
	espera = 10_000,
): Promise<{ cambios: CambioQueBajo[]; cursor: string }> {
	const hasta = Date.now() + espera;
	const cambios: CambioQueBajo[] = [];
	let cursor = desde;
	for (;;) {
		const ventana = await bajarTodo(servidor, cursor, limite);
		cambios.push(...ventana.cambios.filter((cambio) => ids.includes(cambio.id)));
		cursor = ventana.cursor;
		if (listo(cambios) || Date.now() > hasta) return { cambios, cursor };
		await new Promise((listo) => setTimeout(listo, 50));
	}
}

/**
 * Baja hasta que cada renglón de `ids` haya bajado al menos una vez (ver `bajarHasta`).
 * @returns Lo que bajó de esos renglones, en orden, y el cursor con que sigue.
 */
export function bajarHastaTener(
	servidor: ServidorDePrueba,
	desde: string,
	ids: readonly string[],
	limite?: number,
): Promise<{ cambios: CambioQueBajo[]; cursor: string }> {
	return bajarHasta(
		servidor,
		desde,
		ids,
		(cambios) => ids.every((id) => cambios.some((cambio) => cambio.id === id)),
		limite,
	);
}
