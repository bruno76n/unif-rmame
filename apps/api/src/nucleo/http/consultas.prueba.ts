/**
 * Prueba de las consultas: la paginación con cursor, el recorte y el 404.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, encabezadosDeLaWeb, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

describe("una consulta pagina con cursor, no regresa un campo recortado y lo dice en recortado; un registro que la cuenta no puede ver responde 404", () => {
	let servidor: ServidorDePrueba;
	let ids: string[] = [];
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		for (const texto of ["una", "dos", "tres", "privada de la dueña", "cinco"]) {
			const creada = await mandarAccion(servidor, "prueba.crear_nota", { datos: { texto, monto_centavos: 125_000 } });
			ids.push(String((creada.cuerpo.resultado as { id: string }).id));
		}
		ids = ids.sort();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lee una consulta como la web. */
	async function consultar(url: string, quien = "ventas") {
		const respuesta = await servidor.app.inject({ method: "GET", url, headers: encabezadosDeLaWeb(quien) });
		return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
	}

	it("pagina con un cursor opaco hasta que no hay más, sin repetir ni saltar renglones", async () => {
		const vistos: string[] = [];
		let cursor: string | null = null;
		let paginas = 0;
		do {
			const { estado, cuerpo } = await consultar(
				`/v1/consultas/prueba.notas?limite=2${cursor ? `&cursor=${cursor}` : ""}`,
			);
			expect(estado).toBe(200);
			vistos.push(...cuerpo.resultado.renglones.map((renglon: { id: string }) => renglon.id));
			cursor = cuerpo.resultado.cursor;
			expect(cuerpo.resultado.hay_mas).toBe(cursor !== null);
			paginas++;
		} while (cursor !== null);
		expect(vistos).toEqual(ids);
		expect(paginas).toBe(3);
	});

	it("un cursor que no dio la API responde 400 en el campo cursor; un límite fuera de rango, también 400", async () => {
		const malo = await consultar("/v1/consultas/prueba.notas?cursor=no-es-un-cursor");
		expect(malo.estado).toBe(400);
		expect(malo.cuerpo.campos.cursor).toBeDefined();
		expect((await consultar("/v1/consultas/prueba.notas?limite=50")).estado).toBe(400);
	});

	it("sin el permiso, el monto no viaja y recortado lo dice; la dueña sí lo recibe", async () => {
		const ventas = await consultar("/v1/consultas/prueba.notas?limite=2");
		expect(ventas.cuerpo.recortado).toEqual(["monto_centavos"]);
		for (const renglon of ventas.cuerpo.resultado.renglones) expect(renglon).not.toHaveProperty("monto_centavos");
		const duena = await consultar("/v1/consultas/prueba.notas?limite=2", "duena");
		expect(duena.cuerpo.recortado).toEqual([]);
		expect(duena.cuerpo.resultado.renglones[0].monto_centavos).toBe(125_000);
	});

	it("una nota que la cuenta no puede ver responde 404, igual que una que no existe; la dueña sí la ve", async () => {
		const vistasPorLaDuena = await Promise.all(
			ids.map((id) => consultar(`/v1/consultas/prueba.nota?id=${id}`, "duena")),
		);
		const idPrivada = vistasPorLaDuena.find((vista) => vista.cuerpo.resultado.texto.startsWith("privada"))?.cuerpo
			.resultado.id;
		expect(idPrivada).toBeDefined();
		const deVentas = await consultar(`/v1/consultas/prueba.nota?id=${idPrivada}`);
		const inexistente = await consultar("/v1/consultas/prueba.nota?id=01936f2e-8c3a-7b4d-9e5f-00000000dead");
		expect(deVentas.estado).toBe(404);
		expect(deVentas.cuerpo).toEqual(inexistente.cuerpo);
	});

	it("una consulta también revisa el permiso: Aduana no lee las notas de Ventas", async () => {
		expect((await consultar("/v1/consultas/prueba.notas", "aduana")).cuerpo).toMatchObject({
			error: "sin_permiso",
			codigo: "sin_departamento",
		});
	});

	it("el servidor no deja viajar un campo que la consulta dice que recortó: sale 500 sin el dato", async () => {
		const respuesta = await consultar("/v1/consultas/prueba.trampa");
		expect(respuesta.estado).toBe(500);
		expect(JSON.stringify(respuesta.cuerpo)).not.toContain("125000");
	});

	it("una consulta que dice que recortó un campo que su contrato no deja recortar sale con 500", async () => {
		expect((await consultar("/v1/consultas/prueba.trampa?fuera=si")).estado).toBe(500);
	});
});
