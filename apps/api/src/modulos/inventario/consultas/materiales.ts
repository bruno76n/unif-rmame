/**
 * `inventario.materiales`: la pestaña Materiales de Bodega. Las entregas al corte por hacer (un renglón por tela, con
 * sus rollos sugeridos o «No alcanza») y los lotes con todas sus telas entregadas; lo que regresa del corte; las telas en
 * bodega (con sus rollos, sus partidas y los ids para las etiquetas) y los avíos con su existencia y sus usos; y los
 * materiales sin carga inicial.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Materiales»), docs/modulos/inventario/entregas-a-corte.md (reglas 1 y 2)
 * y docs/modulos/inventario/material-en-bodega.md
 *
 * Cuánto pide un corte y qué rollos se sugieren lo calculan Patronaje y `inventario.recalcular_rollos_sugeridos`: aquí
 * solo se lee. Los cortes salen rojos a `produccion.tela_por_entregar_rojo_dias` días o menos, ámbar a
 * `inventario.dias_entrega_corte` o menos.
 */

import { diasHasta, textoEnDias } from "@uniformame/compartido/calculos/fechas";
import { materialesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import {
	cortesPorEntregar,
	leerRegresosDelCorte,
	metrosEscritos,
	papelEscrito,
	rollosLibresDeBodega,
} from "./bodega-comun.ts";

/**
 * Las entregas al corte por hacer y los lotes con todo entregado.
 * @param contexto El contexto de la lectura.
 */
async function entregas(contexto: ContextoDeAccion) {
	const diasEntrega = await parametroNumero(contexto, "inventario.dias_entrega_corte");
	const diasRojo = await parametroNumero(contexto, "produccion.tela_por_entregar_rojo_dias");
	const cortes = (await cortesPorEntregar(contexto)).filter((corte) => corte.recetaVersionId !== null);
	const libres = await rollosLibresDeBodega(contexto, [
		...new Set(cortes.flatMap((corte) => corte.telasPorEntregar.map((tela) => tela.materialId))),
	]);
	const porEntregar = cortes
		.filter((corte) => corte.telasPorEntregar.length > 0)
		.sort((uno, otro) => uno.fechaCorte.localeCompare(otro.fechaCorte) || uno.folio.localeCompare(otro.folio))
		.map((corte) => {
			const dias = diasHasta(contexto.diaDeNegocio, corte.fechaCorte);
			return {
				lote_id: corte.loteId,
				folio: corte.folio,
				prenda: corte.prenda,
				piezas: corte.piezas,
				fecha_corte: corte.fechaCorte,
				en_dias: textoEnDias(dias),
				tono: dias <= diasRojo ? ("rojo" as const) : dias <= diasEntrega ? ("ambar" as const) : null,
				avios: corte.aviosPorEntregar.length > 0 ? corte.aviosPorEntregar.length : null,
				telas: corte.telasPorEntregar.map((tela) => {
					const sugeridos = libres.filter(
						(rollo) => rollo.material_id === tela.materialId && rollo.sugerido_a === corte.loteId,
					);
					const metros = sugeridos.reduce((suma, rollo) => suma + Number(rollo.metros), 0);
					const alcanza = sugeridos.length > 0 && metros >= (tela.cantidad ?? 0);
					return {
						material_id: tela.materialId,
						tela: tela.nombre,
						papel: papelEscrito(tela.papel),
						metros: metrosEscritos(tela.cantidad ?? 0),
						sugeridos: alcanza
							? {
									rollos: sugeridos.length,
									metros: metrosEscritos(metros),
									partidas: [...new Set(sugeridos.flatMap((rollo) => (rollo.partida === null ? [] : [rollo.partida])))],
								}
							: null,
					};
				}),
			};
		});
	const entregados = cortes
		.filter((corte) => corte.telasPorEntregar.length === 0 && corte.rollosEntregados > 0)
		.map((corte) => ({ folio: corte.folio, rollos: corte.rollosEntregados }));
	return { entregas: porEntregar, entregados };
}

/** Una tela con lo que hay, como sale de la base. */
const deLaTela = z.object({
	material_id: z.uuid(),
	nombre: z.string(),
	color: z.string().nullable(),
	detalle: z.string().nullable(),
	en_bodega: z.coerce.number(),
	en_aduana: z.coerce.number(),
	en_taller: z.coerce.number(),
	rollos: z.coerce.number(),
	retazos: z.coerce.number(),
	rollos_taller: z.coerce.number(),
	partidas: z.array(z.string()).nullable(),
	rollo_ids: z.array(z.uuid()).nullable(),
});

/**
 * Las telas con algo en Bodega, en Aduana o en el Taller.
 * @param contexto El contexto de la lectura.
 */
async function telas(contexto: ContextoDeAccion) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT m.id AS material_id, m.nombre, m.color, m.presentacion AS detalle,
			coalesce(sum(em.cantidad) FILTER (WHERE u.tipo = 'bodega'), 0) AS en_bodega,
			coalesce(sum(em.cantidad) FILTER (WHERE u.tipo = 'aduana'), 0) AS en_aduana,
			coalesce(sum(em.cantidad) FILTER (WHERE u.tipo = 'taller'), 0) AS en_taller,
			count(*) FILTER (WHERE u.tipo = 'bodega' AND em.cantidad > 0 AND NOT r.es_retazo) AS rollos,
			count(*) FILTER (WHERE u.tipo = 'bodega' AND em.cantidad > 0 AND r.es_retazo) AS retazos,
			count(*) FILTER (WHERE u.tipo = 'taller' AND em.cantidad > 0) AS rollos_taller,
			array_agg(DISTINCT pt.folio) FILTER (WHERE u.tipo = 'bodega' AND em.cantidad > 0 AND pt.folio IS NOT NULL) AS partidas,
			array_agg(r.id ORDER BY r.folio) FILTER (WHERE u.tipo = 'bodega' AND em.cantidad > 0) AS rollo_ids
		FROM materiales m JOIN existencias_material em ON em.material_id = m.id
		JOIN ubicaciones u ON u.id = em.ubicacion_id LEFT JOIN rollos r ON r.id = em.rollo_id
		LEFT JOIN partidas_tela pt ON pt.id = r.partida_tela_id
		WHERE m.tipo = 'tela' GROUP BY m.id HAVING sum(em.cantidad) <> 0 ORDER BY m.nombre`);
	return z
		.array(deLaTela)
		.parse(rows)
		.map((tela) => ({
			...tela,
			en_bodega: metrosEscritos(tela.en_bodega),
			en_aduana: metrosEscritos(tela.en_aduana),
			en_taller: metrosEscritos(tela.en_taller),
			partidas: tela.partidas ?? [],
			rollo_ids: tela.rollo_ids ?? [],
		}));
}

/**
 * Los avíos con su existencia en Bodega y sus dos primeros usos (las prendas cuya receta vigente los lleva).
 * @param contexto El contexto de la lectura.
 */
async function avios(contexto: ContextoDeAccion) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT m.id AS material_id, m.nombre, m.presentacion, m.unidad,
			coalesce((SELECT sum(em.cantidad) FROM existencias_material em JOIN ubicaciones u ON u.id = em.ubicacion_id
				WHERE em.material_id = m.id AND u.tipo = 'bodega'), 0) AS existencia,
			coalesce((SELECT array_agg(nombre) FROM (SELECT DISTINCT p.nombre FROM receta_lineas rl
				JOIN recetas re ON re.version_vigente_id = rl.receta_version_id JOIN productos p ON p.id = re.producto_id
				WHERE rl.material_id = m.id ORDER BY p.nombre LIMIT 2) usos), '{}') AS usos
		FROM materiales m WHERE m.tipo = 'avio' AND m.baja_en IS NULL ORDER BY m.nombre`);
	return z
		.array(
			z.object({
				material_id: z.uuid(),
				nombre: z.string(),
				presentacion: z.string().nullable(),
				unidad: z.string(),
				existencia: z.coerce.number(),
				usos: z.array(z.string()),
			}),
		)
		.parse(rows)
		.map((avio) => ({ ...avio, existencia: metrosEscritos(avio.existencia) }));
}

export const consultaMateriales = implementarConsulta(materialesDeBodega, async (contexto) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const regresa = (await leerRegresosDelCorte(accion)).map((rollo) => ({
			rollo_id: rollo.id,
			folio: rollo.folio,
			es_retazo: rollo.es_retazo,
			tela: rollo.tela,
			partida: rollo.partida,
			lote: rollo.lote,
			fecha: rollo.cuando.slice(0, 10),
			metros: metrosEscritos(rollo.metros),
			version: rollo.version,
		}));
		// Los materiales que no tienen carga inicial ni movimientos.
		const { rows: sinCarga } = await accion.transaccion.execute(sql`
			SELECT m.id AS material_id, m.nombre, m.tipo = 'tela' AS es_tela, m.unidad FROM materiales m
			WHERE m.baja_en IS NULL AND m.tipo <> 'consumible'
				AND NOT EXISTS (SELECT 1 FROM movimiento_lineas l WHERE l.material_id = m.id)
			ORDER BY m.nombre`);
		return {
			...(await entregas(accion)),
			regresa,
			telas: await telas(accion),
			avios: await avios(accion),
			sin_carga: z
				.array(z.object({ material_id: z.uuid(), nombre: z.string(), es_tela: z.boolean(), unidad: z.string() }))
				.parse(sinCarga),
		};
	}),
}));
