/**
 * El Google de desarrollo de `pnpm local`: un proveedor OpenID con oidc-provider.
 * Fase 5 · docs/modulos/admin/acceso-con-google.md («En local y en las pruebas»)
 *
 * La API lo usa igual que a Google: solo cambia `GOOGLE_EMISOR` (`http://localhost:4000`). Su pantalla de
 * desarrollo pide un correo; con el de una cuenta de la muestra (los escribe al arrancar) se entra como
 * esa cuenta, y con cualquier otro se ve «Esta cuenta no tiene acceso». El `sub` es el correo. Pide PKCE,
 * pone el correo en el `id_token` y, con `max_age`, su `auth_time`. Las llaves de sus cookies nacen al
 * arrancar: no viven en el código.
 */

import { randomBytes } from "node:crypto";
import Provider from "oidc-provider";
import { cuentasDeLaMuestra } from "../../../semillas/cuentas.ts";
import { leerEntorno } from "../entorno.ts";

/** Lo que necesita: el emisor, el cliente de la API y su vuelta. */
export interface ConfiguracionDelGoogleLocal {
	emisor: string;
	clienteId: string;
	clienteSecreto: string;
	vuelta: string;
}

/**
 * Arma el proveedor de desarrollo.
 * @param configuracion El emisor y el cliente, de `.env`.
 */
export function crearGoogleLocal(configuracion: ConfiguracionDelGoogleLocal): Provider {
	return new Provider(configuracion.emisor, {
		clients: [
			{
				client_id: configuracion.clienteId,
				client_secret: configuracion.clienteSecreto,
				redirect_uris: [configuracion.vuelta],
				response_types: ["code"],
				grant_types: ["authorization_code"],
				token_endpoint_auth_method: "client_secret_post",
			},
		],
		claims: { openid: ["sub"], email: ["email", "email_verified"], profile: ["name"] },
		// El correo va en el `id_token`, como lo manda Google.
		conformIdTokenClaims: false,
		pkce: { required: () => true },
		cookies: { keys: [randomBytes(32).toString("hex")] },
		features: { devInteractions: { enabled: true } },
		findAccount: async (_contexto, sub) => {
			const correo = sub.trim().toLowerCase();
			return {
				accountId: correo,
				claims: () => ({ sub: correo, email: correo, email_verified: true, name: correo }),
			};
		},
	});
}

if (import.meta.main) {
	const entorno = leerEntorno();
	if (
		entorno.GOOGLE_EMISOR === undefined ||
		entorno.GOOGLE_CLIENTE_ID === undefined ||
		entorno.GOOGLE_CLIENTE_SECRETO === undefined
	) {
		console.error("El Google de desarrollo pide GOOGLE_EMISOR, GOOGLE_CLIENTE_ID y GOOGLE_CLIENTE_SECRETO en .env.");
		process.exit(1);
	}
	const emisor = new URL(entorno.GOOGLE_EMISOR);
	const proveedor = crearGoogleLocal({
		emisor: entorno.GOOGLE_EMISOR,
		clienteId: entorno.GOOGLE_CLIENTE_ID,
		clienteSecreto: entorno.GOOGLE_CLIENTE_SECRETO,
		vuelta: `${entorno.DOMINIO_API}/v1/acceso/google/vuelta`,
	});
	proveedor.listen(Number(emisor.port), emisor.hostname, () => {
		console.log(`Google de desarrollo en ${entorno.GOOGLE_EMISOR}. Entra con uno de estos correos:`);
		for (const cuenta of cuentasDeLaMuestra) console.log(`  · ${cuenta.correo}`);
	});
}
