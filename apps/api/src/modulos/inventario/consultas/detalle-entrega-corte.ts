/**
 * `inventario.detalle_entrega_corte`: el cajón Entrega al corte de Bodega. Por cada tela de la receta que falta
 * entregar (la principal primero), lo que pide el corte y los rollos libres de esa tela en Bodega, con los sugeridos
 * marcados; los avíos si todavía no se entregan, con lo que hay; y la gente del Taller para «Quién recibe».
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»: Entrega al corte) y docs/modulos/inventario/entregas-a-corte.md
 * (reglas 1, 3, 5 y 11)
 *
 * Lo que pide cada tela sale de `patronaje.calcular_material` con la versión de receta vigente, que el cajón manda de
 * vuelta en «Entregar al corte» para que la acción revise que no cambió. Un rollo sugerido para otro lote también sale:
 * se puede tomar (regla 5).
 */

import { aMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { detalleDeEntregaCorte } from "@uniformame/compartido/contratos/inventario/bodega-cajones";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { cortesPorEntregar, enBodegaDe, metrosEscritos, papelEscrito, rollosLibresDeBodega } from "./bodega-comun.ts";

export const consultaDetalleDeEntregaCorte = implementarConsulta(
	detalleDeEntregaCorte,
	async (contexto, parametros) => ({
		resultado: await contexto.comoAccion(async (accion) => {
			const [corte] = await cortesPorEntregar(accion, parametros.lote_id);
			if (corte === undefined) throw errorDeRegla("lote_no_por_cortar", "Ese lote ya se cortó");
			if (corte.recetaVersionId === null) {
				throw errorDeRegla("sin_receta", `${corte.prenda} no tiene receta: no se corta hasta que Patronaje la capture`);
			}
			const libres = await rollosLibresDeBodega(
				accion,
				corte.telasPorEntregar.map((tela) => tela.materialId),
			);
			const hay = await enBodegaDe(
				accion,
				corte.aviosPorEntregar.map((avio) => avio.materialId),
			);
			const { rows: personas } = await accion.transaccion.execute(sql`
			SELECT id AS persona_id, nombre FROM personas WHERE area = 'taller' AND baja_en IS NULL ORDER BY nombre`);
			const principal = corte.materiales.find((material) => material.papel === "tela_principal");
			return {
				lote_id: corte.loteId,
				folio: corte.folio,
				prenda: corte.prenda,
				fecha_corte: corte.fechaCorte,
				piezas: corte.piezas,
				receta_version_id: corte.recetaVersionId,
				metros_principal: metrosEscritos(principal?.cantidad ?? 0),
				telas: corte.telasPorEntregar.map((tela) => ({
					material_id: tela.materialId,
					tela: tela.nombre,
					papel: papelEscrito(tela.papel),
					metros: metrosEscritos(tela.cantidad ?? 0),
					metros_milesimos: Number(aMilesimos(String(tela.cantidad ?? 0))),
					// Los sugeridos para este lote primero; luego los demás, por partida y folio.
					rollos: libres
						.filter((rollo) => rollo.material_id === tela.materialId)
						.map((rollo) => ({
							rollo_id: rollo.rollo_id,
							folio: rollo.folio,
							es_retazo: rollo.es_retazo,
							partida: rollo.partida,
							metros: metrosEscritos(rollo.metros),
							milesimos: Number(aMilesimos(metrosEscritos(rollo.metros))),
							sugerido: rollo.sugerido_a === corte.loteId,
						}))
						.sort((uno, otro) => Number(otro.sugerido) - Number(uno.sugerido)),
				})),
				avios: corte.aviosPorEntregar.map((avio) => {
					const enBodega = hay.get(avio.materialId) ?? 0;
					return {
						material: avio.nombre,
						se_entrega: `${metrosEscritos(avio.cantidad ?? 0)} ${avio.unidad}`,
						hay: `${metrosEscritos(enBodega)} ${avio.unidad}`,
						alcanza: enBodega >= (avio.cantidad ?? 0),
					};
				}),
				personas: z.array(z.object({ persona_id: z.uuid(), nombre: z.string() })).parse(personas),
			};
		}),
	}),
);
