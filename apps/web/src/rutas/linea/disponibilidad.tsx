/**
 * La pestaña Disponibilidad de Tienda en línea.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Disponibilidad»)
 *
 * La ruta solo arma la pantalla: el cajón abierto viene de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeLinea } from "../../departamentos/linea/direccion.ts";
import { PaginaDeLinea } from "../../departamentos/linea/pagina.tsx";
import { PestanaDisponibilidad } from "../../departamentos/linea/pestanas/disponibilidad.tsx";

export const Route = createFileRoute("/linea/disponibilidad")({
	validateSearch: busquedaDeLinea,
	component: () => (
		<PaginaDeLinea activa="disponibilidad">
			<PestanaDisponibilidad />
		</PaginaDeLinea>
	),
});
