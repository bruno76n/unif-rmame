/**
 * Prueba de los trabajos contra la API real y la Zebra de mentira: el puente imprime lo que le toca, en orden, con el ZPL
 * de cada trabajo byte por byte, confirma cada uno una vez, y si la red se cae después de imprimir lo confirma al volver
 * sin imprimirlo otra vez. Cuando le toca, cambia su llave y sigue entrando con la nueva.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «El puente imprime lo que le toca, en orden,
 * confirma cada trabajo una vez…») y docs/apps/puente-de-impresion.md («Cómo trabaja» y «La llave»)
 */

import { ErrorSinRed } from "@uniformame/compartido/cliente/cliente";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../api/src/nucleo/pruebas/llamadas.ts";
import { levantarPuenteDePrueba, type PuenteDePrueba, puenteDeAduana } from "./de-prueba.ts";
import { atenderTrabajos } from "./trabajos.ts";

/** Unas notas de prueba distintas para cada trabajo. */
const notas = [
	"01936f2e-0000-7000-8000-0000000000c1",
	"01936f2e-0000-7000-8000-0000000000c2",
	"01936f2e-0000-7000-8000-0000000000c3",
];

describe("el puente imprime lo que le toca, en orden, y confirma cada trabajo una vez", () => {
	let prueba: PuenteDePrueba;
	beforeAll(async () => {
		prueba = await levantarPuenteDePrueba();
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	/** Cuántas veces confirmó el puente. */
	const confirmaciones = () =>
		prueba.llamadas.filter((llamada) => llamada === "POST /v1/acciones/admin.confirmar_impresion").length;

	it("imprime lo que le toca, en orden, con el ZPL de su ruta byte por byte, y confirma cada trabajo una vez", async () => {
		const [a = "", b = "", c = ""] = notas;
		const trabajos = [
			await prueba.pedirTrabajo([a], 1),
			await prueba.pedirTrabajo([b, c], 2),
			await prueba.pedirTrabajo([c], 58),
		];
		// El de otra impresora no le toca: la del Taller tiene su propio puente.
		const taller = String(
			(await prueba.servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'TAL'")).rows[0]?.id,
		);
		await mandarAccion(
			prueba.servidor,
			"admin.guardar_impresora",
			{
				datos: {
					nombre: "Zebra Taller",
					modelo: "ZD421",
					ubicacion_id: taller,
					dispositivo_id: "01936f2e-0000-7000-8000-000000000032",
				},
			},
			"duena",
		);
		const ajeno = await mandarAccion(prueba.servidor, "prueba.imprimir", {
			datos: { ubicacion_id: taller, ids: [a], copias: 1 },
		});
		expect(ajeno.estado).toBe(200);
		const zpl = await Promise.all(trabajos.map((trabajo) => prueba.zplDe(trabajo)));
		const antes = confirmaciones();
		await atenderTrabajos(prueba.piezas);
		expect(prueba.zebra.recibido.slice(-3)).toEqual(zpl);
		for (const trabajo of trabajos) expect(await prueba.trabajo(trabajo)).toEqual({ estado: "impreso", error: null });
		expect(confirmaciones() - antes).toBe(3);
		const { rows } = await prueba.servidor.base.dueno.query(
			"SELECT estado FROM trabajos_impresion WHERE impresora_id IN (SELECT id FROM impresoras WHERE nombre = 'Zebra Taller')",
		);
		expect(rows).toEqual([{ estado: "por_imprimir" }]);
		// Otra vuelta sin trabajos nuevos no imprime ni confirma nada.
		await atenderTrabajos(prueba.piezas);
		expect(prueba.zebra.recibido.slice(-3)).toEqual(zpl);
		expect(confirmaciones() - antes).toBe(3);
		expect(await prueba.piezas.diario.pendientes()).toEqual([]);
	});

	it("la red se cae después de imprimir: al volver lo confirma una vez, sin imprimirlo otra vez", async () => {
		const trabajo = await prueba.pedirTrabajo([notas[0] ?? ""], 4);
		const impresos = prueba.zebra.recibido.length;
		const antes = confirmaciones();
		prueba.cortarLaRed((url) => url.endsWith("/v1/acciones/admin.confirmar_impresion"));
		await expect(atenderTrabajos(prueba.piezas)).rejects.toBeInstanceOf(ErrorSinRed);
		expect(prueba.zebra.recibido).toHaveLength(impresos + 1);
		expect(await prueba.trabajo(trabajo)).toMatchObject({ estado: "mandado" });
		expect(await prueba.piezas.diario.pendientes()).toEqual([
			expect.objectContaining({ estado: "por_confirmar", resultado: "impreso" }),
		]);
		await atenderTrabajos(prueba.piezas);
		expect(prueba.zebra.recibido).toHaveLength(impresos + 1);
		expect(await prueba.trabajo(trabajo)).toEqual({ estado: "impreso", error: null });
		expect(await prueba.piezas.diario.pendientes()).toEqual([]);
		// La confirmación cortada no llegó: la API recibió una sola.
		expect(confirmaciones() - antes).toBe(1);
	});

	it("cuando le toca cambia su llave: guarda la nueva y sigue entrando con ella", async () => {
		await prueba.servidor.base.dueno.query(
			"UPDATE dispositivos SET llave_rotada_en = now() - interval '200 days' WHERE id = $1",
			[puenteDeAduana()],
		);
		const vieja = prueba.configuracion.actual.secreto;
		await atenderTrabajos(prueba.piezas);
		const nueva = prueba.configuracion.actual.secreto;
		expect(nueva).not.toBe(vieja);
		expect(prueba.configuracion.actual.secreto_nuevo).toBeUndefined();
		expect(await prueba.registro()).toContain("Cambió su llave");
		const trabajo = await prueba.pedirTrabajo([notas[1] ?? ""], 1);
		await atenderTrabajos(prueba.piezas);
		expect(await prueba.trabajo(trabajo)).toEqual({ estado: "impreso", error: null });
		expect(prueba.configuracion.actual.secreto).toBe(nueva);
	});

	it("se pierde la respuesta de sus trabajos: con la misma clave le vuelven a llegar y cada uno se imprime una vez", async () => {
		const trabajo = await prueba.pedirTrabajo([notas[2] ?? ""], 3);
		const impresos = prueba.zebra.recibido.length;
		prueba.cortarLaRed((url) => url.endsWith("/v1/acciones/admin.trabajos_impresion"), true);
		await expect(atenderTrabajos(prueba.piezas)).rejects.toBeInstanceOf(ErrorSinRed);
		// La API ya lo entregó: queda en «mandado», y el puente no lo recibió.
		expect(await prueba.trabajo(trabajo)).toMatchObject({ estado: "mandado" });
		expect(prueba.zebra.recibido).toHaveLength(impresos);
		await atenderTrabajos(prueba.piezas);
		expect(await prueba.trabajo(trabajo)).toEqual({ estado: "impreso", error: null });
		expect(prueba.zebra.recibido).toHaveLength(impresos + 1);
		// La siguiente vuelta pide con clave nueva y no repite nada.
		await atenderTrabajos(prueba.piezas);
		expect(prueba.zebra.recibido).toHaveLength(impresos + 1);
	});

	it("el cambio de llave sin saber si se aplicó: si se aplicó, entra con la nueva; si no, sigue con la vieja", async () => {
		const tocaRotar = () =>
			prueba.servidor.base.dueno.query(
				"UPDATE dispositivos SET llave_rotada_en = now() - interval '200 days' WHERE id = $1",
				[puenteDeAduana()],
			);
		// Se aplicó, pero la respuesta se perdió: guarda la nueva sin confirmar y la siguiente llamada entra con ella.
		await tocaRotar();
		const vieja = prueba.configuracion.actual.secreto;
		prueba.cortarLaRed((url) => url.endsWith("/v1/acciones/admin.rotar_llave"), true);
		await expect(atenderTrabajos(prueba.piezas)).rejects.toBeInstanceOf(ErrorSinRed);
		const nueva = prueba.configuracion.actual.secreto_nuevo;
		expect(nueva).toBeDefined();
		await atenderTrabajos(prueba.piezas);
		expect(prueba.configuracion.actual).toMatchObject({ secreto: nueva });
		expect(prueba.configuracion.actual.secreto_nuevo).toBeUndefined();
		expect(prueba.configuracion.actual.secreto).not.toBe(vieja);
		// No llegó: guarda la nueva, la API no la conoce, y sigue con la vieja y olvida la nueva.
		await tocaRotar();
		const vigente = prueba.configuracion.actual.secreto;
		prueba.cortarLaRed((url) => url.endsWith("/v1/acciones/admin.rotar_llave"));
		await expect(atenderTrabajos(prueba.piezas)).rejects.toBeInstanceOf(ErrorSinRed);
		expect(prueba.configuracion.actual.secreto_nuevo).toBeDefined();
		await prueba.servidor.base.dueno.query("UPDATE dispositivos SET llave_rotada_en = now() WHERE id = $1", [
			puenteDeAduana(),
		]);
		await atenderTrabajos(prueba.piezas);
		expect(prueba.configuracion.actual.secreto).toBe(vigente);
		expect(prueba.configuracion.actual.secreto_nuevo).toBeUndefined();
	});

	it("un trabajo que la API ya no deja bajar se confirma como fallo, sale del diario y no detiene la señal de vida", async () => {
		const trabajo = await prueba.pedirTrabajo([notas[1] ?? ""], 1);
		// Lo recibió y se apagó; mientras, la dueña da de baja la Zebra de Aduana.
		const clave = await prueba.piezas.diario.claveDelPedido();
		for (const recibido of (await prueba.piezas.api.trabajos(clave)).trabajos)
			await prueba.piezas.diario.recibido(recibido);
		await prueba.piezas.diario.pedidoRecibido(clave);
		const [impresora] = (
			await prueba.servidor.base.dueno.query(
				"SELECT id, version, ubicacion_id FROM impresoras WHERE nombre = 'Zebra Aduana'",
			)
		).rows;
		const cambiada = await mandarAccion(
			prueba.servidor,
			"admin.guardar_impresora",
			{
				datos: {
					impresora_id: impresora?.id,
					nombre: "Zebra Aduana",
					modelo: "ZD421",
					ubicacion_id: impresora?.ubicacion_id,
					dispositivo_id: puenteDeAduana(),
					baja: true,
					motivo_baja: "Se descompuso",
					version: Number(impresora?.version),
				},
			},
			"duena",
		);
		expect(cambiada.estado, JSON.stringify(cambiada.cuerpo)).toBe(200);
		const antes = prueba.llamadas.length;
		await atenderTrabajos(prueba.piezas);
		expect(await prueba.piezas.diario.pendientes()).toEqual([]);
		expect(prueba.llamadas.slice(antes)).toContain("POST /v1/acciones/admin.trabajos_impresion");
		expect(await prueba.trabajo(trabajo)).toEqual({
			estado: "fallo",
			error: "La etiqueta ya no se puede imprimir aquí",
		});
	});
});
