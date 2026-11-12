/**
 * Pendientes de Dirección: la primera pestaña. Hasta que su parte de la fase 19 la construya, muestra la página del
 * departamento sin pendientes.
 * Fase 19 · docs/interfaz/fabrica/ (el archivo de Dirección)
 */

import { createFileRoute } from "@tanstack/react-router";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";

export const Route = createFileRoute("/direccion/")({
	component: () => (
		<PaginaDeDepartamento
			departamento="direccion"
			pestanas={[{ clave: "pendientes", texto: "Pendientes" }]}
			activa="pendientes"
		>
			<EstadoDePantalla tipo="vacio" texto="Sin pendientes" bien />
		</PaginaDeDepartamento>
	),
});
