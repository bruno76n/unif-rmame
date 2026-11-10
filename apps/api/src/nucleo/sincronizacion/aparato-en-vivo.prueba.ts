/**
 * Prueba de los avisos en vivo de un aparato con su llave: le llega solo lo que le baja, y al revocarlo recibe
 * `dispositivo_revocado`, su conexión se corta y ya no se vuelve a conectar. El latido va largo: así el corte
 * viene del evento, con su aviso (el latido también corta una llave revocada, pero sin aviso).
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md (parte 4: «los avisos en vivo con la llave»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { llaveDePrueba, quienesDePrueba } from "../pruebas/cuentas-de-prueba.ts";
import { escuchar, esperarA, procesarComoElWorker } from "../pruebas/en-vivo.ts";
import { conGoogle, mandarAccion } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

/** El id de la tablet de prueba. */
function tablet(): string {
	const quien = quienesDePrueba.tablet;
	if (quien?.tipo !== "aparato") throw new Error("no hay tablet de prueba");
	return quien.dispositivoId;
}

describe("un aparato conectado con su llave recibe solo lo que le baja; revocado, se le corta y ya no entra", () => {
	let servidor: ServidorDePrueba;
	let direccion: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ avisosEnVivo: { latidoMs: 60_000, alcanceReal: true } });
		direccion = await servidor.app.listen({ port: 0, host: "127.0.0.1" });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("le llegan los cambios de las tablas que le bajan y no los de las demás", async () => {
		const conexion = await escuchar(direccion, { llave: llaveDePrueba("tablet") });
		await esperarA(() => conexion.eventos().some((evento) => evento.nombre === "hola"));
		expect(
			(await mandarAccion(servidor, "prueba.abrir_lote", { datos: { id: uuidv7(), nombre: "L-vivo" } })).estado,
		).toBe(200);
		expect(
			(await mandarAccion(servidor, "prueba.crear_nota", { datos: { texto: "Nota de Ventas", monto_centavos: 1 } }))
				.estado,
		).toBe(200);
		await procesarComoElWorker(servidor);
		await esperarA(() => JSON.stringify(conexion.eventos()).includes("prueba_lotes"));
		const cambios = JSON.stringify(conexion.eventos().filter((evento) => evento.nombre === "cambios"));
		expect(cambios).toContain("prueba_lotes");
		expect(cambios).not.toContain("prueba_notas");
		conexion.cerrar();
	});

	it("al revocarla recibe dispositivo_revocado, el servidor corta su conexión y volver a conectarse responde 401 llave_revocada", async () => {
		const conexion = await escuchar(direccion, { llave: llaveDePrueba("tablet") });
		await esperarA(() => conexion.eventos().some((evento) => evento.nombre === "hola"));
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
		await procesarComoElWorker(servidor);
		await esperarA(() => conexion.cortada());
		expect(conexion.cortada()).toBe(true);
		expect(conexion.eventos().filter((evento) => evento.nombre === "dispositivo_revocado")).toHaveLength(1);
		const otraVez = await fetch(`${direccion}/v1/eventos`, { headers: { authorization: llaveDePrueba("tablet") } });
		expect(otraVez.status).toBe(401);
		expect(await otraVez.json()).toMatchObject({ codigo: "llave_revocada" });
	});
});
