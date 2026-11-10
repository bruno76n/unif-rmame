/**
 * Prueba de las pisadas: la versión, el 409 y el control por agregado.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, encabezadosDeLaWeb, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

describe("una edición con versión vieja recibe 409 con la versión actual y sus datos recortados; un cambio en un renglón sube la versión del encabezado", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Crea una nota y regresa su id y su versión, como las leería la pantalla. */
	async function crearYLeer(texto: string): Promise<{ id: string; version: number }> {
		const creada = await mandarAccion(servidor, "prueba.crear_nota", { datos: { texto, monto_centavos: 1 } });
		const id = String((creada.cuerpo.resultado as { id: string }).id);
		const leida = await servidor.app.inject({
			method: "GET",
			url: `/v1/consultas/prueba.nota?id=${id}`,
			headers: encabezadosDeLaWeb(),
		});
		return { id, version: leida.json().resultado.version };
	}

	it("dos ediciones con la misma versión: la primera pasa y regresa su versión nueva; la segunda recibe 409 con la actual y sus datos", async () => {
		const { id, version } = await crearYLeer("original");
		const primera = await mandarAccion(servidor, "prueba.editar_nota", { datos: { id, texto: "de Ana" }, version });
		expect(primera.estado).toBe(200);
		const nueva = (primera.cuerpo.resultado as { version: number }).version;
		expect(nueva).toBeGreaterThan(version);
		const segunda = await mandarAccion(servidor, "prueba.editar_nota", { datos: { id, texto: "de Luis" }, version });
		expect(segunda.estado).toBe(409);
		expect(segunda.cuerpo).toMatchObject({ error: "conflicto_version", version: nueva, datos: { texto: "de Ana" } });
		// Con la versión nueva, la segunda persona sí guarda.
		expect(
			(await mandarAccion(servidor, "prueba.editar_nota", { datos: { id, texto: "de Luis" }, version: nueva })).estado,
		).toBe(200);
	});

	it("un cambio en un renglón sube la versión del encabezado: otra edición con la versión de antes choca", async () => {
		const { id, version } = await crearYLeer("con renglones");
		const renglon = await mandarAccion(servidor, "prueba.agregar_renglon", {
			datos: { nota_id: id, cantidad: 3 },
			version,
		});
		expect(renglon.estado).toBe(200);
		expect((renglon.cuerpo.resultado as { version: number }).version).toBeGreaterThan(version);
		expect((await mandarAccion(servidor, "prueba.editar_nota", { datos: { id, texto: "otra" }, version })).estado).toBe(
			409,
		);
	});

	it("editar algo que no existe responde 404", async () => {
		const respuesta = await mandarAccion(servidor, "prueba.editar_nota", {
			datos: { id: "01936f2e-8c3a-7b4d-9e5f-00000000dead", texto: "x" },
			version: 1,
		});
		expect(respuesta.estado).toBe(404);
	});

	it("una nota que la cuenta no puede ver responde 404 al editarla, no 409, y sus datos no viajan", async () => {
		const creada = await mandarAccion(
			servidor,
			"prueba.crear_nota",
			{ datos: { texto: "privada de la dueña", monto_centavos: 1 } },
			"duena",
		);
		const id = String((creada.cuerpo.resultado as { id: string }).id);
		const deVentas = await mandarAccion(servidor, "prueba.editar_nota", { datos: { id, texto: "otra" }, version: 0 });
		expect(deVentas.estado).toBe(404);
		expect(JSON.stringify(deVentas.cuerpo)).not.toContain("privada");
	});

	it("el 409 lleva los datos recortados según la cuenta: el monto solo para quien lo puede ver", async () => {
		const { id, version } = await crearYLeer("con monto");
		await mandarAccion(servidor, "prueba.editar_nota", { datos: { id, texto: "cambiada" }, version });
		const deVentas = await mandarAccion(servidor, "prueba.editar_nota", { datos: { id, texto: "x" }, version });
		expect(deVentas.estado).toBe(409);
		expect(deVentas.cuerpo.datos).not.toHaveProperty("monto_centavos");
		const deLaDuena = await mandarAccion(
			servidor,
			"prueba.editar_nota",
			{ datos: { id, texto: "x" }, version },
			"duena",
		);
		expect(deLaDuena.cuerpo.datos).toMatchObject({ monto_centavos: 1 });
	});

	it("una acción que edita y no toma su versión no se guarda", async () => {
		const { id } = await crearYLeer("antes de editar");
		const respuesta = await mandarAccion(servidor, "prueba.editar_sin_version", { datos: { id }, version: 0 });
		expect(respuesta.estado).toBe(500);
		const { rows } = await servidor.base.dueno.query("SELECT texto FROM prueba_notas WHERE id = $1", [id]);
		// La acción cambiaba el texto a «sin versión»: el corredor la deshizo y quedó el de antes.
		expect(rows[0]?.texto).toBe("antes de editar");
	});
});
