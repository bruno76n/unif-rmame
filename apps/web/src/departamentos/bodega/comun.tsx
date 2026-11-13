/**
 * Lo que comparten las pestañas, los cajones y las ventanas de Bodega: las consultas que cambian con sus acciones (y
 * `useEnvio` con ellas), la variante en dos renglones y las cifras con su separador de miles.
 * Fase 19 · docs/interfaz/fabrica/bodega.md y docs/interfaz/comunes.md («Los estados de una pantalla»: choque de versión)
 */

import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { useEnvio as useEnvioComun } from "../../comun/envio.ts";

/** Todas las consultas que cambian con una acción de Bodega. */
export const consultasDeBodega = [
	"inventario.bodega_pendientes",
	"inventario.existencias",
	"inventario.materiales",
	"inventario.reabasto",
	"inventario.diferencias",
	"inventario.conteos_y_ajustes",
	"inventario.excepciones",
	"inventario.detalle_variante",
	"inventario.detalle_entrega_corte",
	"inventario.detalle_llegada_aduana",
	"inventario.detalle_conteo",
	"admin.armazon",
] as const;

/** Las cifras enteras con el separador de miles de México («22,899»). */
export const enteros = new Intl.NumberFormat("es-MX");

/**
 * Una acción de Bodega lista para un botón, un cajón o una ventana.
 * @param contrato Su contrato.
 * @returns Lo de `useEnvio` de lo común.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	return useEnvioComun(contrato, consultasDeBodega);
}

/**
 * Una variante en dos renglones: «{prenda} · talla {t}» y, abajo, «{escuela} · {código}».
 * @param props La variante.
 */
export function VarianteEnDosRenglones({
	variante,
}: {
	variante: { prenda: string; talla: string; escuela: string; codigo: string | null };
}) {
	return (
		<DosRenglones
			arriba={`${variante.prenda} · talla ${variante.talla}`}
			abajo={variante.codigo === null ? variante.escuela : `${variante.escuela} · ${variante.codigo}`}
		/>
	);
}
