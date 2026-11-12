/**
 * Las diferencias DF-: cómo nace una y cómo se toma una para aclararla, contarla o ajustarla.
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md (reglas 1 a 3, «Cómo nace una DF-», «Estados»)
 *
 * `abrirDiferencia` corre en la transacción de quien la llama (recibir en aduana, recibir un despacho, la recepción
 * del taller, entregar al corte y el cuadre), como `escribirMovimiento`: ningún otro módulo la llama.
 */

import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { diferencias, type origenesDeDiferencia } from "../tablas.ts";

/** Dónde nace una diferencia. */
export type OrigenDeDiferencia = (typeof origenesDeDiferencia)[number];

/** Lo que dice el hueco: de prenda (piezas con signo) o de material (cantidad con signo, en su unidad). */
export type HuecoDeDiferencia =
	| { varianteId: string; piezas: number; sistemaDecia?: number | null }
	| { materialId: string; rolloId?: string | null; cantidad: string };

/** Lo que se pide para abrir una diferencia. */
export interface PedidoDeDiferencia {
	origen: OrigenDeDiferencia;
	/** El hueco: la ubicación donde está lo pendiente (puede ser un tramo o el Taller). */
	ubicacionId: string;
	/** Quién responde (regla 2). */
	aCargoUbicacionId: string;
	hueco: HuecoDeDiferencia;
	/** El texto que se ve: «Aduana mandó 24 en D-0412 y Bodega recibió 22». */
	descripcion: string;
	/** Lo que la destapó. */
	traspasoId?: string | null;
	traspasoLineaId?: string | null;
	recepcionId?: string | null;
	loteId?: string | null;
	entregaCorteId?: string | null;
	movimientoId?: string | null;
	cuadreId?: string | null;
}

/** Una diferencia recién abierta. */
export interface DiferenciaAbierta {
	diferenciaId: string;
	folio: string;
}

/**
 * El estado con que nace una diferencia, y al que regresa si Dirección rechaza su ajuste: se cuentan las de prenda
 * del cuadre y de «No la encuentro»; se aclaran las de recepción, las de material y las del cuadre en material.
 * @param origen Dónde nació.
 * @param esMaterial Si es de material.
 */
export function estadoDeNacimiento(origen: OrigenDeDiferencia, esMaterial: boolean): "por_contar" | "por_aclarar" {
	if (esMaterial) return "por_aclarar";
	return origen === "recepcion" || origen === "recepcion_taller" || origen === "material_corte"
		? "por_aclarar"
		: "por_contar";
}

/**
 * Abre una diferencia: toma su folio DF-, la escribe con su estado de nacimiento, su texto, a cargo de quién y lo que
 * la destapó, y guarda `diferencia.creada`.
 * @param contexto El contexto de la acción que la destapó.
 * @param pedido Dónde nace, el hueco, el texto y lo que la destapó.
 * @returns La diferencia y su folio.
 */
export async function abrirDiferencia(
	contexto: ContextoDeAccion,
	pedido: PedidoDeDiferencia,
): Promise<DiferenciaAbierta> {
	const { folio } = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "diferencia" }));
	const diferenciaId = uuidv7();
	const { hueco } = pedido;
	const esMaterial = "materialId" in hueco;
	await contexto.transaccion.insert(diferencias).values({
		id: diferenciaId,
		folio,
		origen: pedido.origen,
		ubicacionId: pedido.ubicacionId,
		...(esMaterial
			? { materialId: hueco.materialId, rolloId: hueco.rolloId ?? null, cantidad: hueco.cantidad }
			: { varianteId: hueco.varianteId, piezas: hueco.piezas, sistemaDecia: hueco.sistemaDecia ?? null }),
		descripcion: pedido.descripcion,
		aCargoUbicacionId: pedido.aCargoUbicacionId,
		traspasoId: pedido.traspasoId ?? null,
		traspasoLineaId: pedido.traspasoLineaId ?? null,
		recepcionId: pedido.recepcionId ?? null,
		loteId: pedido.loteId ?? null,
		entregaCorteId: pedido.entregaCorteId ?? null,
		movimientoId: pedido.movimientoId ?? null,
		cuadreId: pedido.cuadreId ?? null,
		estado: estadoDeNacimiento(pedido.origen, esMaterial),
		creadoPor: quienCambia(contexto),
	});
	contexto.guardarEvento({
		tipo: "diferencia.creada",
		datos: { diferencia_id: diferenciaId },
		tablas: ["diferencias"],
		entidad: "diferencias",
		entidadId: diferenciaId,
		entidadFolio: folio,
	});
	return { diferenciaId, folio };
}

/** Una diferencia como la lee quien la aclara, la cuenta o la ajusta. */
export type Diferencia = typeof diferencias.$inferSelect;

/**
 * Bloquea unas diferencias en orden por id y las lee: dos aclaraciones del mismo par de espejos, o una aclaración y un
 * conteo de la misma, se ponen en fila y la segunda ve lo que dejó la primera.
 * @param contexto El contexto de la acción.
 * @param ids Las diferencias.
 * @returns Las que existen, en el orden en que se pidieron.
 */
export async function diferenciasBloqueadas(contexto: ContextoDeAccion, ids: readonly string[]): Promise<Diferencia[]> {
	const ordenados = [...new Set(ids)].sort();
	for (const id of ordenados) {
		await contexto.transaccion.execute(sql`SELECT 1 FROM diferencias WHERE id = ${id} FOR NO KEY UPDATE`);
	}
	const leidas: Diferencia[] = [];
	for (const id of ids) {
		const [diferencia] = await contexto.transaccion.select().from(diferencias).where(eq(diferencias.id, id));
		if (diferencia !== undefined) leidas.push(diferencia);
	}
	return leidas;
}

/**
 * Lee una diferencia, bloqueada.
 * @throws `404` si no existe.
 */
export async function diferenciaBloqueada(contexto: ContextoDeAccion, id: string): Promise<Diferencia> {
	const [diferencia] = await diferenciasBloqueadas(contexto, [id]);
	if (diferencia === undefined) throw noExiste();
	return diferencia;
}
