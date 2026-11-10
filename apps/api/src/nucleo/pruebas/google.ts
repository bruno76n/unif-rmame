/**
 * Entrar con Google en las pruebas: la ida a la API, el código que da el simulador y la vuelta.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 2)
 */

import type { CuentaDeGoogle, crearSimuladorDeGoogle, DanoDelToken } from "@uniformame/pruebas/simuladores/google";
import { clienteDeGooglePrueba, type ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Cómo terminó la vuelta: su estado, a dónde redirige y las cookies que puso (o borró, con valor vacío). */
export interface VueltaDeGoogle {
	estado: number;
	ubicacion: string | undefined;
	cookies: Record<string, { valor: string; opciones: Record<string, unknown> }>;
	cuerpo: string;
}

/**
 * Entra (o confirma) con una cuenta de Google, de punta a punta.
 * @param servidor El servidor de prueba, con `conGoogle`.
 * @param simulador El simulador de Google de la prueba.
 * @param cuenta La cuenta de Google con que se entra.
 * @param opciones Las cookies que ya trae el navegador, la IP, el propósito, `regresar`, un token dañado,
 * cuándo pasó por Google, si se cambia la cookie de la ida, si vuelve con otro `state` y si el código es de
 * otro reto de PKCE.
 */
export async function entrarConGoogle(
	servidor: ServidorDePrueba,
	simulador: ReturnType<typeof crearSimuladorDeGoogle>,
	cuenta: CuentaDeGoogle,
	opciones: {
		cookies?: Record<string, string>;
		ip?: string;
		proposito?: "entrar" | "confirmar";
		regresar?: string;
		dano?: DanoDelToken;
		authTime?: number;
		cambiarLaIda?: boolean;
		/** Vuelve con el `state` de otra ida. */
		stateAjeno?: boolean;
		/** El código se emite para otro reto de PKCE: el verificador de la ida no sirve. */
		otroReto?: boolean;
		agente?: string;
	} = {},
): Promise<VueltaDeGoogle> {
	const ip = opciones.ip ?? "203.0.113.10";
	const agente = opciones.agente ?? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";
	const busqueda = new URLSearchParams();
	if (opciones.regresar !== undefined) busqueda.set("regresar", opciones.regresar);
	if (opciones.proposito !== undefined) busqueda.set("proposito", opciones.proposito);
	const ida = await servidor.app.inject({
		method: "GET",
		url: `/v1/acceso/google?${busqueda.toString()}`,
		remoteAddress: ip,
		headers: { "user-agent": agente },
		cookies: opciones.cookies ?? {},
	});
	if (ida.statusCode !== 302) return resultado(ida);
	const aGoogle = new URL(String(ida.headers.location));
	const deLaIda = ida.cookies.find((cookie) => cookie.name === "ua_google")?.value ?? "";
	const codigo = simulador.emitirCodigo(cuenta, {
		redireccion: clienteDeGooglePrueba.vuelta,
		nonce: aGoogle.searchParams.get("nonce") ?? "",
		retoPkce: opciones.otroReto === true ? "otro-reto-de-pkce" : (aGoogle.searchParams.get("code_challenge") ?? ""),
		...(opciones.dano === undefined ? {} : { dano: opciones.dano }),
		...(opciones.authTime === undefined ? {} : { authTime: opciones.authTime }),
	});
	const state = opciones.stateAjeno === true ? "state-de-otra-ida" : (aGoogle.searchParams.get("state") ?? "");
	const vuelta = new URLSearchParams({ code: codigo, state });
	const respuesta = await servidor.app.inject({
		method: "GET",
		url: `/v1/acceso/google/vuelta?${vuelta.toString()}`,
		remoteAddress: ip,
		headers: { "user-agent": agente },
		cookies: {
			...(opciones.cookies ?? {}),
			ua_google: opciones.cambiarLaIda === true ? `${deLaIda.slice(0, -4)}AAAA` : deLaIda,
		},
	});
	return resultado(respuesta);
}

/** Lo que regresó la API. */
function resultado(respuesta: {
	statusCode: number;
	headers: Record<string, unknown>;
	cookies: { name: string; value: string }[];
	body: string;
}): VueltaDeGoogle {
	const ubicacion = respuesta.headers.location;
	return {
		estado: respuesta.statusCode,
		ubicacion: typeof ubicacion === "string" ? ubicacion : undefined,
		cookies: Object.fromEntries(
			respuesta.cookies.map(({ name, value, ...opciones }) => [name, { valor: value, opciones }]),
		),
		cuerpo: respuesta.body,
	};
}
