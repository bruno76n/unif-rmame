/**
 * Prueba de las respuestas con secretos.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 3)
 */

import { definirAccion } from "@uniformame/compartido/contratos/definir";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion, nuevaClave } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";
import { sinSecretos } from "./claves.ts";

describe("una respuesta con un secreto se repite sin el secreto y con secreto_entregado", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la primera respuesta trae el secreto; la repetida no, y dice secreto_entregado", async () => {
		const clave = nuevaClave();
		const datos = { texto: "con PIN", monto_centavos: 1, con_pin: true };
		const primera = await mandarAccion(servidor, "prueba.crear_nota", { clave, datos });
		expect(primera.cuerpo).toMatchObject({ ok: true, resultado: { pin: "4821" } });
		expect(primera.cuerpo.secreto_entregado).toBeUndefined();
		const repetida = await mandarAccion(servidor, "prueba.crear_nota", { clave, datos });
		expect(repetida.estado).toBe(200);
		expect(repetida.cuerpo).toMatchObject({
			ok: true,
			secreto_entregado: true,
			resultado: { mensaje: "Nota con PIN creada" },
		});
		expect(repetida.cuerpo.resultado).not.toHaveProperty("pin");
	});

	it("la respuesta guardada en comandos_recibidos nunca lleva el secreto", async () => {
		const clave = nuevaClave();
		await mandarAccion(servidor, "prueba.crear_nota", {
			clave,
			datos: { texto: "guardada", monto_centavos: 1, con_pin: true },
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT respuesta::text AS respuesta FROM comandos_recibidos WHERE clave_idempotencia = $1",
			[clave],
		);
		expect(rows[0]?.respuesta).not.toContain("4821");
		expect(rows[0]?.respuesta).toContain("secreto_entregado");
	});

	it("un contrato no deja declarar como secreto un campo obligatorio", () => {
		expect(() =>
			definirAccion({
				nombre: "prueba.mal",
				descripcion: "mal",
				entrada: z.object({}),
				salida: z.object({ llave: z.string() }),
				permiso: {},
				secretos: ["llave"],
			}),
		).toThrow("opcional");
	});

	it("una acción que regresa un campo fuera de su contrato sale con 500 y no guarda nada: ni la nota ni su clave", async () => {
		const clave = nuevaClave();
		const respuesta = await mandarAccion(servidor, "prueba.crear_nota", {
			clave,
			datos: { texto: "de más", monto_centavos: 1, fallar: "campo_de_mas" },
		});
		expect(respuesta.estado).toBe(500);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM comandos_recibidos WHERE clave_idempotencia = $1",
			[clave],
		);
		expect(rows[0]?.n).toBe(0);
		expect(JSON.stringify(respuesta.cuerpo)).not.toContain("SECRETO-DE-MAS");
	});

	it("un secreto que aparece en un aviso no se guarda: la acción sale con 500 y no deja nada", async () => {
		const clave = nuevaClave();
		const respuesta = await mandarAccion(servidor, "prueba.crear_nota", {
			clave,
			datos: { texto: "aviso", monto_centavos: 1, con_pin: true, fallar: "secreto_en_aviso" },
		});
		expect(respuesta.estado).toBe(500);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM comandos_recibidos WHERE clave_idempotencia = $1",
			[clave],
		);
		expect(rows[0]?.n).toBe(0);
	});

	it("un contrato no deja una salida con nombre de secreto sin declararla", () => {
		expect(() =>
			definirAccion({
				nombre: "prueba.mal2",
				descripcion: "mal",
				entrada: z.object({}),
				salida: z.object({ llave_secreta: z.string().optional() }),
				permiso: {},
			}),
		).toThrow("parece un secreto");
	});

	it("un contrato no deja un secreto dentro de otro campo, pero sí un id con nombre parecido", () => {
		expect(() =>
			definirAccion({
				nombre: "prueba.mal3",
				descripcion: "mal",
				entrada: z.object({}),
				salida: z.object({ accesos: z.array(z.object({ pin: z.string() })).optional() }),
				permiso: {},
			}),
		).toThrow("primer nivel");
		expect(() =>
			definirAccion({
				nombre: "prueba.bien",
				descripcion: "bien",
				entrada: z.object({}),
				salida: z.object({ llave_id: z.string(), aparato: z.object({ pin_id: z.string() }) }),
				permiso: {},
			}),
		).not.toThrow();
	});

	it("un secreto solo se busca escrito como palabra en el mensaje y en los avisos: un id, un folio o un secreto vacío no fallan", () => {
		const conId = {
			ok: true as const,
			resultado: { mensaje: "Pedido PE-4821 creado", id: "0196f3a2-4821-7abc-9def-000000004821", pin: "4821" },
			avisos: ["Folio PE-4821"],
		};
		expect(sinSecretos(conId, ["pin"])).toMatchObject({
			resultado: { id: conId.resultado.id },
			secreto_entregado: true,
		});
		expect(sinSecretos({ ok: true, resultado: { mensaje: "Listo", pin: "" }, avisos: [] }, ["pin"])).toMatchObject({
			secreto_entregado: true,
		});
		expect(() =>
			sinSecretos({ ok: true, resultado: { mensaje: "Tu PIN es 4821.", pin: "4821" }, avisos: [] }, ["pin"]),
		).toThrow("secreto");
	});
});
