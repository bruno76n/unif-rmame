/**
 * Prueba de la entrada con Google (`GET /v1/acceso/google` y su vuelta), con el simulador de Google.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 2)
 */

import { createHash } from "node:crypto";
import { type CuentaDeGoogle, crearSimuladorDeGoogle, cuentasDeGoogle } from "@uniformame/pruebas/simuladores/google";
import { setupServer } from "msw/node";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { entrarConGoogle } from "../../../nucleo/pruebas/google.ts";
import { darDeAltaCuenta } from "../../../nucleo/pruebas/llamadas.ts";
import {
	clienteDeGooglePrueba,
	crearServidorDePrueba,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

const simulador = crearSimuladorDeGoogle({ id: clienteDeGooglePrueba.id, secreto: clienteDeGooglePrueba.secreto });
const red = setupServer(...simulador.manejadores);

describe("una cuenta activa entra con Google y su sesión queda solo como hash; la primera entrada liga su google_sub; un token malo, o una cuenta sin acceso, no entra; un aparato nuevo deja una alerta", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba({ conGoogle: true });
		idDeGloria = await darDeAltaCuenta(servidor, gloria.email, ["calidad"]);
	});
	afterAll(async () => {
		red.close();
		await servidor.cerrar();
	});

	/** Las sesiones de una cuenta. */
	async function sesionesDe(usuarioId: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT token_hash, huella_aparato, es_aparato_nuevo, aparato, ip, cerrada_en FROM sesiones WHERE usuario_id = $1 ORDER BY creado_en",
			[usuarioId],
		);
		return rows;
	}

	/** Los renglones de bitácora de las entradas. */
	async function entradas() {
		const { rows } = await servidor.base.dueno.query(
			`SELECT b.descripcion, b.tipo, b.es_alerta, b.usuario_id, b.correo_intento, host(b.ip) AS ip, d.clave AS departamento
			 FROM bitacora b LEFT JOIN departamentos d ON d.id = b.departamento_id
			 WHERE b.accion = 'admin.entrar_con_google' ORDER BY b.ocurrido_en`,
		);
		return rows;
	}

	const aduana = cuentasDeGoogle.dadaDeAlta;
	/** Una cuenta recién dada de alta, que nunca ha entrado, y su cuenta de Google. */
	const gloria: CuentaDeGoogle = { sub: "100000000000000000077", email: "gloria@alameda.invalid", name: "Gloria" };
	let idDeGloria = "";
	let aparatoDeGloria = "";

	it("la ida manda a Google con PKCE S256, state y nonce, y guarda la ida cifrada en ua_google por 10 minutos", async () => {
		const ida = await servidor.app.inject({ method: "GET", url: "/v1/acceso/google?regresar=/aduana" });
		expect(ida.statusCode).toBe(302);
		const aGoogle = new URL(String(ida.headers.location));
		expect(aGoogle.origin + aGoogle.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
		expect(Object.fromEntries(aGoogle.searchParams)).toMatchObject({
			client_id: clienteDeGooglePrueba.id,
			redirect_uri: clienteDeGooglePrueba.vuelta,
			response_type: "code",
			scope: "openid email profile",
			code_challenge_method: "S256",
			state: expect.any(String),
			nonce: expect.any(String),
			code_challenge: expect.any(String),
		});
		const cookie = ida.cookies.find((galleta) => galleta.name === "ua_google");
		expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600 });
		expect(cookie?.value).not.toContain(aGoogle.searchParams.get("state"));
	});

	it("la primera entrada liga el google_sub, abre la sesión con su hash, pone ua_sesion y ua_aparato y regresa a la web; deja «Entró al sistema» sin alerta", async () => {
		const vuelta = await entrarConGoogle(servidor, simulador, gloria, { regresar: "/calidad/lotes" });
		expect(vuelta.estado).toBe(302);
		expect(vuelta.ubicacion).toBe("https://fabrica.prueba.invalid/calidad/lotes");
		const sesion = vuelta.cookies.ua_sesion;
		expect(sesion?.opciones).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
		expect(vuelta.cookies.ua_aparato?.opciones).toMatchObject({ httpOnly: true, maxAge: 400 * 24 * 60 * 60 });
		aparatoDeGloria = vuelta.cookies.ua_aparato?.valor ?? "";
		const { rows } = await servidor.base.dueno.query("SELECT google_sub FROM usuarios WHERE id = $1", [idDeGloria]);
		expect(rows[0]?.google_sub).toBe(gloria.sub);
		const guardadas = await sesionesDe(idDeGloria);
		const nueva = guardadas.at(-1);
		expect(nueva?.token_hash).toBe(
			createHash("sha256")
				.update(sesion?.valor ?? "")
				.digest("hex"),
		);
		expect(nueva).toMatchObject({ es_aparato_nuevo: false, aparato: "iPhone · Safari", ip: "203.0.113.10" });
		// El identificador de la cookie no queda en ninguna parte de la base.
		const enLaBase = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM sesiones WHERE token_hash = $1 OR agente LIKE $2",
			[sesion?.valor, `%${sesion?.valor}%`],
		);
		expect(enLaBase.rows[0]?.n).toBe(0);
		expect(await entradas()).toEqual([
			{
				descripcion: "Entró al sistema",
				tipo: "acceso",
				es_alerta: false,
				usuario_id: idDeGloria,
				correo_intento: null,
				ip: "203.0.113.10",
				departamento: "admin",
			},
		]);
	});

	it("desde el mismo navegador no hay alerta; desde un aparato nuevo, «Entró desde un dispositivo nuevo» con alerta", async () => {
		await entrarConGoogle(servidor, simulador, gloria, { cookies: { ua_aparato: aparatoDeGloria } });
		expect((await entradas()).filter((renglon) => renglon.es_alerta)).toEqual([]);
		const otro = await entrarConGoogle(servidor, simulador, gloria, {
			ip: "203.0.113.20",
			agente: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
		});
		expect(otro.estado).toBe(302);
		const alertas = (await entradas()).filter((renglon) => renglon.es_alerta);
		expect(alertas).toEqual([
			expect.objectContaining({ descripcion: "Entró desde un dispositivo nuevo: Windows · Chrome", tipo: "acceso" }),
		]);
		expect((await sesionesDe(idDeGloria)).at(-1)?.es_aparato_nuevo).toBe(true);
	});

	it.each([
		["firma", 1],
		["nonce", 2],
		["audiencia", 3],
		["vencido", 4],
		["emisor", 5],
		["sin_verificar", 6],
	] as const)(
		"un id_token con %s malo no entra: regresa a la pantalla de acceso con google_fallo y no abre sesión",
		async (dano, n) => {
			const antes = (await sesionesDe(cuentaDePrueba("aduana"))).length;
			const vuelta = await entrarConGoogle(servidor, simulador, aduana, { dano, ip: `198.51.100.${n}` });
			expect(vuelta.ubicacion).toBe("https://fabrica.prueba.invalid/acceso?error=google_fallo");
			expect(vuelta.cookies.ua_sesion).toBeUndefined();
			expect(await sesionesDe(cuentaDePrueba("aduana"))).toHaveLength(antes);
		},
	);

	it("una ida cambiada, una vuelta con el state de otra ida o un código de otro reto de PKCE no entran", async () => {
		for (const opciones of [{ cambiarLaIda: true }, { stateAjeno: true }, { otroReto: true }]) {
			const vuelta = await entrarConGoogle(servidor, simulador, aduana, { ...opciones, ip: "198.51.100.50" });
			expect(vuelta.ubicacion).toBe("https://fabrica.prueba.invalid/acceso?error=google_fallo");
			expect(vuelta.cookies.ua_sesion).toBeUndefined();
		}
	});

	it("ningún código, token, verificador ni secreto del cliente queda en el registro técnico", () => {
		const registro = servidor.registro.join("\n");
		for (const prohibido of ["4/", "eyJ", "ya29.", "code_verifier", "verificador", clienteDeGooglePrueba.secreto]) {
			expect([prohibido, registro.includes(prohibido)]).toEqual([prohibido, false]);
		}
	});

	it("una cuenta de Google sin alta no entra: «Esta cuenta no tiene acceso» con su correo y una alerta con correo_intento", async () => {
		const vuelta = await entrarConGoogle(servidor, simulador, cuentasDeGoogle.noExiste, { ip: "198.51.100.60" });
		expect(vuelta.ubicacion).toBe(
			"https://fabrica.prueba.invalid/acceso?error=sin_acceso#correo=desconocida%40ejemplo.invalid",
		);
		expect(vuelta.cookies.ua_sesion).toBeUndefined();
		expect((await entradas()).at(-1)).toMatchObject({
			descripcion: "Intentó entrar una cuenta de Google sin acceso: desconocida@ejemplo.invalid",
			es_alerta: true,
			usuario_id: null,
			correo_intento: "desconocida@ejemplo.invalid",
		});
	});

	it.each([
		["solicitada", 1],
		["rechazada", 2],
		["sin_acceso", 3],
	])("una cuenta %s no entra", async (estado, n) => {
		const correo = `cuenta.${estado}@alameda.invalid`;
		await servidor.base.dueno.query(
			`INSERT INTO usuarios (id, persona_id, correo, estado, baja_en, baja_confirmado_con_google_en)
			 VALUES ($1, $2, $3, $4, $5, $5)`,
			[uuidv7(), uuidv7(), correo, estado, estado === "sin_acceso" ? new Date().toISOString() : null],
		);
		const cuenta: CuentaDeGoogle = { sub: `20000000000000000000${n}`, email: correo, name: estado };
		const vuelta = await entrarConGoogle(servidor, simulador, cuenta, { ip: `198.51.100.7${n}` });
		expect(vuelta.ubicacion).toContain("/acceso?error=sin_acceso");
	});

	it("el correo de una cuenta activa que ya tiene otro google_sub no entra", async () => {
		const otra: CuentaDeGoogle = { sub: "999999999999999999999", email: gloria.email, name: "Otra" };
		const vuelta = await entrarConGoogle(servidor, simulador, otra, { ip: "198.51.100.90" });
		expect(vuelta.ubicacion).toContain("/acceso?error=sin_acceso");
	});

	it("regresar a otro sitio no se puede, ni con un tabulador o un salto de línea escondidos: regresa a la raíz de la web; una ruta de la web se respeta", async () => {
		for (const regresar of [
			"//malo.invalid/robar",
			"/\t/malo.invalid/robar",
			"/\n/malo.invalid",
			"/\r/malo.invalid",
			"/\\malo.invalid",
			"https://malo.invalid/",
			"/.//malo.invalid/robar",
			"/a/..//malo.invalid",
			"/%2e//malo.invalid",
		]) {
			const vuelta = await entrarConGoogle(servidor, simulador, gloria, {
				regresar,
				cookies: { ua_aparato: aparatoDeGloria },
			});
			expect([regresar, vuelta.ubicacion]).toEqual([regresar, "https://fabrica.prueba.invalid/"]);
		}
		const buena = await entrarConGoogle(servidor, simulador, gloria, {
			regresar: "/calidad/lotes?estado=abierto",
			cookies: { ua_aparato: aparatoDeGloria },
		});
		expect(buena.ubicacion).toBe("https://fabrica.prueba.invalid/calidad/lotes?estado=abierto");
	});

	it("entrar otra vez desde el mismo navegador cierra la sesión que traía, con salio", async () => {
		const primera = await entrarConGoogle(servidor, simulador, gloria, { cookies: { ua_aparato: aparatoDeGloria } });
		const sesion = primera.cookies.ua_sesion?.valor ?? "";
		await entrarConGoogle(servidor, simulador, gloria, {
			cookies: { ua_aparato: aparatoDeGloria, ua_sesion: sesion },
		});
		const { rows } = await servidor.base.dueno.query("SELECT motivo_cierre FROM sesiones WHERE token_hash = $1", [
			createHash("sha256").update(sesion).digest("hex"),
		]);
		expect(rows[0]?.motivo_cierre).toBe("salio");
		// Y a las pantallas de esa sesión les llega `sesion_cerrada`.
		const evento = await servidor.base.dueno.query(
			"SELECT datos FROM eventos WHERE tipo = 'sesion.cerrada' AND datos->>'sesion_ids' = (SELECT id::text FROM sesiones WHERE token_hash = $1)",
			[createHash("sha256").update(sesion).digest("hex")],
		);
		expect(evento.rows).toEqual([{ datos: expect.objectContaining({ motivo: "salio" }) }]);
	});
});
