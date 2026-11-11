/**
 * Prueba del alta de un producto: sus códigos seguidos (también con dos altas a la vez), sin códigos no crea nada,
 * lo que resuelve, a partir de otro y desde un pedido.
 * Fase 8 · docs/fases/08-catalogo.md (parte 3)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	altaDesdeCero,
	nuevoProducto,
	productoCreado,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { materialesDeReceta, nuevoDesarrollo } from "../../../nucleo/pruebas/patronaje-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("un alta toma sus códigos seguidos, resuelve lo que no viene y, desde un pedido, exige Ventas a externos y el precio del cliente", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Manda un alta como `quien`. */
	function alta(datos: Record<string, unknown>, quien = "catalogo") {
		return mandarAccion(servidor, "catalogo.crear_producto", { datos }, quien);
	}

	/** Los precios vigentes de un producto, por lista y talla. */
	async function preciosDe(productoId: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT lista_id, variante_id, precio_centavos::int AS precio, origen FROM precios WHERE producto_id = $1 AND vigente_hasta IS NULL ORDER BY lista_id, variante_id NULLS FIRST",
			[productoId],
		);
		return rows;
	}

	it("una variante por talla con códigos seguidos, todas por imprimir; su bitácora y su evento", async () => {
		const creado = await nuevoProducto(servidor, siembra);
		const codigos = creado.variantes.map((variante) => Number(variante.codigo));
		expect(codigos).toEqual([codigos[0], (codigos[0] ?? 0) + 1, (codigos[0] ?? 0) + 2]);
		expect(creado.mensaje).toMatch(
			new RegExp(`creado con 3 variantes, códigos ${creado.codigo_desde} a ${creado.codigo_hasta}$`),
		);
		const { rows } = await servidor.base.dueno.query("SELECT estado_etiqueta FROM variantes WHERE producto_id = $1", [
			creado.producto_id,
		]);
		expect(rows.every((fila) => fila.estado_etiqueta === "por_imprimir")).toBe(true);
		const bitacora = await servidor.base.dueno.query("SELECT descripcion FROM bitacora WHERE entidad_id = $1", [
			creado.producto_id,
		]);
		expect(bitacora.rows).toEqual([
			{ descripcion: `Producto nuevo con 3 variantes, códigos ${creado.codigo_desde} a ${creado.codigo_hasta}` },
		]);
		const evento = await servidor.base.dueno.query("SELECT tipo FROM eventos WHERE entidad_id = $1", [
			creado.producto_id,
		]);
		expect(evento.rows).toEqual([{ tipo: "producto.creado" }]);
	});

	it("dos altas a la vez toman bloques seguidos que no se cruzan; ningún código se repite", async () => {
		const [una, otra] = await Promise.all([nuevoProducto(servidor, siembra), nuevoProducto(servidor, siembra)]);
		const deUna = una.variantes.map((variante) => Number(variante.codigo));
		const deOtra = otra.variantes.map((variante) => Number(variante.codigo));
		for (const codigos of [deUna, deOtra]) {
			expect(codigos.every((codigo, i) => i === 0 || codigo === (codigos[i - 1] ?? 0) + 1)).toBe(true);
		}
		expect(new Set([...deUna, ...deOtra]).size).toBe(6);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n, count(DISTINCT codigo)::int AS distintos FROM variantes",
		);
		expect(rows[0]?.n).toBe(rows[0]?.distintos);
	});

	it("sin códigos suficientes no crea nada: sin_codigos", async () => {
		await servidor.base.dueno.query("UPDATE contadores_folio SET siguiente = 499998 WHERE tipo = 'codigo_barras'");
		try {
			const datos = altaDesdeCero(siembra);
			const respuesta = await alta(datos);
			expect(respuesta.cuerpo).toMatchObject({
				codigo: "sin_codigos",
				mensaje: "No quedan códigos de barras de fábrica para 3 tallas. Avisa a soporte.",
			});
			const { rows } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM productos WHERE nombre = $1", [
				datos.nombre,
			]);
			expect(rows[0]).toEqual({ n: 0 });
			const contador = await servidor.base.dueno.query(
				"SELECT siguiente::int AS siguiente FROM contadores_folio WHERE tipo = 'codigo_barras'",
			);
			expect(contador.rows[0]).toEqual({ siguiente: 499998 });
		} finally {
			await servidor.base.dueno.query(
				"UPDATE contadores_folio SET siguiente = (SELECT max(codigo::int) + 1 FROM variantes) WHERE tipo = 'codigo_barras'",
			);
		}
	});

	it("resuelve el recargo inicial y el precio en línea de mostrador; el nombre se repite por escuela; los canales en línea", async () => {
		const enLinea = await nuevoProducto(servidor, siembra, { canales: ["mostrador", "en_linea"] });
		const producto = await servidor.base.dueno.query(
			"SELECT recargo_pedido_especial_centavos::int AS recargo, tipo_prenda_id FROM productos WHERE id = $1",
			[enLinea.producto_id],
		);
		expect(producto.rows[0]).toEqual({ recargo: 5_000, tipo_prenda_id: siembra.tipoPrenda });
		expect(
			(await preciosDe(enLinea.producto_id)).map((precio) => [precio.lista_id, precio.precio, precio.origen]).sort(),
		).toEqual(
			[
				[siembra.listas.en_linea, 25_000, "alta_producto"],
				[siembra.listas.mostrador, 25_000, "alta_producto"],
			].sort(),
		);
		const nombre = "Playera polo blanca";
		expect((await alta(altaDesdeCero(siembra, { nombre }))).estado).toBe(200);
		expect((await alta(altaDesdeCero(siembra, { nombre: "PLAYERA POLO BLANCA" }))).cuerpo).toMatchObject({
			codigo: "nombre_repetido",
		});
		const escuela = z
			.object({ escuela_id: z.uuid() })
			.parse(
				(
					await mandarAccion(
						servidor,
						"catalogo.agregar_escuela",
						{ datos: { nombre: "Colegio Morelos", municipio: "Zamora" } },
						"catalogo",
					)
				).cuerpo.resultado,
			).escuela_id;
		expect(
			(
				await alta(
					altaDesdeCero(siembra, { nombre, escuela_id: escuela, categoria_mayoreo_id: siembra.categorias.Especial }),
				)
			).estado,
		).toBe(200);
		expect((await alta(altaDesdeCero(siembra, { escuela_id: escuela, canales: ["en_linea"] }))).cuerpo).toMatchObject({
			codigo: "en_linea_solo_sin_escuela",
		});
		expect((await alta(altaDesdeCero(siembra, { es_servicio: true, canales: ["en_linea"] }))).cuerpo).toMatchObject({
			codigo: "servicio_en_linea",
		});
		expect((await alta(altaDesdeCero(siembra, { canales: ["en_linea"], precios: [] }))).cuerpo).toMatchObject({
			codigo: "falta_precio_en_linea",
		});
		expect((await alta(altaDesdeCero(siembra, { precios: [] }))).cuerpo).toMatchObject({
			codigo: "falta_precio_mostrador",
		});
		expect(
			(
				await alta(
					altaDesdeCero(siembra, { tallas: [{ talla_id: siembra.tallas.Infantil?.["4"], es_pedido_especial: true }] }),
				)
			).cuerpo,
		).toMatchObject({ codigo: "especial_desde_cero" });
		expect((await alta(altaDesdeCero(siembra, { tipo_prenda_id: undefined }))).cuerpo).toMatchObject({
			codigo: "falta_tipo_prenda",
		});
		const caro = await alta(
			altaDesdeCero(siembra, { precios: [{ lista_id: siembra.listas.mostrador, precio_centavos: 10_000_000 }] }),
		);
		expect(caro.cuerpo).toMatchObject({ campos: { precios: "Un precio entero, de $1 a $99,999." } });
		const centavos = await alta(
			altaDesdeCero(siembra, { precios: [{ lista_id: siembra.listas.mostrador, precio_centavos: 25_050 }] }),
		);
		expect(centavos.estado).toBe(400);
	});

	it("a partir de otro: su tipo de prenda y su recargo, y sus precios propios de talla en las mismas tallas y listas", async () => {
		const base = await nuevoProducto(servidor, siembra, { recargo_pedido_especial_centavos: 8_000 });
		const [, seis] = base.variantes;
		await servidor.base.dueno.query(
			"INSERT INTO precios (id, lista_id, producto_id, variante_id, precio_centavos, origen) VALUES ($1, $2, $3, $4, 27000, 'ficha')",
			[uuidv7(), siembra.listas.mostrador, base.producto_id, seis?.variante_id],
		);
		const copia = await alta({
			...altaDesdeCero(siembra, { nombre: "Playera polo con escudo", tipo_prenda_id: undefined }),
			modo: "a_partir_de",
			producto_base_id: base.producto_id,
			medidas: [{ medida: "Largo", orden: 1, valores: [{ talla_id: seis?.talla_id, valor_cm: 40 }] }],
		});
		expect(copia.cuerpo).toMatchObject({ avisos: ["Las medidas se capturan con la receta en Patronaje"] });
		const creado = productoCreado.parse(copia.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query(
			"SELECT recargo_pedido_especial_centavos::int AS recargo, tipo_prenda_id, producto_base_id FROM productos WHERE id = $1",
			[creado.producto_id],
		);
		expect(rows[0]).toEqual({ recargo: 8_000, tipo_prenda_id: siembra.tipoPrenda, producto_base_id: base.producto_id });
		const seisNueva = creado.variantes.find((variante) => variante.talla === "6")?.variante_id;
		expect(await preciosDe(creado.producto_id)).toEqual([
			{ lista_id: siembra.listas.mostrador, variante_id: null, precio: 25_000, origen: "alta_producto" },
			{ lista_id: siembra.listas.mostrador, variante_id: seisNueva, precio: 27_000, origen: "alta_producto" },
		]);
		const bitacora = await servidor.base.dueno.query("SELECT descripcion FROM bitacora WHERE entidad_id = $1", [
			creado.producto_id,
		]);
		expect(bitacora.rows[0]?.descripcion).toMatch(/, a partir de /);
		await mandarAccion(
			servidor,
			"catalogo.descontinuar_productos",
			{
				datos: {
					productos: [
						{
							producto_id: base.producto_id,
							version: Number(
								(await servidor.base.dueno.query("SELECT version FROM productos WHERE id = $1", [base.producto_id]))
									.rows[0]?.version,
							),
						},
					],
					motivo: "Ya no se hace",
				},
			},
			"catalogo",
		);
		const sinBase = await alta({ ...altaDesdeCero(siembra), modo: "a_partir_de", producto_base_id: base.producto_id });
		expect(sinBase.cuerpo).toMatchObject({ codigo: "base_no_disponible" });
	});

	it("desde un pedido: Ventas a externos, a externos y con el precio del cliente; Ventas sin pedido, 403", async () => {
		const cliente = uuidv7();
		const lista = z.object({ lista_id: z.uuid() }).parse(
			await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
				contexto.interna("catalogo.crear_lista_cliente", {
					cliente_id: cliente,
					nombre: "Distribuidora Escolar Zamora",
				}),
			),
		).lista_id;
		const delPedido = (cambios: Record<string, unknown>) =>
			altaDesdeCero(siembra, {
				origen: "pedido",
				cliente_id: cliente,
				canales: ["externos"],
				precios: [{ lista_id: lista, precio_centavos: 21_000 }],
				...cambios,
			});
		expect((await alta(delPedido({ canales: ["mostrador"] }), "ventas")).cuerpo).toMatchObject({
			codigo: "externos_obligatorio",
		});
		expect((await alta(delPedido({ precios: [] }), "ventas")).cuerpo).toMatchObject({
			codigo: "falta_precio_cliente",
			mensaje: "Falta el precio de Distribuidora Escolar Zamora.",
		});
		const creado = await alta(delPedido({}), "ventas");
		expect(creado.estado).toBe(200);
		expect(productoCreado.parse(creado.cuerpo.resultado).mensaje).toMatch(/creado en Catálogo y agregado al pedido$/);
		const sinPedido = await alta(altaDesdeCero(siembra), "ventas");
		expect(sinPedido.estado).toBe(403);
		expect((await alta(altaDesdeCero(siembra), "aduana")).estado).toBe(403);
	});

	it("a partir de otro, las tallas son las del base (también las de pedido especial) en los grupos marcados", async () => {
		const base = await nuevoProducto(servidor, siembra);
		await mandarAccion(
			servidor,
			"catalogo.agregar_talla",
			{
				datos: { producto_id: base.producto_id, talla_id: siembra.tallas.Infantil?.["10"], es_pedido_especial: true },
				version: await versionDelProducto(servidor, base.producto_id),
			},
			"catalogo",
		);
		// La pantalla marca el grupo Infantil con una sola de sus tallas: el alta toma las cuatro del base.
		const copia = await alta({
			...altaDesdeCero(siembra, {
				nombre: "Playera copiada",
				tallas: [{ talla_id: siembra.tallas.Infantil?.["4"], es_pedido_especial: false }],
			}),
			modo: "a_partir_de",
			producto_base_id: base.producto_id,
		});
		const creado = productoCreado.parse(copia.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query(
			`SELECT t.nombre AS talla, v.es_pedido_especial AS especial FROM variantes v JOIN tallas t ON t.id = v.talla_id
			 WHERE v.producto_id = $1 ORDER BY t.orden`,
			[creado.producto_id],
		);
		expect(rows).toEqual([
			{ talla: "4", especial: false },
			{ talla: "6", especial: false },
			{ talla: "8", especial: false },
			{ talla: "10", especial: true },
		]);
	});

	it("una escuela dada de baja no recibe productos nuevos; una lista repetida o un tipo de prenda que no existe son 400", async () => {
		const escuela = z
			.object({ escuela_id: z.uuid() })
			.parse(
				(
					await mandarAccion(
						servidor,
						"catalogo.agregar_escuela",
						{ datos: { nombre: "Colegio Cuauhtémoc", municipio: "Tangancícuaro" } },
						"catalogo",
					)
				).cuerpo.resultado,
			).escuela_id;
		const version = Number(
			(await servidor.base.dueno.query("SELECT version::int AS v FROM escuelas WHERE id = $1", [escuela])).rows[0]?.v,
		);
		expect(
			(
				await mandarAccion(
					servidor,
					"catalogo.dar_baja_escuela",
					{ datos: { escuela_id: escuela, motivo: "Ya no trabaja con nosotros" }, version },
					"catalogo",
				)
			).estado,
		).toBe(200);
		expect((await alta(altaDesdeCero(siembra, { escuela_id: escuela }))).cuerpo).toMatchObject({
			codigo: "escuela_dada_de_baja",
			mensaje: "Colegio Cuauhtémoc está dada de baja: reactívala antes.",
		});
		const repetida = await alta(
			altaDesdeCero(siembra, {
				precios: [
					{ lista_id: siembra.listas.mostrador, precio_centavos: 25_000 },
					{ lista_id: siembra.listas.mostrador, precio_centavos: 26_000 },
				],
			}),
		);
		expect(repetida.cuerpo).toMatchObject({ campos: { precios: "Cada lista va una sola vez." } });
		expect((await alta(altaDesdeCero(siembra, { tipo_prenda_id: uuidv7() }))).cuerpo).toMatchObject({
			campos: { tipo_prenda_id: "Escoge el tipo de prenda." },
		});
	});

	it("el recargo inicial de un parámetro con centavos se lleva a peso entero", async () => {
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_entero = 5050 WHERE clave = 'catalogo.recargo_pedido_especial_inicial_centavos'",
		);
		try {
			const creado = await nuevoProducto(servidor, siembra);
			const { rows } = await servidor.base.dueno.query(
				"SELECT recargo_pedido_especial_centavos::int AS recargo FROM productos WHERE id = $1",
				[creado.producto_id],
			);
			expect(rows[0]?.recargo).toBe(5_100);
		} finally {
			await servidor.base.dueno.query(
				"UPDATE parametros SET valor_entero = 5000 WHERE clave = 'catalogo.recargo_pedido_especial_inicial_centavos'",
			);
		}
	});

	it("Fase 10: desde un desarrollo en ficha técnica, lo liga y el desarrollo queda en catálogo; uno que no está ahí, desarrollo_no_disponible", async () => {
		const materiales = await materialesDeReceta(servidor);
		const ds = await nuevoDesarrollo(servidor, materiales.gabardina, null);
		const desdeElDesarrollo = (nombre: string) =>
			alta({ ...altaDesdeCero(siembra, { nombre }), origen: "desarrollo", desarrollo_id: ds.id });
		expect((await desdeElDesarrollo("Chamarra antes de tiempo")).cuerpo).toMatchObject({
			codigo: "desarrollo_no_disponible",
			mensaje: `${ds.folio} ya no está en Ficha técnica: revisa el desarrollo.`,
		});
		// Nada quedó a medias: el producto no se creó.
		const { rows: antes } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM productos WHERE nombre = $1",
			["Chamarra antes de tiempo"],
		);
		expect(antes[0]?.n).toBe(0);
		await servidor.base.dueno.query(
			"UPDATE desarrollos SET etapa = 'ficha_tecnica', aprobado_por_tipo = 'direccion', aprobado_en = now() WHERE id = $1",
			[ds.id],
		);
		const creado = await desdeElDesarrollo("Chamarra con escudo nueva");
		expect(creado.estado).toBe(200);
		const productoId = productoCreado.parse(creado.cuerpo.resultado).producto_id;
		const { rows } = await servidor.base.dueno.query(
			"SELECT etapa, producto_id, en_catalogo_en IS NOT NULL AS con_fecha FROM desarrollos WHERE id = $1",
			[ds.id],
		);
		expect(rows).toEqual([{ etapa: "en_catalogo", producto_id: productoId, con_fecha: true }]);
		expect((await alta({ ...altaDesdeCero(siembra), origen: "desarrollo" })).cuerpo).toMatchObject({
			campos: { desarrollo_id: "Escoge el desarrollo." },
		});
	});
});
