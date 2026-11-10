/**
 * El simulador de Google (OpenID Connect) para las pruebas.
 * Fase 2 · docs/cimientos/PRUEBAS.md («Simuladores de los servicios de fuera») y docs/modulos/admin/acceso-con-google.md
 *
 * Sigue la interfaz oficial de Google: el documento de descubrimiento, el intercambio del código en el
 * punto de tokens (con PKCE S256) y las llaves públicas para revisar el `id_token`, firmado con RS256
 * por una llave de prueba que nace con cada simulador. Trae tres cuentas: la dueña, una dada de alta y
 * una que el sistema no conoce. El `id_token` lleva `auth_time` (la hora de entrar, o la que diga la
 * prueba) y se puede pedir dañado: con otra firma, otro `nonce`, otra audiencia o ya vencido.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 2)
 */

import { createHash, createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { HttpResponse, http } from "msw";
import { aplicarFalla, type ModoDeFalla } from "./fallas.ts";

/** El emisor de Google, como lo dice su documento de descubrimiento. */
export const emisorDeGoogle = "https://accounts.google.com";
const puntoDeTokens = "https://oauth2.googleapis.com/token";
const puntoDeLlaves = "https://www.googleapis.com/oauth2/v3/certs";

/** Una cuenta de Google de prueba. */
export interface CuentaDeGoogle {
	sub: string;
	email: string;
	name: string;
}

/** Las cuentas de prueba. Los correos usan `.invalid`, que nunca existe. */
export const cuentasDeGoogle = {
	duena: { sub: "100000000000000000001", email: "duena@alameda.invalid", name: "La dueña" },
	dadaDeAlta: { sub: "100000000000000000002", email: "aduana@alameda.invalid", name: "Aduana" },
	noExiste: { sub: "100000000000000000003", email: "desconocida@ejemplo.invalid", name: "Desconocida" },
} satisfies Record<string, CuentaDeGoogle>;

/** Cómo sale dañado un `id_token`, para probar que no entra. */
export type DanoDelToken = "firma" | "nonce" | "audiencia" | "vencido";

/** Lo que se guardó al emitir un código: de quién es y lo que hay que revisar al cambiarlo. */
interface CodigoEmitido {
	cuenta: CuentaDeGoogle;
	nonce: string | undefined;
	/** Cuándo pasó por Google, en segundos. */
	authTime: number | undefined;
	dano: DanoDelToken | undefined;
	retoPkce: string | undefined;
	redireccion: string;
	usado: boolean;
}

/** Codifica en base64url, como piden los JWT. */
function base64url(datos: Buffer | string): string {
	return Buffer.from(datos).toString("base64url");
}

/**
 * Crea un simulador de Google con su propia llave de firma.
 * @param cliente El `client_id` (que lleva el `aud` del `id_token`) y el `client_secret` que espera el punto de tokens.
 * @param ahora De dónde sale la hora, en segundos; las pruebas la fijan.
 * @returns Sus manejadores de MSW, cómo emitir un código para una cuenta y cómo ponerlo a fallar.
 */
export function crearSimuladorDeGoogle(
	cliente: { id: string; secreto: string },
	ahora: () => number = () => Math.floor(Date.now() / 1000),
) {
	const clienteId = cliente.id;
	const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
	// Otra llave, que no está en las públicas: firma los tokens con la firma dañada.
	const otraLlave = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
	const kid = randomUUID();
	const codigos = new Map<string, CodigoEmitido>();
	let modo: ModoDeFalla = "ninguna";

	/** Firma un `id_token` para el código emitido, dañado si así se pidió. */
	function firmarIdToken(emitido: CodigoEmitido): string {
		const { cuenta, nonce, dano } = emitido;
		const hora = ahora();
		const encabezado = base64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
		const contenido = base64url(
			JSON.stringify({
				iss: emisorDeGoogle,
				azp: clienteId,
				aud: dano === "audiencia" ? "otro-cliente.apps.googleusercontent.com" : clienteId,
				sub: cuenta.sub,
				email: cuenta.email,
				email_verified: true,
				name: cuenta.name,
				iat: dano === "vencido" ? hora - 7200 : hora,
				exp: dano === "vencido" ? hora - 3600 : hora + 3600,
				auth_time: emitido.authTime ?? hora,
				...(nonce === undefined ? {} : { nonce: dano === "nonce" ? `${nonce}-otro` : nonce }),
			}),
		);
		const firma = createSign("RSA-SHA256")
			.update(`${encabezado}.${contenido}`)
			.sign(dano === "firma" ? otraLlave : privateKey);
		return `${encabezado}.${contenido}.${base64url(firma)}`;
	}

	/** El error de Google para un código o un verificador que no sirven. */
	const concesionInvalida = () =>
		HttpResponse.json({ error: "invalid_grant", error_description: "Bad Request" }, { status: 400 });
	const erroresDeGoogle = {
		servidor: () => HttpResponse.json({ error: "server_error", error_description: "Internal error" }, { status: 500 }),
		demasiadasPeticiones: () =>
			HttpResponse.json({ error: "rate_limit_exceeded", error_description: "Too many requests" }, { status: 429 }),
	};

	const manejadores = [
		http.get(`${emisorDeGoogle}/.well-known/openid-configuration`, async () => {
			return (
				(await aplicarFalla(modo, erroresDeGoogle)) ??
				HttpResponse.json({
					issuer: emisorDeGoogle,
					authorization_endpoint: `${emisorDeGoogle}/o/oauth2/v2/auth`,
					token_endpoint: puntoDeTokens,
					jwks_uri: puntoDeLlaves,
					response_types_supported: ["code"],
					subject_types_supported: ["public"],
					id_token_signing_alg_values_supported: ["RS256"],
					scopes_supported: ["openid", "email", "profile"],
					code_challenge_methods_supported: ["plain", "S256"],
				})
			);
		}),
		http.get(puntoDeLlaves, async () => {
			return (
				(await aplicarFalla(modo, erroresDeGoogle)) ??
				HttpResponse.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" }] })
			);
		}),
		http.post(puntoDeTokens, async ({ request }) => {
			const falla = await aplicarFalla(modo, erroresDeGoogle);
			if (falla) return falla;
			const datos = new URLSearchParams(await request.text());
			const emitido = codigos.get(datos.get("code") ?? "");
			if (
				datos.get("grant_type") !== "authorization_code" ||
				datos.get("client_id") !== clienteId ||
				datos.get("client_secret") !== cliente.secreto
			) {
				return HttpResponse.json({ error: "invalid_client", error_description: "Unauthorized" }, { status: 401 });
			}
			if (emitido === undefined || emitido.usado) return concesionInvalida();
			if (datos.get("redirect_uri") !== emitido.redireccion) {
				return HttpResponse.json({ error: "redirect_uri_mismatch", error_description: "Bad Request" }, { status: 400 });
			}
			// PKCE: el verificador tiene que dar el reto con que se pidió el código.
			const verificador = datos.get("code_verifier") ?? "";
			if (
				emitido.retoPkce !== undefined &&
				base64url(createHash("sha256").update(verificador).digest()) !== emitido.retoPkce
			) {
				return concesionInvalida();
			}
			emitido.usado = true;
			return HttpResponse.json({
				access_token: `ya29.${randomUUID()}`,
				expires_in: 3599,
				scope: "openid email profile",
				token_type: "Bearer",
				id_token: firmarIdToken(emitido),
			});
		}),
	];

	return {
		manejadores,
		/**
		 * Emite el código que Google le daría a la app después de que la cuenta entra.
		 * @param cuenta Una de `cuentasDeGoogle`.
		 * @param pedido La dirección de vuelta, y el `nonce` y el reto PKCE (S256) con que la app pidió entrar;
		 * `authTime` (segundos) si la prueba fija cuándo pasó por Google, y `dano` para un token que no debe entrar.
		 */
		emitirCodigo(
			cuenta: CuentaDeGoogle,
			pedido: { redireccion: string; nonce?: string; retoPkce?: string; authTime?: number; dano?: DanoDelToken },
		): string {
			const codigo = `4/${randomUUID()}`;
			codigos.set(codigo, {
				cuenta,
				nonce: pedido.nonce,
				authTime: pedido.authTime,
				dano: pedido.dano,
				retoPkce: pedido.retoPkce,
				redireccion: pedido.redireccion,
				usado: false,
			});
			return codigo;
		},
		ponerAFallar(nuevoModo: ModoDeFalla): void {
			modo = nuevoModo;
		},
	};
}
