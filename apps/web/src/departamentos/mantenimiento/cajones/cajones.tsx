/**
 * El cajón de Mantenimiento que dice la dirección (`?cajon=falla&id=…` o `?cajon=maquina&id=…`). Así cualquier
 * pestaña, y cualquier otro departamento con un enlace, abre el mismo cajón.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Cajones») y .claude/rules/react.md (regla 5)
 */

import { useDireccionDeMantenimiento } from "../direccion.ts";
import { CajonFalla } from "./falla.tsx";
import { CajonMaquina } from "./maquina.tsx";

/** El cajón abierto, si hay uno. */
export function CajonesDeMantenimiento() {
	const { busqueda, cerrar } = useDireccionDeMantenimiento();
	const { cajon, id } = busqueda;
	if (id === undefined) return null;
	// La llave hace que otro documento abra un cajón nuevo, sin lo del anterior.
	if (cajon === "falla") return <CajonFalla key={id} fallaId={id} alCerrar={cerrar} />;
	if (cajon === "maquina") return <CajonMaquina key={id} maquinaId={id} alCerrar={cerrar} />;
	return null;
}
