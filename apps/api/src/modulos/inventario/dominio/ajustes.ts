/**
 * Los ajustes AJ-: el motivo de la lista y cómo se pide uno a Dirección, con la diferencia que se vio.
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md (reglas 6 a 8, «La tabla `ajustes`», «La tabla
 * `ajuste_lineas`») y conteos.md (regla 3)
 *
 * Los usan «Aclarar» (una DF- perdida o con ajuste) y «Guardar conteo» (lo que no cuadró). El ajuste guarda lo que
 * se vio, renglón por renglón, y no cambia: al autorizarlo se mueve eso, nunca la existencia de ese momento.
 */

import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeCampo } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { listas, listaValores } from "../../admin/tablas.ts";
import { listaDeMotivosAjuste } from "../siembra.ts";
import { ajusteLineas, ajustes, ubicaciones } from "../tablas.ts";

/**
 * Revisa que el motivo sea uno vigente de «Motivos de ajuste».
 * @param contexto El contexto de la acción.
 * @param motivoId El motivo que se escogió, o nada.
 * @param campo El campo donde se escoge.
 * @throws `400` en el campo: «Todo ajuste necesita motivo», si no viene o no es de la lista.
 */
export async function revisarMotivoDeAjuste(
	contexto: ContextoDeAccion,
	motivoId: string | undefined,
	campo = "motivo_id",
): Promise<string> {
	const [motivo] =
		motivoId === undefined
			? []
			: await contexto.transaccion
					.select({ id: listaValores.id })
					.from(listaValores)
					.innerJoin(listas, eq(listas.id, listaValores.listaId))
					.where(
						and(eq(listaValores.id, motivoId), eq(listas.clave, listaDeMotivosAjuste), isNull(listaValores.bajaEn)),
					);
	if (motivo === undefined) throw errorDeCampo(campo, "Todo ajuste necesita motivo");
	return motivo.id;
}

/** Un renglón de un ajuste: la diferencia que se vio, con signo (+ entra, − sale), y de dónde salió. */
export type RenglonDeAjuste = {
	diferenciaId?: string | null;
	conteoLineaId?: string | null;
	traspasoId?: string | null;
	loteId?: string | null;
} & (
	| { varianteId: string; piezas: number; piezasSistema?: number; piezasContadas?: number }
	| { materialId: string; rolloId: string | null; cantidad: string }
);

/** Lo que se pide para un ajuste. */
export interface PedidoDeAjuste {
	ubicacionId: string;
	origen: "conteo" | "diferencia_recepcion" | "diferencia_material";
	conteoId?: string;
	diferenciaId?: string;
	motivoId: string;
	motivoTexto?: string | undefined;
	/** El departamento de la pantalla que lo pide: `bodega` o `aduana`. */
	departamento: "bodega" | "aduana";
	renglones: readonly RenglonDeAjuste[];
}

/** Un ajuste recién pedido. */
export interface AjustePedido {
	ajusteId: string;
	folio: string;
	/** «AJ-0046: 1 diferencia espera autorización de Dirección». */
	mensaje: string;
}

/**
 * Pide un ajuste: toma su folio AJ-, lo escribe `esperando_autorizacion` con sus renglones, pide a Dirección la
 * autorización `ajuste_inventario` y le pone su AU-, en la misma transacción. Guarda `ajuste.pedido`.
 * @param contexto El contexto de la acción.
 * @param pedido La ubicación, el origen, el motivo y los renglones (al menos uno).
 * @returns El ajuste, su folio y el mensaje para quien lo pidió.
 */
export async function pedirAjuste(contexto: ContextoDeAccion, pedido: PedidoDeAjuste): Promise<AjustePedido> {
	const { transaccion } = contexto;
	if (pedido.renglones.length === 0) throw new Error("un ajuste sin renglones");
	const { folio } = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "ajuste" }));
	const ajusteId = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(ajustes).values({
		id: ajusteId,
		folio,
		ubicacionId: pedido.ubicacionId,
		origen: pedido.origen,
		conteoId: pedido.conteoId ?? null,
		diferenciaId: pedido.diferenciaId ?? null,
		motivoId: pedido.motivoId,
		motivoTexto: pedido.motivoTexto === undefined || pedido.motivoTexto === "" ? null : pedido.motivoTexto,
		creadoPor: quien,
	});
	await transaccion.insert(ajusteLineas).values(
		pedido.renglones.map((renglon, i) => ({
			id: uuidv7(),
			ajusteId,
			renglon: i + 1,
			diferenciaId: renglon.diferenciaId ?? null,
			conteoLineaId: renglon.conteoLineaId ?? null,
			traspasoId: renglon.traspasoId ?? null,
			loteId: renglon.loteId ?? null,
			...("varianteId" in renglon
				? {
						varianteId: renglon.varianteId,
						piezasDiferencia: renglon.piezas,
						piezasSistema: renglon.piezasSistema ?? null,
						piezasContadas: renglon.piezasContadas ?? null,
					}
				: { materialId: renglon.materialId, rolloId: renglon.rolloId, cantidadDiferencia: renglon.cantidad }),
			creadoPor: quien,
		})),
	);
	const [ubicacion] = await transaccion
		.select({ nombre: ubicaciones.nombre })
		.from(ubicaciones)
		.where(eq(ubicaciones.id, pedido.ubicacionId));
	const n = pedido.renglones.length;
	const cuantas = n === 1 ? "1 diferencia" : `${n} diferencias`;
	const { autorizacion_id } = z.object({ autorizacion_id: z.uuid() }).parse(
		await contexto.interna("direccion.pedir_autorizacion", {
			tipo: "ajuste_inventario",
			departamento_origen: pedido.departamento,
			resumen: `Ajuste ${folio} en ${ubicacion?.nombre ?? ""}: ${cuantas}`,
			documento: folio,
			ajuste_id: ajusteId,
		}),
	);
	await transaccion.update(ajustes).set({ autorizacionId: autorizacion_id }).where(eq(ajustes.id, ajusteId));
	contexto.guardarEvento({
		tipo: "ajuste.pedido",
		datos: { ajuste_id: ajusteId },
		tablas: ["ajustes", "ajuste_lineas"],
		entidad: "ajustes",
		entidadId: ajusteId,
		entidadFolio: folio,
	});
	return {
		ajusteId,
		folio,
		mensaje: `${folio}: ${cuantas} ${n === 1 ? "espera" : "esperan"} autorización de Dirección`,
	};
}
