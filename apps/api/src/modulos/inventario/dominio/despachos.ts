/**
 * Lo que comparten el despacho y sus pantallas: qué traspasos salen con etiquetas, por qué uno no sale por despacho y
 * qué órdenes tienen lo de más esperando regresar al proveedor. La acción lo revisa; el cajón de Aduana lo dice antes.
 * Fase 11 · docs/modulos/inventario/surtido-y-despachos.md (reglas 4 y 8)
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Despacho»)
 */

import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { tiposDeDevolucionDeCliente } from "../internas/devoluciones.ts";
import { traspasos } from "../tablas.ts";
import { ubicacionDeTipo } from "./recepciones.ts";

/**
 * Los tipos de traspaso que salen con etiquetas: los lotes, los reprocesos y los rollos de un proveedor. Es la lista de
 * `inventario.marcar_etiquetas_impresas`, y con ella la pantalla de Aduana dice qué tiene etiquetas por imprimir.
 */
export const tiposConEtiquetas: ReadonlySet<string> = new Set([
	"lote_cliente",
	"lote_reabasto",
	"lote_temporada",
	"lote_pedido_especial",
	"reproceso",
	"material_proveedor",
]);

/** Lo que hace falta de un traspaso para saber si sale por despacho. */
export interface TraspasoPorDespachar {
	folio: string;
	estado: string;
	tipo: string;
	destinoExterno: string | null;
	/** Si nació de otro (un hijo con destino); lo de un cliente sin padre espera a Calidad. */
	tienePadre: boolean;
	tieneNotaDeEntrega: boolean;
}

/** Por qué un traspaso no sale por despacho: su código de la acción y su texto. */
export interface PorQueNoSale {
	codigo: "no_esta_en_aduana" | "se_empaca" | "es_devolucion_proveedor" | "espera_calidad" | "sin_nota";
	mensaje: string;
}

/**
 * Por qué un traspaso no puede salir por despacho (regla 4), sin leer la base.
 * @param traspaso Lo que se sabe del traspaso.
 * @returns El motivo, o `null` si sale (falta revisar aparte que su orden no tenga lo de más esperando regresar).
 */
export function porQueNoSale(traspaso: TraspasoPorDespachar): PorQueNoSale | null {
	if (traspaso.estado !== "en_aduana")
		return { codigo: "no_esta_en_aduana", mensaje: `${traspaso.folio} no está en aduana.` };
	if (traspaso.tipo === "pedido_linea" || traspaso.destinoExterno === "cliente_linea") {
		return { codigo: "se_empaca", mensaje: "Los pedidos en línea no se despachan: salen al empacarlos" };
	}
	if (traspaso.tipo === "devolucion_proveedor" || traspaso.destinoExterno === "proveedor") {
		return {
			codigo: "es_devolucion_proveedor",
			mensaje: "Lo de más que regresa al proveedor sale con «Devolver al proveedor».",
		};
	}
	// Lo que regresó de un cliente con defecto se queda en el padre, sin destino, hasta que Calidad lo revisa.
	if (
		traspaso.tipo === "devolucion_defecto" ||
		(tiposDeDevolucionDeCliente.some((tipo) => tipo === traspaso.tipo) && !traspaso.tienePadre)
	) {
		return { codigo: "espera_calidad", mensaje: `${traspaso.folio} espera la revisión de Calidad` };
	}
	if (
		traspaso.destinoExterno === "cliente_externo" &&
		(traspaso.tipo !== "nota_entrega" || !traspaso.tieneNotaDeEntrega)
	) {
		return { codigo: "sin_nota", mensaje: "Sin nota de entrega no sale" };
	}
	return null;
}

/**
 * Las órdenes de compra con lo de más esperando regresar al proveedor desde aduana: la que nació ahí y no ha salido, o
 * la que Bodega ya surtió y Aduana recibió. Su A- de material no sale mientras tanto.
 * @param transaccion La transacción.
 * @param ordenIds Solo estas órdenes; sin ellas, todas.
 */
export async function ordenesConDevolucionPendiente(
	transaccion: Transaccion,
	ordenIds?: readonly string[],
): Promise<Set<string>> {
	if (ordenIds !== undefined && ordenIds.length === 0) return new Set();
	const aduana = await ubicacionDeTipo(transaccion, "aduana");
	const pendientes = await transaccion
		.selectDistinct({ ordenCompraId: traspasos.ordenCompraId })
		.from(traspasos)
		.where(
			and(
				eq(traspasos.tipo, "devolucion_proveedor"),
				isNotNull(traspasos.ordenCompraId),
				ordenIds === undefined ? undefined : inArray(traspasos.ordenCompraId, [...ordenIds]),
				or(
					and(eq(traspasos.estado, "esperado"), eq(traspasos.origenUbicacionId, aduana)),
					eq(traspasos.estado, "en_aduana"),
				),
			),
		);
	return new Set(pendientes.flatMap((fila) => (fila.ordenCompraId === null ? [] : [fila.ordenCompraId])));
}

/**
 * El texto de un A- de material que espera a que lo de más de su orden regrese al proveedor.
 * @param orden El folio de la orden, si se sabe.
 */
export function textoDeDevolucionPendiente(orden: string | null | undefined): string {
	return `Primero regresa al proveedor lo de más de ${orden ?? "la orden"}.`;
}
