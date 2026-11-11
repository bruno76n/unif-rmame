/**
 * Prueba de `inventario.devolver_a_proveedor` y de la devolución surtida de Bodega: lo de más regresa al proveedor en
 * rollos enteros que se reparten de su A-, desde aduana o surtido de Bodega.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	decidirDePrueba,
	despacharDePrueba,
	ordenParaRecibir,
	recibirDePrueba,
	versionDeDespacho,
	versionDeTraspaso,
} from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Lo de más regresa al proveedor en rollos enteros que se reparten de su A-, desde aduana o surtido de Bodega", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Una orden recibida con tres rollos (50, 50 y 10 m: 110 de 100) y 520 botones de 500; su A- y sus rollos. */
	async function recibidaDeMas() {
		const orden = await ordenParaRecibir(servidor);
		const respuesta = await recibirDePrueba(
			servidor,
			orden,
			[
				{ metros: "50", partida: "A" },
				{ metros: "50", partida: "A" },
				{ metros: "10", partida: "A" },
			],
			520,
		);
		const { traspaso_id: aDeLaOrden, rollos } = z
			.object({ traspaso_id: z.uuid(), rollos: z.array(z.object({ rollo_id: z.uuid(), folio: z.string() })) })
			.parse(respuesta.cuerpo.resultado);
		return { orden, aDeLaOrden, rollos };
	}

	/** Dirección rechaza lo de más de una línea; regresa la devolución que nació (la primera). */
	async function rechazar(lineaId: string) {
		const [au] = await consultar("SELECT id FROM autorizaciones WHERE orden_compra_linea_id = $1", [lineaId]);
		await decidirDePrueba(servidor, String(au?.id), { decision: "rechazar", motivo: "No lo pedimos" });
		const [devolucion] = await consultar(
			`SELECT t.id, t.folio FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id
			 WHERE t.tipo = 'devolucion_proveedor' AND l.material_id = (SELECT material_id FROM orden_compra_lineas WHERE id = $1)`,
			[lineaId],
		);
		return { id: String(devolucion?.id), folio: String(devolucion?.folio) };
	}

	/** Aduana devuelve al proveedor. */
	async function devolver(traspasoId: string, datos: Record<string, unknown> = {}) {
		return mandarAccion(
			servidor,
			"inventario.devolver_a_proveedor",
			{ datos: { traspaso_id: traspasoId, ...datos }, version: await versionDeTraspaso(servidor, traspasoId) },
			"aduana",
		);
	}

	/** Lo recibido de una línea, como lo ve Compras. */
	async function recibido(lineaId: string) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura("inventario.recibido_de_ordenes", { orden_compra_linea_ids: [lineaId] }),
		);
	}

	it("desde aduana: el rollo entero sale, se reparte del A-, queda devuelto, y lo recibido de la línea baja", async () => {
		const { orden, aDeLaOrden, rollos } = await recibidaDeMas();
		const devolucion = await rechazar(orden.lineaTela);
		const [, , chico] = rollos;
		const respuesta = await devolver(devolucion.id, { rollo_ids: [chico?.rollo_id] });
		expect(respuesta.cuerpo).toMatchObject({
			resultado: { mensaje: expect.stringMatching(/^10 m de Gabardina de prueba .+ regresan a /) },
			avisos: [],
		});
		expect(await consultar("SELECT estado FROM rollos WHERE id = $1", [chico?.rollo_id])).toEqual([
			{ estado: "devuelto" },
		]);
		expect(
			await consultar("SELECT estado, terminado_en IS NOT NULL AS terminado FROM traspasos WHERE id = $1", [
				devolucion.id,
			]),
		).toEqual([{ estado: "salio", terminado: true }]);
		expect(
			await consultar("SELECT cantidad_repartida FROM traspaso_lineas WHERE traspaso_id = $1 AND rollo_id = $2", [
				aDeLaOrden,
				chico?.rollo_id,
			]),
		).toEqual([{ cantidad_repartida: "10.000" }]);
		expect(
			await consultar("SELECT sum(cantidad)::text AS hay FROM existencias_material WHERE rollo_id = $1", [
				chico?.rollo_id,
			]),
		).toEqual([{ hay: "0.000" }]);
		expect(await recibido(orden.lineaTela)).toMatchObject({ lineas: { [orden.lineaTela]: "100.000" } });
		// Ya sin nada pendiente en aduana, el A- de la orden sale.
		expect((await despacharDePrueba(servidor, [aDeLaOrden])).estado).toBe(200);
	});

	it("rollos que no suman lo de más: avisa la diferencia; un rollo ajeno no regresa; lo que no es tela, por su cantidad exacta", async () => {
		const { orden, rollos } = await recibidaDeMas();
		const devolucion = await rechazar(orden.lineaTela);
		const otra = await recibidaDeMas();
		expect((await devolver(devolucion.id, { rollo_ids: [otra.rollos[0]?.rollo_id] })).cuerpo).toMatchObject({
			codigo: "rollo_ajeno",
			mensaje: expect.stringMatching(
				new RegExp(`^${otra.rollos[0]?.folio} no es de .+ de ${orden.folio}, o no está en aduana\\.$`),
			),
		});
		const conAviso = await devolver(devolucion.id, { rollo_ids: [rollos[0]?.rollo_id] });
		expect(conAviso.cuerpo.avisos).toEqual([
			"Los rollos suman 50 m y lo de más es 10 m: la diferencia se ve en la conciliación de Compras",
		]);
		const botones = await rechazar(orden.lineaAvio);
		expect((await devolver(botones.id, { cantidad: "15" })).cuerpo).toMatchObject({
			codigo: "cantidad_distinta",
			mensaje: "Lo que regresa es 20 pza.",
		});
		expect((await devolver(botones.id, { cantidad: "20" })).estado).toBe(200);
	});

	it("desde Bodega: se surte a aduana con el rollo entero, Aduana la recibe y la saca", async () => {
		const { orden, aDeLaOrden, rollos } = await recibidaDeMas();
		// Todo pasó a Bodega antes de que Dirección decidiera.
		const despacho = z
			.object({ despacho_id: z.uuid() })
			.parse((await despacharDePrueba(servidor, [aDeLaOrden])).cuerpo.resultado).despacho_id;
		await mandarAccion(
			servidor,
			"inventario.recibir_despacho",
			{ datos: { despacho_id: despacho, modo: "completo" }, version: await versionDeDespacho(servidor, despacho) },
			"bodega",
		);
		const devolucion = await rechazar(orden.lineaTela);
		expect(
			await consultar(
				"SELECT u.codigo FROM traspasos t JOIN ubicaciones u ON u.id = t.origen_ubicacion_id WHERE t.id = $1",
				[devolucion.id],
			),
		).toEqual([{ codigo: "BOD" }]);
		expect((await devolver(devolucion.id, { rollo_ids: [rollos[2]?.rollo_id] })).cuerpo).toMatchObject({
			codigo: "no_esta_en_aduana",
		});
		const surtida = await mandarAccion(
			servidor,
			"inventario.surtir_a_aduana",
			{
				datos: {
					documento_tipo: "devolucion_proveedor",
					documento_id: devolucion.id,
					rollo_ids: [rollos[2]?.rollo_id],
				},
			},
			"bodega",
		);
		expect(surtida.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^10 m de Gabardina de prueba .+ van a aduana para regresar a /),
		});
		await mandarAccion(
			servidor,
			"inventario.recibir_en_aduana",
			{
				datos: { traspaso_id: devolucion.id, modo: "completo" },
				version: await versionDeTraspaso(servidor, devolucion.id),
			},
			"aduana",
		);
		expect((await devolver(devolucion.id)).estado).toBe(200);
		expect(await consultar("SELECT estado FROM rollos WHERE id = $1", [rollos[2]?.rollo_id])).toEqual([
			{ estado: "devuelto" },
		]);
		expect(await recibido(orden.lineaTela)).toMatchObject({ lineas: { [orden.lineaTela]: "100.000" } });
	});
});
