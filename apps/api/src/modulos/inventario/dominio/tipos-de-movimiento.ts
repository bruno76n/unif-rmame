/**
 * Las reglas de cada tipo de movimiento: de dónde a dónde va cada renglón y si mueve prendas, material o los dos.
 * Fase 9 · docs/modulos/inventario/libro-de-movimientos.md («Los tipos de movimiento»)
 *
 * Fuera es un lado vacío. `reversion` no está aquí: sus renglones son los del original al revés.
 */

import type { TipoDeMovimiento } from "../tablas.ts";

/** El tipo de una ubicación, o Fuera (proveedores, clientes, consumo y merma). */
export type Lado = "aduana" | "bodega" | "tienda" | "taller" | "transito" | "en_camino_aduana" | "fuera";

/** Lo que puede mover un tipo: prendas (variante y piezas), material (material y cantidad) o los dos. */
export type Forma = "prenda" | "material" | "las_dos";

/** La regla de un tipo: sus caminos posibles (de qué lados a qué lados) y su forma. */
export interface ReglaDeTipo {
	caminos: readonly (readonly [readonly Lado[], readonly Lado[]])[];
	forma: Forma;
}

/** Las siete ubicaciones de inventario. */
const todas: readonly Lado[] = ["aduana", "bodega", "tienda", "taller", "transito", "en_camino_aduana"];

/** Un solo camino. */
function de(origen: readonly Lado[], destino: readonly Lado[], forma: Forma): ReglaDeTipo {
	return { caminos: [[origen, destino]], forma };
}

/** Las reglas, por tipo (sin `reversion`). */
export const reglasDeTipo: Readonly<Record<Exclude<TipoDeMovimiento, "reversion">, ReglaDeTipo>> = {
	// Prendas.
	// Un consumible se carga donde lo toma el taller (`inventario.ubicacion_consumibles`), que puede ser el Taller.
	carga_inicial: de(["fuera"], ["bodega", "aduana", "tienda", "taller"], "las_dos"),
	venta_tienda: de(["tienda"], ["fuera"], "prenda"),
	devolucion_mostrador: de(["fuera"], ["tienda"], "prenda"),
	merma_tienda: de(["tienda"], ["fuera"], "prenda"),
	salida_tienda: de(["tienda"], ["en_camino_aduana"], "prenda"),
	surtido_bodega: de(["bodega"], ["en_camino_aduana"], "las_dos"),
	recepcion_aduana: de(["en_camino_aduana"], ["aduana"], "las_dos"),
	piezas_cortadas: de(["fuera"], ["taller"], "prenda"),
	merma_produccion: de(["taller"], ["fuera"], "prenda"),
	recepcion_taller: de(["taller"], ["aduana"], "prenda"),
	recepcion_reproceso: de(["taller"], ["aduana"], "prenda"),
	despacho: de(["aduana"], ["transito"], "las_dos"),
	recepcion_despacho: de(["transito"], ["bodega", "tienda"], "las_dos"),
	entrega_cliente_externo: de(["transito"], ["fuera"], "prenda"),
	entrega_tienda_sin_caja: de(["transito"], ["fuera"], "prenda"),
	salida_linea: de(["aduana"], ["fuera"], "prenda"),
	devolucion_cliente_externo: de(["fuera"], ["aduana"], "prenda"),
	devolucion_linea: de(["fuera"], ["aduana"], "prenda"),
	merma_calidad: de(["aduana"], ["fuera"], "prenda"),
	// Material.
	recepcion_proveedor: de(["fuera"], ["aduana"], "material"),
	devolucion_proveedor: de(["aduana"], ["fuera"], "material"),
	entrega_corte: de(["bodega"], ["taller"], "material"),
	consumo_corte: de(["taller"], ["fuera"], "material"),
	merma_corte: de(["taller"], ["fuera"], "material"),
	regreso_rollo: de(["taller"], ["bodega"], "material"),
	regreso_retazo: de(["taller"], ["bodega"], "material"),
	consumo_avios: de(["taller"], ["fuera"], "material"),
	// La ubicación de los consumibles es un parámetro (`inventario.ubicacion_consumibles`, Bodega al inicio).
	consumible_tomado: de(["bodega", "taller", "aduana"], ["fuera"], "material"),
	// De los dos.
	ajuste: {
		caminos: [
			[todas, ["fuera"]],
			[["fuera"], todas],
		],
		forma: "las_dos",
	},
	// Fuera es el lugar que recibió lo entregado a una tienda sin caja: esa entrega ya salió del inventario.
	aclaracion_recepcion: {
		caminos: [
			[
				["transito", "en_camino_aduana", "taller"],
				[...todas, "fuera"],
			],
			[
				[...todas, "fuera"],
				["transito", "en_camino_aduana", "taller"],
			],
		],
		forma: "las_dos",
	},
};

/**
 * Dice si un renglón va por un camino de su tipo.
 * @param regla La regla del tipo.
 * @param origen El lado de donde sale.
 * @param destino El lado a donde llega.
 */
export function vaPorSuCamino(regla: ReglaDeTipo, origen: Lado, destino: Lado): boolean {
	return regla.caminos.some(([origenes, destinos]) => origenes.includes(origen) && destinos.includes(destino));
}
