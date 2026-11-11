/**
 * Lo que comparten las entregas a corte y el cierre del corte: el lote por cortar con su receta, los datos de sus
 * materiales y los rollos que se usan, bloqueados.
 * Fase 12 · docs/modulos/inventario/entregas-a-corte.md (reglas 3 a 7)
 */

import { aMilesimos, aMilesimosConSigno } from "@uniformame/compartido/calculos/cuenta-material";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { productos } from "../../catalogo/tablas.ts";
import { lotes } from "../../produccion/tablas.ts";
import { apartadosRollo, existenciasMaterial, partidasTela, rollos } from "../tablas.ts";

/** Lo que regresa `patronaje.calcular_material`. */
const cuentaDeLaReceta = z.object({
	receta_version_id: z.uuid().nullable(),
	materiales: z.array(z.object({ material_id: z.uuid(), cantidad: z.number().nullable() })),
});

/** Lo que regresa `produccion.lotes_por_cortar`, en lo que se usa aquí. */
const lotesPorCortar = z.object({
	lotes: z.array(
		z.object({
			lote_id: z.uuid(),
			producto_id: z.uuid(),
			tallas: z.array(z.object({ variante_id: z.uuid(), talla_id: z.uuid(), piezas_planeadas: z.number() })),
		}),
	),
});

/** Lo que regresa `compras.datos_materiales`, en lo que se usa aquí. */
const datosDeMateriales = z.record(z.string(), z.object({ nombre: z.string(), tipo: z.string(), unidad: z.string() }));

/** Un lote por cortar, con lo que pide su receta para sus piezas planeadas. */
export interface LoteConReceta {
	loteId: string;
	folio: string;
	productoId: string;
	prenda: string;
	fechaCorte: string;
	recetaVersionId: string;
	/** Por material de la receta: su nombre, su tipo, su unidad y lo que pide, en su unidad de inventario. */
	materiales: { materialId: string; nombre: string; tipo: string; unidad: string; cantidad: number | null }[];
	tallas: { varianteId: string; tallaId: string; piezas: number }[];
}

/**
 * El lote por cortar, bloqueado, con su receta vigente y lo que pide para sus piezas planeadas.
 * @throws `422 lote_no_por_cortar`: «{lote} ya se cortó»; `422 sin_receta`.
 */
export async function loteConReceta(contexto: ContextoDeAccion, loteId: string): Promise<LoteConReceta> {
	const [lote] = await contexto.transaccion
		.select({
			folio: lotes.folio,
			productoId: lotes.productoId,
			prenda: productos.nombre,
			fechaCorte: lotes.fechaCorte,
		})
		.from(lotes)
		.innerJoin(productos, eq(productos.id, lotes.productoId))
		.where(eq(lotes.id, loteId))
		// Bloquea el lote: dos entregas del mismo lote, o una entrega y el cierre de su corte, van una tras otra.
		.for("update", { of: lotes });
	if (lote === undefined) throw errorDeRegla("lote_no_por_cortar", "Ese lote ya se cortó");
	const porCortar = lotesPorCortar
		.parse(await contexto.lectura("produccion.lotes_por_cortar", {}))
		.lotes.find((suyo) => suyo.lote_id === loteId);
	if (porCortar === undefined) throw errorDeRegla("lote_no_por_cortar", `${lote.folio} ya se cortó`);
	const tallas = porCortar.tallas.map((talla) => ({
		varianteId: talla.variante_id,
		tallaId: talla.talla_id,
		piezas: talla.piezas_planeadas,
	}));
	const cuenta = cuentaDeLaReceta.parse(
		await contexto.lectura("patronaje.calcular_material", {
			producto_id: lote.productoId,
			piezas_por_talla: tallas.map((talla) => ({ talla_id: talla.tallaId, piezas: talla.piezas })),
		}),
	);
	if (cuenta.receta_version_id === null) {
		throw errorDeRegla("sin_receta", `${lote.prenda} no tiene receta: no se corta hasta que Patronaje la capture`);
	}
	const datos = await datosDe(
		contexto,
		cuenta.materiales.map((material) => material.material_id),
	);
	return {
		loteId,
		folio: lote.folio,
		productoId: lote.productoId,
		prenda: lote.prenda,
		fechaCorte: lote.fechaCorte,
		recetaVersionId: cuenta.receta_version_id,
		materiales: cuenta.materiales.map((material) => ({
			materialId: material.material_id,
			nombre: datos[material.material_id]?.nombre ?? "",
			tipo: datos[material.material_id]?.tipo ?? "",
			unidad: datos[material.material_id]?.unidad ?? "",
			cantidad: material.cantidad,
		})),
		tallas,
	};
}

/** El nombre, el tipo y la unidad de unos materiales, de Compras. */
export async function datosDe(contexto: ContextoDeAccion, materialIds: readonly string[]) {
	return datosDeMateriales.parse(
		await contexto.lectura("compras.datos_materiales", { material_ids: [...materialIds] }),
	);
}

/** Un rollo que se usa en el corte, con su partida, su estado y lo que tiene en una ubicación. */
export interface RolloEnUso {
	rolloId: string;
	folio: string;
	materialId: string;
	partida: string | null;
	estado: string;
	esRetazo: boolean;
	milesimos: bigint;
	/** El lote al que está entregado, si lo está. */
	entregadoA: { loteId: string; folio: string } | null;
}

/**
 * Lee y bloquea (`FOR UPDATE`, en orden de id) unos rollos, con lo que tienen en una ubicación y a qué lote están
 * entregados. Así dos entregas o dos cortes no toman el mismo rollo a la vez.
 * @param ubicacionId Dónde se cuentan sus metros.
 */
export async function rollosEnUso(
	contexto: ContextoDeAccion,
	rolloIds: readonly string[],
	ubicacionId: string,
): Promise<RolloEnUso[]> {
	if (rolloIds.length === 0) return [];
	const { transaccion } = contexto;
	const bloqueados = await transaccion
		.select({
			rolloId: rollos.id,
			folio: rollos.folio,
			materialId: rollos.materialId,
			partida: partidasTela.folio,
			estado: rollos.estado,
			esRetazo: rollos.esRetazo,
		})
		.from(rollos)
		.leftJoin(partidasTela, eq(partidasTela.id, rollos.partidaTelaId))
		.where(inArray(rollos.id, [...rolloIds]))
		.orderBy(asc(rollos.id))
		.for("update", { of: rollos });
	const metros = await transaccion
		.select({ rolloId: existenciasMaterial.rolloId, cantidad: existenciasMaterial.cantidad })
		.from(existenciasMaterial)
		.where(and(inArray(existenciasMaterial.rolloId, [...rolloIds]), eq(existenciasMaterial.ubicacionId, ubicacionId)));
	const entregados = await transaccion
		.select({ rolloId: apartadosRollo.rolloId, loteId: apartadosRollo.loteId, folio: lotes.folio })
		.from(apartadosRollo)
		.innerJoin(lotes, eq(lotes.id, apartadosRollo.loteId))
		.where(and(inArray(apartadosRollo.rolloId, [...rolloIds]), eq(apartadosRollo.estado, "entregado")));
	return bloqueados.map((rollo) => {
		const entregado = entregados.find((suyo) => suyo.rolloId === rollo.rolloId);
		return {
			...rollo,
			milesimos: aMilesimosConSigno(metros.find((suyo) => suyo.rolloId === rollo.rolloId)?.cantidad ?? "0"),
			entregadoA: entregado === undefined ? null : { loteId: entregado.loteId, folio: entregado.folio },
		};
	});
}

/** El aviso de una tela que mezcla partidas: «Se mezclan las partidas {P} y {P}: el tono puede variar entre piezas.». */
export function avisoDeMezcla(partidas: readonly (string | null)[]): string | undefined {
	const distintas = [...new Set(partidas.filter((partida): partida is string => partida !== null))].sort();
	if (distintas.length < 2) return undefined;
	const lista = `${distintas.slice(0, -1).join(", ")} y ${distintas.at(-1)}`;
	return `Se mezclan las partidas ${lista}: el tono puede variar entre piezas.`;
}

/** Unos metros enteros de la cuenta, en milésimos. */
export function milesimosDeCuenta(cantidad: number): bigint {
	return aMilesimos(String(cantidad));
}

/** Las telas que ya recibió un lote: las de sus rollos entregados o usados. */
export async function telasRecibidas(contexto: ContextoDeAccion, loteIds: readonly string[]) {
	if (loteIds.length === 0) return [];
	return contexto.transaccion
		.selectDistinct({ loteId: apartadosRollo.loteId, materialId: rollos.materialId })
		.from(apartadosRollo)
		.innerJoin(rollos, eq(rollos.id, apartadosRollo.rolloId))
		.where(and(inArray(apartadosRollo.loteId, [...loteIds]), inArray(apartadosRollo.estado, ["entregado", "usado"])));
}

/** Suma de unos milésimos. */
export function suma(milesimos: readonly bigint[]): bigint {
	return milesimos.reduce((total, uno) => total + uno, 0n);
}
