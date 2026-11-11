/**
 * Prueba de levantar una orden: un proveedor tiene un solo borrador y lo que se levanta se suma ahí, también con
 * dos personas al mismo tiempo; una cantidad que no es múltiplo o pasa del tope no entra.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { altaDeMaterial, altaDeProveedor, levantarDePrueba } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un proveedor tiene un solo borrador: lo que se levanta se suma ahí, también con dos personas al mismo tiempo; una cantidad que no es múltiplo o pasa del tope no entra", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Los borradores de un proveedor, con sus líneas. */
	async function borradores(proveedor: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT o.folio, o.fecha_prometida - o.fecha AS dias, count(l.id)::int AS lineas
			 FROM ordenes_compra o LEFT JOIN orden_compra_lineas l ON l.orden_compra_id = o.id
			 WHERE o.proveedor_id = $1 AND o.estado = 'borrador' GROUP BY o.id`,
			[proveedor],
		);
		return rows;
	}

	it("nace en borrador con su folio y la fecha prometida de lo que dice que tarda; lo siguiente se suma, y un material que ya estaba cambia", async () => {
		const ochoa = await altaDeProveedor(servidor, { nombre: "Refacciones Olvera", dias_dice_tardar: 4 });
		const agujas = await altaDeMaterial(servidor, ochoa, {
			nombre: "Agujas 16/100",
			tipo: "consumible",
			unidad: "cajas",
			costo_centavos: 25_000,
		});
		const bandas = await altaDeMaterial(servidor, ochoa, { nombre: "Bandas de transmisión", costo_centavos: 9_500 });
		const primera = await mandarAccion(
			servidor,
			"compras.levantar_orden",
			{ datos: { renglones: [{ material_id: agujas, proveedor_id: ochoa, cantidad: 10, precio_centavos: 26_000 }] } },
			"compras",
		);
		expect(primera.cuerpo).toMatchObject({
			resultado: {
				ordenes: [{ proveedor: "Refacciones Olvera", resultado: "nueva", folio: expect.stringMatching(/^OC-\d{4}$/) }],
				mensaje: expect.stringMatching(/^OC-\d{4} quedó en borrador con Refacciones Olvera$/),
			},
			avisos: ["Agujas 16/100: sube 4 % · antes $250"],
		});
		const segunda = await levantarDePrueba(servidor, [
			{ material_id: bandas, proveedor_id: ochoa, cantidad: 6, precio_centavos: 9_500 },
			{ material_id: agujas, proveedor_id: ochoa, cantidad: 12, precio_centavos: 26_000 },
		]);
		expect(await borradores(ochoa)).toEqual([{ folio: segunda.folio, dias: 4, lineas: 2 }]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT cantidad FROM orden_compra_lineas WHERE orden_compra_id = $1 AND material_id = $2",
			[segunda.id, agujas],
		);
		expect(rows).toEqual([{ cantidad: "12.000" }]);
		// Para dos proveedores, dos órdenes.
		const otro = await altaDeProveedor(servidor);
		const deOtro = await altaDeMaterial(servidor, otro);
		const dos = await mandarAccion(
			servidor,
			"compras.levantar_orden",
			{
				datos: {
					renglones: [
						{ material_id: deOtro, proveedor_id: otro, cantidad: 3, precio_centavos: 38 },
						{ material_id: bandas, proveedor_id: ochoa, cantidad: 2, precio_centavos: 9_500 },
					],
				},
			},
			"compras",
		);
		expect(dos.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^2 órdenes quedaron en borrador: OC-\d{4} y OC-\d{4}$/),
		});
	});

	it("dos personas que levantan a la vez para el mismo proveedor dejan un solo borrador con lo de las dos", async () => {
		for (let ronda = 0; ronda < 5; ronda++) {
			const proveedor = await altaDeProveedor(servidor);
			const [uno, dos] = [await altaDeMaterial(servidor, proveedor), await altaDeMaterial(servidor, proveedor)];
			const ordenes = await Promise.all([
				levantarDePrueba(servidor, [{ material_id: uno, proveedor_id: proveedor, cantidad: 1, precio_centavos: 38 }]),
				levantarDePrueba(servidor, [{ material_id: dos, proveedor_id: proveedor, cantidad: 1, precio_centavos: 38 }]),
			]);
			expect(ordenes[0].id).toBe(ordenes[1].id);
			expect(await borradores(proveedor)).toEqual([{ folio: ordenes[0].folio, dias: 12, lineas: 2 }]);
		}
	});

	it("la cantidad: múltiplo de lo que se compra junto y hasta el tope; el material repetido, el material y el proveedor de baja", async () => {
		const proveedor = await altaDeProveedor(servidor, { nombre: "Textiles Alborada" });
		const gabardina = await altaDeMaterial(servidor, proveedor, {
			nombre: "Gabardina azul noche",
			tipo: "tela",
			unidad: "m",
			multiplo_compra: 50,
			costo_centavos: 7_800,
		});
		const levantar = (renglones: Record<string, unknown>[]) =>
			mandarAccion(servidor, "compras.levantar_orden", { datos: { renglones } }, "compras");
		const linea = (cantidad: number) => ({
			material_id: gabardina,
			proveedor_id: proveedor,
			cantidad,
			precio_centavos: 7_800,
		});
		expect((await levantar([linea(120)])).cuerpo).toMatchObject({
			codigo: "no_es_multiplo",
			mensaje: "Se compra de 50 en 50 m. Prueba con 100",
		});
		expect((await levantar([linea(1_000_000)])).cuerpo).toMatchObject({
			codigo: "cantidad_demasiada",
			mensaje: "Es demasiado: revisa la cantidad",
		});
		expect((await levantar([linea(0)])).cuerpo).toMatchObject({ error: "validacion" });
		expect((await levantar([])).cuerpo).toMatchObject({ error: "validacion" });
		expect((await levantar([linea(100), linea(150)])).cuerpo).toMatchObject({
			codigo: "material_repetido",
			mensaje: "Gabardina azul noche está dos veces con Textiles Alborada.",
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM ordenes_compra WHERE proveedor_id = $1",
			[proveedor],
		);
		expect(rows[0]?.n).toBe(0);
		expect((await levantar([linea(100)])).estado).toBe(200);
	});
});
