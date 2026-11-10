/**
 * Los contadores de folio de la siembra: un renglón por tipo de documento, con su formato.
 * Fase 4 · docs/modulos/admin/folios.md («La siembra»)
 *
 * El prefijo de un tipo con alcance lleva dónde va el alcance: `{año}` (OP-, L-), `{T}` (el prefijo del
 * aparato) o `{tipo}` (el tipo de máquina). Su renglón de la siembra, con alcance vacío, es la plantilla:
 * el contador de cada alcance nace de él la primera vez que se pide.
 */

import { v7 as uuidv7 } from "uuid";
import type { Semilla } from "../../../nucleo/base/siembra.ts";
import { contadoresFolio } from "../tablas.ts";

/** Un tipo de folio de la siembra. */
interface TipoDeFolio {
	tipo: string;
	prefijo: string;
	digitos: number;
	asigna: "servidor" | "aparato";
	modulo: string;
	minimo?: number;
	maximo?: number;
}

/** Los tipos de folio y su formato. */
const tiposDeFolio: readonly TipoDeFolio[] = [
	{ tipo: "pedido", prefijo: "PE-", digitos: 4, asigna: "servidor", modulo: "ventas" },
	{ tipo: "nota_entrega", prefijo: "NV-", digitos: 4, asigna: "servidor", modulo: "ventas" },
	{ tipo: "nota_credito", prefijo: "NC-", digitos: 4, asigna: "servidor", modulo: "ventas" },
	{ tipo: "orden_produccion", prefijo: "OP-{año}-", digitos: 3, asigna: "servidor", modulo: "produccion" },
	{ tipo: "lote", prefijo: "L-{año}-", digitos: 3, asigna: "servidor", modulo: "produccion" },
	{ tipo: "rollo", prefijo: "R-", digitos: 4, asigna: "servidor", modulo: "inventario" },
	{ tipo: "partida", prefijo: "P-", digitos: 4, asigna: "servidor", modulo: "inventario" },
	{ tipo: "retazo", prefijo: "RZ-", digitos: 3, asigna: "servidor", modulo: "inventario" },
	{ tipo: "orden_compra", prefijo: "OC-", digitos: 4, asigna: "servidor", modulo: "compras" },
	{ tipo: "factura_proveedor", prefijo: "FP-", digitos: 4, asigna: "servidor", modulo: "contaduria" },
	{ tipo: "pago", prefijo: "PG-", digitos: 4, asigna: "servidor", modulo: "contaduria" },
	{ tipo: "gasto", prefijo: "G-", digitos: 4, asigna: "servidor", modulo: "contaduria" },
	{ tipo: "deuda", prefijo: "PR-", digitos: 2, asigna: "servidor", modulo: "contaduria" },
	{ tipo: "deposito_pasarela", prefijo: "MP-", digitos: 4, asigna: "servidor", modulo: "contaduria" },
	{ tipo: "autorizacion", prefijo: "AU-", digitos: 4, asigna: "servidor", modulo: "direccion" },
	{ tipo: "ajuste", prefijo: "AJ-", digitos: 4, asigna: "servidor", modulo: "inventario" },
	{ tipo: "conteo", prefijo: "CN-", digitos: 3, asigna: "servidor", modulo: "inventario" },
	{ tipo: "diferencia", prefijo: "DF-", digitos: 3, asigna: "servidor", modulo: "inventario" },
	{ tipo: "partida_aduana", prefijo: "A-", digitos: 2, asigna: "servidor", modulo: "inventario" },
	{ tipo: "despacho", prefijo: "D-", digitos: 4, asigna: "servidor", modulo: "inventario" },
	{ tipo: "reabasto", prefijo: "RB-", digitos: 3, asigna: "servidor", modulo: "inventario" },
	{ tipo: "envio_tienda", prefijo: "SE-", digitos: 4, asigna: "servidor", modulo: "inventario" },
	{ tipo: "pedido_linea", prefijo: "W-", digitos: 4, asigna: "servidor", modulo: "linea" },
	{ tipo: "devolucion_linea", prefijo: "DL-", digitos: 4, asigna: "servidor", modulo: "linea" },
	{ tipo: "solicitud_distribuidor", prefijo: "SD-", digitos: 4, asigna: "servidor", modulo: "linea" },
	{ tipo: "desarrollo", prefijo: "DS-", digitos: 3, asigna: "servidor", modulo: "patronaje" },
	{ tipo: "reclamo", prefijo: "RC-", digitos: 3, asigna: "servidor", modulo: "calidad" },
	{ tipo: "falla", prefijo: "FM-", digitos: 4, asigna: "servidor", modulo: "mantenimiento" },
	{ tipo: "servicio", prefijo: "SM-", digitos: 4, asigna: "servidor", modulo: "mantenimiento" },
	{ tipo: "maquina", prefijo: "{tipo}-", digitos: 2, asigna: "servidor", modulo: "mantenimiento" },
	{ tipo: "persona", prefijo: "E-", digitos: 3, asigna: "servidor", modulo: "personal" },
	{ tipo: "dispositivo", prefijo: "DV-", digitos: 2, asigna: "servidor", modulo: "admin" },
	{
		tipo: "codigo_barras",
		prefijo: "",
		digitos: 6,
		asigna: "servidor",
		modulo: "catalogo",
		minimo: 100001,
		maximo: 499999,
	},
	{ tipo: "solicitud_tienda", prefijo: "S-{T}-", digitos: 3, asigna: "aparato", modulo: "inventario" },
	{ tipo: "salida_tienda", prefijo: "E-{T}-", digitos: 4, asigna: "aparato", modulo: "inventario" },
	{ tipo: "conteo_tienda", prefijo: "CN-{T}-", digitos: 3, asigna: "aparato", modulo: "inventario" },
	{ tipo: "corte_caja", prefijo: "C{T}-", digitos: 4, asigna: "aparato", modulo: "tiendas" },
	{ tipo: "venta_tienda", prefijo: "{T}-", digitos: 6, asigna: "aparato", modulo: "tiendas" },
	{ tipo: "apartado_tienda", prefijo: "AP-{T}-", digitos: 4, asigna: "aparato", modulo: "tiendas" },
	{ tipo: "pedido_especial_tienda", prefijo: "PE-{T}-", digitos: 4, asigna: "aparato", modulo: "tiendas" },
	{ tipo: "merma_tienda", prefijo: "MR-{T}-", digitos: 3, asigna: "aparato", modulo: "tiendas" },
	{ tipo: "movimiento_caja", prefijo: "MC-{T}-", digitos: 4, asigna: "aparato", modulo: "tiendas" },
];

/** La siembra de `contadores_folio`: cada tipo con alcance vacío, empezando en su mínimo. */
export const semillaDeContadores: Semilla = {
	tabla: contadoresFolio,
	filas: tiposDeFolio.map((tipo) => ({
		id: uuidv7(),
		tipo: tipo.tipo,
		alcance: "",
		prefijo: tipo.prefijo,
		siguiente: tipo.minimo ?? 1,
		digitos: tipo.digitos,
		minimo: tipo.minimo ?? 1,
		maximo: tipo.maximo ?? null,
		asigna: tipo.asigna,
		modulo: tipo.modulo,
	})),
};
