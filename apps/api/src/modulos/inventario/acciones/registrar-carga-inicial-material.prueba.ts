/**
 * Prueba de `inventario.registrar_carga_inicial_material`: la tela entra por rollo, cada uno con su folio, su costo y
 * la partida del proveedor habitual, y recalcula los rollos sugeridos; los avíos van por cantidad a Bodega y los
 * consumibles a su ubicación; una sola vez y solo sin movimientos.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { materialesDePrueba } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { prendaParaCortar } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("La carga inicial del material: la tela por rollo con su costo y su partida, lo demás por cantidad", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Bodega registra la carga inicial de un material. */
	function cargar(datos: Record<string, unknown>, quien = "bodega") {
		return mandarAccion(servidor, "inventario.registrar_carga_inicial_material", { datos }, quien);
	}

	/** Un material con su precio de alta: su costo. */
	async function conCosto(tipo: "tela" | "avio" | "consumible", centavos: number): Promise<string> {
		const [material = ""] = await materialesDePrueba(servidor, 1, tipo);
		await servidor.base.dueno.query(
			`INSERT INTO precios_compra (id, material_id, proveedor_id, precio_centavos, origen, fecha)
			 SELECT $1, m.id, m.proveedor_habitual_id, $3, 'alta', current_date FROM materiales m WHERE m.id = $2`,
			[uuidv7(), material, centavos],
		);
		return material;
	}

	/** Dónde quedó un material, por ubicación y rollo. */
	async function dondeQuedo(material: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT u.codigo, e.rollo_id IS NOT NULL AS por_rollo, e.cantidad FROM existencias_material e
			 JOIN ubicaciones u ON u.id = e.ubicacion_id WHERE e.material_id = $1 AND e.cantidad <> 0 ORDER BY e.cantidad`,
			[material],
		);
		return rows;
	}

	it("la tela: un rollo por cada uno, con folio R-, su costo y la partida del proveedor habitual; una sola vez", async () => {
		const tela = await conCosto("tela", 4500);
		const respuesta = await cargar({
			material_id: tela,
			cantidad: "80",
			rollos: [
				{ metros: "30", partida: "ab-12" },
				{ metros: "50", partida: "AB-12" },
			],
		});
		const salida = z
			.object({
				mensaje: z.string(),
				movimiento_id: z.uuid(),
				rollos: z.array(z.object({ rollo_id: z.uuid(), folio: z.string() })),
			})
			.parse(respuesta.cuerpo.resultado);
		expect(salida.mensaje).toMatch(/: carga inicial de 80 m en Bodega$/);
		const { rows } = await servidor.base.dueno.query(
			`SELECT r.folio, r.estado, r.es_carga_inicial, r.costo_metro_centavos, r.metros_iniciales, p.codigo_proveedor,
				p.proveedor_id = m.proveedor_habitual_id AS del_habitual, p.folio AS partida
			 FROM rollos r JOIN materiales m ON m.id = r.material_id LEFT JOIN partidas_tela p ON p.id = r.partida_tela_id
			 WHERE r.material_id = $1 ORDER BY r.metros_iniciales`,
			[tela],
		);
		expect(rows).toEqual([
			expect.objectContaining({
				estado: "disponible",
				es_carga_inicial: true,
				costo_metro_centavos: "4500",
				metros_iniciales: "30.000",
				codigo_proveedor: "AB-12",
				del_habitual: true,
			}),
			expect.objectContaining({
				estado: "disponible",
				es_carga_inicial: true,
				costo_metro_centavos: "4500",
				metros_iniciales: "50.000",
				codigo_proveedor: "AB-12",
				del_habitual: true,
			}),
		]);
		// Una sola partida para los dos, y un folio R- por rollo.
		expect(new Set(rows.map((fila) => fila.partida)).size).toBe(1);
		expect(rows.every((fila) => /^R-\d{4}$/.test(fila.folio))).toBe(true);
		expect(await dondeQuedo(tela)).toEqual([
			{ codigo: "BOD", por_rollo: true, cantidad: "30.000" },
			{ codigo: "BOD", por_rollo: true, cantidad: "50.000" },
		]);
		// Su documento es el propio movimiento.
		expect(
			(
				await servidor.base.dueno.query(
					"SELECT tipo, documento_tipo, documento_id = id AS el_mismo FROM movimientos WHERE id = $1",
					[salida.movimiento_id],
				)
			).rows,
		).toEqual([{ tipo: "carga_inicial", documento_tipo: "carga_inicial", el_mismo: true }]);
		expect((await cargar({ material_id: tela, cantidad: "10" })).cuerpo).toMatchObject({
			codigo: "ya_tiene_carga_inicial",
			mensaje: expect.stringMatching(/ ya tiene carga inicial o movimientos\.$/),
		});
	});

	it("sin rollos, la tela nace en un solo rollo; los rollos tienen que sumar lo escrito; con 0 no mueve nada", async () => {
		const tela = await conCosto("tela", 3000);
		expect((await cargar({ material_id: tela, cantidad: "60", rollos: [{ metros: "50" }] })).cuerpo).toMatchObject({
			campos: { rollos: "Los rollos suman 50 m y escribiste 60 m." },
		});
		await cargar({ material_id: tela, cantidad: "60" });
		expect(await dondeQuedo(tela)).toEqual([{ codigo: "BOD", por_rollo: true, cantidad: "60.000" }]);
		const vacia = await conCosto("tela", 3000);
		expect((await cargar({ material_id: vacia, cantidad: "0" })).estado).toBe(200);
		expect(await dondeQuedo(vacia)).toEqual([]);
	});

	it("los avíos por cantidad a Bodega, enteros si se cuentan enteros; los consumibles donde los toma el taller; solo la tela lleva rollos", async () => {
		const avio = await conCosto("avio", 150);
		expect((await cargar({ material_id: avio, cantidad: "10", rollos: [{ metros: "10" }] })).cuerpo).toMatchObject({
			campos: { rollos: "Solo la tela lleva rollos." },
		});
		const { rows: entera } = await servidor.base.dueno.query(
			`SELECT v.se_cuenta_entera FROM lista_valores v JOIN listas l ON l.id = v.lista_id
			 WHERE l.clave = 'unidades_material' AND v.clave = 'pza'`,
		);
		if (entera[0]?.se_cuenta_entera === true) {
			expect((await cargar({ material_id: avio, cantidad: "2.5" })).cuerpo).toMatchObject({
				campos: { cantidad: "Número entero" },
			});
		}
		await cargar({ material_id: avio, cantidad: "40" });
		expect(await dondeQuedo(avio)).toEqual([{ codigo: "BOD", por_rollo: false, cantidad: "40.000" }]);
		const consumible = await conCosto("consumible", 80);
		await cargar({ material_id: consumible, cantidad: "7" });
		const { rows: parametro } = await servidor.base.dueno.query(
			"SELECT valor_texto AS valor FROM parametros WHERE clave = 'inventario.ubicacion_consumibles'",
		);
		const codigo = { bodega: "BOD", taller: "TAL", aduana: "ADU" }[String(parametro[0]?.valor)];
		expect(await dondeQuedo(consumible)).toEqual([{ codigo, por_rollo: false, cantidad: "7.000" }]);
		expect((await cargar({ material_id: avio, cantidad: "1" }, "aduana")).estado).toBe(403);
		// Con los consumibles en el Taller, la carga de un consumible entra al Taller y lo dice; el parámetro regresa a
		// como estaba aunque la prueba falle.
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_texto = 'taller' WHERE clave = 'inventario.ubicacion_consumibles'",
		);
		try {
			const delTaller = await conCosto("consumible", 80);
			const enTaller = await cargar({ material_id: delTaller, cantidad: "3" });
			expect(enTaller.estado).toBe(200);
			expect(z.object({ mensaje: z.string() }).parse(enTaller.cuerpo.resultado).mensaje).toMatch(
				/: carga inicial de 3 .+ en Taller$/,
			);
			expect(await dondeQuedo(delTaller)).toEqual([{ codigo: "TAL", por_rollo: false, cantidad: "3.000" }]);
		} finally {
			await servidor.base.dueno.query(
				"UPDATE parametros SET valor_texto = $1 WHERE clave = 'inventario.ubicacion_consumibles'",
				[parametro[0]?.valor],
			);
		}
	});

	it("la tela que entra recalcula los rollos sugeridos: el lote que la espera aparta su rollo", async () => {
		const siembra = await siembraDelCatalogo(servidor);
		const prenda = await prendaParaCortar(servidor, siembra);
		const { rows: bodega } = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'BOD'");
		const orden = await mandarAccion(
			servidor,
			"produccion.crear_orden",
			{
				datos: {
					ubicacion_destino_id: bodega[0]?.id,
					producto_id: prenda.productoId,
					tallas: [{ variante_id: prenda.variantes["4"], piezas: 10 }],
					fecha_entrega: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10),
				},
			},
			"produccion",
		);
		const { lote_id: loteId } = z.object({ lote_id: z.uuid() }).parse(orden.cuerpo.resultado);
		const sugeridos = async () =>
			(
				await servidor.base.dueno.query(
					"SELECT count(*)::int AS n FROM apartados_rollo WHERE lote_id = $1 AND estado = 'sugerido'",
					[loteId],
				)
			).rows;
		expect(await sugeridos()).toEqual([{ n: 0 }]);
		expect((await cargar({ material_id: prenda.materiales.gabardina, cantidad: "200" })).estado).toBe(200);
		expect(await sugeridos()).toEqual([{ n: 1 }]);
	});
});
