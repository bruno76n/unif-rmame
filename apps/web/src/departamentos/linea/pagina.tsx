/**
 * La página de Tienda en línea: su título, sus tres pestañas como rutas (Pendientes, Pedidos y Disponibilidad) y el
 * cajón del pedido en línea que abre la dirección. No tiene acción principal. Pendientes cuenta todo lo pendiente (sus
 * renglones), roja si alguno va en rojo; la pastilla del menú cuenta solo los W- por surtir.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Quién entra») y docs/interfaz/comunes.md («La página de un
 * departamento»)
 */

import { pendientesLinea } from "@uniformame/compartido/contratos/linea/consultas";
import type { ReactNode } from "react";
import { useConsulta } from "../../comun/api.tsx";
import { conTodoLoPendiente, PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonPedidoLinea } from "./cajones/pedido.tsx";
import { type PestanaDeLinea, pestanasDeLinea, useDireccionDeLinea } from "./direccion.ts";

/**
 * La página de Tienda en línea con una pestaña activa.
 * @param props La pestaña activa y su contenido.
 */
export function PaginaDeLinea({ activa, children }: { activa: PestanaDeLinea; children: ReactNode }) {
	const { busqueda, cerrar } = useDireccionDeLinea();
	const pendientes = useConsulta(pendientesLinea, {}).data;
	const pestanas = conTodoLoPendiente(pestanasDeLinea, pendientes?.renglones);
	return (
		<PaginaDeDepartamento departamento="linea" pestanas={pestanas} activa={activa}>
			{children}
			{busqueda.cajon === "pedido" && busqueda.id !== undefined ? (
				<CajonPedidoLinea key={busqueda.id} pedidoLineaId={busqueda.id} alCerrar={cerrar} />
			) : null}
		</PaginaDeDepartamento>
	);
}
