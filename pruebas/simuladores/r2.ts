/**
 * El simulador de Cloudflare R2 (almacenamiento con la interfaz de S3) para las pruebas y `pnpm local`.
 * Fase 2 · docs/cimientos/PRUEBAS.md («Simuladores de los servicios de fuera») y docs/modulos/admin/archivos.md
 *
 * Sigue la interfaz de S3 que expone R2 en `https://<cuenta>.r2.cloudflarestorage.com/<cubo>/<llave>`:
 * la subida (`PUT`) y la bajada (`GET`) con dirección firmada, y la revisión de que el objeto llegó
 * (`HEAD`). La dirección firmada se revisa por su forma y su vencimiento (`X-Amz-Date` más
 * `X-Amz-Expires`); la firma de verdad solo la revisa R2 (ver «Verificación real pendiente»). Una
 * llamada sin dirección firmada pide `Authorization` con SigV4. Sus errores son los XML de S3.
 */

import { HttpResponse, http } from "msw";
import { aplicarFalla, type ModoDeFalla } from "./fallas.ts";

/** Un objeto guardado: su contenido y su tipo. */
interface Objeto {
	contenido: Uint8Array;
	tipo: string;
}

/** Un error con la forma de S3. */
function errorDeS3(estado: number, codigo: string, mensaje: string): Response {
	return HttpResponse.xml(
		`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${codigo}</Code><Message>${mensaje}</Message></Error>`,
		{
			status: estado,
		},
	);
}

/**
 * Lee el vencimiento de una dirección firmada.
 * @returns El momento en que vence, en milisegundos, o `undefined` si la dirección no viene firmada.
 */
function vencimientoDeLaFirma(url: URL): number | undefined {
	const fecha = url.searchParams.get("X-Amz-Date");
	const segundos = Number(url.searchParams.get("X-Amz-Expires"));
	if (fecha === null || url.searchParams.get("X-Amz-Signature") === null || !Number.isInteger(segundos))
		return undefined;
	const partes = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(fecha);
	if (partes === null) return undefined;
	const [, anio, mes, dia, hora, minuto, segundo] = partes.map(Number);
	return Date.UTC(anio ?? 0, (mes ?? 1) - 1, dia, hora, minuto, segundo) + segundos * 1000;
}

/**
 * Crea un simulador de R2 para una cuenta.
 * @param cuenta El identificador de la cuenta de Cloudflare (`R2_CUENTA`).
 * @param ahora De dónde sale la hora, en milisegundos; las pruebas la fijan para que una dirección venza.
 * @returns Sus manejadores de MSW, los objetos guardados por `cubo/llave` y cómo ponerlo a fallar.
 */
export function crearSimuladorDeR2(cuenta: string, ahora: () => number = Date.now) {
	const objetos = new Map<string, Objeto>();
	let modo: ModoDeFalla = "ninguna";
	const direccion = `https://${cuenta}.r2.cloudflarestorage.com/:cubo/*`;

	/** Revisa la falla y la autorización; si algo no deja seguir, regresa la respuesta. */
	async function revisar(request: Request): Promise<Response | undefined> {
		const falla = await aplicarFalla(modo, () =>
			errorDeS3(500, "InternalError", "We encountered an internal error. Please try again."),
		);
		if (falla) return falla;
		const url = new URL(request.url);
		const vence = vencimientoDeLaFirma(url);
		if (vence !== undefined) {
			return ahora() > vence ? errorDeS3(403, "AccessDenied", "Request has expired") : undefined;
		}
		if (!(request.headers.get("authorization") ?? "").startsWith("AWS4-HMAC-SHA256 ")) {
			return errorDeS3(403, "AccessDenied", "Access Denied");
		}
		return undefined;
	}

	/** La llave del objeto: `cubo/llave`, sin la cuenta. */
	const llaveDe = (request: Request) => decodeURIComponent(new URL(request.url).pathname.slice(1));

	const manejadores = [
		http.put(direccion, async ({ request }) => {
			const negado = await revisar(request);
			if (negado) return negado;
			objetos.set(llaveDe(request), {
				contenido: new Uint8Array(await request.arrayBuffer()),
				tipo: request.headers.get("content-type") ?? "application/octet-stream",
			});
			return new HttpResponse(null, { status: 200, headers: { ETag: `"${objetos.size}"` } });
		}),
		http.head(direccion, async ({ request }) => {
			const negado = await revisar(request);
			if (negado) return negado;
			const objeto = objetos.get(llaveDe(request));
			return objeto === undefined
				? new HttpResponse(null, { status: 404 })
				: new HttpResponse(null, {
						status: 200,
						headers: { "Content-Length": String(objeto.contenido.byteLength), "Content-Type": objeto.tipo },
					});
		}),
		http.get(direccion, async ({ request }) => {
			const negado = await revisar(request);
			if (negado) return negado;
			const objeto = objetos.get(llaveDe(request));
			return objeto === undefined
				? errorDeS3(404, "NoSuchKey", "The specified key does not exist.")
				: new HttpResponse(objeto.contenido, { status: 200, headers: { "Content-Type": objeto.tipo } });
		}),
	];

	return {
		manejadores,
		/** Lo guardado, por `cubo/llave`. */
		objetos,
		ponerAFallar(nuevoModo: ModoDeFalla): void {
			modo = nuevoModo;
		},
	};
}
