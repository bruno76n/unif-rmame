/**
 * `inventario.recalcular_rollos_sugeridos`: vuelve a apartar como sugeridos los rollos libres de Bodega para los lotes
 * por cortar, con la regla de las partidas; crea los nuevos y libera los que ya no tocan. Nunca toca lo entregado.
 * Fase 12 · docs/modulos/inventario/entregas-a-corte.md (reglas 1 y 2, «`inventario.recalcular_rollos_sugeridos`»)
 *
 * Toma un candado por nombre para que dos recálculos no se crucen. Lo que pide cada tela sale de
 * `patronaje.calcular_material` con las piezas planeadas del lote; un lote sin receta no pide nada.
 */

import { aMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import { type LotePorSugerir, type RolloLibre, sugerirRollos } from "../dominio/rollos-sugeridos.ts";
import { apartadosRollo, existenciasMaterial, partidasTela, rollos } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ material_id: z.uuid().optional() });

/** Lo que regresa `produccion.lotes_por_cortar`, en lo que se usa aquí. */
const porCortar = z.object({
	lotes: z.array(
		z.object({
			lote_id: z.uuid(),
			folio: z.string(),
			producto_id: z.uuid(),
			fecha_corte: z.string(),
			tiene_receta: z.boolean(),
			tallas: z.array(z.object({ talla_id: z.uuid(), piezas_planeadas: z.number() })),
		}),
	),
});

/** Lo que regresa `patronaje.calcular_material`, en lo que se usa aquí. */
const deLaReceta = z.object({
	materiales: z.array(z.object({ material_id: z.uuid(), cantidad: z.number().nullable() })),
});

/** Lo que regresa `compras.datos_materiales`, en lo que se usa aquí. */
const datosDeMateriales = z.record(z.string(), z.object({ tipo: z.string() }));

/**
 * Las telas que cada lote por cortar todavía no recibe, con lo que pide su receta para sus piezas planeadas.
 * @param soloMaterial Si se pide, solo esa tela.
 * @returns Los lotes en orden de fecha de corte (y folio).
 */
async function lotesQuePiden(contexto: ContextoDeAccion, soloMaterial: string | undefined): Promise<LotePorSugerir[]> {
	const { lotes } = porCortar.parse(await contexto.lectura("produccion.lotes_por_cortar", {}));
	const conReceta = lotes.filter((lote) => lote.tiene_receta);
	// Las telas que ya recibió cada lote: las de sus rollos entregados.
	const recibidas =
		conReceta.length === 0
			? []
			: await contexto.transaccion
					.selectDistinct({ loteId: apartadosRollo.loteId, materialId: rollos.materialId })
					.from(apartadosRollo)
					.innerJoin(rollos, eq(rollos.id, apartadosRollo.rolloId))
					.where(
						and(
							inArray(
								apartadosRollo.loteId,
								conReceta.map((lote) => lote.lote_id),
							),
							inArray(apartadosRollo.estado, ["entregado", "usado"]),
						),
					);
	const pedidos: LotePorSugerir[] = [];
	const tipos = new Map<string, string>();
	for (const lote of conReceta) {
		const cuenta = deLaReceta.parse(
			await contexto.lectura("patronaje.calcular_material", {
				producto_id: lote.producto_id,
				piezas_por_talla: lote.tallas.map((talla) => ({ talla_id: talla.talla_id, piezas: talla.piezas_planeadas })),
			}),
		);
		const faltanTipos = cuenta.materiales.map((m) => m.material_id).filter((id) => !tipos.has(id));
		if (faltanTipos.length > 0) {
			const datos = datosDeMateriales.parse(
				await contexto.lectura("compras.datos_materiales", { material_ids: faltanTipos }),
			);
			for (const [id, dato] of Object.entries(datos)) tipos.set(id, dato.tipo);
		}
		pedidos.push({
			loteId: lote.lote_id,
			telas: cuenta.materiales.flatMap((material) =>
				tipos.get(material.material_id) !== "tela" ||
				material.cantidad === null ||
				(soloMaterial !== undefined && material.material_id !== soloMaterial) ||
				recibidas.some((suya) => suya.loteId === lote.lote_id && suya.materialId === material.material_id)
					? []
					: [{ materialId: material.material_id, pide: aMilesimos(String(material.cantidad)) }],
			),
		});
	}
	return pedidos;
}

/**
 * Los rollos libres de Bodega: disponibles, con metros en Bodega y sin entregar a un lote.
 * @param soloMaterial Si se pide, solo de esa tela.
 */
async function rollosLibres(contexto: ContextoDeAccion, soloMaterial: string | undefined): Promise<RolloLibre[]> {
	const bodega = await ubicacionDeTipo(contexto.transaccion, "bodega");
	const filas = await contexto.transaccion
		.select({
			rolloId: rollos.id,
			materialId: rollos.materialId,
			partida: sql<string>`coalesce(${partidasTela.folio}, '')`,
			cantidad: existenciasMaterial.cantidad,
		})
		.from(rollos)
		.innerJoin(
			existenciasMaterial,
			and(eq(existenciasMaterial.rolloId, rollos.id), eq(existenciasMaterial.ubicacionId, bodega)),
		)
		.leftJoin(partidasTela, eq(partidasTela.id, rollos.partidaTelaId))
		.where(
			and(
				eq(rollos.estado, "disponible"),
				sql`${existenciasMaterial.cantidad} > 0`,
				...(soloMaterial === undefined ? [] : [eq(rollos.materialId, soloMaterial)]),
				notInArray(
					rollos.id,
					contexto.transaccion
						.select({ id: apartadosRollo.rolloId })
						.from(apartadosRollo)
						.where(eq(apartadosRollo.estado, "entregado")),
				),
			),
		);
	return filas.map((fila) => ({
		rolloId: fila.rolloId,
		materialId: fila.materialId,
		partida: fila.partida,
		milesimos: aMilesimos(fila.cantidad),
	}));
}

/**
 * Vuelve a calcular los rollos sugeridos.
 * @param contexto El contexto de quien llama.
 * @param datos `material_id`, opcional: sin él, todas las telas.
 * @returns Cuántos apartados nacieron y cuántos se liberaron.
 */
export async function recalcularRollosSugeridos(contexto: ContextoDeAccion, datos: unknown) {
	const { material_id } = pedido.parse(datos);
	const { transaccion } = contexto;
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('rollos_sugeridos', 0))`);
	const lotes = await lotesQuePiden(contexto, material_id);
	const libres = await rollosLibres(contexto, material_id);
	const nuevos = sugerirRollos(lotes, libres);
	const fechaDe = new Map(
		porCortar
			.parse(await contexto.lectura("produccion.lotes_por_cortar", {}))
			.lotes.map((lote) => [lote.lote_id, lote.fecha_corte]),
	);
	// Los sugeridos de ahora, de esas telas.
	const actuales = await transaccion
		.select({ id: apartadosRollo.id, rolloId: apartadosRollo.rolloId, loteId: apartadosRollo.loteId })
		.from(apartadosRollo)
		.innerJoin(rollos, eq(rollos.id, apartadosRollo.rolloId))
		.where(
			and(
				eq(apartadosRollo.estado, "sugerido"),
				...(material_id === undefined ? [] : [eq(rollos.materialId, material_id)]),
			),
		);
	const llave = (loteId: string, rolloId: string) => `${loteId}|${rolloId}`;
	const quedan = new Set(nuevos.map((nuevo) => llave(nuevo.loteId, nuevo.rolloId)));
	const sobran = actuales.filter((actual) => !quedan.has(llave(actual.loteId, actual.rolloId)));
	if (sobran.length > 0) {
		await transaccion
			.update(apartadosRollo)
			.set({ estado: "liberado" })
			.where(
				inArray(
					apartadosRollo.id,
					sobran.map((suyo) => suyo.id),
				),
			);
	}
	const yaEstan = new Set(actuales.map((actual) => llave(actual.loteId, actual.rolloId)));
	const faltan = nuevos.filter((nuevo) => !yaEstan.has(llave(nuevo.loteId, nuevo.rolloId)));
	if (faltan.length > 0) {
		await transaccion.insert(apartadosRollo).values(
			faltan.map((nuevo) => ({
				id: uuidv7(),
				rolloId: nuevo.rolloId,
				loteId: nuevo.loteId,
				fechaCorte: fechaDe.get(nuevo.loteId) ?? contexto.diaDeNegocio.toString(),
				estado: "sugerido" as const,
				creadoPor: quienCambia(contexto),
			})),
		);
	}
	if (sobran.length > 0 || faltan.length > 0) {
		contexto.guardarEvento({
			tipo: "rollos.sugeridos",
			datos: { material_id: material_id ?? null },
			tablas: ["apartados_rollo"],
		});
	}
	return { sugeridos: faltan.length, liberados: sobran.length };
}
