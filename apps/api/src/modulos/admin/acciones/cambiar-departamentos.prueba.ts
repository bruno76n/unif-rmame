/**
 * Prueba de `admin.cambiar_departamentos`.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { escuchar, esperarA, procesarComoElWorker } from "../../../nucleo/pruebas/en-vivo.ts";
import { conGoogle, darDeAltaCuenta, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("solo la dueña cambia departamentos, con «Confirmar con Google»; a la dueña nada; ninguna cuenta queda sin departamentos; soporte nunca recibe dinero; a las sesiones les llega permisos_cambiados", () => {
	let servidor: ServidorDePrueba;
	let direccion: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ avisosEnVivo: { latidoMs: 100 } });
		direccion = await servidor.app.listen({ port: 0, host: "127.0.0.1" });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La versión de una cuenta. */
	async function versionDe(usuarioId: string): Promise<number> {
		const { rows } = await servidor.base.dueno.query("SELECT version FROM usuarios WHERE id = $1", [usuarioId]);
		return Number(rows[0]?.version);
	}

	/** Los departamentos vigentes de una cuenta, por clave. */
	async function departamentosDe(usuarioId: string): Promise<string[]> {
		const { rows } = await servidor.base.dueno.query(
			`SELECT d.clave FROM usuario_departamentos ud JOIN departamentos d ON d.id = ud.departamento_id
			 WHERE ud.usuario_id = $1 AND ud.baja_en IS NULL ORDER BY d.orden`,
			[usuarioId],
		);
		return rows.map((renglon) => renglon.clave);
	}

	/** Un cambio de una cuenta con su versión de ahora. */
	async function cambio(usuarioId: string, recibe: string[], deja: string[]) {
		return { usuario_id: usuarioId, version: await versionDe(usuarioId), recibe, deja };
	}

	/** Manda los cambios como `quien`, con Google confirmado ahora. */
	const cambiar = (cambios: unknown[], quien = "duena") =>
		mandarAccion(servidor, "admin.cambiar_departamentos", { datos: { cambios } }, quien, conGoogle());

	it("Administración del sistema sin ser la dueña responde 403 solo_duena; a la dueña, 422 es_la_duena", async () => {
		const ventas = cuentaDePrueba("ventas");
		expect((await cambiar([await cambio(ventas, ["bodega"], [])], "admin")).cuerpo).toMatchObject({
			codigo: "solo_duena",
		});
		const duena = cuentaDePrueba("duena");
		expect((await cambiar([await cambio(duena, [], ["ventas"])])).cuerpo).toMatchObject({ codigo: "es_la_duena" });
	});

	it("lo que ya tenía no es cambio: 422 sin_cambios; dejar el último, 422 sin_departamentos; Contaduría a soporte, 422 soporte_sin_dinero; la Puerta del taller, 422", async () => {
		const ventas = cuentaDePrueba("ventas");
		expect((await cambiar([await cambio(ventas, ["ventas"], [])])).cuerpo).toMatchObject({ codigo: "sin_cambios" });
		const sinNada = await cambiar([await cambio(ventas, [], ["ventas"])]);
		expect(sinNada.cuerpo).toMatchObject({
			codigo: "sin_departamentos",
			mensaje: "Prueba ventas se quedaría sin departamentos. Para quitarle todo, usa «Quitar acceso»",
		});
		const soporte = await cambiar([await cambio(cuentaDePrueba("soporte"), ["contaduria"], [])]);
		expect(soporte.cuerpo).toMatchObject({
			codigo: "soporte_sin_dinero",
			mensaje: "La cuenta de soporte no ve dinero ni nómina.",
		});
		expect((await cambiar([await cambio(ventas, ["puerta_taller"], [])])).cuerpo).toMatchObject({
			codigo: "departamento_no_asignable",
		});
		expect(await departamentosDe(ventas)).toEqual(["ventas"]);
	});

	it("con la versión vieja de una cuenta responde 409 y no cambia ninguna", async () => {
		const ventas = cuentaDePrueba("ventas");
		const aduana = cuentaDePrueba("aduana");
		const vieja = { ...(await cambio(aduana, ["bodega"], [])), version: (await versionDe(aduana)) - 1 };
		const respuesta = await cambiar([await cambio(ventas, ["linea"], []), vieja]);
		expect(respuesta.estado).toBe(409);
		expect(await departamentosDe(ventas)).toEqual(["ventas"]);
		expect(await departamentosDe(aduana)).toEqual(["aduana"]);
	});

	it("cambia varias cuentas a la vez: baja a lo que dejan, renglón nuevo con su confirmación a lo que reciben, un renglón de bitácora con alerta por cuenta y permisos_cambiados a sus sesiones", async () => {
		const ventas = cuentaDePrueba("ventas");
		const aduana = cuentaDePrueba("aduana");
		const antes = await versionDe(ventas);
		const enVentas = await escuchar(direccion, "ventas");
		const enAdmin = await escuchar(direccion, "admin");
		await esperarA(() => enVentas.eventos().some((evento) => evento.nombre === "hola"));
		await esperarA(() => enAdmin.eventos().some((evento) => evento.nombre === "hola"));
		const respuesta = await cambiar([
			await cambio(ventas, ["linea", "compras"], ["ventas"]),
			await cambio(aduana, ["bodega"], []),
		]);
		expect(respuesta.estado).toBe(200);
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: "Departamentos guardados. Los menús ya cambiaron" });
		expect(await departamentosDe(ventas)).toEqual(["compras", "linea"]);
		expect(await departamentosDe(aduana)).toEqual(["aduana", "bodega"]);
		expect(await versionDe(ventas)).toBeGreaterThan(antes);
		const { rows } = await servidor.base.dueno.query(
			"SELECT confirmado_con_google_en FROM usuario_departamentos WHERE usuario_id = $1 AND baja_en IS NULL",
			[ventas],
		);
		expect(rows.every((renglon) => renglon.confirmado_con_google_en !== null)).toBe(true);
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion, es_alerta, antes, despues FROM bitacora WHERE accion = 'admin.cambiar_departamentos' ORDER BY descripcion",
		);
		expect(bitacora.rows).toEqual([
			{
				descripcion: "Departamentos de Prueba aduana: recibe Bodega",
				es_alerta: true,
				antes: { departamentos: ["aduana"] },
				despues: { departamentos: ["aduana", "bodega"] },
			},
			{
				descripcion: "Departamentos de Prueba ventas: recibe Tienda en línea, Compras · deja Ventas a externos",
				es_alerta: true,
				antes: { departamentos: ["ventas"] },
				despues: { departamentos: ["compras", "linea"] },
			},
		]);
		await procesarComoElWorker(servidor);
		await esperarA(() => enVentas.eventos().some((evento) => evento.nombre === "permisos_cambiados"));
		expect(enAdmin.eventos().some((evento) => evento.nombre === "permisos_cambiados")).toBe(false);
		enVentas.cerrar();
		enAdmin.cerrar();
	});

	it("una cuenta sin acceso responde 422 cuenta_no_activa", async () => {
		const nueva = await darDeAltaCuenta(servidor, "temporal@gmail.com", ["bodega"]);
		const quitado = await mandarAccion(
			servidor,
			"admin.quitar_acceso",
			{ datos: { usuario_id: nueva }, version: await versionDe(nueva) },
			"duena",
			conGoogle(),
		);
		expect(quitado.estado).toBe(200);
		expect((await cambiar([await cambio(nueva, ["aduana"], [])])).cuerpo).toMatchObject({
			codigo: "cuenta_no_activa",
		});
	});
});
