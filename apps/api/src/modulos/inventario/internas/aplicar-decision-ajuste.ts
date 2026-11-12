/**
 * `inventario.aplicar_decision_ajuste`: el efecto que Inventario registra para el tipo `ajuste_inventario`.
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md (reglas 6 y 7, «`inventario.aplicar_decision_ajuste`»)
 *
 * Autorizado, mueve lo guardado en los renglones del AJ-, nunca contra la existencia de hoy: lo que entra, de Fuera a
 * la ubicación; lo que sale, de la ubicación a Fuera; con su traspaso en un tramo y su lote en el Taller. Rechazado,
 * la existencia no cambia y sus DF- regresan a como estaban antes de pedirlo. Corre en la transacción de la decisión,
 * con un contexto sin bitácora: el renglón es el de Dirección.
 */

import { aMilesimosConSigno, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { tomarCandadosDeInventario } from "../dominio/candados.ts";
import { estadoDeNacimiento } from "../dominio/diferencias.ts";
import { escribirMovimiento, type RenglonDeMovimiento } from "../dominio/escribir-movimiento.ts";
import { ajusteLineas, ajustes, diferencias } from "../tablas.ts";

/** Lo que manda `direccion.decidir_autorizacion` al efecto. */
const decisionDeAjuste = z
	.object({
		autorizacion_id: z.uuid(),
		decision: z.enum(["autorizar", "rechazar"]),
		ajuste_id: z.uuid(),
		motivo: z.string().optional(),
	})
	.passthrough();

/**
 * Un renglón del ajuste como renglón del movimiento: con signo, + entra de Fuera, − sale a Fuera.
 * @param ubicacionId La ubicación del ajuste.
 * @param linea El renglón guardado.
 */
function renglonDelAjuste(ubicacionId: string, linea: typeof ajusteLineas.$inferSelect): RenglonDeMovimiento {
	const ligas = { traspasoId: linea.traspasoId, loteId: linea.loteId };
	if (linea.varianteId !== null) {
		const piezas = linea.piezasDiferencia ?? 0;
		return {
			...ligas,
			origen: piezas > 0 ? null : ubicacionId,
			destino: piezas > 0 ? ubicacionId : null,
			varianteId: linea.varianteId,
			piezas: Math.abs(piezas),
		};
	}
	const milesimos = aMilesimosConSigno(linea.cantidadDiferencia ?? "0");
	return {
		traspasoId: linea.traspasoId,
		origen: milesimos > 0n ? null : ubicacionId,
		destino: milesimos > 0n ? ubicacionId : null,
		materialId: linea.materialId ?? "",
		rolloId: linea.rolloId,
		cantidad: deMilesimos(milesimos < 0n ? -milesimos : milesimos),
	};
}

/**
 * Aplica la decisión de Dirección sobre un AJ-.
 * @param contexto El contexto de la decisión, sin bitácora (la escribe Dirección).
 * @param datos La autorización, la decisión, el AJ- y el motivo si se rechaza.
 * @returns El mensaje y el estado del AJ- antes y después, para la bitácora de Dirección.
 * @throws Error (un error del programa) si el AJ- no espera autorización: la AU- se decide una sola vez.
 */
export async function aplicarDecisionAjuste(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = decisionDeAjuste.parse(datos);
	const { transaccion } = contexto;
	// Los renglones no cambian: con ellos se toman primero los candados del inventario, en el orden fijo.
	const lineas = await transaccion
		.select()
		.from(ajusteLineas)
		.where(eq(ajusteLineas.ajusteId, pedido.ajuste_id))
		.orderBy(asc(ajusteLineas.renglon));
	await tomarCandadosDeInventario(transaccion, {
		varianteIds: lineas.flatMap((linea) => (linea.varianteId === null ? [] : [linea.varianteId])),
		traspasoIds: lineas.flatMap((linea) => (linea.traspasoId === null ? [] : [linea.traspasoId])),
	});
	const [ajuste] = await transaccion.select().from(ajustes).where(eq(ajustes.id, pedido.ajuste_id)).for("update");
	if (ajuste === undefined || ajuste.estado !== "esperando_autorizacion") {
		throw new Error(`el ajuste ${pedido.ajuste_id} no espera autorización`);
	}
	const suyas = await transaccion
		.select({
			id: diferencias.id,
			folio: diferencias.folio,
			origen: diferencias.origen,
			materialId: diferencias.materialId,
		})
		.from(diferencias)
		.where(eq(diferencias.ajusteId, ajuste.id))
		.orderBy(asc(diferencias.id))
		.for("no key update");
	const decidido = { decididoEn: contexto.ahora.toString(), decididoPor: quienCambia(contexto) };
	if (pedido.decision === "rechazar") {
		await transaccion
			.update(ajustes)
			.set({ ...decidido, estado: "rechazado", motivoRechazo: pedido.motivo ?? "" })
			.where(eq(ajustes.id, ajuste.id));
		// Cada DF- regresa a como estaba antes de pedirlo: a contar, o a aclarar.
		for (const diferencia of suyas) {
			await transaccion
				.update(diferencias)
				.set({ estado: estadoDeNacimiento(diferencia.origen, diferencia.materialId !== null), ajusteId: null })
				.where(eq(diferencias.id, diferencia.id));
		}
		contexto.guardarEvento({
			tipo: "ajuste.rechazado",
			datos: { ajuste_id: ajuste.id },
			tablas: ["ajustes", "diferencias"],
			entidad: "ajustes",
			entidadId: ajuste.id,
			entidadFolio: ajuste.folio,
		});
		return {
			mensaje: `${ajuste.folio} rechazado`,
			antes: { ajuste: ajuste.folio, estado: ajuste.estado },
			despues: { ajuste: ajuste.folio, estado: "rechazado", diferencias: suyas.map((suya) => suya.folio) },
		};
	}
	const movimiento = await escribirMovimiento(contexto, {
		tipo: "ajuste",
		documento: { tipo: "ajuste", id: ajuste.id, folio: ajuste.folio },
		renglones: lineas.map((linea) => renglonDelAjuste(ajuste.ubicacionId, linea)),
	});
	await transaccion
		.update(ajustes)
		.set({ ...decidido, estado: "autorizado", movimientoId: movimiento.movimientoId })
		.where(eq(ajustes.id, ajuste.id));
	for (const diferencia of suyas) {
		await transaccion
			.update(diferencias)
			.set({
				estado: "resuelta",
				resolucion: "ajuste",
				resueltaEn: decidido.decididoEn,
				resueltaPor: decidido.decididoPor,
			})
			.where(eq(diferencias.id, diferencia.id));
		contexto.guardarEvento({
			tipo: "diferencia.resuelta",
			datos: { diferencia_id: diferencia.id },
			tablas: ["diferencias"],
			entidad: "diferencias",
			entidadId: diferencia.id,
			entidadFolio: diferencia.folio,
		});
	}
	contexto.guardarEvento({
		tipo: "ajuste.autorizado",
		datos: { ajuste_id: ajuste.id, movimiento_id: movimiento.movimientoId },
		tablas: ["ajustes", "diferencias", ...movimiento.tablas],
		entidad: "ajustes",
		entidadId: ajuste.id,
		entidadFolio: ajuste.folio,
	});
	return {
		mensaje: `${ajuste.folio} autorizado: se movió la diferencia`,
		antes: { ajuste: ajuste.folio, estado: ajuste.estado },
		despues: { ajuste: ajuste.folio, estado: "autorizado", diferencias: suyas.map((suya) => suya.folio) },
	};
}
