/**
 * Prueba de `calidad.devolucion` y de la devolución en Pendientes: lo que regresó de un cliente con defecto y está en
 * aduana sale «Por revisar» con lo que trae; la ventana ve cada renglón con lo que queda por decidir, el defecto con que
 * llegó y su versión; decidida en parte, queda lo demás; decidida toda, ya no espera a Calidad. Sin precios.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/calidad.md («Pendientes» y la ventana
 * «Revisar devolución {folio}»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { devolucionEnAduana } from "./de-prueba.ts";

/** Lo que regresa la consulta. */
interface Devolucion {
	traspaso_id: string;
	version: number;
	folio: string;
	cliente: string;
	renglones: {
		traspaso_linea_id: string;
		prenda: string;
		lote: string | null;
		por_decidir: number;
		defecto_id: string | null;
		defecto: string | null;
	}[];
	defectos: { id: string; nombre: string }[];
}

describe("calidad.devolucion: lo que regresó con defecto y espera a Calidad", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("sale en Pendientes y en su ventana; decidida en parte queda lo demás, y decidida toda ya no espera", async () => {
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, nombre FROM defectos WHERE nombre = 'Costura abierta'",
		);
		const defecto = { id: String(rows[0]?.id), nombre: String(rows[0]?.nombre) };
		const devolucion = await devolucionEnAduana(servidor, defecto.id);
		// En Pendientes: «Por revisar», con lo que trae.
		const pendientes = await pedirConsulta(servidor, "calidad.pendientes", { grupo: "devoluciones" }, "calidad");
		const { renglones } = pendientes.cuerpo.resultado as { renglones: Record<string, unknown>[] };
		expect(renglones).toEqual([
			expect.objectContaining({
				tipo: "devolucion",
				titulo: `${devolucion.folio} · ${devolucion.cliente}`,
				detalle: `3 ${devolucion.prenda} talla 4: Costura abierta`,
				cifra: "3 pz",
				estado: "Por revisar",
				color: "ambar",
				traspaso_id: devolucion.traspasoId,
			}),
		]);
		expect(JSON.stringify(pendientes.cuerpo)).not.toMatch(/centavos|precio|importe/);
		// La ventana.
		const pedir = () =>
			pedirConsulta(servidor, "calidad.devolucion", { traspaso_id: devolucion.traspasoId }, "calidad");
		const respuesta = await pedir();
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|importe/);
		const leida = respuesta.cuerpo.resultado as Devolucion;
		expect(leida).toMatchObject({ folio: devolucion.folio, cliente: devolucion.cliente });
		expect(leida.renglones).toEqual([
			expect.objectContaining({
				traspaso_linea_id: devolucion.lineaId,
				prenda: `${devolucion.prenda} · talla 4`,
				por_decidir: 3,
				defecto_id: defecto.id,
				defecto: "Costura abierta",
			}),
		]);
		expect(leida.defectos).toContainEqual(defecto);
		// Decidida en parte: queda lo demás.
		const revisar = async (version: number, piezas: number) =>
			mandarAccion(
				servidor,
				"calidad.revisar_devolucion",
				{
					datos: {
						traspaso_id: devolucion.traspasoId,
						renglones: [{ traspaso_linea_id: devolucion.lineaId, piezas, decision: "sirve" }],
					},
					version,
				},
				"calidad",
			);
		expect((await revisar(leida.version, 1)).estado).toBe(200);
		const otra = (await pedir()).cuerpo.resultado as Devolucion;
		expect(otra.renglones[0]?.por_decidir).toBe(2);
		expect((await revisar(otra.version, 2)).estado).toBe(200);
		expect((await pedir()).estado).toBe(404);
	});

	it("solo Calidad la pide", async () => {
		const otra = "01936f2e-0000-7000-8000-0000000000ff";
		expect((await pedirConsulta(servidor, "calidad.devolucion", { traspaso_id: otra }, "aduana")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "calidad.devolucion", { traspaso_id: otra }, "calidad")).estado).toBe(404);
	});
});
