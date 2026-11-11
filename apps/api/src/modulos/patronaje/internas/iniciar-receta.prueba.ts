/**
 * Prueba de la receta que nace con el producto: desde cero, en «Sin receta»; a partir de otro con receta, su
 * versión vigente copiada, solo con las tallas del producto nuevo y con las medidas del alta; y el primer corte la
 * verifica.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 2)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { ErrorDeApi } from "../../../nucleo/http/errores.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	altaDesdeCero,
	productoCreado,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	guardarRecetaDePrueba,
	type MaterialesDeReceta,
	materialesDeReceta,
	prendaConReceta,
	recetaDeEjemplo,
} from "../../../nucleo/pruebas/patronaje-de-prueba.ts";
import { loteDePrueba } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un producto de una sección con receta nace con la suya; a partir de otro, con la versión vigente del base, solo sus tallas y las medidas del alta", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	let materiales: MaterialesDeReceta;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
		materiales = await materialesDeReceta(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Las versiones de la receta de un producto, con lo que guardan. */
	async function versionesDe(productoId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT r.estado, v.numero, v.motivo, v.copiada_de_version_id IS NOT NULL AS copiada,
				(SELECT json_agg(json_build_object('material_id', l.material_id, 'tallas',
					(SELECT coalesce(json_agg(t.talla_id ORDER BY t.talla_id), '[]') FROM receta_linea_tallas t WHERE t.receta_linea_id = l.id))
					ORDER BY l.papel, l.orden) FROM receta_lineas l WHERE l.receta_version_id = v.id) AS lineas,
				(SELECT json_agg(json_build_object('medida', m.medida, 'talla_id', m.talla_id, 'valor_cm', m.valor_cm) ORDER BY m.medida, m.talla_id)
					FROM receta_medidas m WHERE m.receta_version_id = v.id) AS medidas
			 FROM recetas r LEFT JOIN receta_versiones v ON v.receta_id = r.id WHERE r.producto_id = $1 ORDER BY v.numero`,
			[productoId],
		);
		return rows;
	}

	it("desde cero nace en «Sin receta», sin versión, y el alta lo dice para «Crear y seguir con la receta»", async () => {
		const respuesta = await mandarAccion(
			servidor,
			"catalogo.crear_producto",
			{ datos: altaDesdeCero(siembra) },
			"catalogo",
		);
		expect(respuesta.cuerpo.resultado).toMatchObject({ receta_id: expect.any(String), receta_estado: "sin_receta" });
		const creado = productoCreado.parse(respuesta.cuerpo.resultado);
		expect(await versionesDe(creado.producto_id)).toEqual([
			{ estado: "sin_receta", numero: null, motivo: null, copiada: false, lineas: null, medidas: null },
		]);
	});

	it("a partir de otro con receta: la versión vigente del base como versión 1, solo sus tallas, con las medidas del alta, sin verificar", async () => {
		// La base lleva también la CH, de otro grupo de tallas, que el producto nuevo no tiene.
		const infantilDeLaBase = siembra.tallas.Infantil ?? {};
		const ch = siembra.tallas["Juvenil y adulto"]?.CH ?? "";
		const base = await prendaConReceta(servidor, siembra, {
			tallas: [
				...["4", "6", "8"].map((talla) => ({ talla_id: infantilDeLaBase[talla], es_pedido_especial: false })),
				{ talla_id: ch, es_pedido_especial: false },
			],
		});
		const deLaBase = recetaDeEjemplo(base, materiales);
		const [tela, ...avios] = deLaBase.lineas as { tallas?: { talla_id: string; cantidad: string }[] }[];
		const [largo] = deLaBase.medidas as { valores: { talla_id: string; valor_cm: string }[] }[];
		await guardarRecetaDePrueba(servidor, base, {
			medidas: [{ ...largo, valores: [...(largo?.valores ?? []), { talla_id: ch, valor_cm: "60" }] }],
			lineas: [{ ...tela, tallas: [...(tela?.tallas ?? []), { talla_id: ch, cantidad: "1.200" }] }, ...avios],
		});
		const [cuatro = "", seis = "", ocho = ""] = ["4", "6", "8"].map((talla) => base.tallas[talla] ?? "");
		const infantil = siembra.tallas.Infantil ?? {};
		const respuesta = await mandarAccion(
			servidor,
			"catalogo.crear_producto",
			{
				datos: {
					...altaDesdeCero(siembra, {
						nombre: "Playera con escudo de la base",
						tipo_prenda_id: undefined,
						tallas: ["4", "6", "8"].map((talla) => ({ talla_id: infantil[talla], es_pedido_especial: false })),
					}),
					modo: "a_partir_de",
					producto_base_id: base.productoId,
					medidas: [
						{
							medida: "Pecho",
							orden: 1,
							valores: [
								{ talla_id: cuatro, valor_cm: 70 },
								{ talla_id: seis, valor_cm: null },
							],
						},
					],
				},
			},
			"catalogo",
		);
		expect(respuesta.cuerpo).toMatchObject({ resultado: { receta_estado: "sin_verificar" }, avisos: [] });
		const creado = productoCreado.parse(respuesta.cuerpo.resultado);
		const [version] = await versionesDe(creado.producto_id);
		const { rows: nombre } = await servidor.base.dueno.query("SELECT nombre FROM productos WHERE id = $1", [
			base.productoId,
		]);
		expect(version).toMatchObject({
			estado: "sin_verificar",
			numero: 1,
			motivo: `Copiada de ${nombre[0]?.nombre}, versión 1`,
			copiada: true,
			medidas: [{ medida: "Pecho", talla_id: cuatro, valor_cm: 70 }],
		});
		// La gabardina, que va por talla, sin la CH; el cierre y el hilo van igual en todas.
		const copiada = version.lineas.find((linea: { material_id: string }) => linea.material_id === materiales.gabardina);
		expect(copiada.tallas).toEqual([cuatro, seis, ocho].sort());
		expect(version.lineas).toHaveLength(3);
	});

	it("a partir de otro sin receta: nace en «Sin receta» y las medidas del alta se descartan con su aviso", async () => {
		const base = await prendaConReceta(servidor, siembra);
		const respuesta = await mandarAccion(
			servidor,
			"catalogo.crear_producto",
			{
				datos: {
					...altaDesdeCero(siembra, { nombre: "Playera de base sin receta", tipo_prenda_id: undefined }),
					modo: "a_partir_de",
					producto_base_id: base.productoId,
					medidas: [{ medida: "Pecho", orden: 1, valores: [{ talla_id: base.tallas["4"], valor_cm: 70 }] }],
				},
			},
			"catalogo",
		);
		expect(respuesta.cuerpo).toMatchObject({
			resultado: { receta_estado: "sin_receta" },
			avisos: ["Las medidas se capturan con la receta en Patronaje"],
		});
	});

	it("el primer corte la verifica una sola vez; sin receta, sin_receta", async () => {
		const prenda = await prendaConReceta(servidor, siembra);
		const lote = await loteDePrueba(servidor.base.dueno, prenda.productoId);
		const verificar = () =>
			enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
				contexto.interna("patronaje.verificar_receta", { producto_id: prenda.productoId, lote_id: lote }),
			).catch((error: unknown) => (error instanceof ErrorDeApi ? error.cuerpo() : Promise.reject(error)));
		expect(await verificar()).toMatchObject({
			codigo: "sin_receta",
			mensaje: "Sin receta no se puede cortar: el sistema no sabe cuánta tela lleva cada talla.",
		});
		await guardarRecetaDePrueba(servidor, prenda, recetaDeEjemplo(prenda, materiales));
		expect(await verificar()).toMatchObject({ verifico: true, receta_version_id: expect.any(String) });
		expect(await verificar()).toMatchObject({ verifico: false });
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, verificada_en IS NOT NULL AS con_fecha FROM recetas WHERE id = $1",
			[prenda.recetaId],
		);
		expect(rows).toEqual([{ estado: "verificada", con_fecha: true }]);
	});
});
