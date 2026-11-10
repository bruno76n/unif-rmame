/**
 * Prueba de los avisos en vivo (`GET /v1/eventos`).
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../base/conexion.ts";
import { enAccionDePrueba } from "../pruebas/accion-de-prueba.ts";
import { escuchar, esperarA, procesarComoElWorker } from "../pruebas/en-vivo.ts";
import { mandarAccion } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

describe("una sesión recibe cambios solo de las tablas que leen sus departamentos; ningún evento en vivo lleva montos; un NOTIFY llega a las conexiones de otra instancia; un aviso llega a las sesiones de su cuenta", () => {
	let servidor: ServidorDePrueba;
	let otra: ServidorDePrueba;
	let direccion: string;
	let direccionDeLaOtra: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ avisosEnVivo: { latidoMs: 100 } });
		otra = await crearServidorDePrueba({ avisosEnVivo: { latidoMs: 100 }, otraInstanciaDe: servidor });
		direccion = await servidor.app.listen({ port: 0, host: "127.0.0.1" });
		direccionDeLaOtra = await otra.app.listen({ port: 0, host: "127.0.0.1" });
	});
	afterAll(async () => {
		await otra.cerrar();
		await servidor.cerrar();
	});

	it("sin identificarse responde 401; al conectar, sin X-App-Version (EventSource no la manda), llegan retry y hola con la hora, el intervalo y la versión mínima", async () => {
		expect((await fetch(`${direccion}/v1/eventos`)).status).toBe(401);
		const ventas = await escuchar(direccion, "ventas");
		await esperarA(() => ventas.eventos().some((evento) => evento.nombre === "hola"));
		expect(ventas.bloques[0]).toBe("retry: 5000");
		expect(ventas.eventos()[0]).toEqual({
			nombre: "hola",
			datos: { servidor_en: expect.any(String), intervalo_segundos: 30, version_minima: "1.0.0" },
		});
		ventas.cerrar();
	});

	it("cambios llega a quien lee la tabla (Ventas, la dueña, la tablet de su alcance), en las dos instancias, sin montos; a Aduana no", async () => {
		const ventas = await escuchar(direccion, "ventas");
		const duena = await escuchar(direccion, "duena");
		const aduana = await escuchar(direccion, "aduana");
		const tablet = await escuchar(direccion, "tablet");
		const enLaOtra = await escuchar(direccionDeLaOtra, "ventas");
		const creada = await mandarAccion(servidor, "prueba.crear_nota", {
			datos: { texto: "en vivo", monto_centavos: 125_000 },
		});
		const id = String((creada.cuerpo.resultado as { id: string }).id);
		await procesarComoElWorker(servidor);
		const esperado = {
			nombre: "cambios",
			datos: { tablas: ["prueba_notas"], entidad: "prueba_notas", entidad_id: id },
		};
		for (const conexion of [ventas, duena, tablet, enLaOtra]) {
			await esperarA(() => conexion.eventos().some((evento) => evento.nombre === "cambios"));
			expect(conexion.eventos().filter((evento) => evento.nombre === "cambios")).toEqual([esperado]);
			expect(conexion.bloques.join("")).not.toContain("125000");
		}
		await new Promise((listo) => setTimeout(listo, 200));
		expect(aduana.eventos().filter((evento) => evento.nombre === "cambios")).toEqual([]);
		for (const conexion of [ventas, duena, aduana, tablet, enLaOtra]) conexion.cerrar();
	});

	it("a un aparato no le llega lo de otra ubicación; a la sesión sí", async () => {
		const tablet = await escuchar(direccion, "tablet");
		const ventas = await escuchar(direccion, "ventas");
		await esperarA(() => tablet.eventos().length > 0 && ventas.eventos().length > 0);
		await servidor.base.dueno.query(
			`INSERT INTO eventos (id, tipo, modulo, tablas, ubicacion_ids, ocurrido_en)
			 VALUES ('01936f2e-0000-7000-8000-0000000000e2', 'nota.movida', 'prueba', '{prueba_notas}',
			 '{01936f2e-0000-7000-8000-0000000000b2}', now())`,
		);
		await procesarComoElWorker(servidor);
		await esperarA(() => ventas.eventos().some((evento) => evento.nombre === "cambios"));
		await new Promise((listo) => setTimeout(listo, 200));
		expect(tablet.eventos().filter((evento) => evento.nombre === "cambios")).toEqual([]);
		tablet.cerrar();
		ventas.cerrar();
	});

	it("un aviso nuevo llega como aviso a las sesiones de su cuenta, en las dos instancias; a otra cuenta no", async () => {
		const duena = await escuchar(direccion, "duena");
		const duenaEnLaOtra = await escuchar(direccionDeLaOtra, "duena");
		const ventas = await escuchar(direccion, "ventas");
		await esperarA(() => [duena, duenaEnLaOtra, ventas].every((conexion) => conexion.eventos().length > 0));
		const { aviso_ids } = (await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("admin.crear_aviso", {
				tipo: "alerta_direccion",
				destinatarios: { regla: "duena" },
				texto: "Hay 3 lotes atorados",
				enlace: "direccion/alertas",
			}),
		)) as { aviso_ids: string[] };
		const esperado = {
			nombre: "aviso",
			datos: {
				aviso_id: aviso_ids[0],
				tipo: "alerta_direccion",
				texto: "Hay 3 lotes atorados",
				enlace: "direccion/alertas",
			},
		};
		for (const conexion of [duena, duenaEnLaOtra]) {
			await esperarA(() => conexion.eventos().some((evento) => evento.nombre === "aviso"));
			expect(conexion.eventos().filter((evento) => evento.nombre === "aviso")).toEqual([esperado]);
		}
		await new Promise((listo) => setTimeout(listo, 200));
		expect(ventas.eventos().filter((evento) => evento.nombre === "aviso")).toEqual([]);
		for (const conexion of [duena, duenaEnLaOtra, ventas]) conexion.cerrar();
	});

	it("el documento del evento solo viaja a quien lee su tabla", async () => {
		const ventas = await escuchar(direccion, "ventas");
		await esperarA(() => ventas.eventos().length > 0);
		await servidor.base.dueno.query(
			`INSERT INTO eventos (id, tipo, modulo, tablas, entidad, entidad_id, ocurrido_en)
			 VALUES ('01936f2e-0000-7000-8000-0000000000e3', 'otra.cosa', 'prueba', '{prueba_notas,otra_tabla}',
			 'otra_tabla', '01936f2e-0000-7000-8000-0000000000e4', now())`,
		);
		await procesarComoElWorker(servidor);
		await esperarA(() => ventas.eventos().some((evento) => evento.nombre === "cambios"));
		expect(ventas.eventos().filter((evento) => evento.nombre === "cambios")).toEqual([
			{ nombre: "cambios", datos: { tablas: ["prueba_notas"] } },
		]);
		ventas.cerrar();
	});

	it("a cada conexión le llega su latido", async () => {
		const ventas = await escuchar(direccion, "ventas");
		await esperarA(() => ventas.bloques.includes(": latido"));
		ventas.cerrar();
	});
});
