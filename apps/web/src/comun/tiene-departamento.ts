/**
 * Qué departamentos tiene la cuenta, del armazón: un botón o una cifra que lleva a otro departamento solo lleva si la
 * cuenta lo tiene; si no, se muestra sin llevar a ningún lado. Sale de `admin.armazon`, que ya pidió el armazón; el
 * servidor vuelve a revisar todo en cada consulta.
 * Fase 19 · docs/interfaz/comunes.md («El cajón», regla 2)
 */

import { armazon } from "@uniformame/compartido/contratos/admin/armazon";
import { useConsulta } from "./api.tsx";

/**
 * Dice si la cuenta tiene un departamento (la dueña los tiene todos).
 * @returns `tiene(clave)`: falso mientras el armazón no ha llegado.
 */
export function useTieneDepartamento(): (clave: string) => boolean {
	const { data } = useConsulta(armazon, {});
	return (clave) =>
		data !== undefined &&
		(data.cuenta.es_duena || data.departamentos.some((departamento) => departamento.clave === clave));
}
