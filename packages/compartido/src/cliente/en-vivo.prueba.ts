/**
 * Prueba de leer los avisos en vivo: los eventos completos con su nombre y sus datos, sin el latido ni `retry`, y lo que
 * sobra cuando un evento llega partido.
 * Fase 20 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («Avisos en vivo»)
 */

import { describe, expect, it } from "vitest";
import { escucharEventos, leerEventos } from "./en-vivo.ts";

describe("leer los avisos en vivo de un aparato", () => {
	it("lee los eventos que llegan en pedazos, sin el latido ni retry", () => {
		const { eventos, resto } = leerEventos(
			'retry: 5000\n\nevent: hola\ndata: {"intervalo_segundos":60}\n\n: latido\n\nevent: impresion\ndata: {"trabajo_id"',
		);
		expect(eventos).toEqual([{ nombre: "hola", datos: { intervalo_segundos: 60 } }]);
		expect(leerEventos(`${resto}:"t1"}\n\n`).eventos).toEqual([{ nombre: "impresion", datos: { trabajo_id: "t1" } }]);
	});

	it("escucha una conexión hasta que se cierra y pasa cada evento en orden", async () => {
		const pedazos = [
			'event: cambios\ndata: {"tablas":["bultos"]}\n',
			'\nevent: resincronizar\ndata: {"motivo":"x"}\n\n',
		];
		const cuerpo = new ReadableStream<Uint8Array<ArrayBuffer>>({
			start: (control) => {
				for (const pedazo of pedazos) control.enqueue(new TextEncoder().encode(pedazo));
				control.close();
			},
		});
		const vistos: string[] = [];
		await escucharEventos(cuerpo, async (evento) => {
			vistos.push(evento.nombre);
		});
		expect(vistos).toEqual(["cambios", "resincronizar"]);
	});
});
