/**
 * Prueba de «Guardar receta»: cada guardado es una versión que no cambia, con la conversión congelada; cambiar solo
 * medidas no quita la verificación; y las reglas de captura con los textos de la muestra.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 2)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	guardarRecetaDePrueba,
	type MaterialesDeReceta,
	materialesDeReceta,
	prendaConReceta,
	recetaDeEjemplo,
} from "../../../nucleo/pruebas/patronaje-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Guardar una receta crea una versión que no cambia, con la conversión congelada; cambiar solo medidas no quita la verificación", () => {
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

	it("la versión 1 queda sin verificar con su conversión; Compras cambia el hilo y la versión guardada no cambia", async () => {
		const prenda = await prendaConReceta(servidor, siembra);
		const primera = await guardarRecetaDePrueba(servidor, prenda, recetaDeEjemplo(prenda, materiales));
		expect(primera.cuerpo).toMatchObject({
			resultado: {
				numero: 1,
				estado: "sin_verificar",
				perdio_verificacion: false,
				mensaje: "Receta guardada como versión 1. Compras ya puede proyectar su tela",
			},
		});
		const { rows } = await servidor.base.dueno.query(
			`SELECT l.unidad_receta, l.receta_por_unidad_inventario AS conversion FROM receta_lineas l
			 JOIN recetas r ON r.version_vigente_id = l.receta_version_id WHERE r.id = $1 ORDER BY l.papel, l.orden`,
			[prenda.recetaId],
		);
		expect(rows).toEqual([
			{ unidad_receta: "pza", conversion: "1.000" },
			{ unidad_receta: "m", conversion: "5000.000" },
			{ unidad_receta: "m", conversion: "1.000" },
		]);
		// Compras cambia el factor del hilo con SQL de la dueña (no hay acción que lo cambie): la versión no cambia.
		await servidor.base.dueno.query("UPDATE materiales SET factor_receta = 4000 WHERE id = $1", [materiales.hilo]);
		const { rows: despues } = await servidor.base.dueno.query(
			"SELECT receta_por_unidad_inventario AS conversion FROM receta_lineas WHERE material_id = $1",
			[materiales.hilo],
		);
		expect(despues.every((fila) => fila.conversion === "5000.000")).toBe(true);
		await servidor.base.dueno.query("UPDATE materiales SET factor_receta = 5000 WHERE id = $1", [materiales.hilo]);
		// La versión guardada no se puede cambiar ni borrar.
		for (const consulta of [
			"UPDATE receta_versiones SET motivo = 'cambiada'",
			"DELETE FROM receta_lineas",
			"UPDATE receta_linea_tallas SET cantidad = 9",
			"DELETE FROM receta_medidas",
		]) {
			await expect(servidor.base.app.query(consulta)).rejects.toMatchObject({ code: "42501" });
		}
	});

	it("una versión nueva pide motivo; con la tela cambiada pierde la verificación; con solo medidas, sigue verificada", async () => {
		const prenda = await prendaConReceta(servidor, siembra);
		await guardarRecetaDePrueba(servidor, prenda, recetaDeEjemplo(prenda, materiales));
		await servidor.base.dueno.query("UPDATE recetas SET estado = 'verificada', verificada_en = now() WHERE id = $1", [
			prenda.recetaId,
		]);
		const conMedidas = recetaDeEjemplo(prenda, materiales);
		const [largo] = conMedidas.medidas as { valores: { valor_cm: string }[] }[];
		for (const valor of largo?.valores ?? []) valor.valor_cm = "60";
		expect((await guardarRecetaDePrueba(servidor, prenda, conMedidas)).cuerpo).toMatchObject({
			campos: { motivo: "Escribe el motivo del cambio" },
		});
		const soloMedidas = await guardarRecetaDePrueba(servidor, prenda, { ...conMedidas, motivo: "Ajuste del largo" });
		expect(soloMedidas.cuerpo).toMatchObject({
			resultado: {
				numero: 2,
				estado: "verificada",
				perdio_verificacion: false,
				mensaje: "Versión 2 guardada. Los lotes ya cortados conservan la versión 1",
			},
			avisos: [],
		});
		const otraTela = await guardarRecetaDePrueba(servidor, prenda, {
			...recetaDeEjemplo(prenda, materiales, ["1.000", "1.050", "1.200"]),
			medidas: conMedidas.medidas,
			motivo: "Más tela en la 8",
		});
		expect(otraTela.cuerpo).toMatchObject({
			resultado: { numero: 3, estado: "sin_verificar", perdio_verificacion: true },
			avisos: ["Queda sin verificar hasta que se mida en el próximo corte"],
		});
		expect(
			(
				await guardarRecetaDePrueba(servidor, prenda, {
					...recetaDeEjemplo(prenda, materiales, ["1.000", "1.050", "1.200"]),
					medidas: conMedidas.medidas,
					motivo: "Otra vez",
				})
			).cuerpo,
		).toMatchObject({ codigo: "sin_cambios", mensaje: "Sin cambios" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT numero, motivo FROM receta_versiones WHERE receta_id = $1 ORDER BY numero",
			[prenda.recetaId],
		);
		expect(rows).toEqual([
			{ numero: 1, motivo: "Captura inicial" },
			{ numero: 2, motivo: "Ajuste del largo" },
			{ numero: 3, motivo: "Más tela en la 8" },
		]);
		const { rows: bitacora } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE entidad_id = $1 ORDER BY ocurrido_en DESC, id DESC LIMIT 1",
			[prenda.recetaId],
		);
		expect(bitacora[0]?.descripcion).toMatch(/^Receta de Playera .+: versión 3\. Más tela en la 8$/);
	});

	it("las reglas de captura: tallas que faltan, medidas fuera de rango, tela de más, sin tela, y los textos de la muestra", async () => {
		const prenda = await prendaConReceta(servidor, siembra);
		const ejemplo = recetaDeEjemplo(prenda, materiales);
		const [t4 = "", t6 = "", t8 = ""] = ["4", "6", "8"].map((talla) => prenda.tallas[talla] ?? "");
		const respuesta = await guardarRecetaDePrueba(servidor, prenda, {
			medidas: [
				{ medida: "Cintura", orden: 1, valores: [{ talla_id: t4, valor_cm: "60" }] },
				{
					medida: "Cadera",
					orden: 2,
					valores: [t4, t6, t8].map((talla_id) => ({ talla_id, valor_cm: talla_id === t6 ? "300" : "70" })),
				},
				{ medida: "cintura", orden: 3, valores: [t4, t6, t8].map((talla_id) => ({ talla_id, valor_cm: "60" })) },
			],
			lineas: [
				{
					papel: "tela_principal",
					material_id: materiales.gabardina,
					modo: "por_talla",
					unidad_receta: "m",
					tallas: [
						{ talla_id: t4, cantidad: "1" },
						{ talla_id: t6, cantidad: "106" },
					],
					orden: 1,
				},
				{ papel: "avio", material_id: materiales.cierre, modo: "igual", unidad_receta: "pza", orden: 1 },
			],
		});
		expect(respuesta.estado).toBe(400);
		expect(respuesta.cuerpo.campos).toEqual({
			"medidas.0": "Cintura: faltan 2 tallas, en centímetros",
			"medidas.1": "Cadera, talla 6: 300 cm no parece medida de la prenda. Va en centímetros",
			"medidas.2": "cintura ya está en las medidas",
			"lineas.0": expect.stringMatching(/^Gabardina azul marino .+: falta la talla 8, en metros$/),
			"lineas.1": expect.stringMatching(/^Cierre 14 cm .+: escribe cuánto lleva cada prenda, en piezas$/),
		});
		const soloAvios = {
			...ejemplo,
			lineas: (ejemplo.lineas as { papel: string }[]).filter((linea) => linea.papel === "avio"),
		};
		expect((await guardarRecetaDePrueba(servidor, prenda, soloAvios)).cuerpo).toMatchObject({
			campos: { lineas: "Falta la tela" },
		});
		const telaDeMas = recetaDeEjemplo(prenda, materiales, ["1.000", "6.000", "1.100"]);
		expect((await guardarRecetaDePrueba(servidor, prenda, telaDeMas)).cuerpo.campos).toEqual({
			"lineas.0": expect.stringMatching(
				/^Gabardina azul marino .+, talla 6: 6\.000 m por prenda es demasiado\. La tela va en metros, por ejemplo 1\.06$/,
			),
		});
	});

	it("los materiales: tipo que no cuadra, tela que no va en metros, unidad sin conversión, repetido, dado de baja y talla ajena", async () => {
		const prenda = await prendaConReceta(servidor, siembra);
		const ejemplo = recetaDeEjemplo(prenda, materiales);
		const lineas = ejemplo.lineas as Record<string, unknown>[];
		const con = (cambio: (lineas: Record<string, unknown>[]) => Record<string, unknown>[]) =>
			guardarRecetaDePrueba(servidor, prenda, { ...ejemplo, lineas: cambio(lineas.map((linea) => ({ ...linea }))) });
		expect(
			(
				await con((suyas) => [
					...suyas,
					{
						papel: "forro",
						material_id: materiales.cierre,
						modo: "por_talla",
						unidad_receta: "m",
						tallas: [],
						orden: 2,
					},
				])
			).cuerpo,
		).toMatchObject({
			codigo: "material_tipo_no_cuadra",
			mensaje: expect.stringMatching(/^Cierre 14 cm .+ es avío: no va como tela\.$/),
		});
		expect(
			(
				await con((suyas) => [
					...suyas,
					{
						papel: "avio",
						material_id: materiales.popelina,
						modo: "igual",
						unidad_receta: "m",
						cantidad: "1",
						orden: 3,
					},
				])
			).cuerpo,
		).toMatchObject({
			codigo: "material_tipo_no_cuadra",
			mensaje: expect.stringMatching(/es tela: va en la tabla de tela\.$/),
		});
		expect(
			(
				await con((suyas) =>
					suyas.map((linea, i) => (i === 0 ? { ...linea, modo: "igual", cantidad: "1", tallas: undefined } : linea)),
				)
			).cuerpo,
		).toMatchObject({
			codigo: "tela_en_metros",
			mensaje: expect.stringMatching(/: la tela va en metros por prenda, talla por talla\.$/),
		});
		expect(
			(await con((suyas) => suyas.map((linea, i) => (i === 1 ? { ...linea, unidad_receta: "cm" } : linea)))).cuerpo,
		).toMatchObject({
			codigo: "unidad_sin_conversion",
			mensaje: expect.stringMatching(/^Cierre 14 cm .+ se guarda en pza: captúralo en piezas\.$/),
		});
		expect((await con((suyas) => [...suyas, { ...suyas[1], orden: 5 }])).cuerpo).toMatchObject({
			codigo: "material_repetido",
		});
		const tallaAjena = siembra.tallas["Juvenil y adulto"]?.CH ?? Object.values(siembra.tallas.Juvenil ?? {})[0];
		expect(
			(
				await con((suyas) =>
					suyas.map((linea, i) =>
						i === 0
							? { ...linea, tallas: [...(linea.tallas as unknown[]), { talla_id: tallaAjena, cantidad: "1" }] }
							: linea,
					),
				)
			).cuerpo,
		).toMatchObject({ codigo: "talla_ajena" });
		// Un material dado de baja ya no entra a una receta nueva.
		const cierreViejo = materiales.cierre;
		await servidor.base.dueno.query("UPDATE materiales SET baja_en = now(), motivo_baja = 'prueba' WHERE id = $1", [
			cierreViejo,
		]);
		try {
			expect((await con((suyas) => suyas)).cuerpo).toMatchObject({
				codigo: "material_dado_de_baja",
				mensaje: expect.stringMatching(/ está dado de baja en Compras\.$/),
			});
		} finally {
			await servidor.base.dueno.query("UPDATE materiales SET baja_en = NULL, motivo_baja = NULL WHERE id = $1", [
				cierreViejo,
			]);
		}
	});

	it("una sección sin receta responde seccion_sin_receta; la versión vieja da 409; solo Patronaje guarda", async () => {
		const prenda = await prendaConReceta(servidor, siembra);
		const vieja = Number(
			(await servidor.base.dueno.query("SELECT version FROM recetas WHERE id = $1", [prenda.recetaId])).rows[0]
				?.version,
		);
		await guardarRecetaDePrueba(servidor, prenda, recetaDeEjemplo(prenda, materiales));
		expect(
			(
				await mandarAccion(
					servidor,
					"patronaje.guardar_receta",
					{
						datos: { producto_id: prenda.productoId, motivo: "Otra", ...recetaDeEjemplo(prenda, materiales) },
						version: vieja,
					},
					"patronaje",
				)
			).estado,
		).toBe(409);
		expect(
			(
				await mandarAccion(
					servidor,
					"patronaje.guardar_receta",
					{ datos: { producto_id: prenda.productoId, ...recetaDeEjemplo(prenda, materiales) }, version: vieja },
					"ventas",
				)
			).estado,
		).toBe(403);
		const accesorio = await prendaConReceta(servidor, siembra, {
			seccion_id: siembra.secciones["Accesorios y servicios"],
			tipo_prenda_id: undefined,
		});
		// Un producto de una sección sin receta no nace con receta.
		const { rows } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM recetas WHERE producto_id = $1", [
			accesorio.productoId,
		]);
		expect(rows[0]?.n).toBe(0);
		const sinReceta = await mandarAccion(
			servidor,
			"patronaje.guardar_receta",
			{ datos: { producto_id: accesorio.productoId, ...recetaDeEjemplo(accesorio, materiales) }, version: 0 },
			"patronaje",
		);
		expect(sinReceta.cuerpo).toMatchObject({
			codigo: "seccion_sin_receta",
			mensaje: "Accesorios y servicios no lleva receta.",
		});
	});
});
