/**
 * El cajón de Personal que dice la dirección (`?cajon=persona&id=…`, o `?cajon=nueva` para el alta). Así cualquier
 * pestaña, y cualquier otro departamento con un enlace, abre el mismo cajón.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Cajones») y .claude/rules/react.md (regla 5)
 */

import { useDireccionDePersonal } from "../direccion.ts";
import { CajonPersona } from "./persona.tsx";

/** El cajón abierto, si hay uno. */
export function CajonesDePersonal() {
	const { busqueda, cerrar } = useDireccionDePersonal();
	const { cajon, id } = busqueda;
	// La llave hace que otra persona abra un cajón nuevo, sin lo capturado en el anterior.
	if (cajon === "nueva") return <CajonPersona key="nueva" personaId={undefined} alCerrar={cerrar} />;
	if (cajon === "persona" && id !== undefined) return <CajonPersona key={id} personaId={id} alCerrar={cerrar} />;
	return null;
}
