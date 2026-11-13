/**
 * Los cajones de Ventas a externos que abre la dirección: el que diga `?cajon=` con su documento en `?id=`. Así un
 * enlace (también desde otro departamento) abre el cajón tal cual, y cerrar lo quita de la dirección.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Cajones») y .claude/rules/react.md (regla 5)
 */

import { useDireccionDeVentas } from "../direccion.ts";
import { CajonArmarNota } from "./armar-nota.tsx";
import { CajonCliente } from "./cliente.tsx";
import { CajonEditorPedido } from "./editor-pedido.tsx";
import { CajonMandar } from "./mandar.tsx";
import { CajonNota } from "./nota.tsx";
import { CajonPedido } from "./pedido.tsx";

/** El cajón abierto de Ventas, si hay. */
export function CajonesDeVentas() {
	const { busqueda, cerrar } = useDireccionDeVentas();
	const { cajon, id } = busqueda;
	// Cada documento con su propio cajón: cambiar de documento lo vuelve a leer desde el principio.
	const clave = `${cajon ?? ""}-${id ?? ""}`;
	switch (cajon) {
		case "pedido":
			return id === undefined ? null : <CajonPedido key={clave} pedidoId={id} alCerrar={cerrar} />;
		case "nuevo":
			return <CajonEditorPedido key={clave} {...(id === undefined ? {} : { clienteId: id })} alCerrar={cerrar} />;
		case "modificar":
			return id === undefined ? null : <CajonEditorPedido key={clave} pedidoId={id} alCerrar={cerrar} />;
		case "mandar":
			return id === undefined ? null : <CajonMandar key={clave} pedidoId={id} alCerrar={cerrar} />;
		case "armar":
			return id === undefined ? null : <CajonArmarNota key={clave} pedidoId={id} alCerrar={cerrar} />;
		case "nota":
			return id === undefined ? null : <CajonNota key={clave} notaId={id} alCerrar={cerrar} />;
		case "cliente":
			return <CajonCliente key={clave} {...(id === undefined ? {} : { clienteId: id })} alCerrar={() => cerrar()} />;
		default:
			return null;
	}
}
