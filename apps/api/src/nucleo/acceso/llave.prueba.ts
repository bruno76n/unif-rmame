/**
 * Prueba de la llave de los aparatos: quién llama, la revocada y la rotación con su gracia.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { cuentaDePrueba, llaveDePrueba, quienesDePrueba } from "../pruebas/cuentas-de-prueba.ts";
import { conGoogle, mandarAccion, nuevaClave } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

/** El id de un aparato de prueba. */
function aparato(nombre: string): string {
	const quien = quienesDePrueba[nombre];
	if (quien?.tipo !== "aparato") throw new Error(`no hay aparato de prueba ${nombre}`);
	return quien.dispositivoId;
}

describe("un aparato solo entra con su llave vigente; revocado, responde 401 llave_revocada; rotada, valen las dos durante la gracia", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** El puente pide sus trabajos con una llave. */
	async function pedirTrabajos(autorizacion: string, encabezados: Record<string, string> = {}) {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/admin.trabajos_impresion",
			headers: { authorization: autorizacion, "x-app-version": "1.0.0", ...encabezados },
			payload: { clave_idempotencia: nuevaClave(), datos: {} },
		});
		return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
	}

	/** El último contacto de un aparato. */
	async function contacto(dispositivoId: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT ultimo_contacto_en, version_app, pendientes_por_subir, host(ip) AS ip FROM dispositivos_sync WHERE dispositivo_id = $1",
			[dispositivoId],
		);
		return rows[0];
	}

	it("con su llave entra como el aparato y anota su contacto; con otra, con una mal escrita o con una que no existe, 401 llave_invalida", async () => {
		await servidor.base.dueno.query(
			"UPDATE dispositivos_sync SET ultimo_contacto_en = NULL WHERE dispositivo_id = $1",
			[aparato("puente")],
		);
		const bien = await pedirTrabajos(llaveDePrueba("puente"), { "x-pendientes": "3", "x-app-version": "1.0.4" });
		expect(bien.estado).toBe(200);
		expect(await contacto(aparato("puente"))).toMatchObject({
			ultimo_contacto_en: expect.any(Date),
			version_app: "1.0.4",
			pendientes_por_subir: 3,
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT origen, dispositivo_id FROM comandos_recibidos WHERE tipo_comando = 'admin.trabajos_impresion' ORDER BY recibido_en DESC LIMIT 1",
		);
		expect(rows[0]).toEqual({ origen: "aparato", dispositivo_id: aparato("puente") });
		const ajena = llaveDePrueba("puente").replace(/\.(.)/, ".A");
		for (const autorizacion of [ajena, "Llave prueba31", "Llave noexiste.".padEnd(58, "x"), "Bearer algo"]) {
			const respuesta = await pedirTrabajos(autorizacion);
			expect([autorizacion, respuesta.estado]).toEqual([autorizacion, 401]);
		}
		expect((await pedirTrabajos(ajena)).cuerpo).toMatchObject({ error: "sin_sesion", codigo: "llave_invalida" });
	});

	it("el contacto se anota a lo más una vez por minuto", async () => {
		await servidor.base.dueno.query(
			"UPDATE dispositivos_sync SET ultimo_contacto_en = now() - interval '30 seconds', version_app = '1.0.0' WHERE dispositivo_id = $1",
			[aparato("puente")],
		);
		await pedirTrabajos(llaveDePrueba("puente"), { "x-app-version": "1.0.9" });
		expect((await contacto(aparato("puente")))?.version_app).toBe("1.0.0");
	});

	it("la tablet no llama lo que es del puente: 403 fuera_de_alcance", async () => {
		const respuesta = await pedirTrabajos(llaveDePrueba("tablet"));
		expect(respuesta.estado).toBe(403);
		expect(respuesta.cuerpo).toMatchObject({ codigo: "fuera_de_alcance" });
	});

	it("rotar la llave: durante la gracia valen las dos; la primera llamada con la nueva acaba la gracia; vencida la gracia, la anterior ya no entra", async () => {
		const secretoNuevo = "secreto-nuevo-del-otro-puente".padEnd(43, "y");
		const rotada = await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/admin.rotar_llave",
			headers: { authorization: llaveDePrueba("otro_puente"), "x-app-version": "1.0.0" },
			payload: { clave_idempotencia: nuevaClave(), datos: { secreto_nuevo: secretoNuevo } },
		});
		expect(rotada.statusCode).toBe(200);
		expect(rotada.json().resultado).toMatchObject({ rotada_en: expect.any(String) });
		const nueva = `Llave prueba32.${secretoNuevo}`;
		expect((await pedirTrabajos(llaveDePrueba("otro_puente"))).estado).toBe(200);
		expect((await pedirTrabajos(nueva)).estado).toBe(200);
		expect((await pedirTrabajos(llaveDePrueba("otro_puente"))).estado).toBe(401);
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion, despues FROM bitacora WHERE accion = 'admin.rotar_llave'",
		);
		expect(bitacora.rows).toEqual([{ descripcion: "Puente del Taller cambió su llave", despues: null }]);
		// Otra rotación, y la gracia vence sin que llegue la nueva.
		const otraVez = "otro-secreto-mas-del-otro-puente".padEnd(43, "z");
		await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/admin.rotar_llave",
			headers: { authorization: nueva, "x-app-version": "1.0.0" },
			payload: { clave_idempotencia: nuevaClave(), datos: { secreto_nuevo: otraVez } },
		});
		await servidor.base.dueno.query(
			"UPDATE dispositivos SET llave_anterior_vence_en = now() - interval '1 second' WHERE id = $1",
			[aparato("otro_puente")],
		);
		expect((await pedirTrabajos(nueva)).estado).toBe(401);
		expect((await pedirTrabajos(`Llave prueba32.${otraVez}`)).estado).toBe(200);
	});

	it("cuando a su llave le toca cambiar, sus trabajos se lo dicen", async () => {
		expect((await pedirTrabajos(llaveDePrueba("puente"))).cuerpo.resultado).toMatchObject({ rotar_llave: false });
		await servidor.base.dueno.query(
			"UPDATE dispositivos SET llave_rotada_en = now() - interval '91 days' WHERE id = $1",
			[aparato("puente")],
		);
		expect((await pedirTrabajos(llaveDePrueba("puente"))).cuerpo.resultado).toMatchObject({ rotar_llave: true });
	});

	it("desde la web solo se rota la credencial de uniformame.mx, que recibe su secreto una sola vez", async () => {
		const version = async (id: string) =>
			Number(
				(await servidor.base.dueno.query("SELECT version FROM dispositivos WHERE id = $1", [id])).rows[0]?.version,
			);
		const alPuente = await mandarAccion(
			servidor,
			"admin.rotar_llave",
			{ datos: { dispositivo_id: aparato("puente"), version: await version(aparato("puente")) } },
			"duena",
			conGoogle(),
		);
		expect(alPuente.cuerpo).toMatchObject({ codigo: "solo_credencial" });
		const credencial = "01936f2e-0000-7000-8000-0000000000c1";
		await servidor.base.dueno.query(
			`INSERT INTO dispositivos (id, folio, nombre, tipo, llave_id, llave_hash)
			 VALUES ($1, 'DV-PC1', 'uniformame.mx', 'credencial_servidor', 'credenc1', 'x')`,
			[credencial],
		);
		const clave = nuevaClave();
		const datos = { dispositivo_id: credencial, version: await version(credencial) };
		const rotada = await mandarAccion(servidor, "admin.rotar_llave", { clave, datos }, "duena", conGoogle());
		const { secreto } = z.object({ secreto: z.string().length(43) }).parse(rotada.cuerpo.resultado);
		const otraVez = await mandarAccion(servidor, "admin.rotar_llave", { clave, datos }, "duena", conGoogle());
		expect(otraVez.cuerpo).toMatchObject({ secreto_entregado: true });
		expect(JSON.stringify(otraVez.cuerpo)).not.toContain(secreto);
	});

	it("revocado (solo la dueña, con motivo y Google) responde 401 llave_revocada; revocarlo otra vez, ya_revocado", async () => {
		const tablet = aparato("tablet");
		const version = Number(
			(await servidor.base.dueno.query("SELECT version FROM dispositivos WHERE id = $1", [tablet])).rows[0]?.version,
		);
		const datos = { dispositivo_id: tablet, motivo: "Se perdió", anular_pines: false };
		expect(
			(await mandarAccion(servidor, "admin.revocar_dispositivo", { datos, version }, "admin", conGoogle())).cuerpo,
		).toMatchObject({
			codigo: "solo_duena",
		});
		expect(
			(
				await mandarAccion(
					servidor,
					"admin.revocar_dispositivo",
					{ datos: { ...datos, motivo: "x" }, version },
					"duena",
					conGoogle(),
				)
			).cuerpo,
		).toMatchObject({ error: "validacion" });
		await servidor.base.dueno.query("UPDATE dispositivos_sync SET pendientes_por_subir = 4 WHERE dispositivo_id = $1", [
			tablet,
		]);
		const revocado = await mandarAccion(
			servidor,
			"admin.revocar_dispositivo",
			{ datos, version },
			"duena",
			conGoogle(),
		);
		expect(revocado.cuerpo).toMatchObject({
			resultado: { mensaje: "Tablet del taller revocado: ya no entra" },
			avisos: ["Tiene 4 movimientos sin subir. Lo que llegue después entra a la bandeja de excepciones de Bodega."],
		});
		// Quién llama se revisa antes que el permiso: aun lo que no es suyo responde que está revocado.
		const conLaLlave = await pedirTrabajos(llaveDePrueba("tablet"));
		expect(conLaLlave.estado).toBe(401);
		expect(conLaLlave.cuerpo).toMatchObject({
			codigo: "llave_revocada",
			mensaje: "Este aparato fue revocado: ya no entra.",
		});
		const nueva = Number(
			(await servidor.base.dueno.query("SELECT version FROM dispositivos WHERE id = $1", [tablet])).rows[0]?.version,
		);
		expect(
			(await mandarAccion(servidor, "admin.revocar_dispositivo", { datos, version: nueva }, "duena", conGoogle()))
				.cuerpo,
		).toMatchObject({ codigo: "ya_revocado" });
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion, usuario_id FROM bitacora WHERE accion = 'admin.revocar_dispositivo'",
		);
		expect(bitacora.rows).toEqual([
			{ descripcion: "Revocó Tablet del taller: Se perdió", usuario_id: cuentaDePrueba("duena") },
		]);
	});
});
