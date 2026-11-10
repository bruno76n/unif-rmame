/**
 * Prueba del cliente de la API: sus tipos y cómo reintenta y atiende las respuestas.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 5)
 *
 * Las pruebas de tipos (`@ts-expect-error` y `expectTypeOf`) las revisa `pnpm tipos`: si un nombre o un
 * dato que no existe compilara, la revisión sale en rojo.
 */

import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { definirAccion, definirConsulta } from "../contratos/definir.ts";
import { crearCliente, ErrorDeConflicto, ErrorDeLaApi, ErrorSinRed } from "./cliente.ts";

const confirmarPedido = definirAccion({
	nombre: "ventas.confirmar_pedido",
	descripcion: "Confirma un pedido",
	entrada: z.object({ pedido_id: z.uuid().describe("El pedido") }),
	salida: z.object({ folio: z.string().describe("El folio") }),
	permiso: { departamento: "ventas" },
	edita: true,
});
const pedidos = definirConsulta({
	nombre: "ventas.pedidos",
	descripcion: "Los pedidos",
	entrada: z.object({ cliente: z.string().optional().describe("El cliente") }),
	salida: z.object({ total: z.number().int().describe("Cuántos") }),
	permiso: { departamento: "ventas" },
});
const contratos = {
	acciones: { "ventas.confirmar_pedido": confirmarPedido },
	consultas: { "ventas.pedidos": pedidos },
};
const pedidoId = "01936f2e-8c3a-7b4d-9e5f-0000000000aa";

/** Una respuesta de la API de mentira. */
function respuesta(estado: number, cuerpo: unknown): Response {
	return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });
}

/** Arma un cliente con un `fetch` de mentira que contesta, en orden, lo que se le dé. */
function clienteCon(respuestas: (Response | Error)[]) {
	const llamadas: { url: string; init: RequestInit }[] = [];
	const alReautenticar = vi.fn(async () => undefined);
	const alActualizar = vi.fn();
	const cliente = crearCliente(contratos, {
		urlBase: "https://api.prueba.invalid",
		versionApp: "1.0.0",
		alReautenticar,
		alActualizar,
		esperar: async () => undefined,
		fetch: async (url, init) => {
			llamadas.push({ url: String(url), init: init ?? {} });
			const siguiente = respuestas.shift();
			if (siguiente === undefined || siguiente instanceof Error) throw siguiente ?? new Error("sin respuesta");
			return siguiente;
		},
	});
	return { cliente, llamadas, alReautenticar, alActualizar };
}

/** La clave de idempotencia que llevó una llamada. */
function claveDe(llamada: { init: RequestInit }): string {
	return z.object({ clave_idempotencia: z.string() }).parse(JSON.parse(String(llamada.init.body))).clave_idempotencia;
}

const correcta = respuesta(200, {
	ok: true,
	resultado: { mensaje: "PE-0150 confirmado", folio: "PE-0150", version: 42 },
	avisos: [],
});

describe("el cliente solo compila con nombres y datos que existen en los contratos, reusa la clave al reintentar y atiende 401 reautenticar, 426 y 409", () => {
	it("solo compila con nombres y datos que existen, y su resultado tiene el tipo del contrato", async () => {
		const { cliente } = clienteCon([
			correcta.clone(),
			respuesta(200, { ok: true, resultado: { total: 3 }, recortado: [] }),
		]);
		const resultado = await cliente.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId }, version: 41 });
		expectTypeOf(resultado.folio).toEqualTypeOf<string>();
		expect(resultado.folio).toBe("PE-0150");
		const { resultado: leido } = await cliente.consulta("ventas.pedidos", {});
		expectTypeOf(leido.total).toEqualTypeOf<number>();
		const nunca = async () => {
			// @ts-expect-error: esa acción no existe en los contratos.
			await cliente.accion("ventas.borrar_pedido", { datos: {} });
			// @ts-expect-error: ese dato no existe en la entrada.
			await cliente.accion("ventas.confirmar_pedido", { datos: { pedido: pedidoId } });
			// @ts-expect-error: esa consulta no existe.
			await cliente.consulta("ventas.otra", {});
		};
		expect(nunca).toBeTypeOf("function");
	});

	it("sin red y con 500 o 503 reintenta con la misma clave hasta que contesta", async () => {
		const { cliente, llamadas } = clienteCon([
			new TypeError("sin red"),
			respuesta(503, {}),
			respuesta(500, {}),
			correcta.clone(),
		]);
		await cliente.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId }, version: 41 });
		expect(llamadas).toHaveLength(4);
		expect(new Set(llamadas.map(claveDe)).size).toBe(1);
		expect(llamadas[0]?.init.headers).toMatchObject({ "x-app-version": "1.0.0" });
	});

	it("dos intenciones distintas llevan claves distintas", async () => {
		const { cliente, llamadas } = clienteCon([correcta.clone(), correcta.clone()]);
		await cliente.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId }, version: 41 });
		await cliente.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId }, version: 41 });
		expect(claveDe(llamadas[0] ?? { init: {} })).not.toBe(claveDe(llamadas[1] ?? { init: {} }));
	});

	it("si nunca hay red, se rinde con ErrorSinRed después de sus reintentos", async () => {
		const { cliente, llamadas } = clienteCon(Array.from({ length: 10 }, () => new TypeError("sin red")));
		await expect(cliente.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId } })).rejects.toBeInstanceOf(
			ErrorSinRed,
		);
		expect(llamadas).toHaveLength(5);
	});

	it("ante 401 reautenticar, pide «Confirmar con Google» y repite una vez con la misma clave", async () => {
		const { cliente, llamadas, alReautenticar } = clienteCon([
			respuesta(401, {
				ok: false,
				error: "reautenticar",
				codigo: null,
				mensaje: "Confirma con Google para seguir.",
				proposito: "pagar la nómina",
				minutos: 5,
			}),
			correcta.clone(),
		]);
		await cliente.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId } });
		expect(alReautenticar).toHaveBeenCalledWith("pagar la nómina");
		expect(llamadas).toHaveLength(2);
		expect(claveDe(llamadas[0] ?? { init: {} })).toBe(claveDe(llamadas[1] ?? { init: {} }));
	});

	it("ante 426, pide actualizar con la versión mínima y no reintenta", async () => {
		const { cliente, alActualizar, llamadas } = clienteCon([
			respuesta(426, {
				ok: false,
				error: "actualizar",
				codigo: null,
				mensaje: "Hay una versión nueva. Actualiza para seguir.",
				version_minima: "1.2.0",
			}),
		]);
		await expect(cliente.consulta("ventas.pedidos", {})).rejects.toBeInstanceOf(ErrorDeLaApi);
		expect(alActualizar).toHaveBeenCalledWith("1.2.0");
		expect(llamadas).toHaveLength(1);
	});

	it("ante 409, entrega la versión y los datos nuevos a la pantalla, sin reintentar", async () => {
		const { cliente, llamadas } = clienteCon([
			respuesta(409, {
				ok: false,
				error: "conflicto_version",
				codigo: null,
				mensaje: "Alguien más cambió esto mientras lo veías. Revisa y vuelve a guardar.",
				version: 43,
				datos: { estado: "confirmado" },
			}),
		]);
		const error = await cliente
			.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId }, version: 41 })
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ErrorDeConflicto);
		expect(error).toMatchObject({
			version: 43,
			datos: { estado: "confirmado" },
			message: "Alguien más cambió esto mientras lo veías. Revisa y vuelve a guardar.",
		});
		expect(llamadas).toHaveLength(1);
	});

	it("ante un 422 no reintenta y trae el mensaje de la API", async () => {
		const { cliente, llamadas } = clienteCon([
			respuesta(422, {
				ok: false,
				error: "regla",
				codigo: "pedido_sin_renglones",
				mensaje: "El pedido no tiene renglones",
			}),
		]);
		await expect(cliente.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId } })).rejects.toThrow(
			"El pedido no tiene renglones",
		);
		expect(llamadas).toHaveLength(1);
	});

	it("si la conexión se corta mientras llega el cuerpo, o el balanceador da 502 o 504, reintenta con la misma clave", async () => {
		const cortada = new Response(
			new ReadableStream({
				start(control) {
					control.error(new TypeError("se cortó la conexión"));
				},
			}),
			{ status: 200 },
		);
		const { cliente, llamadas } = clienteCon([cortada, respuesta(502, {}), respuesta(504, {}), correcta.clone()]);
		await cliente.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId }, version: 41 });
		expect(llamadas).toHaveLength(4);
		expect(new Set(llamadas.map(claveDe)).size).toBe(1);
	});

	it("los errores llevan la clave de la intención, para que la pantalla la reuse si la persona vuelve a intentar", async () => {
		const sinRed = clienteCon(Array.from({ length: 10 }, () => new TypeError("sin red")));
		const error = await sinRed.cliente
			.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId } })
			.catch((e: unknown) => e);
		if (!(error instanceof ErrorSinRed) || error.clave === undefined)
			throw new Error("se esperaba ErrorSinRed con su clave");
		expect(error.clave).toBe(claveDe(sinRed.llamadas[0] ?? { init: {} }));
		const otraVez = clienteCon([correcta.clone()]);
		await otraVez.cliente.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId } }, error.clave);
		expect(claveDe(otraVez.llamadas[0] ?? { init: {} })).toBe(error.clave);
	});

	it("una respuesta de error que no es JSON (de un balanceador) termina en ErrorSinRed, no en un error de lectura", async () => {
		const { cliente } = clienteCon(
			Array.from({ length: 6 }, () => new Response("<html>Bad Gateway</html>", { status: 500 })),
		);
		await expect(cliente.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId } })).rejects.toBeInstanceOf(
			ErrorSinRed,
		);
	});

	it("un 4xx que no es JSON (de un proxy) no se reintenta: repetirlo daría lo mismo", async () => {
		const { cliente, llamadas } = clienteCon([new Response("<html>Not Found</html>", { status: 404 })]);
		await expect(cliente.accion("ventas.confirmar_pedido", { datos: { pedido_id: pedidoId } })).rejects.toBeInstanceOf(
			ErrorSinRed,
		);
		expect(llamadas).toHaveLength(1);
	});
});
