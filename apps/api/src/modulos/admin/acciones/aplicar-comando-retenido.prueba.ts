/**
 * Prueba de `admin.aplicar_comando_retenido`: lo que llega de un aparato revocado y pasó antes abre
 * `dispositivo_revocado`; al aplicarlo la dueña, la excepción queda resuelta, y aplicarlo otra vez no hace nada.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 4)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { llaveDePrueba, quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { conGoogle, mandarAccion, nuevaClave } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** El id de la tablet de prueba. */
function tablet(): string {
	const quien = quienesDePrueba.tablet;
	if (quien?.tipo !== "aparato") throw new Error("no hay tablet de prueba");
	return quien.dispositivoId;
}

describe("Lo que llega de un aparato revocado y pasó antes abre `dispositivo_revocado`; al aplicarlo la dueña, la excepción queda resuelta, y aplicarlo otra vez no hace nada", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La tablet sube un comando de abrir un lote. */
	function subirLote(nombre: string, ocurridoEn: string) {
		return subirComando("prueba.abrir_lote", { id: uuidv7(), nombre }, ocurridoEn);
	}

	/** La tablet sube un comando. */
	async function subirComando(accion: string, datos: Record<string, unknown>, ocurridoEn: string) {
		const comando = { clave_idempotencia: nuevaClave(), accion, datos, ocurrido_en: ocurridoEn };
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/sync/subir",
			headers: { authorization: llaveDePrueba("tablet"), "x-app-version": "1.0.0" },
			payload: { enviado_en: new Date().toISOString(), pendientes_por_subir: 1, comandos: [comando] },
		});
		return { comando, respuesta: respuesta.json().respuestas[0] };
	}

	/** La excepción de un comando, con lo que importa. */
	async function excepcionDe(clave: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT c.id AS comando_id, e.id, e.tipo, e.estado, e.version::int AS version, e.resolucion, e.datos->>'accion' AS accion,
				e.dispositivo_id, c.retenido_aplicado_en IS NOT NULL AS aplicado, c.resultado
			 FROM comandos_recibidos c JOIN excepciones e ON e.id = c.excepcion_id WHERE c.clave_idempotencia = $1`,
			[clave],
		);
		return rows[0];
	}

	it("retenido con su excepción; Bodega no lo aplica; la dueña sí, con Google; otra vez, ya_aplicado", async () => {
		const version = Number(
			(await servidor.base.dueno.query("SELECT version FROM dispositivos WHERE id = $1", [tablet()])).rows[0]?.version,
		);
		const revocado = await mandarAccion(
			servidor,
			"admin.revocar_dispositivo",
			{ datos: { dispositivo_id: tablet(), motivo: "Se perdió", anular_pines: false }, version },
			"duena",
			conGoogle(),
		);
		expect(revocado.estado).toBe(200);
		const { comando, respuesta } = await subirLote("L-retenido", new Date(Date.now() - 60_000).toISOString());
		expect(respuesta).toMatchObject({
			resultado: "excepcion",
			motivo: "dispositivo_revocado",
			excepciones: [{ id: expect.any(String), codigo: "dispositivo_revocado" }],
		});
		const abierta = await excepcionDe(comando.clave_idempotencia);
		expect(abierta).toMatchObject({
			tipo: "dispositivo_revocado",
			estado: "por_revisar",
			accion: "prueba.abrir_lote",
			dispositivo_id: tablet(),
			aplicado: false,
		});
		expect(respuesta.excepciones[0].id).toBe(abierta?.id);
		const aplicar = (quien: string, google = true) =>
			mandarAccion(
				servidor,
				"admin.aplicar_comando_retenido",
				{ datos: { comando_id: abierta?.comando_id }, version: abierta?.version },
				quien,
				google ? conGoogle() : {},
			);
		// Solo la dueña, y con «Confirmar con Google».
		expect((await aplicar("admin")).estado).toBe(403);
		expect((await aplicar("duena", false)).estado).toBe(401);
		const aplicado = await aplicar("duena");
		expect(aplicado.estado).toBe(200);
		expect(aplicado.cuerpo.resultado).toMatchObject({
			resultado: "aplicado",
			mensaje: "Movimiento de Tablet del taller aplicado: prueba.abrir_lote L-retenido",
		});
		// El lote se abrió, con la bitácora de su acción y quién lo aplicó.
		const { rows: lotes } = await servidor.base.dueno.query(
			"SELECT nombre FROM prueba_lotes WHERE nombre = 'L-retenido'",
		);
		expect(lotes).toEqual([{ nombre: "L-retenido" }]);
		const { rows: bitacora } = await servidor.base.dueno.query(
			"SELECT despues->>'retenido' AS retenido, confirmado_con_google_en IS NOT NULL AS con_google FROM bitacora WHERE accion = 'prueba.abrir_lote' AND comando_id = $1",
			[abierta?.comando_id],
		);
		expect(bitacora[0]?.retenido).toMatch(/^retenido de Tablet del taller revocado; aplicado por /);
		// Con la confirmación de Google de quien lo aplicó.
		expect(bitacora[0]?.con_google).toBe(true);
		expect(await excepcionDe(comando.clave_idempotencia)).toMatchObject({
			estado: "resuelta",
			resolucion: "Se aplicó el movimiento retenido",
			aplicado: true,
			resultado: "aplicado",
		});
		// Otra vez: no hace nada.
		const otraVez = await mandarAccion(
			servidor,
			"admin.aplicar_comando_retenido",
			{ datos: { comando_id: abierta?.comando_id }, version: (await excepcionDe(comando.clave_idempotencia))?.version },
			"duena",
			conGoogle(),
		);
		expect(otraVez.cuerpo).toMatchObject({ codigo: "ya_aplicado", mensaje: "Ese movimiento ya se aplicó." });
		const { rows: siguenSiendoUno } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM prueba_lotes WHERE nombre = 'L-retenido'",
		);
		expect(siguenSiendoUno[0]?.n).toBe(1);
		// Lo de después de revocar no está retenido.
		const despues = await subirLote("L-despues", new Date(Date.now() + 60_000).toISOString());
		const { rows: apartado } = await servidor.base.dueno.query(
			"SELECT id FROM comandos_recibidos WHERE clave_idempotencia = $1",
			[despues.comando.clave_idempotencia],
		);
		expect(
			(
				await mandarAccion(
					servidor,
					"admin.aplicar_comando_retenido",
					{ datos: { comando_id: apartado[0]?.id }, version: 1 },
					"duena",
					conGoogle(),
				)
			).cuerpo,
		).toMatchObject({ codigo: "no_retenido" });
	});

	it("la versión vieja da 409; dos a la vez aplican uno; si le falta su documento queda apartado y sigue retenido", async () => {
		// La tablet ya está revocada (la prueba anterior): lo que sube de antes queda retenido.
		const haceUnMinuto = new Date(Date.now() - 60_000).toISOString();
		const lote = await subirLote("L-a-la-vez", haceUnMinuto);
		const abierta = await excepcionDe(lote.comando.clave_idempotencia);
		const aplicar = (version: number, comandoId = abierta?.comando_id) =>
			mandarAccion(
				servidor,
				"admin.aplicar_comando_retenido",
				{ datos: { comando_id: comandoId }, version },
				"duena",
				conGoogle(),
			);
		expect((await aplicar((abierta?.version ?? 0) - 1)).estado).toBe(409);
		const aLaVez = await Promise.all([aplicar(abierta?.version ?? 0), aplicar(abierta?.version ?? 0)]);
		expect(aLaVez.map((respuesta) => respuesta.estado).sort()).toEqual([200, 422]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM prueba_lotes WHERE nombre = 'L-a-la-vez'",
		);
		expect(rows[0]?.n).toBe(1);
		// Un bulto de un lote que no existe: al aplicarlo queda apartado, y sigue retenido con su excepción abierta.
		const bulto = await subirComando(
			"prueba.registrar_bulto",
			{ id: uuidv7(), lote_id: uuidv7(), piezas: 3 },
			haceUnMinuto,
		);
		const delBulto = await excepcionDe(bulto.comando.clave_idempotencia);
		const sinLote = await aplicar(delBulto?.version ?? 0, delBulto?.comando_id);
		expect(sinLote.cuerpo.resultado).toMatchObject({
			resultado: "apartado",
			mensaje: expect.stringMatching(/^Sigue retenido: /),
		});
		expect(await excepcionDe(bulto.comando.clave_idempotencia)).toMatchObject({
			estado: "por_revisar",
			aplicado: false,
		});
	});
});
