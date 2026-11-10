/**
 * Prueba del aparato revocado: sigue subiendo su cola, pero nada se aplica; lo de antes de revocarlo queda
 * retenido, lo de después se aparta, y en todo lo demás responde `401 llave_revocada`.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fotoCompleta, pedirFoto } from "../pruebas/bajada-de-prueba.ts";
import { llaveDePrueba, quienesDePrueba } from "../pruebas/cuentas-de-prueba.ts";
import { conGoogle, mandarAccion, nuevaClave } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

/** El id de la tablet de prueba. */
function tablet(): string {
	const quien = quienesDePrueba.tablet;
	if (quien?.tipo !== "aparato") throw new Error("no hay tablet de prueba");
	return quien.dispositivoId;
}

/** Un comando de abrir un lote, con la hora en que pasó. */
function abrir(nombre: string, ocurridoEn: string) {
	return {
		clave_idempotencia: nuevaClave(),
		accion: "prueba.abrir_lote",
		datos: { id: uuidv7(), nombre },
		ocurrido_en: ocurridoEn,
	};
}

describe("lo que llega de un aparato revocado y pasó antes de revocarlo queda retenido; lo de después se aparta; nada se pierde", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La tablet sube una tanda. */
	async function subir(comandos: readonly ReturnType<typeof abrir>[]) {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/sync/subir",
			headers: { authorization: llaveDePrueba("tablet"), "x-app-version": "1.0.0" },
			payload: { enviado_en: new Date().toISOString(), pendientes_por_subir: comandos.length, comandos },
		});
		return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
	}

	it("retenido, apartado o repetido según cuándo pasó y cuándo llegó; una bitácora con alerta por tanda; en todo lo demás, 401", async () => {
		const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString();
		const yaLlego = abrir("L-antes", haceUnaHora);
		expect((await subir([yaLlego])).cuerpo.respuestas[0].resultado).toBe("aplicado");
		const version = Number(
			(await servidor.base.dueno.query("SELECT version FROM dispositivos WHERE id = $1", [tablet()])).rows[0]?.version,
		);
		const revocado = await mandarAccion(
			servidor,
			"admin.revocar_dispositivo",
			{ datos: { dispositivo_id: tablet(), motivo: "Se perdió" }, version },
			"duena",
			conGoogle(),
		);
		expect(revocado.estado).toBe(200);
		// La cola de la tablet: lo que ya había llegado, uno de antes de revocarla y uno de después.
		const antes = abrir("L-retenido", new Date(Date.now() - 60_000).toISOString());
		const despues = abrir("L-despues", new Date(Date.now() + 60_000).toISOString());
		const { estado, cuerpo } = await subir([yaLlego, antes, despues]);
		expect(estado).toBe(200);
		expect(cuerpo).toMatchObject({ revocado: true, hay_cambios: false, detenido: false });
		expect(cuerpo.respuestas.map((r: { resultado: string; motivo: string | null }) => [r.resultado, r.motivo])).toEqual(
			[
				["repetido", null],
				["excepcion", "dispositivo_revocado"],
				["apartado", "despues_de_revocar"],
			],
		);
		// Nada se aplicó, y los dos se guardaron con su carga.
		const lotes = await servidor.base.dueno.query(
			"SELECT nombre FROM prueba_lotes WHERE nombre IN ('L-retenido', 'L-despues')",
		);
		expect(lotes.rows).toEqual([]);
		const { rows } = await servidor.base.dueno.query(
			`SELECT resultado, motivo_apartado, dispositivo_revocado, carga->>'accion' AS accion
			 FROM comandos_recibidos WHERE clave_idempotencia = ANY($1) ORDER BY ocurrido_en`,
			[[antes.clave_idempotencia, despues.clave_idempotencia]],
		);
		expect(rows).toEqual([
			{ resultado: "excepcion", motivo_apartado: null, dispositivo_revocado: true, accion: "prueba.abrir_lote" },
			{
				resultado: "apartado",
				motivo_apartado: "despues_de_revocar",
				dispositivo_revocado: true,
				accion: "prueba.abrir_lote",
			},
		]);
		// Volver a mandar la misma tanda no duplica nada ni vuelve a alertar: lo que ya llegó es `repetido`, con
		// su respuesta guardada (el retenido lleva su motivo; el apartado, como se apartó).
		const otraVez = await subir([yaLlego, antes, despues]);
		expect(
			otraVez.cuerpo.respuestas.map((r: { resultado: string; motivo: string | null }) => [r.resultado, r.motivo]),
		).toEqual([
			["repetido", null],
			["repetido", "dispositivo_revocado"],
			["apartado", "despues_de_revocar"],
		]);
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion, es_alerta FROM bitacora WHERE accion = 'admin.subir' AND entidad_id = $1",
			[tablet()],
		);
		expect(bitacora.rows).toEqual([
			{ descripcion: "Llegaron 2 movimientos de Tablet del taller después de revocarlo", es_alerta: true },
		]);
		// Si la alerta falla, el último comando se queda sin respuesta; al volver a mandarlo, la alerta cuenta
		// todo lo que llegó desde la anterior: no se pierde.
		const primero = abrir("L-otro-1", new Date(Date.now() - 30_000).toISOString());
		const segundo = abrir("L-otro-2", new Date(Date.now() - 20_000).toISOString());
		servidor.fallas.bitacoraUnaVez.add("después de revocarlo");
		const cortada = await subir([primero, segundo]);
		expect(cortada.cuerpo).toMatchObject({
			detenido: true,
			respuestas: [expect.objectContaining({ resultado: "excepcion" })],
		});
		expect((await subir([segundo])).cuerpo.detenido).toBe(false);
		const alertas = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'admin.subir' AND es_alerta AND entidad_id = $1 ORDER BY ocurrido_en",
			[tablet()],
		);
		expect(alertas.rows.map((renglon) => renglon.descripcion)).toEqual([
			"Llegaron 2 movimientos de Tablet del taller después de revocarlo",
			"Llegaron 2 movimientos de Tablet del taller después de revocarlo",
		]);
		// Lo de un aparato revocado no se reintenta a mano.
		const apartado = await servidor.base.dueno.query(
			"SELECT id FROM comandos_recibidos WHERE clave_idempotencia = $1",
			[despues.clave_idempotencia],
		);
		const reintento = await mandarAccion(
			servidor,
			"admin.reintentar_comando_apartado",
			{ datos: { comando_id: apartado.rows[0]?.id } },
			"admin",
		);
		expect(reintento.cuerpo).toMatchObject({ codigo: "dispositivo_revocado" });
		// Todo lo demás: 401 llave_revocada.
		const bajada = await servidor.app.inject({
			method: "GET",
			url: "/v1/sync/bajar",
			headers: { authorization: llaveDePrueba("tablet"), "x-app-version": "1.0.0" },
		});
		expect(bajada.statusCode).toBe(401);
		expect(bajada.json()).toMatchObject({
			codigo: "llave_revocada",
			mensaje: "Este aparato fue revocado: ya no entra.",
		});
		expect((await pedirFoto(servidor)).cuerpo).toMatchObject({ codigo: "llave_revocada" });
		await expect(fotoCompleta(servidor)).rejects.toThrow("401");
	});
});
