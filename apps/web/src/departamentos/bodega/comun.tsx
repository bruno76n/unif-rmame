/**
 * Lo que comparten las pestañas, los cajones y las ventanas de Bodega: la variante en dos renglones y las cifras con
 * su separador de miles.
 * Fase 19 · docs/interfaz/fabrica/bodega.md
 */

import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";

/** Las cifras enteras con el separador de miles de México («22,899»). */
export const enteros = new Intl.NumberFormat("es-MX");

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
