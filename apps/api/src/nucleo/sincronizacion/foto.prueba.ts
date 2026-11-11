/**
 * Prueba de la foto: entrega todo lo vigente del aparato y, al terminar, la bajada sigue desde su inicio sin
 * perder lo que cambió durante la foto.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bajarHasta, fotoCompleta, pedirFoto } from "../pruebas/bajada-de-prueba.ts";
import { quienesDePrueba } from "../pruebas/cuentas-de-prueba.ts";
import { mandarAccion } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

describe("la foto entrega todo lo vigente del aparato y la bajada sigue desde su inicio", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Ventas abre un lote en el Taller. */
	async function abrirLote(nombre: string): Promise<string> {
		const id = uuidv7();
		expect((await mandarAccion(servidor, "prueba.abrir_lote", { datos: { id, nombre } })).estado).toBe(200);
		return id;
	}

	it("entrega lo vigente que cumple el filtro, tabla por tabla en el orden de dependencias, sin quitar nada", async () => {
		const abiertos = [await abrirLote("L-foto-1"), await abrirLote("L-foto-2")];
		const cerrado = await abrirLote("L-foto-cerrado");
		await mandarAccion(servidor, "prueba.cerrar_lote", { datos: { lote_id: cerrado } });
		await servidor.base.dueno.query(
			"INSERT INTO prueba_lotes (id, nombre, ubicacion_id) SELECT $1, 'L-ADU', id FROM ubicaciones WHERE codigo = 'ADU'",
			[uuidv7()],
		);
		const { cambios } = await fotoCompleta(servidor, 2);
		expect(cambios.every((cambio) => cambio.op === "cambio")).toBe(true);
		const tablas = [...new Set(cambios.map((cambio) => cambio.tabla))];
		expect(tablas).toEqual(["dispositivos", "parametros", "tallas", "prueba_lotes"]);
		const quien = quienesDePrueba.tablet;
		const suyo = quien?.tipo === "aparato" ? quien.dispositivoId : "";
		expect(cambios.filter((cambio) => cambio.tabla === "dispositivos").map((cambio) => cambio.id)).toEqual([suyo]);
		expect(cambios.find((cambio) => cambio.tabla === "dispositivos")?.datos).not.toHaveProperty("llave_hash");
		// Los parámetros que bajan a la tablet, y ninguno más.
		const parametros = cambios.filter((cambio) => cambio.tabla === "parametros").map((cambio) => cambio.datos?.clave);
		const { rows } = await servidor.base.dueno.query(
			"SELECT clave FROM parametros WHERE 'tablet_taller' = ANY(baja_a) ORDER BY clave",
		);
		expect([...parametros].sort()).toEqual(rows.map((renglon) => renglon.clave));
		expect(parametros).toEqual(
			expect.arrayContaining(["prueba.atendidos_bajan", "sync.intervalo_segundos", "sync.tanda_max_comandos"]),
		);
		// Los lotes abiertos del Taller, por id; ni el cerrado ni el de otra ubicación.
		expect(cambios.filter((cambio) => cambio.tabla === "prueba_lotes").map((cambio) => cambio.id)).toEqual(
			[...abiertos].sort(),
		);
	});

	it("lo que cambia durante la foto baja después, desde su inicio: nada se pierde", async () => {
		const antes = await abrirLote("L-foto-3");
		let durante = "";
		const { cursor } = await fotoCompleta(servidor, 1, async (pagina) => {
			if (pagina !== 0) return;
			// Entre la primera página y la segunda: un lote nuevo y uno que ya existía cambia.
			durante = await abrirLote("L-foto-4");
			await servidor.base.dueno.query("UPDATE prueba_lotes SET nombre = 'L-foto-3-B' WHERE id = $1", [antes]);
		});
		const { cambios } = await bajarHasta(
			servidor,
			cursor,
			[antes, durante],
			(bajados) =>
				bajados.some((cambio) => cambio.id === durante) &&
				bajados.some((cambio) => cambio.datos?.nombre === "L-foto-3-B"),
		);
		expect(cambios).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ tabla: "prueba_lotes", op: "cambio", id: durante }),
				expect.objectContaining({
					tabla: "prueba_lotes",
					op: "cambio",
					id: antes,
					datos: expect.objectContaining({ nombre: "L-foto-3-B" }),
				}),
			]),
		);
	});

	it("una parte cambiada o de otro aparato no sirve: 400 y la foto empieza otra vez", async () => {
		const primera = await pedirFoto(servidor, undefined, 1);
		expect(primera.estado).toBe(200);
		const parte = String(primera.cuerpo.parte);
		const [texto = "", firma = ""] = parte.split(".");
		const otra = await pedirFoto(servidor, `${texto}x.${firma}`, 1);
		expect(otra.estado).toBe(400);
		expect(otra.cuerpo).toMatchObject({ error: "validacion", campos: { parte: "Empieza la foto otra vez." } });
	});
});
