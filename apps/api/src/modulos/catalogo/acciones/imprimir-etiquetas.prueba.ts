/**
 * Prueba de las etiquetas de prenda: el PDF se guarda antes de confirmar, las pendientes pasan a impresas y las
 * tallas que no se etiquetan no entran.
 * Fase 8 · docs/fases/08-catalogo.md (parte 5)
 */

import { crearSimuladorDeR2 } from "@uniformame/pruebas/simuladores/r2";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearAlmacen, direccionDeR2 } from "../../../nucleo/almacen.ts";
import {
	nuevoProducto,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { leerPdf } from "../../../nucleo/pruebas/leer-impresos.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

const cuenta = "cuentaprueba";
const simulador = crearSimuladorDeR2(cuenta);
const red = setupServer(...simulador.manejadores);
const almacen = crearAlmacen({
	direccion: direccionDeR2(cuenta),
	cubo: "uniformame-archivos",
	llaveId: "llave-de-prueba",
	secreto: "secreto-de-prueba",
});

/** Lo que regresa el PDF. */
const pdfListo = z.object({ archivo_id: z.uuid(), url: z.string(), etiquetas: z.number(), mensaje: z.string() });

describe("Imprimir etiquetas pasa a `impresa` las pendientes y no toca las ya impresas; no imprime pedido especial, descontinuadas ni dadas de baja; si el PDF no se guarda, nada queda marcado", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba({ almacen });
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		red.close();
		await servidor.cerrar();
	});

	/** Pide etiquetas como Catálogo. */
	function imprimir(datos: Record<string, unknown>) {
		return mandarAccion(servidor, "catalogo.imprimir_etiquetas", { datos }, "catalogo");
	}

	/** Un producto con las tallas 4, 6 y 8, más la 10 de pedido especial agregada en la ficha. */
	async function productoConEspecial() {
		const producto = await nuevoProducto(servidor, siembra);
		const diez = await mandarAccion(
			servidor,
			"catalogo.agregar_talla",
			{
				datos: {
					producto_id: producto.producto_id,
					talla_id: siembra.tallas.Infantil?.["10"],
					es_pedido_especial: true,
				},
				version: await versionDelProducto(servidor, producto.producto_id),
			},
			"catalogo",
		);
		const { variante_id } = z.object({ variante_id: z.uuid() }).parse(diez.cuerpo.resultado);
		return { ...producto, variantes: [...producto.variantes, { variante_id, talla: "10" }] };
	}

	/** El estado de la etiqueta de cada variante del producto, por talla. */
	async function estados(productoId: string): Promise<Record<string, { estado: string; impresa_en: string | null }>> {
		const { rows } = await servidor.base.dueno.query(
			`SELECT t.nombre AS talla, v.estado_etiqueta AS estado, v.etiqueta_impresa_en::text AS impresa_en
			 FROM variantes v JOIN tallas t ON t.id = v.talla_id WHERE v.producto_id = $1`,
			[productoId],
		);
		return Object.fromEntries(
			rows.map((renglon) => [renglon.talla, { estado: renglon.estado, impresa_en: renglon.impresa_en }]),
		);
	}

	/**
	 * Las variantes del PDF guardado, en orden: el código que lleva cada página, de una etiqueta de prenda, llevado a su
	 * variante.
	 */
	async function idsDelPdf(archivoId: string): Promise<string[]> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT almacen_clave, proposito, modulo, tipo_mime FROM archivos WHERE id = $1",
			[archivoId],
		);
		expect(rows[0]).toMatchObject({ proposito: "etiqueta", modulo: "catalogo", tipo_mime: "application/pdf" });
		const objeto = simulador.objetos.get(`uniformame-archivos/${rows[0]?.almacen_clave}`);
		if (objeto === undefined) throw new Error("no llegó el PDF");
		const paginas = leerPdf(objeto.contenido);
		for (const pagina of paginas) expect([pagina.ancho, pagina.alto]).toEqual([144, 72]);
		const codigos = paginas.map((pagina) => pagina.textos.at(-1) ?? "");
		const { rows: variantes } = await servidor.base.dueno.query(
			"SELECT id, codigo FROM variantes WHERE codigo = ANY($1::text[])",
			[codigos],
		);
		const porCodigo = new Map(variantes.map((variante) => [variante.codigo, variante.id]));
		return codigos.map((codigo) => porCodigo.get(codigo) ?? codigo);
	}

	it("las nuevas de un producto: una por talla normal activa, pasan a impresas, sube la versión, un renglón de bitácora y su evento", async () => {
		const producto = await productoConEspecial();
		const antes = await versionDelProducto(servidor, producto.producto_id);
		const respuesta = await imprimir({ producto_ids: [producto.producto_id], solo_pendientes: true });
		expect(respuesta.estado).toBe(200);
		const resultado = pdfListo.parse(respuesta.cuerpo.resultado);
		const nombre = (
			await servidor.base.dueno.query("SELECT nombre FROM productos WHERE id = $1", [producto.producto_id])
		).rows[0]?.nombre;
		expect(resultado).toMatchObject({
			etiquetas: 3,
			mensaje: `PDF de 3 etiquetas de ${nombre} listo. Ya se pueden recibir en las tiendas`,
		});
		expect(resultado.url).toContain(resultado.archivo_id);
		const normales = producto.variantes.filter((variante) => variante.talla !== "10").map((v) => v.variante_id);
		expect((await idsDelPdf(resultado.archivo_id)).sort()).toEqual([...normales].sort());
		const despues = await estados(producto.producto_id);
		expect([despues["4"]?.estado, despues["6"]?.estado, despues["8"]?.estado]).toEqual([
			"impresa",
			"impresa",
			"impresa",
		]);
		expect(despues["10"]?.estado).not.toBe("impresa");
		expect(await versionDelProducto(servidor, producto.producto_id)).toBeGreaterThan(antes);
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'catalogo.imprimir_etiquetas' AND entidad_id = $1",
			[producto.producto_id],
		);
		expect(bitacora.rows).toEqual([{ descripcion: `Imprimió 3 etiquetas de ${nombre}` }]);
		const eventos = await servidor.base.dueno.query(
			"SELECT datos FROM eventos WHERE tipo = 'etiquetas.impresas' AND entidad_id = $1",
			[resultado.archivo_id],
		);
		expect(eventos.rows).toEqual([{ datos: { archivo_id: resultado.archivo_id, etiquetas: 3 } }]);

		// Ya no hay pendientes: «Sin etiquetas».
		const otraVez = await imprimir({ producto_ids: [producto.producto_id], solo_pendientes: true });
		expect(otraVez.estado).toBe(400);
	});

	it("reimprimir una ya impresa no la toca ni sube la versión; con varios productos, un renglón por producto con el mismo comando", async () => {
		const uno = await nuevoProducto(servidor, siembra);
		const otro = await nuevoProducto(servidor, siembra);
		await imprimir({ producto_ids: [uno.producto_id] });
		const impresasAntes = await estados(uno.producto_id);
		const versionAntes = await versionDelProducto(servidor, uno.producto_id);
		const seis = uno.variantes.find((variante) => variante.talla === "6");
		const respuesta = await imprimir({
			renglones: [
				{ variante_id: seis?.variante_id, cuantas: 5 },
				{ variante_id: otro.variantes[0]?.variante_id, cuantas: 2 },
			],
		});
		expect(respuesta.estado).toBe(200);
		const resultado = pdfListo.parse(respuesta.cuerpo.resultado);
		expect(resultado).toMatchObject({ etiquetas: 7, mensaje: "PDF de 7 etiquetas listo" });
		const ids = await idsDelPdf(resultado.archivo_id);
		expect(ids.filter((id) => id === seis?.variante_id)).toHaveLength(5);
		expect(await estados(uno.producto_id)).toEqual(impresasAntes);
		expect(await versionDelProducto(servidor, uno.producto_id)).toBe(versionAntes);
		const { rows } = await servidor.base.dueno.query(
			"SELECT entidad_id, descripcion, comando_id FROM bitacora WHERE accion = 'catalogo.imprimir_etiquetas' AND entidad_id = ANY($1::uuid[]) AND descripcion ~ '^Imprimió (5|2) '",
			[[uno.producto_id, otro.producto_id]],
		);
		expect(rows.map((renglon) => renglon.entidad_id).sort()).toEqual([uno.producto_id, otro.producto_id].sort());
		expect(new Set(rows.map((renglon) => renglon.comando_id)).size).toBe(1);
	});

	it("por variante no imprime pedido especial, descontinuadas ni dadas de baja; por producto simplemente no entran", async () => {
		const producto = await productoConEspecial();
		const talla = (nombre: string) => producto.variantes.find((variante) => variante.talla === nombre)?.variante_id;
		for (const [accion, variante, datos] of [
			["catalogo.descontinuar_talla", talla("6"), { motivo: "Ya no se surte" }],
			["catalogo.dar_baja_talla", talla("8"), { motivo: "Ya no se vende" }],
		] as const) {
			const respuesta = await mandarAccion(
				servidor,
				accion,
				{
					datos: { variante_id: variante, ...datos },
					version: await versionDelProducto(servidor, producto.producto_id),
				},
				"catalogo",
			);
			expect(respuesta.estado).toBe(200);
		}
		for (const [nombre, codigo, mensaje] of [
			["10", "talla_especial", "La talla 10 es de pedido especial: se etiqueta al fabricar el pedido."],
			["6", "talla_descontinuada", "La talla 6 está descontinuada: ya no se etiqueta."],
			["8", "talla_dada_de_baja", "La talla 8 está dada de baja: su código ya no se imprime."],
		] as const) {
			const respuesta = await imprimir({ renglones: [{ variante_id: talla(nombre), cuantas: 1 }] });
			expect(respuesta.estado).toBe(422);
			expect(respuesta.cuerpo).toMatchObject({ codigo, mensaje });
		}
		const porProducto = await imprimir({ producto_ids: [producto.producto_id] });
		expect(porProducto.estado).toBe(200);
		expect(await idsDelPdf(pdfListo.parse(porProducto.cuerpo.resultado).archivo_id)).toEqual([talla("4")]);
	});

	it("«Sin etiquetas» y el máximo por talla", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const variante = producto.variantes[0]?.variante_id;
		expect((await imprimir({})).estado).toBe(400);
		expect(
			(await imprimir({ producto_ids: [producto.producto_id], renglones: [{ variante_id: variante, cuantas: 1 }] }))
				.estado,
		).toBe(400);
		expect((await imprimir({ renglones: [] })).estado).toBe(400);
		expect((await imprimir({ renglones: [{ variante_id: variante, cuantas: 0 }] })).estado).toBe(400);
		const deMas = await imprimir({ renglones: [{ variante_id: variante, cuantas: 1_000 }] });
		expect(deMas.estado).toBe(400);
		expect(deMas.cuerpo).toMatchObject({ campos: { renglones: "Hasta 999 etiquetas de una talla." } });
	});
});

describe("si el PDF no se guarda, nada queda marcado", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		// Sin almacén: guardar el PDF falla.
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la acción falla y las variantes siguen por imprimir, sin bitácora ni evento", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const antes = await versionDelProducto(servidor, producto.producto_id);
		const respuesta = await mandarAccion(
			servidor,
			"catalogo.imprimir_etiquetas",
			{ datos: { producto_ids: [producto.producto_id] } },
			"catalogo",
		);
		expect(respuesta.estado).not.toBe(200);
		const { rows } = await servidor.base.dueno.query(
			"SELECT DISTINCT estado_etiqueta FROM variantes WHERE producto_id = $1",
			[producto.producto_id],
		);
		expect(rows).toEqual([{ estado_etiqueta: "por_imprimir" }]);
		expect(await versionDelProducto(servidor, producto.producto_id)).toBe(antes);
		const bitacora = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM bitacora WHERE accion = 'catalogo.imprimir_etiquetas'",
		);
		expect(bitacora.rows[0]?.n).toBe(0);
		const archivos = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM archivos WHERE proposito = 'etiqueta'",
		);
		expect(archivos.rows[0]?.n).toBe(0);
	});
});
