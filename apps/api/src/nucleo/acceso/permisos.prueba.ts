/**
 * Prueba de la revisión de cada llamada: recorre todos los contratos registrados.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 4)
 *
 * Cada acción y cada consulta se llama, con la sesión de verdad, con una cuenta a la que le falta lo que
 * pide su contrato: el departamento, el permiso fino, ser la dueña o «Confirmar con Google»; y una cuenta
 * no llama lo que es solo de aparatos. Los datos se arman de la entrada del contrato, para que lleguen
 * hasta el permiso. La cuenta de soporte nunca recibe un monto: ni en una consulta, ni en una acción, ni
 * en un `409`, y cada monto de un resultado es opcional para que se pueda recortar.
 */

import type { ContratoDeAccion, ContratoDeConsulta } from "@uniformame/compartido/contratos/definir";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { cuentaDePrueba, quienesDePrueba } from "../pruebas/cuentas-de-prueba.ts";
import { nuevaClave } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, dominios, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";
import { hashDe, nuevoIdentificador } from "./cookies.ts";
import { recorteComun } from "./recorte.ts";

/** Un esquema JSON, como lo da `z.toJSONSchema`: lo que la prueba lee de él. */
interface EsquemaJson {
	type?: string | undefined;
	properties?: Record<string, EsquemaJson> | undefined;
	required?: string[] | undefined;
	items?: EsquemaJson | undefined;
	enum?: unknown[] | undefined;
	const?: unknown;
	format?: string | undefined;
	minLength?: number | undefined;
	minimum?: number | undefined;
	exclusiveMinimum?: number | undefined;
	minItems?: number | undefined;
	anyOf?: EsquemaJson[] | undefined;
	oneOf?: EsquemaJson[] | undefined;
}

/** Lee un esquema JSON con la forma de `EsquemaJson`. */
const esquemaJson: z.ZodType<EsquemaJson, unknown> = z.lazy(() =>
	z.looseObject({
		// Un tipo que acepta nulo viene en lista (`["string", "null"]`): vale el que no es nulo.
		type: z
			.union([z.string(), z.array(z.string())])
			.optional()
			.transform((tipo) => (Array.isArray(tipo) ? tipo.find((uno) => uno !== "null") : tipo)),
		properties: z.record(z.string(), esquemaJson).optional(),
		required: z.array(z.string()).optional(),
		items: esquemaJson.optional(),
		enum: z.array(z.unknown()).optional(),
		const: z.unknown().optional(),
		format: z.string().optional(),
		minLength: z.number().optional(),
		minimum: z.number().optional(),
		exclusiveMinimum: z.number().optional(),
		minItems: z.number().optional(),
		anyOf: z.array(esquemaJson).optional(),
		oneOf: z.array(esquemaJson).optional(),
	}),
);

/** El esquema JSON de un esquema de Zod. */
function aJson(esquema: z.ZodType, io: "input" | "output"): EsquemaJson {
	return esquemaJson.parse(z.toJSONSchema(esquema, { io }));
}

/** Los campos cuya forma revisa una transformación que el esquema de entrada no dice. */
const ejemplosPorCampo: Record<string, string> = { correo: "alguien@alameda.invalid", rfc: "UAL010101AB1" };

/**
 * Un valor que cumple un esquema JSON, para llegar hasta el permiso: lo obligatorio y nada más.
 * @param esquema El esquema de la entrada.
 * @param nombre El nombre del campo, para los de `ejemplosPorCampo`.
 */
function ejemploDe(esquema: EsquemaJson, nombre = ""): unknown {
	const opcion = esquema.anyOf?.[0] ?? esquema.oneOf?.[0];
	if (opcion !== undefined) return ejemploDe(opcion, nombre);
	if (esquema.const !== undefined) return esquema.const;
	if (esquema.enum !== undefined) return esquema.enum[0];
	if (esquema.type === "object") {
		return Object.fromEntries(
			(esquema.required ?? []).map((campo) => [campo, ejemploDe(esquema.properties?.[campo] ?? {}, campo)]),
		);
	}
	if (esquema.type === "array") {
		return Array.from({ length: esquema.minItems ?? 0 }, () => ejemploDe(esquema.items ?? {}));
	}
	if (esquema.type === "boolean") return true;
	if (esquema.type === "integer" || esquema.type === "number") {
		return esquema.exclusiveMinimum !== undefined ? esquema.exclusiveMinimum + 1 : (esquema.minimum ?? 1);
	}
	if (esquema.format === "uuid") return uuidv7();
	const porCampo = ejemplosPorCampo[nombre];
	if (porCampo !== undefined) return porCampo;
	if (esquema.format === "email") return "alguien@alameda.invalid";
	if (esquema.format === "date-time") return "2026-11-10T12:00:00Z";
	if (esquema.format === "date") return "2026-11-10";
	return "x".repeat(Math.max(esquema.minLength ?? 1, 1));
}

/** Lo que una cuenta sin permiso recibe: su estado y su error. */
interface Rechazo {
	estado: number;
	error: string;
	codigo: string | null;
}

describe("cada acción y consulta revisa en el servidor su departamento, su permiso fino, solo_duena y «Confirmar con Google»; la cuenta de soporte nunca recibe montos", () => {
	let servidor: ServidorDePrueba;
	/** Las cookies de las cuentas que arma la prueba, por lo que tienen. */
	const sesiones = new Map<string, string>();
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ sesionReal: true });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/**
	 * Una cuenta activa con esos departamentos y permisos finos, con su sesión abierta.
	 * @param departamentos Sus departamentos.
	 * @param opciones Sus permisos finos, si es la dueña, si es soporte y si confirmó con Google.
	 * @returns El valor de su cookie `ua_sesion`.
	 */
	async function sesionDe(
		departamentos: readonly string[],
		opciones: { permisos?: readonly string[]; duena?: true; soporte?: true; confirmada?: true } = {},
	): Promise<string> {
		const llave = JSON.stringify([departamentos, opciones]);
		const guardada = sesiones.get(llave);
		if (guardada !== undefined) return guardada;
		const usuarioId =
			opciones.duena === true
				? cuentaDePrueba("duena")
				: opciones.soporte === true
					? cuentaDePrueba("soporte")
					: uuidv7();
		if (opciones.duena !== true && opciones.soporte !== true) {
			await servidor.base.dueno.query(
				"INSERT INTO usuarios (id, persona_id, correo, estado) VALUES ($1, $2, $3, 'activa')",
				[usuarioId, uuidv7(), `${usuarioId}@alameda.invalid`],
			);
		}
		for (const clave of departamentos) {
			await servidor.base.dueno.query(
				`INSERT INTO usuario_departamentos (id, usuario_id, departamento_id)
				 SELECT $1, $2, id FROM departamentos WHERE clave = $3
				 ON CONFLICT DO NOTHING`,
				[uuidv7(), usuarioId, clave],
			);
		}
		for (const permiso of opciones.permisos ?? []) {
			await servidor.base.dueno.query("INSERT INTO permisos_finos (id, usuario_id, permiso) VALUES ($1, $2, $3)", [
				uuidv7(),
				usuarioId,
				permiso,
			]);
		}
		const identificador = nuevoIdentificador();
		await servidor.base.dueno.query(
			`INSERT INTO sesiones (id, usuario_id, token_hash, ultima_actividad_en, vence_en, google_confirmado_en)
			 VALUES ($1, $2, $3, now(), now() + interval '1 hour', $4)`,
			[uuidv7(), usuarioId, hashDe(identificador), opciones.confirmada === true ? new Date().toISOString() : null],
		);
		sesiones.set(llave, identificador);
		return identificador;
	}

	/** Llama una acción o una consulta con la cookie de una sesión. */
	async function llamar(
		contrato: ContratoDeAccion | ContratoDeConsulta,
		sesion: string,
		datos?: unknown,
	): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
		const ejemplo = datos ?? ejemploDe(aJson(contrato.entrada, "input"));
		const respuesta =
			contrato.tipo === "accion"
				? await servidor.app.inject({
						method: "POST",
						url: `/v1/acciones/${contrato.nombre}`,
						headers: { "x-app-version": "1.0.0", origin: dominios.DOMINIO_WEB },
						cookies: { ua_sesion: sesion },
						payload: {
							clave_idempotencia: nuevaClave(),
							datos: ejemplo,
							...(contrato.edita ? { version: 1 } : {}),
						},
					})
				: await servidor.app.inject({
						method: "GET",
						url: `/v1/consultas/${contrato.nombre}?${new URLSearchParams(
							Object.entries(typeof ejemplo === "object" && ejemplo !== null ? ejemplo : {}).map(([campo, valor]) => [
								campo,
								String(valor),
							]),
						).toString()}`,
						headers: { "x-app-version": "1.0.0", origin: dominios.DOMINIO_WEB },
						cookies: { ua_sesion: sesion },
					});
		return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
	}

	/** Lo que el contrato le debe negar a una cuenta a la que le falta lo que pide, y cómo es esa cuenta. */
	async function sinPermisoPara(
		contrato: ContratoDeAccion | ContratoDeConsulta,
	): Promise<{ sesion: string; esperado: Rechazo } | undefined> {
		const { permiso } = contrato;
		const otroDepartamento = permiso.departamento === "personal" ? "compras" : "personal";
		if (permiso.aparatos !== undefined && permiso.departamento === undefined && permiso.soloDuena !== true) {
			return {
				sesion: await sesionDe(["admin"]),
				esperado: { estado: 403, error: "sin_permiso", codigo: "fuera_de_alcance" },
			};
		}
		if (permiso.departamento !== undefined) {
			return {
				sesion: await sesionDe([otroDepartamento]),
				esperado: { estado: 403, error: "sin_permiso", codigo: "sin_departamento" },
			};
		}
		if (permiso.soloDuena === true) {
			return {
				sesion: await sesionDe(["admin"]),
				esperado: { estado: 403, error: "sin_permiso", codigo: "solo_duena" },
			};
		}
		return undefined;
	}

	it("a cada contrato registrado, una cuenta sin su departamento (o que no es la dueña, o con lo que es solo de aparatos) recibe 403 con su código", async () => {
		const contratos = [
			...[...servidor.modulos.acciones.values()].map((accion) => accion.contrato),
			...[...servidor.modulos.consultas.values()].map((consulta) => consulta.contrato),
		];
		expect(contratos.length).toBeGreaterThan(20);
		const resultados: Record<string, Rechazo | string> = {};
		const esperados: Record<string, Rechazo | string> = {};
		for (const contrato of contratos) {
			const caso = await sinPermisoPara(contrato);
			if (caso === undefined) continue;
			const { estado, cuerpo } = await llamar(contrato, caso.sesion);
			resultados[contrato.nombre] = {
				estado,
				error: String(cuerpo.error),
				codigo: typeof cuerpo.codigo === "string" ? cuerpo.codigo : null,
			};
			esperados[contrato.nombre] = caso.esperado;
		}
		expect(resultados).toEqual(esperados);
	});

	it("con el departamento pero sin el permiso fino, 403 sin_permiso_fino; sin ser la dueña, 403 solo_duena", async () => {
		const contratos = [
			...[...servidor.modulos.acciones.values()].map((accion) => accion.contrato),
			...[...servidor.modulos.consultas.values()].map((consulta) => consulta.contrato),
		];
		const conPermisoFino = contratos.filter((contrato) => contrato.permiso.permisoFino !== undefined);
		const deLaDuena = contratos.filter(
			(contrato) => contrato.permiso.soloDuena === true && contrato.permiso.departamento !== undefined,
		);
		expect(conPermisoFino.length).toBeGreaterThan(0);
		expect(deLaDuena.length).toBeGreaterThan(5);
		for (const contrato of conPermisoFino) {
			const sesion = await sesionDe([contrato.permiso.departamento ?? "admin"]);
			expect([contrato.nombre, (await llamar(contrato, sesion)).cuerpo.codigo]).toEqual([
				contrato.nombre,
				"sin_permiso_fino",
			]);
		}
		for (const contrato of deLaDuena) {
			const sesion = await sesionDe([contrato.permiso.departamento ?? "admin"], { permisos: ["imprime_guias"] });
			expect([contrato.nombre, (await llamar(contrato, sesion)).cuerpo.codigo]).toEqual([
				contrato.nombre,
				"solo_duena",
			]);
		}
	});

	it("a cada contrato que pide «Confirmar con Google», la dueña sin una confirmación reciente recibe 401 reautenticar con su propósito", async () => {
		const contratos = [...servidor.modulos.acciones.values()]
			.map((accion) => accion.contrato)
			.filter((contrato) => contrato.permiso.confirmarConGoogle !== undefined);
		expect(contratos.length).toBeGreaterThan(4);
		const sesion = await sesionDe([], { duena: true });
		for (const contrato of contratos) {
			const { estado, cuerpo } = await llamar(contrato, sesion);
			expect([contrato.nombre, estado, cuerpo.error, cuerpo.proposito, cuerpo.minutos]).toEqual([
				contrato.nombre,
				401,
				"reautenticar",
				contrato.permiso.confirmarConGoogle,
				5,
			]);
		}
	});

	it("sin sesión, o con una que no existe, toda acción y consulta responde 401 sin_sesion", async () => {
		const accion = servidor.modulos.acciones.get("prueba.crear_nota")?.contrato;
		const consulta = servidor.modulos.consultas.get("prueba.notas")?.contrato;
		if (accion === undefined || consulta === undefined) throw new Error("faltan los contratos de prueba");
		for (const contrato of [accion, consulta]) {
			const { estado, cuerpo } = await llamar(contrato, nuevoIdentificador());
			expect([estado, cuerpo.error]).toEqual([401, "sin_sesion"]);
		}
	});

	it("todo monto o sueldo de un resultado es opcional, para que el servidor lo pueda recortar", () => {
		const obligatorios: string[] = [];
		const revisar = (nombre: string, esquema: EsquemaJson, ruta: string) => {
			for (const [campo, interior] of Object.entries(esquema.properties ?? {})) {
				const monto = campo.endsWith("_centavos") || servidor.modulos.camposDeSueldo.has(campo);
				if (monto && (esquema.required ?? []).includes(campo)) obligatorios.push(`${nombre}: ${ruta}${campo}`);
				revisar(nombre, interior, `${ruta}${campo}.`);
				if (interior.items !== undefined) revisar(nombre, interior.items, `${ruta}${campo}[].`);
			}
		};
		for (const { contrato } of [...servidor.modulos.acciones.values(), ...servidor.modulos.consultas.values()]) {
			revisar(contrato.nombre, aJson(contrato.resultado, "output"), "");
		}
		expect(obligatorios).toEqual([]);
	});

	it("la cuenta de soporte, aunque tuviera el departamento, no recibe montos ni sueldos: ni en una consulta que no los recorta (y recortado lo dice), ni en un 409; sin «ven sueldos y tarifas», no recibe sueldos", async () => {
		const sinRecorte = servidor.modulos.consultas.get("prueba.sin_recorte")?.contrato;
		const provocar = servidor.modulos.acciones.get("prueba.provocar")?.contrato;
		if (sinRecorte === undefined || provocar === undefined) throw new Error("faltan los contratos de prueba");
		const soporte = await sesionDe(["ventas"], { soporte: true });
		const deSoporte = await llamar(sinRecorte, soporte, {});
		expect(deSoporte.estado).toBe(200);
		expect(deSoporte.cuerpo).toMatchObject({
			resultado: { texto: "Con montos", renglones: [{}] },
			recortado: ["monto_centavos", "pago_dia_centavos"],
		});
		expect(JSON.stringify(deSoporte.cuerpo)).not.toMatch(/125000|45000/);
		const ventas = await sesionDe(["ventas"]);
		const deVentas = await llamar(sinRecorte, ventas, {});
		expect(deVentas.cuerpo).toMatchObject({
			resultado: { monto_centavos: 125_000, renglones: [{}] },
			recortado: ["pago_dia_centavos"],
		});
		const duena = await sesionDe([], { duena: true });
		expect((await llamar(sinRecorte, duena, {})).cuerpo).toMatchObject({
			resultado: { monto_centavos: 125_000, renglones: [{ pago_dia_centavos: 45_000 }] },
			recortado: [],
		});
		const conflicto = await llamar(provocar, soporte, { error: "conflicto_con_monto" });
		expect(conflicto.estado).toBe(409);
		expect(conflicto.cuerpo).toMatchObject({ version: 3, datos: { texto: "La nota" } });
		expect(JSON.stringify(conflicto.cuerpo)).not.toContain("125000");
		expect((await llamar(provocar, ventas, { error: "conflicto_con_monto" })).cuerpo).toMatchObject({
			datos: { monto_centavos: 125_000 },
		});
	});

	it("el recorte común: soporte pierde todo monto; sin «ven sueldos y tarifas», los sueldos; la dueña y quien lo tiene, nada", () => {
		const respuesta = { nota: { total_centavos: 5000, pago_dia_centavos: 45_000, nombre: "Ana" } };
		const sueldos = new Set(["pago_dia_centavos"]);
		const cuenta = quienesDePrueba.ventas;
		const duena = quienesDePrueba.duena;
		const soporte = quienesDePrueba.soporte;
		if (cuenta?.tipo !== "cuenta" || duena?.tipo !== "cuenta" || soporte?.tipo !== "cuenta") throw new Error();
		expect(recorteComun(soporte, respuesta, sueldos)).toEqual({
			objeto: { nota: { nombre: "Ana" } },
			recortado: ["total_centavos", "pago_dia_centavos"],
		});
		expect(recorteComun(cuenta, respuesta, sueldos)).toEqual({
			objeto: { nota: { total_centavos: 5000, nombre: "Ana" } },
			recortado: ["pago_dia_centavos"],
		});
		const conPermiso = { ...cuenta, permisosFinos: ["ven_sueldos_y_tarifas"] };
		expect(recorteComun(conPermiso, respuesta, sueldos).recortado).toEqual([]);
		expect(recorteComun(duena, respuesta, sueldos).recortado).toEqual([]);
	});
});
