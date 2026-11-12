/**
 * `produccion.costo_lote`: el costo de un lote cortado, solo para Compras o Contaduría (regla 10 de
 * docs/modulos/produccion/lotes.md): la tela, con los metros usados de cada rollo a su costo de compra; los avíos de
 * su receta para las cortadas, a su última compra (`compras.costo_material`); y, con «ven sueldos y tarifas», la mano
 * de obra (estimada en proceso con las tarifas vigentes de su flujo, real ya terminado con las de sus registros), el
 * total y el costo por pieza.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Cajones · Lote»: «Costo del lote»)
 */

import { aMilesimos, cantidadEnTexto } from "@uniformame/compartido/calculos/cuenta-material";
import { costoDeLote } from "@uniformame/compartido/contratos/produccion/lotes";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { deCalcularMaterial, piezasPorTallaDelLote } from "./comun.ts";

/** Los papeles de la receta que son tela: lo demás son avíos. */
const papelesDeTela = ["tela_principal", "combinacion", "forro"];

/**
 * Divide hacia el entero más cercano (la mitad hacia arriba) dos enteros no negativos.
 * @param numerador De cero en adelante.
 * @param denominador Mayor que cero.
 */
function redondear(numerador: bigint, denominador: bigint): bigint {
	return (numerador * 2n + denominador) / (denominador * 2n);
}

/**
 * La tela del corte: los metros de todos sus rollos y su importe, cada rollo a su costo por metro.
 * @param contexto El contexto de la consulta.
 * @param loteId El lote.
 */
async function telaDelCorte(contexto: ContextoDeConsulta, loteId: string) {
	const { rows } = await contexto.base.execute(sql`
		SELECT cr.metros_usados::text AS metros, coalesce(r.costo_metro_centavos, 0) AS costo
		FROM cortes c JOIN corte_telas ct ON ct.corte_id = c.id JOIN corte_rollos cr ON cr.corte_tela_id = ct.id
		JOIN rollos r ON r.id = cr.rollo_id WHERE c.lote_id = ${loteId}`);
	const rollos = z.array(z.object({ metros: z.string(), costo: z.coerce.number() })).parse(rows);
	const milesimos = rollos.reduce((suma, rollo) => suma + aMilesimos(rollo.metros), 0n);
	const importe = rollos.reduce(
		(suma, rollo) => suma + redondear(aMilesimos(rollo.metros) * BigInt(rollo.costo), 1000n),
		0n,
	);
	return { metros: cantidadEnTexto(milesimos), importe_centavos: Number(importe) };
}

/**
 * Los avíos de la receta con que se cortó, para las cortadas, a su costo de última compra.
 * @param contexto El contexto de la consulta.
 * @param lote El lote, su prenda y su versión de receta.
 */
async function aviosDelCorte(
	contexto: ContextoDeConsulta,
	lote: { id: string; productoId: string; recetaVersionId: string },
): Promise<number> {
	const material = deCalcularMaterial.parse(
		await contexto.lectura("patronaje.calcular_material", {
			producto_id: lote.productoId,
			piezas_por_talla: await piezasPorTallaDelLote(contexto, lote.id, "cortadas"),
			receta_version_id: lote.recetaVersionId,
		}),
	);
	const avios = material.materiales.filter((uno) => !papelesDeTela.includes(uno.papel));
	const costos = z
		.record(z.string(), z.number())
		.parse(await contexto.lectura("compras.costo_material", { material_ids: avios.map((avio) => avio.material_id) }));
	return avios.reduce((suma, avio) => suma + (avio.cantidad ?? 0) * (costos[avio.material_id] ?? 0), 0);
}

/**
 * La mano de obra: en proceso, las tarifas vigentes de las operaciones de su flujo por las cortadas; terminado, la
 * suma real de las tarifas de sus registros vigentes.
 * @param contexto El contexto de la consulta.
 * @param lote El lote, su flujo, su etapa y sus cortadas.
 */
async function manoDeObra(
	contexto: ContextoDeConsulta,
	lote: { id: string; flujoId: string; estado: string; cortadas: number },
) {
	const { rows } = await contexto.base.execute(sql`
		SELECT count(*)::int AS operaciones, coalesce(sum(t.tarifa_centavos), 0)::bigint AS por_pieza
		FROM flujo_operaciones f LEFT JOIN tarifas_operacion t ON t.flujo_operacion_id = f.id AND t.vigente_hasta IS NULL
		WHERE f.flujo_id = ${lote.flujoId} AND f.baja_en IS NULL`);
	const flujo = z.object({ operaciones: z.number(), por_pieza: z.coerce.number() }).parse(rows[0]);
	const estimada = lote.estado === "en_proceso";
	const { rows: reales } = await contexto.base.execute(sql`
		SELECT coalesce(sum(coalesce(tarifa_centavos, 0) * piezas_buenas), 0)::bigint AS importe
		FROM registros_operacion WHERE lote_id = ${lote.id} AND estado = 'vigente'`);
	const real = z.object({ importe: z.coerce.number() }).parse(reales[0]).importe;
	return {
		operaciones: flujo.operaciones,
		por_pieza_centavos: flujo.por_pieza,
		importe_centavos: estimada ? flujo.por_pieza * lote.cortadas : real,
		estimada,
	};
}

export const consultaCostoLote = implementarConsulta(costoDeLote, async (contexto, parametros) => {
	const { rows } = await contexto.base.execute(sql`
		SELECT l.id, l.folio, l.estado, l.producto_id, l.flujo_id, l.receta_version_id,
			(SELECT coalesce(sum(t.piezas_cortadas), 0) FROM lote_tallas t WHERE t.lote_id = l.id)::int AS cortadas
		FROM lotes l WHERE l.id = ${parametros.lote_id}`);
	const lote = z
		.object({
			id: z.uuid(),
			folio: z.string(),
			estado: z.string(),
			producto_id: z.uuid(),
			flujo_id: z.uuid().nullable(),
			receta_version_id: z.uuid().nullable(),
			cortadas: z.number(),
		})
		.optional()
		.parse(rows[0]);
	if (lote === undefined) throw noExiste();
	if (lote.flujo_id === null || lote.receta_version_id === null || lote.cortadas === 0) {
		throw errorDeRegla("lote_sin_cortar", `${lote.folio} todavía no se corta.`);
	}
	const tela = await telaDelCorte(contexto, lote.id);
	const avios = await aviosDelCorte(contexto, {
		id: lote.id,
		productoId: lote.producto_id,
		recetaVersionId: lote.receta_version_id,
	});
	const { quien } = contexto;
	const veSueldos = quien.tipo === "cuenta" && (quien.esDuena || quien.permisosFinos.includes("ven_sueldos_y_tarifas"));
	if (!veSueldos) {
		return {
			resultado: { cortadas: lote.cortadas, tela, avios: { importe_centavos: avios } },
			recortado: ["mano_de_obra", "total_centavos", "costo_por_pieza_centavos"],
		};
	}
	const mano = await manoDeObra(contexto, {
		id: lote.id,
		flujoId: lote.flujo_id,
		estado: lote.estado,
		cortadas: lote.cortadas,
	});
	const total = tela.importe_centavos + avios + mano.importe_centavos;
	return {
		resultado: {
			cortadas: lote.cortadas,
			tela,
			avios: { importe_centavos: avios },
			mano_de_obra: mano,
			total_centavos: total,
			costo_por_pieza_centavos: Number(redondear(BigInt(total), BigInt(lote.cortadas))),
		},
	};
});
