/**
 * Los cajones de Contaduría que abre la dirección: el que diga `?cajon=` con su documento en `?id=`. Así un enlace
 * (también desde otro departamento) abre el cajón tal cual, y cerrar lo quita de la dirección.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Cajones») y .claude/rules/react.md (regla 5)
 */

import { useDireccionDeContaduria } from "../direccion.ts";
import { CajonCliente } from "./cliente.tsx";
import { CajonRegistrarPago } from "./registrar-pago.tsx";
import { CajonTercero } from "./tercero.tsx";

/** El cajón abierto de Contaduría, si hay. */
export function CajonesDeContaduria() {
	const { busqueda, cerrar } = useDireccionDeContaduria();
	const { cajon, id } = busqueda;
	// Cada documento con su propio cajón: cambiar de documento lo vuelve a leer desde el principio.
	const clave = `${cajon ?? ""}-${id ?? ""}`;
	switch (cajon) {
		case "cliente":
			return id === undefined ? null : <CajonCliente key={clave} clienteId={id} alCerrar={cerrar} />;
		case "tercero":
			return id === undefined ? null : <CajonTercero key={clave} terceroId={id} alCerrar={cerrar} />;
		case "registrar_pago":
			return <CajonRegistrarPago key={clave} clienteId={id} alCerrar={cerrar} />;
		default:
			return null;
	}
}
