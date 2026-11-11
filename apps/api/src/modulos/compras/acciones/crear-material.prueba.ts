/**
 * Prueba del alta de un material: en una transacción, el material sin existencia, su proveedor habitual con su
 * último precio y el primer precio del historial; la tela solo en metros; una unidad que no está en la lista no
 * entra.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { altaDeProveedor } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El alta de un material deja, en una transacción, el material sin existencia, su proveedor habitual con su último precio y el primer precio del historial; la tela solo en metros; una unidad que no está en la lista no entra", () => {
	let servidor: ServidorDePrueba;
	let aurora: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		aurora = await altaDeProveedor(servidor, { nombre: "Textiles Alborada" });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Compras da de alta un material; lo que no viene es el de la gabardina. */
	function crear(datos: Record<string, unknown>) {
		return mandarAccion(
			servidor,
			"compras.crear_material",
			{
				datos: {
					nombre: "Gabardina azul noche",
					tipo: "tela",
					unidad: "m",
					presentacion: "Ancho 1.50 m",
					proveedor_id: aurora,
					costo_centavos: 7_800,
					minimo: 150,
					multiplo_compra: 50,
					dias_cubre: 60,
					...datos,
				},
			},
			"compras",
		);
	}

	it("deja el material sin existencia, su proveedor habitual con su último precio y el primer precio del historial", async () => {
		const respuesta = await crear({});
		expect(respuesta.cuerpo).toMatchObject({
			resultado: {
				mensaje: "Gabardina azul noche ya está en Materiales. Lo que haya hoy lo registra Bodega como carga inicial",
			},
		});
		const id = (respuesta.cuerpo.resultado as { material_id: string }).material_id;
		const { rows } = await servidor.base.dueno.query(
			`SELECT m.unidad, m.minimo, m.multiplo_compra, m.proveedor_habitual_id,
				(SELECT count(*)::int FROM existencias_material e WHERE e.material_id = m.id) AS existencias,
				(SELECT count(*)::int FROM movimiento_lineas l WHERE l.material_id = m.id) AS movimientos
			 FROM materiales m WHERE m.id = $1`,
			[id],
		);
		expect(rows).toEqual([
			{
				unidad: "m",
				minimo: "150.000",
				multiplo_compra: "50.000",
				proveedor_habitual_id: aurora,
				existencias: 0,
				movimientos: 0,
			},
		]);
		const { rows: pares } = await servidor.base.dueno.query(
			"SELECT proveedor_id, ultimo_precio_centavos FROM material_proveedores WHERE material_id = $1",
			[id],
		);
		expect(pares).toEqual([{ proveedor_id: aurora, ultimo_precio_centavos: "7800" }]);
		const { rows: precios } = await servidor.base.dueno.query(
			"SELECT proveedor_id, precio_centavos, origen, precio_anterior_centavos, cambio_porcentaje FROM precios_compra WHERE material_id = $1",
			[id],
		);
		expect(precios).toEqual([
			{
				proveedor_id: aurora,
				precio_centavos: "7800",
				origen: "alta",
				precio_anterior_centavos: null,
				cambio_porcentaje: null,
			},
		]);
		const { rows: bitacora } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE entidad_id = $1",
			[id],
		);
		expect(bitacora).toEqual([{ descripcion: "Material nuevo: Gabardina azul noche, m, con Textiles Alborada a $78" }]);
	});

	it("el nombre es único sin acentos ni mayúsculas; la tela solo en metros; la unidad sale de la lista", async () => {
		await crear({ nombre: "Popelina perla" });
		expect((await crear({ nombre: "POPELINA BLANCÁ" })).cuerpo).toMatchObject({
			codigo: "nombre_repetido",
			mensaje: "Ya existe un material con ese nombre",
		});
		expect((await crear({ nombre: "Tela en piezas", unidad: "pza" })).cuerpo).toMatchObject({
			codigo: "tela_en_metros",
			mensaje: "La tela se mide en metros.",
		});
		expect((await crear({ nombre: "Medida rara", tipo: "avio", unidad: "yardas" })).cuerpo).toMatchObject({
			codigo: "unidad_no_existe",
			mensaje: "Escoge cómo se mide.",
		});
		// Una unidad que la dueña agrega a la lista ya se puede usar.
		await mandarAccion(
			servidor,
			"admin.agregar_a_lista",
			{ datos: { lista: "unidades_material", nombre: "rollos", se_cuenta_entera: true } },
			"duena",
		);
		expect((await crear({ nombre: "Entretela", tipo: "avio", unidad: "rollos" })).estado).toBe(200);
	});

	it("la conversión: cada unidad con su factor, y la de la tablet solo en un consumible", async () => {
		expect(
			(await crear({ nombre: "Hilo poliéster gris", tipo: "avio", unidad: "conos", unidad_receta: "m" })).cuerpo,
		).toMatchObject({ codigo: "falta_conversion", mensaje: "Escribe cuántas m trae un conos." });
		expect(
			(
				await crear({
					nombre: "Hilo poliéster gris",
					tipo: "avio",
					unidad: "conos",
					unidad_receta: "m",
					factor_receta: "5000",
				})
			).estado,
		).toBe(200);
		expect(
			(
				await crear({
					nombre: "Botón con tablet",
					tipo: "avio",
					unidad: "pza",
					unidad_tablet: "botones",
					factor_tablet: "1",
				})
			).cuerpo,
		).toMatchObject({ codigo: "solo_consumible_en_tablet", mensaje: "Solo un consumible se toma en la tablet." });
		expect(
			(await crear({ nombre: "Agujas", tipo: "consumible", unidad: "cajas", unidad_tablet: "agujas" })).cuerpo,
		).toMatchObject({ codigo: "falta_conversion", mensaje: "Escribe cuántas agujas hacen un cajas." });
		expect(
			(
				await crear({
					nombre: "Agujas",
					tipo: "consumible",
					unidad: "cajas",
					unidad_tablet: "agujas",
					factor_tablet: "100",
				})
			).estado,
		).toBe(200);
	});

	it("los topes de los parámetros y el proveedor dado de baja; nada queda a medias", async () => {
		expect((await crear({ nombre: "Muy cara", costo_centavos: 10_000_000 })).cuerpo).toMatchObject({
			campos: { costo_centavos: "Escribe el costo, por ejemplo 78 o 6.50" },
		});
		expect((await crear({ nombre: "Cubre mucho", dias_cubre: 366 })).cuerpo).toMatchObject({
			campos: { dias_cubre: "Entre 1 y 365 días" },
		});
		const viejo = await altaDeProveedor(servidor, { nombre: "Proveedor que cerró" });
		await mandarAccion(
			servidor,
			"compras.dar_baja_proveedor",
			{
				datos: { proveedor_id: viejo, motivo: "Ya no vende" },
				version: Number(
					(await servidor.base.dueno.query("SELECT version FROM proveedores WHERE id = $1", [viejo])).rows[0]?.version,
				),
			},
			"compras",
		);
		expect((await crear({ nombre: "Del que cerró", proveedor_id: viejo })).cuerpo).toMatchObject({
			codigo: "proveedor_dado_de_baja",
			mensaje: "Proveedor que cerró está dado de baja.",
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM materiales WHERE nombre IN ('Muy cara', 'Cubre mucho', 'Del que cerró')",
		);
		expect(rows[0]?.n).toBe(0);
	});
});
