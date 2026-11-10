/**
 * Prueba de `admin.enviar_correos` con el simulador de Resend.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 4)
 */

import { crearSimuladorDeResend } from "@uniformame/pruebas/simuladores/resend";
import { setupServer } from "msw/node";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { crearEnvioConResend, remitenteDeAvisos } from "../../../nucleo/correo.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo, type DependenciasDelTrabajador } from "../../../nucleo/trabajos/trabajador.ts";
import { enviarCorreos } from "./enviar-correos.ts";

const simulador = crearSimuladorDeResend();
const red = setupServer(...simulador.manejadores);

describe("el correo sale por el simulador de Resend y, si falla, se reintenta", () => {
	let servidor: ServidorDePrueba;
	let dependencias: DependenciasDelTrabajador;
	let ahora = Temporal.Instant.from("2026-11-10T18:00:00Z");
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba();
		dependencias = {
			base: crearBase(servidor.base.app),
			registro: servidor.modulos,
			servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: escribirBitacoraConAdmin },
			enviarCorreo: crearEnvioConResend(`re_prueba_${"x".repeat(20)}`),
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => ahora,
		};
	});
	afterEach(() => simulador.ponerAFallar("ninguna"));
	afterAll(async () => {
		red.close();
		await servidor.cerrar();
	});

	/** Crea un aviso por correo para la dueña y regresa su id. */
	async function avisoPorCorreo(texto: string): Promise<string> {
		const { aviso_ids } = (await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("admin.crear_aviso", {
				tipo: "autorizacion_pedida",
				destinatarios: { regla: "duena" },
				texto,
				enlace: "direccion/autorizaciones/au-0028",
				entidad: "autorizaciones",
				entidadId: uuidv7(),
			}),
		)) as { aviso_ids: string[] };
		const [id] = aviso_ids;
		if (id === undefined) throw new Error("no nació el aviso");
		return id;
	}

	/** Cómo va el correo de un aviso. */
	async function estado(id: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT correo_enviado_en IS NOT NULL AS enviado, correo_intentos, correo_error FROM avisos WHERE id = $1",
			[id],
		);
		return rows[0];
	}

	it("sale con la plantilla al correo de la cuenta: el texto, el botón a la web y la marca de la empresa", async () => {
		const id = await avisoPorCorreo("Ventas pide autorización: NC-0012");
		await correrTrabajo(dependencias, enviarCorreos, {});
		expect(simulador.correos).toHaveLength(1);
		const [correo] = simulador.correos;
		expect(correo).toMatchObject({
			from: remitenteDeAvisos,
			to: ["carmen@uniformesalameda.mx"],
			subject: "Ventas pide autorización: NC-0012",
		});
		expect(correo?.html).toContain('href="https://fabrica.prueba.invalid/direccion/autorizaciones/au-0028"');
		expect(correo?.html).toContain("Uniformes Alameda");
		expect(correo?.text).toContain("Ventas pide autorización: NC-0012");
		expect(await estado(id)).toMatchObject({ enviado: true, correo_intentos: 0 });
		// Otra vuelta no lo vuelve a mandar.
		await correrTrabajo(dependencias, enviarCorreos, {});
		expect(simulador.correos).toHaveLength(1);
	});

	it("si Resend falla, sube el intento y espera un minuto: antes no lo reintenta; después, sale", async () => {
		const id = await avisoPorCorreo("Ventas pide autorización: NC-0013");
		simulador.ponerAFallar("error_del_servidor");
		await correrTrabajo(dependencias, enviarCorreos, {});
		expect(await estado(id)).toMatchObject({ enviado: false, correo_intentos: 1 });
		expect((await estado(id))?.correo_error).toContain("Resend");
		const { rows } = await servidor.base.dueno.query(
			"SELECT run_at FROM graphile_worker.jobs WHERE task_identifier = 'admin.enviar_correos' ORDER BY run_at DESC LIMIT 1",
		);
		expect(new Date(rows[0]?.run_at).toISOString()).toBe("2026-11-10T18:01:00.000Z");
		simulador.ponerAFallar("ninguna");
		const antes = simulador.correos.length;
		ahora = Temporal.Instant.from("2026-11-10T18:00:30Z");
		await correrTrabajo(dependencias, enviarCorreos, {});
		expect(simulador.correos).toHaveLength(antes);
		ahora = Temporal.Instant.from("2026-11-10T18:01:00Z");
		await correrTrabajo(dependencias, enviarCorreos, {});
		expect(await estado(id)).toMatchObject({ enviado: true });
	});

	it("al décimo intento avisa a soporte con trabajo_fallido, sin correo, y ya no lo reintenta", async () => {
		const id = await avisoPorCorreo("Ventas pide autorización: NC-0014");
		await servidor.base.dueno.query(
			"UPDATE avisos SET correo_intentos = 9, actualizado_en = '2026-11-10T10:00:00Z' WHERE id = $1",
			[id],
		);
		simulador.ponerAFallar("demasiadas_peticiones");
		await correrTrabajo(dependencias, enviarCorreos, {});
		expect(await estado(id)).toMatchObject({ enviado: false, correo_intentos: 10 });
		const { rows } = await servidor.base.dueno.query(
			"SELECT usuario_id, por_correo, entidad_id FROM avisos WHERE tipo = 'trabajo_fallido'",
		);
		expect(rows).toEqual([{ usuario_id: "01936f2e-0000-7000-8000-000000000005", por_correo: false, entidad_id: id }]);
		simulador.ponerAFallar("ninguna");
		ahora = Temporal.Instant.from("2026-11-11T18:00:00Z");
		const antes = simulador.correos.length;
		await correrTrabajo(dependencias, enviarCorreos, {});
		expect(simulador.correos.map((correo) => correo.subject).slice(antes)).not.toContain(
			"Ventas pide autorización: NC-0014",
		);
	});

	it("a una cuenta que perdió el acceso no le sale el correo: queda anotado y no se reintenta", async () => {
		const id = await avisoPorCorreo("Aviso de una cuenta que ya no entra");
		const enviados = simulador.correos.length;
		await servidor.base.dueno.query(
			"UPDATE usuarios SET estado = 'sin_acceso' WHERE id = (SELECT usuario_id FROM avisos WHERE id = $1)",
			[id],
		);
		try {
			await correrTrabajo(dependencias, enviarCorreos, {});
			expect(simulador.correos).toHaveLength(enviados);
			expect(await estado(id)).toMatchObject({
				enviado: false,
				correo_intentos: 10,
				correo_error: "La cuenta ya no tiene acceso: el correo no se manda",
			});
		} finally {
			await servidor.base.dueno.query(
				"UPDATE usuarios SET estado = 'activa' WHERE id = (SELECT usuario_id FROM avisos WHERE id = $1)",
				[id],
			);
		}
	});
});
