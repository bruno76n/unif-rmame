/**
 * Un monto en pantalla: «$1,250», o «—» si el servidor no lo mandó porque la cuenta no lo ve (la de soporte nunca
 * recibe montos, ver docs/modulos/admin/permisos.md).
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla») y docs/interfaz/TEXTOS.md (los montos)
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";

/**
 * El monto escrito, o «—» si no viajó.
 * @param monto En centavos, o `undefined` si el servidor lo recortó.
 */
export function montoEnPantalla(monto: number | null | undefined): string {
	return monto === undefined || monto === null ? "—" : enPesos(monto);
}
