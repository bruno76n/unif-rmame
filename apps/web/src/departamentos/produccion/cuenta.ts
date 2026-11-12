/**
 * Lo que la cuenta tiene, para los botones que llevan a otro departamento: «Ver pedido» solo con Ventas a externos,
 * «Capturar receta» y «Ver receta» con Patronaje, y el costo del lote con Compras o Contaduría. Sale de `admin.armazon`,
 * que ya pidió el armazón; el servidor vuelve a revisar todo en cada consulta.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Quién entra»)
 */

import { armazon } from "@uniformame/compartido/contratos/admin/armazon";
import { useConsulta } from "../../comun/api.tsx";

/** Las direcciones de lo que Producción abre en otro departamento. */
export const enOtroDepartamento = {
	/** El cajón del pedido en Ventas a externos. */
	pedido: (pedidoId: string) => `/ventas/pedidos?pedido=${pedidoId}`,
	/** La receta de una prenda en Patronaje. */
	receta: (productoId: string) => `/patronaje/recetas?producto=${productoId}`,
};

/**
 * Si la cuenta tiene un departamento (la dueña los tiene todos: el armazón ya se los da).
 * @returns `tiene(clave)`.
 */
export function useCuenta() {
	const { data } = useConsulta(armazon, {});
	const claves = new Set<string>(data?.departamentos.map((departamento) => departamento.clave) ?? []);
	return { tiene: (clave: string) => claves.has(clave) };
}
