/**
 * Prueba del cuadre de la noche: corrige desde el libro una existencia alterada con su excepción; un traspaso
 * terminado con algo en un tramo, uno sin confirmar y una reserva sin documento abren la suya; corre una sola vez
 * por fecha; y no frena las ventas.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 5)
 * Fase 14 · «En el cuadre, un traspaso `con_diferencia` tiene en sus tramos justo sus DF- abiertas, y un negativo sin DF-
 * abre una `cuadre` (por contar en prenda, por aclarar en material) o `cuadre_proyeccion` en el Taller y en los tramos»
 */

import { join } from "node:path";
import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { cargarModulos } from "../../../nucleo/modulos.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { materialesDePrueba, rollosDePrueba } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { diferenciaEnTransito, sacarPiezas } from "../../../nucleo/pruebas/diferencias-de-prueba.ts";
import {
	meterPiezas,
	nuevoTraspaso,
	ubicacionesPorCodigo,
	variantesLibres,
} from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { documentosAbiertosDePrueba } from "../../../nucleo/pruebas/modulos/ventas/index.ts";
import { loteCortado } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo } from "../../../nucleo/trabajos/trabajador.ts";
import { abrirDiferencia } from "../dominio/diferencias.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";
import { cambiarEstadoTraspaso } from "../dominio/traspasos.ts";
import { type CuadreCorrido, correrCuadre } from "./correr-cuadre.ts";

describe("el cuadre de la noche", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Corre el cuadre de una fecha como lo corre el trabajo, con lo que se pida entre tandas. */
	async function cuadrar(fecha: string, entreTandas?: (tanda: string) => Promise<void>): Promise<CuadreCorrido> {
		let corrido: CuadreCorrido | undefined;
		const registro = await cargarModulos(join(import.meta.dirname, "../.."));
		const pruebas = await cargarModulos(join(import.meta.dirname, "../../../nucleo/pruebas/modulos"));
		await correrTrabajo(
			{
				base: crearBase(servidor.base.app),
				registro: { ...registro, lecturas: new Map([...registro.lecturas, ...pruebas.lecturas]) },
				servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: async () => undefined },
				avisarFalla: async () => undefined,
				enviarCorreo: async () => undefined,
				dominioWeb: "https://fabrica.prueba.invalid",
				reloj: () => Temporal.Now.instant(),
			},
			{
				nombre: "prueba.cuadre",
				correr: async (contexto) => {
					corrido = await correrCuadre(contexto, fecha, entreTandas);
				},
			},
			{},
		);
		if (corrido === undefined) throw new Error("el cuadre no regresó nada");
		return corrido;
	}

	/** Las excepciones de un cuadre, por tipo. */
	async function excepcionesDe(cuadre: CuadreCorrido) {
		if ("yaCorrio" in cuadre) return [];
		const { rows } = await servidor.base.dueno.query(
			"SELECT tipo, variante_id, documento_id, datos FROM excepciones WHERE cuadre_id = $1 ORDER BY tipo",
			[cuadre.cuadreId],
		);
		return rows;
	}

	it("El cuadre corrige desde el libro una existencia alterada y deja la excepción con los dos valores; corre una sola vez por fecha", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 5);
		await servidor.base.dueno.query("UPDATE existencias SET piezas = 9 WHERE ubicacion_id = $1 AND variante_id = $2", [
			ubicacion.BOD,
			variante,
		]);
		const cuadre = await cuadrar("2026-10-01");
		expect(cuadre).toMatchObject({ estado: "con_residuo" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT piezas FROM existencias WHERE ubicacion_id = $1 AND variante_id = $2",
			[ubicacion.BOD, variante],
		);
		expect(rows).toEqual([{ piezas: 5 }]);
		expect(await excepcionesDe(cuadre)).toEqual([
			{ tipo: "cuadre_proyeccion", variante_id: variante, documento_id: null, datos: { guardada: 9, libro: 5 } },
		]);
		if ("yaCorrio" in cuadre) throw new Error("el cuadre no corrió");
		const { rows: renglon } = await servidor.base.dueno.query(
			"SELECT estado, proyecciones_corregidas, excepciones_creadas, terminado_en IS NOT NULL AS terminado FROM cuadres WHERE id = $1",
			[cuadre.cuadreId],
		);
		expect(renglon).toEqual([
			{ estado: "con_residuo", proyecciones_corregidas: 1, excepciones_creadas: 1, terminado: true },
		]);
		expect(await cuadrar("2026-10-01")).toMatchObject({ yaCorrio: true, estado: "con_residuo" });
		// Otra noche, ya cuadra.
		expect(await cuadrar("2026-10-02")).toMatchObject({ estado: "cuadro" });
	});

	it("un traspaso terminado con algo en un tramo abre `cuadre_proyeccion`; uno de más días sin confirmar abre `sin_confirmar`, una sola vez", async () => {
		const [variante = "", otra = ""] = await variantesLibres(servidor, 2);
		const { traspasoId } = await nuevoTraspaso(servidor, {
			tipo: "reabasto",
			estado: "en_aduana",
			origen: { ubicacionId: ubicacion.BOD ?? "" },
			destino: { ubicacionId: ubicacion.T1 ?? "" },
			renglones: [
				{ varianteId: variante, piezas: 5 },
				{ varianteId: otra, piezas: 5 },
			],
		});
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, async (contexto) => {
			const mover = (tipo: "despacho" | "recepcion_despacho", de: string, a: string, piezas: [number, number]) =>
				escribirMovimiento(contexto, {
					tipo,
					documento: { tipo: "traspaso", id: traspasoId },
					renglones: [variante, otra].map((varianteId, i) => ({
						origen: ubicacion[de] ?? "",
						destino: ubicacion[a] ?? "",
						varianteId,
						piezas: piezas[i] ?? 0,
						traspasoId,
					})),
					clave: uuidv7(),
				});
			await mover("despacho", "ADU", "TRA", [5, 5]);
			await cambiarEstadoTraspaso(contexto, traspasoId, "en_transito");
			// Llegan 8 de una y 2 de la otra: en Tránsito quedan −3 y +3, que juntos darían cero.
			await mover("recepcion_despacho", "TRA", "T1", [8, 2]);
			await cambiarEstadoTraspaso(contexto, traspasoId, "recibido");
		});
		// Otro que salió de Bodega hace tres días y nadie ha recibido.
		const viejo = await nuevoTraspaso(servidor, {
			tipo: "solicitud_tienda",
			estado: "en_camino_aduana",
			origen: { ubicacionId: ubicacion.BOD ?? "" },
			destino: { ubicacionId: ubicacion.T2 ?? "" },
			renglones: [{ varianteId: variante, piezas: 1 }],
		});
		await servidor.base.dueno.query("UPDATE traspasos SET enviado_en = now() - interval '3 days' WHERE id = $1", [
			viejo.traspasoId,
		]);
		const hoy = diaDeNegocio(Temporal.Now.instant()).toString();
		const cuadre = await cuadrar(hoy);
		const encontradas = await excepcionesDe(cuadre);
		const delTramo = encontradas.filter((excepcion) => excepcion.documento_id === traspasoId);
		expect(delTramo).toHaveLength(1);
		expect(delTramo[0]?.tipo).toBe("cuadre_proyeccion");
		expect(
			delTramo[0]?.datos.tramos
				.map((tramo: { variante_id: string; en_tramo: string; tramo: string }) => [
					tramo.tramo,
					tramo.variante_id,
					Number(tramo.en_tramo),
				])
				.sort((uno: [string, string, number], otro: [string, string, number]) => uno[2] - otro[2]),
		).toEqual([
			["Tránsito", variante, -3],
			["Tránsito", otra, 3],
		]);
		expect(encontradas.filter((excepcion) => excepcion.documento_id === viejo.traspasoId)).toEqual([
			{ tipo: "sin_confirmar", variante_id: null, documento_id: viejo.traspasoId, datos: null },
		]);
		// La noche siguiente sigue sin confirmar, pero su excepción ya está abierta.
		const siguiente = await cuadrar("2099-01-01");
		expect((await excepcionesDe(siguiente)).filter((excepcion) => excepcion.documento_id === viejo.traspasoId)).toEqual(
			[],
		);
	});

	it("una reserva activa cuyo documento ya se cerró abre `reserva_sin_documento`; si sigue abierto, no", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		const abierto = uuidv7();
		const cerrado = uuidv7();
		for (const pedido of [abierto, cerrado]) {
			await servidor.base.dueno.query(
				`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, estado)
				 VALUES ($1, $2, $3, 1, 'pedido_externo', $4, 'activa')`,
				[uuidv7(), ubicacion.BOD, variante, pedido],
			);
		}
		documentosAbiertosDePrueba.add(abierto);
		try {
			const cuadre = await cuadrar("2026-10-05");
			const sinDocumento = (await excepcionesDe(cuadre)).filter(
				(excepcion) => excepcion.tipo === "reserva_sin_documento",
			);
			expect(sinDocumento.map((excepcion) => excepcion.datos.documento_id)).toEqual([cerrado]);
		} finally {
			documentosAbiertosDePrueba.delete(abierto);
		}
	});

	it("El cuadre no frena las ventas: cada tanda es su propia transacción corta, y lo que se mueve a media corrida no descuadra", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.ADU ?? "", variante, 2);
		let movidoEn = Number.NaN;
		const cuadre = await cuadrar("2026-10-06", async (tanda) => {
			if (tanda !== "ADU") return;
			// Después de la tanda de Aduana y antes de la de Bodega: una venta… y un ajuste en las dos.
			const inicio = performance.now();
			await meterPiezas(servidor, ubicacion.ADU ?? "", variante, 4);
			await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 7);
			movidoEn = performance.now() - inicio;
		});
		// Los movimientos no esperaron al cuadre (ninguna tanda estaba abierta).
		expect(movidoEn).toBeLessThan(2_000);
		expect((await excepcionesDe(cuadre)).filter((excepcion) => excepcion.variante_id === variante)).toEqual([]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT u.codigo, e.piezas FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id WHERE e.variante_id = $1 ORDER BY u.codigo",
			[variante],
		);
		expect(rows).toEqual([
			{ codigo: "ADU", piezas: 6 },
			{ codigo: "BOD", piezas: 7 },
		]);
	});

	it("El cuadre encuentra un rollo con metros en dos ubicaciones (paso 2); con sus metros en un solo lugar, ya cuadra", async () => {
		const [tela = ""] = await materialesDePrueba(servidor, 1, "tela");
		const [rollo = ""] = await rollosDePrueba(servidor, tela, 1);
		/** Un ajuste del rollo que entra o sale de una ubicación. */
		const ajuste = (codigo: string, cantidad: string, entra: boolean) =>
			enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
				escribirMovimiento(contexto, {
					tipo: "ajuste",
					documento: { tipo: "ajuste", id: uuidv7() },
					renglones: [
						{
							origen: entra ? null : (ubicacion[codigo] ?? ""),
							destino: entra ? (ubicacion[codigo] ?? "") : null,
							materialId: tela,
							rolloId: rollo,
							cantidad,
						},
					],
					clave: uuidv7(),
				}),
			);
		await ajuste("BOD", "40.000", true);
		await ajuste("ADU", "2.500", true);
		const cuadre = await cuadrar("2026-12-01");
		expect(await excepcionesDe(cuadre)).toEqual([
			{
				tipo: "rollo_en_dos_lugares",
				variante_id: null,
				documento_id: null,
				datos: expect.objectContaining({ rollo_id: rollo, donde: "Aduana 2.500, Bodega 40.000" }),
			},
		]);
		await ajuste("ADU", "2.500", false);
		expect(await cuadrar("2026-12-02")).toMatchObject({ estado: "cuadro" });
	});

	it("El cuadre compara las piezas de cada lote en el Taller contra lo que lleva Producción (paso 4); al cuadrar, ya no abre nada", async () => {
		const lote = await loteCortado(servidor, await siembraDelCatalogo(servidor));
		const [bulto] = lote.bultos;
		if (bulto === undefined) throw new Error("el lote no tiene bultos");
		const { rows: taller } = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE tipo = 'taller'");
		const tallerId = String(taller[0]?.id);
		/** Un ajuste de tres piezas del lote que sale del Taller o regresa. */
		const ajuste = (sale: boolean) =>
			enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
				escribirMovimiento(contexto, {
					tipo: "ajuste",
					documento: { tipo: "ajuste", id: uuidv7() },
					renglones: [
						{
							origen: sale ? tallerId : null,
							destino: sale ? null : tallerId,
							varianteId: bulto.varianteId,
							piezas: 3,
							loteId: lote.loteId,
						},
					],
					clave: uuidv7(),
				}),
			);
		expect(await cuadrar("2027-01-01")).toMatchObject({ estado: "cuadro" });
		await ajuste(true);
		const cuadre = await cuadrar("2027-01-02");
		expect(await excepcionesDe(cuadre)).toEqual([
			{
				tipo: "cuadre_proyeccion",
				variante_id: bulto.varianteId,
				documento_id: null,
				datos: {
					lote_id: lote.loteId,
					variante_id: bulto.varianteId,
					folio: lote.folio,
					produccion: 24,
					taller: 21,
				},
			},
		]);
		await ajuste(false);
		expect(await cuadrar("2027-01-03")).toMatchObject({ estado: "cuadro" });
	});

	it("un traspaso `con_diferencia` tiene en sus tramos justo sus DF- abiertas; si no, `cuadre_proyeccion`", async () => {
		const { traspasoId, diferencia } = await diferenciaEnTransito(servidor, 4);
		const delTraspaso = async (fecha: string) =>
			(await excepcionesDe(await cuadrar(fecha))).filter((excepcion) => excepcion.documento_id === traspasoId);
		expect(await delTraspaso("2027-02-01")).toEqual([]);
		// Si la DF- se resolviera sin su movimiento, el tramo ya no cuadraría con lo abierto.
		await servidor.base.dueno.query(
			"UPDATE diferencias SET estado = 'resuelta', resolucion = 'aclarada' WHERE id = $1",
			[diferencia],
		);
		const encontradas = await delTraspaso("2027-02-02");
		expect(encontradas.map((excepcion) => [excepcion.tipo, excepcion.datos.tramos])).toEqual([
			["cuadre_proyeccion", [expect.objectContaining({ tramo: "Tránsito", en_tramo: "1" })]],
		]);
	});

	it("un negativo sin DF- abierta abre una DF- `cuadre`: por contar en prenda, por aclarar en material; en el Taller, `cuadre_proyeccion`", async () => {
		const [enBodega = "", enTaller = "", explicada = ""] = await variantesLibres(servidor, 3);
		const [material = ""] = await materialesDePrueba(servidor, 1, "avio");
		await sacarPiezas(servidor, ubicacion.BOD ?? "", enBodega, 2);
		await sacarPiezas(servidor, ubicacion.TAL ?? "", enTaller, 1);
		await sacarPiezas(servidor, ubicacion.BOD ?? "", explicada, 1);
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, async (contexto) => {
			await escribirMovimiento(contexto, {
				tipo: "ajuste",
				documento: { tipo: "ajuste", id: uuidv7() },
				renglones: [{ origen: ubicacion.BOD ?? "", destino: null, materialId: material, cantidad: "1.5" }],
				clave: uuidv7(),
			});
			// Esta ya tiene su DF- abierta: el cuadre no abre otra.
			await abrirDiferencia(contexto, {
				origen: "cuadre",
				ubicacionId: ubicacion.BOD ?? "",
				aCargoUbicacionId: ubicacion.BOD ?? "",
				hueco: { varianteId: explicada, piezas: -1 },
				descripcion: "Ya explicada",
			});
		});
		const cuadre = await cuadrar("2027-03-08");
		if ("yaCorrio" in cuadre) throw new Error("ya había corrido");
		expect(cuadre.estado).toBe("con_residuo");
		const nacidas = await servidor.base.dueno.query(
			`SELECT d.variante_id, d.material_id, coalesce(d.piezas, d.cantidad)::text AS cuanto, d.estado, d.descripcion,
				u.codigo, c.codigo AS a_cargo FROM diferencias d JOIN ubicaciones u ON u.id = d.ubicacion_id
			 JOIN ubicaciones c ON c.id = d.a_cargo_ubicacion_id WHERE d.cuadre_id = $1 AND (d.variante_id = ANY($2::uuid[]) OR d.material_id = $3)
			 ORDER BY d.folio`,
			[cuadre.cuadreId, [enBodega, enTaller, explicada], material],
		);
		expect(nacidas.rows).toEqual([
			{
				variante_id: enBodega,
				material_id: null,
				cuanto: "-2",
				estado: "por_contar",
				descripcion: "El cuadre del 8 mar halló -2 en Bodega",
				codigo: "BOD",
				a_cargo: "BOD",
			},
			{
				variante_id: null,
				material_id: material,
				cuanto: "-1.500",
				estado: "por_aclarar",
				descripcion: expect.stringMatching(/^El cuadre del 8 mar halló -1\.5 en Bodega$/),
				codigo: "BOD",
				a_cargo: "BOD",
			},
		]);
		expect(
			(await excepcionesDe(cuadre))
				.filter((excepcion) => excepcion.variante_id === enTaller)
				.map((excepcion) => [excepcion.tipo, excepcion.datos]),
		).toEqual([["cuadre_proyeccion", { paso: "negativo", piezas: -1 }]]);
		// La noche siguiente ya están explicados: no abre nada otra vez.
		const siguiente = await cuadrar("2027-03-09");
		if ("yaCorrio" in siguiente) throw new Error("ya había corrido");
		const otraVez = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM diferencias WHERE cuadre_id = $1 AND (variante_id = ANY($2::uuid[]) OR material_id = $3)",
			[siguiente.cuadreId, [enBodega, enTaller, explicada], material],
		);
		expect(otraVez.rows).toEqual([{ n: 0 }]);
		expect((await excepcionesDe(siguiente)).filter((excepcion) => excepcion.variante_id === enTaller)).toEqual([]);
	});
});
