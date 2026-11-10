/**
 * La entrada con Google: el flujo de código de OpenID con PKCE, con openid-client.
 * Fase 5 · docs/modulos/admin/acceso-con-google.md («`admin.entrar_con_google`» y «`admin.confirmar_con_google`»)
 *
 * openid-client revisa del `id_token` el emisor, la audiencia, el vencimiento, el `nonce`, el `state`, el
 * verificador de PKCE y, con `max_age`, el `auth_time`; la firma la revisa con las llaves públicas del
 * emisor (`enableNonRepudiationChecks`). Aquí se pide además `email_verified`. El documento de
 * descubrimiento se lee una vez y se recuerda; si falla, se vuelve a pedir la siguiente vez.
 */

import * as openid from "openid-client";

/** Lo que dice Google de la cuenta que entró. */
export interface CuentaQueEntro {
	sub: string;
	/** En minúsculas y sin espacios. */
	correo: string;
	/** Cuándo pasó por Google, en segundos; con `max_age` siempre viene. */
	authTime: number | undefined;
}

/** Lo que guarda la ida para revisar la vuelta. */
export interface IdaAGoogle {
	state: string;
	nonce: string;
	verificador: string;
}

/** Cómo se habla con Google. */
export interface AccesoConGoogle {
	/**
	 * La dirección de Google a la que se manda el navegador, con un `state`, un `nonce` y un verificador nuevos.
	 * @param opciones `login_hint` y `max_age` (segundos), para «Confirmar con Google».
	 */
	ida: (opciones?: { correo?: string; maxAge?: number }) => Promise<{ direccion: URL; ida: IdaAGoogle }>;
	/**
	 * Cambia el código de la vuelta por el `id_token` y lo revisa.
	 * @param busqueda Los parámetros de la vuelta (`code`, `state`).
	 * @param ida Lo que guardó la ida.
	 * @param maxAge Los segundos de `max_age`, si la ida lo pidió.
	 * @throws Error si Google falla o el token no pasa la revisión.
	 */
	vuelta: (busqueda: URLSearchParams, ida: IdaAGoogle, maxAge?: number) => Promise<CuentaQueEntro>;
}

/** Lo que necesita: el emisor, el cliente y la dirección de vuelta. */
export interface ConfiguracionDeGoogle {
	emisor: string;
	clienteId: string;
	clienteSecreto: string;
	/** `https://api.uniformame.mx/v1/acceso/google/vuelta`. */
	vuelta: string;
	/** Solo en local: el proveedor de desarrollo corre en `http://localhost`. */
	permitirHttp?: boolean;
}

/**
 * Arma la entrada con Google.
 * @param configuracion El emisor, el cliente y la vuelta, de las variables de entorno.
 */
export function crearAccesoConGoogle(configuracion: ConfiguracionDeGoogle): AccesoConGoogle {
	let descubierto: Promise<openid.Configuration> | undefined;
	const descubrir = (): Promise<openid.Configuration> => {
		descubierto ??= openid
			.discovery(
				new URL(configuracion.emisor),
				configuracion.clienteId,
				undefined,
				openid.ClientSecretPost(configuracion.clienteSecreto),
				{
					execute: [
						openid.enableNonRepudiationChecks,
						...(configuracion.permitirHttp === true ? [openid.allowInsecureRequests] : []),
					],
				},
			)
			.catch((error: unknown) => {
				descubierto = undefined;
				throw error;
			});
		return descubierto;
	};
	return {
		async ida(opciones = {}) {
			const config = await descubrir();
			const ida = {
				state: openid.randomState(),
				nonce: openid.randomNonce(),
				verificador: openid.randomPKCECodeVerifier(),
			};
			const direccion = openid.buildAuthorizationUrl(config, {
				redirect_uri: configuracion.vuelta,
				scope: "openid email profile",
				response_type: "code",
				code_challenge: await openid.calculatePKCECodeChallenge(ida.verificador),
				code_challenge_method: "S256",
				state: ida.state,
				nonce: ida.nonce,
				...(opciones.correo === undefined ? {} : { login_hint: opciones.correo }),
				...(opciones.maxAge === undefined ? {} : { max_age: String(opciones.maxAge) }),
			});
			return { direccion, ida };
		},
		async vuelta(busqueda, ida, maxAge) {
			const config = await descubrir();
			const actual = new URL(configuracion.vuelta);
			actual.search = busqueda.toString();
			const tokens = await openid.authorizationCodeGrant(config, actual, {
				pkceCodeVerifier: ida.verificador,
				expectedState: ida.state,
				expectedNonce: ida.nonce,
				idTokenExpected: true,
				...(maxAge === undefined ? {} : { maxAge }),
			});
			const claims = tokens.claims();
			if (claims === undefined) throw new Error("Google no mandó id_token");
			if (claims.email_verified !== true || typeof claims.email !== "string") {
				throw new Error("el correo de Google no está verificado");
			}
			return {
				sub: claims.sub,
				correo: claims.email.trim().toLowerCase(),
				authTime: typeof claims.auth_time === "number" ? claims.auth_time : undefined,
			};
		},
	};
}
