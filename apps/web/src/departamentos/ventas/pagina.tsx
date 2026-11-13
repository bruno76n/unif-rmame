/**
 * La página de Ventas a externos: su título, sus cuatro pestañas como rutas, la acción principal «Nuevo pedido» y los
 * cajones que abre la dirección.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Quién entra») y docs/interfaz/comunes.md («La página de un departamento»)
 */

import { Boton } from "@uniformame/interfaz/botones/boton";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { useConConexion } from "../../comun/estado-de-la-app.ts";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonesDeVentas } from "./cajones/cajones.tsx";
import { useDireccionDeVentas } from "./direccion.ts";

/** Las pestañas de Ventas a externos; su clave es su ruta. */
export const pestanasDeVentas = [
	{ clave: "pendientes", texto: "Pendientes" },
	{ clave: "pedidos", texto: "Pedidos" },
	{ clave: "notas", texto: "Notas de entrega" },
	{ clave: "clientes", texto: "Clientes" },
] as const;

/**
 * La página de Ventas con una pestaña activa.
 * @param props La pestaña activa y su contenido.
 */
export function PaginaDeVentas({
	activa,
	children,
}: {
	activa: (typeof pestanasDeVentas)[number]["clave"];
	children: ReactNode;
}) {
	const { abrir } = useDireccionDeVentas();
	const conConexion = useConConexion();
	return (
		<PaginaDeDepartamento departamento="ventas" pestanas={pestanasDeVentas} activa={activa}>
			<AccionPrincipal>
				<Boton variante="principal" icono={Plus} disabled={!conConexion} onClick={() => abrir("nuevo")}>
					Nuevo pedido
				</Boton>
			</AccionPrincipal>
			{children}
			<CajonesDeVentas />
		</PaginaDeDepartamento>
	);
}
