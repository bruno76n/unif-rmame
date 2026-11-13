/**
 * Qué departamentos tiene la cuenta, del armazón: los botones con cifra solo llevan a otro departamento si la cuenta lo
 * tiene; si no, muestran la cifra sin llevar a ningún lado.
 * Fase 19 · docs/interfaz/comunes.md («El cajón», regla 2) y docs/interfaz/fabrica/ventas.md («Quién entra»)
 */

import { armazon } from "@uniformame/compartido/contratos/admin/armazon";
import { useConsulta } from "../../comun/api.tsx";

/**
 * Dice si la cuenta tiene un departamento (la dueña los tiene todos).
 * @returns `tiene(clave)`.
 */
export function useTieneDepartamento(): (clave: string) => boolean {
	const { data } = useConsulta(armazon, {});
	return (clave) =>
		data !== undefined &&
		(data.cuenta.es_duena || data.departamentos.some((departamento) => departamento.clave === clave));
}
