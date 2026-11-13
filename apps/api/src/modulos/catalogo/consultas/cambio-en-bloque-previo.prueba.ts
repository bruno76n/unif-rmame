/**
 * Prueba de `catalogo.cambio_en_bloque_previo` con los datos de la muestra: la vista previa del cambio en bloque da lo
 * mismo que la cuenta de la acción (`precioDelCambioEnBloque`), cuenta los que cambian y los que no tienen precio,
 * ofrece solo las listas donde alguno tiene precio, dice los topes con el valor de su parámetro, y solo Catálogo la lee.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada botón llama a su acción con lo que dice su archivo» y
 * «Cada consulta revisa el departamento…») y docs/interfaz/fabrica/catalogo.md («Cambiar precios en bloque»)
 */

import { precioDelCambioEnBloque } from "@uniformame/compartido/calculos/precios";
import { centavos } from "@uniformame/compartido/tipos/base";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta. */
interface Previo {
	listas: { id: string; nombre: string }[];
	lista: { id: string; nombre: string } | null;
	renglones: { producto: string; antes_centavos: number; despues_centavos: number }[];
	cambian: number;
	escogidos: number;
	sin_precio: number;
	precios: number;
	error: { codigo: string; mensaje: string } | null;
}

describe("catalogo.cambio_en_bloque_previo: lo que se ve es lo que se aplica", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Los ids de unos productos por nombre (el primero de cada nombre). */
	async function ids(...nombres: string[]): Promise<string> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT DISTINCT ON (nombre) id FROM productos WHERE nombre = ANY($1) ORDER BY nombre, id",
			[nombres],
		);
		return rows.map((fila) => String(fila.id)).join(",");
	}

	/** Pide la vista previa como Catálogo. */
	async function previo(parametros: Record<string, string>): Promise<Previo> {
		const respuesta = await pedirConsulta(
			servidor,
			"catalogo.cambio_en_bloque_previo",
			{ direccion: "subir", modo: "por_ciento", cantidad: "10", redondear: "si", ...parametros },
			"catalogo",
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Previo;
	}

	it("sube 10% con redondeo a $5 igual que la acción, y cuenta los que cambian y los sin precio", async () => {
		const resultado = await previo({
			productos: await ids("Playera polo blanca lisa", "Pants marino liso", "Bata blanca de laboratorio con escudo"),
		});
		expect(resultado.lista?.nombre).toBe("Mostrador");
		// Las generales primero; luego las de los clientes donde alguno tiene precio.
		expect(resultado.listas.slice(0, 3).map((lista) => lista.nombre)).toEqual(["Mostrador", "Mayoreo", "En línea"]);
		expect(resultado).toMatchObject({ escogidos: 3, cambian: 2, sin_precio: 1, error: null });
		const { rows } = await servidor.base.dueno.query(
			"SELECT valor_entero::int AS v FROM parametros WHERE clave = 'catalogo.bloque_redondeo_centavos'",
		);
		const cambio = { direccion: "subir", modo: "por_ciento", cantidad: 10, redondear: true } as const;
		for (const renglon of resultado.renglones) {
			expect(renglon.despues_centavos, renglon.producto).toBe(
				precioDelCambioEnBloque(centavos(renglon.antes_centavos), cambio, Number(rows[0]?.v)),
			);
		}
		expect(resultado.renglones.map((renglon) => renglon.antes_centavos).sort()).toEqual([17_500, 41_000]);
		expect(resultado.precios).toBeGreaterThanOrEqual(2);
	});

	it("los topes y «sin cambio» salen con el texto de la acción", async () => {
		const productos = await ids("Playera polo blanca lisa");
		expect((await previo({ productos, cantidad: "60" })).error).toEqual({
			codigo: "tope_por_ciento",
			mensaje: "Más de 50% se cambia producto por producto.",
		});
		expect((await previo({ productos, modo: "pesos", cantidad: "999" })).error).toBeNull();
		expect((await previo({ productos, cantidad: "1", redondear: "si" })).error?.codigo).toBe("sin_cambio");
	});

	it("sin ningún precio no hay listas que ofrecer", async () => {
		const resultado = await previo({ productos: await ids("Bata blanca de laboratorio con escudo") });
		expect(resultado.listas).toEqual([]);
		expect(resultado.lista).toBeNull();
		expect(resultado.error?.codigo).toBe("sin_precio_en_lista");
	});

	it("solo Catálogo la lee: Bodega y Ventas no", async () => {
		const productos = await ids("Playera polo blanca lisa");
		for (const quien of ["bodega", "ventas"]) {
			const respuesta = await pedirConsulta(
				servidor,
				"catalogo.cambio_en_bloque_previo",
				{ productos, direccion: "subir", modo: "por_ciento", cantidad: "10", redondear: "si" },
				quien,
			);
			expect(respuesta.estado, quien).toBe(403);
		}
	});
});
