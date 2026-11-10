/**
 * Prueba de `admin.salir`, `admin.cerrar_mi_sesion` y `admin.cerrar_sesiones`.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 2)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cuentaDePrueba, quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { escuchar, esperarA, procesarComoElWorker } from "../../../nucleo/pruebas/en-vivo.ts";
import { mandarAccion, nuevaClave } from "../../../nucleo/pruebas/llamadas.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("salir y cerrar las propias sesiones; Administración del sistema cierra las de otra cuenta, y las de la dueña solo ella", () => {
	let servidor: ServidorDePrueba;
	let direccion: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ avisosEnVivo: { latidoMs: 100 } });
		direccion = await servidor.app.listen({ port: 0, host: "127.0.0.1" });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Abre otra sesión de una cuenta. */
	async function otraSesion(usuarioId: string): Promise<string> {
		const id = uuidv7();
		await servidor.base.dueno.query(
			`INSERT INTO sesiones (id, usuario_id, token_hash, ultima_actividad_en, vence_en)
			 VALUES ($1, $2, $3, now(), now() + interval '1 hour')`,
			[id, usuarioId, `otra-${id}`],
		);
		return id;
	}

	/** El motivo y quién cerró cada sesión de una cuenta, por id. */
	async function sesionesDe(usuarioId: string): Promise<Record<string, { motivo: string | null; por: string | null }>> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, motivo_cierre, cerrada_por FROM sesiones WHERE usuario_id = $1",
			[usuarioId],
		);
		return Object.fromEntries(rows.map((fila) => [fila.id, { motivo: fila.motivo_cierre, por: fila.cerrada_por }]));
	}

	/** La sesión de prueba de una cuenta. */
	function sesionDe(nombre: string): string {
		const quien = quienesDePrueba[nombre];
		return quien?.tipo === "cuenta" ? quien.sesionId : "";
	}

	it("cerrar_mi_sesion cierra todas las demás, no la de la pantalla; una sesión de otra cuenta responde 404", async () => {
		const aduana = cuentaDePrueba("aduana");
		const una = await otraSesion(aduana);
		const dos = await otraSesion(aduana);
		const respuesta = await mandarAccion(
			servidor,
			"admin.cerrar_mi_sesion",
			{ datos: { todas_las_demas: true } },
			"aduana",
		);
		expect(respuesta.cuerpo.resultado).toMatchObject({ cerradas: 2, mensaje: "2 sesiones cerradas" });
		const sesiones = await sesionesDe(aduana);
		expect(sesiones[una]).toEqual({ motivo: "salio", por: aduana });
		expect(sesiones[dos]).toEqual({ motivo: "salio", por: aduana });
		expect(sesiones[sesionDe("aduana")]).toEqual({ motivo: null, por: null });
		const ajena = await mandarAccion(
			servidor,
			"admin.cerrar_mi_sesion",
			{ datos: { sesion_id: sesionDe("ventas") } },
			"aduana",
		);
		expect(ajena.estado).toBe(404);
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion, tipo FROM bitacora WHERE accion = 'admin.cerrar_mi_sesion'",
		);
		expect(bitacora.rows).toEqual([{ descripcion: "Cerró 2 de sus sesiones", tipo: "acceso" }]);
	});

	it("Administración del sistema cierra las sesiones de otra cuenta con cerrada_por_otra_cuenta, y a sus pantallas les llega sesion_cerrada; sin sesiones abiertas, 422", async () => {
		const ventas = cuentaDePrueba("ventas");
		const enVentas = await escuchar(direccion, "ventas");
		await esperarA(() => enVentas.eventos().some((evento) => evento.nombre === "hola"));
		const otra = await otraSesion(ventas);
		const respuesta = await mandarAccion(servidor, "admin.cerrar_sesiones", { datos: { usuario_id: ventas } }, "admin");
		expect(respuesta.cuerpo.resultado).toMatchObject({
			cerradas: 2,
			mensaje: "Sesiones de Prueba ventas cerradas",
		});
		const sesiones = await sesionesDe(ventas);
		expect(sesiones[otra]).toEqual({ motivo: "cerrada_por_otra_cuenta", por: cuentaDePrueba("admin") });
		await procesarComoElWorker(servidor);
		await esperarA(() => enVentas.eventos().some((evento) => evento.nombre === "sesion_cerrada"));
		expect(enVentas.eventos().find((evento) => evento.nombre === "sesion_cerrada")?.datos).toEqual({
			motivo: "cerrada_por_otra_cuenta",
		});
		enVentas.cerrar();
		const otraVez = await mandarAccion(servidor, "admin.cerrar_sesiones", { datos: { usuario_id: ventas } }, "admin");
		expect(otraVez.cuerpo).toMatchObject({
			codigo: "sin_sesiones_abiertas",
			mensaje: "Prueba ventas no tiene sesiones abiertas.",
		});
		const sinDepartamento = await mandarAccion(
			servidor,
			"admin.cerrar_sesiones",
			{ datos: { usuario_id: cuentaDePrueba("aduana") } },
			"aduana",
		);
		expect(sinDepartamento.cuerpo).toMatchObject({ codigo: "sin_departamento" });
	});

	it("las sesiones de la dueña solo las cierra ella", async () => {
		const duena = cuentaDePrueba("duena");
		const otra = await otraSesion(duena);
		const porAdmin = await mandarAccion(servidor, "admin.cerrar_sesiones", { datos: { usuario_id: duena } }, "admin");
		expect(porAdmin.estado).toBe(403);
		expect(porAdmin.cuerpo).toMatchObject({
			codigo: "solo_duena",
			mensaje: "Las sesiones de la dueña solo las cierra ella.",
		});
		expect((await sesionesDe(duena))[otra]).toEqual({ motivo: null, por: null });
		const porElla = await mandarAccion(servidor, "admin.cerrar_sesiones", { datos: { usuario_id: duena } }, "duena");
		expect(porElla.estado).toBe(200);
		expect((await sesionesDe(duena))[otra]).toEqual({ motivo: "cerrada_por_otra_cuenta", por: duena });
	});

	it("salir cierra la sesión de la pantalla con salio y borra la cookie ua_sesion", async () => {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/admin.salir",
			headers: encabezadosDeLaWeb("admin"),
			payload: { clave_idempotencia: nuevaClave(), datos: {} },
		});
		expect(respuesta.statusCode).toBe(200);
		const borrada = respuesta.cookies.find((cookie) => cookie.name === "ua_sesion");
		expect(borrada?.value).toBe("");
		expect(borrada?.expires?.getTime()).toBeLessThan(Date.now());
		const admin = cuentaDePrueba("admin");
		expect((await sesionesDe(admin))[sesionDe("admin")]).toEqual({ motivo: "salio", por: admin });
		const bitacora = await servidor.base.dueno.query(
			"SELECT b.descripcion, b.tipo, d.clave FROM bitacora b JOIN departamentos d ON d.id = b.departamento_id WHERE b.accion = 'admin.salir'",
		);
		expect(bitacora.rows).toEqual([{ descripcion: "Salió del sistema", tipo: "acceso", clave: "admin" }]);
	});
});
