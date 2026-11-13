/**
 * El cajón de Aduana que dice la dirección: Recibir del taller (`?cajon=taller&id=<lote>`), Recibir material
 * (`material`, la orden), Recibir lo que viene en camino (`camino`, el traspaso; `reproceso`, el reproceso) y
 * Despachar (`despachar`, el traspaso en aduana). Así cualquier pestaña, y cualquier otro departamento con un enlace,
 * abre el mismo cajón.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Cajones») y .claude/rules/react.md (regla 5)
 */

import { useDireccionDeAduana } from "../direccion.ts";
import { CajonDespachar } from "./despachar.tsx";
import { CajonRecibirEnCamino } from "./recibir-en-camino.tsx";
import { CajonRecibirMaterial } from "./recibir-material.tsx";
import { CajonRecibirTaller } from "./recibir-taller.tsx";

/** El cajón abierto, si hay uno. */
export function CajonesDeAduana() {
	const { busqueda, cerrar } = useDireccionDeAduana();
	const { cajon, id } = busqueda;
	if (id === undefined) return null;
	// La llave hace que otro documento abra un cajón nuevo, sin lo del anterior.
	if (cajon === "taller") return <CajonRecibirTaller key={id} loteId={id} alCerrar={cerrar} />;
	if (cajon === "material") return <CajonRecibirMaterial key={id} ordenId={id} alCerrar={cerrar} />;
	if (cajon === "camino") return <CajonRecibirEnCamino key={id} traspasoId={id} alCerrar={cerrar} />;
	if (cajon === "reproceso") return <CajonRecibirEnCamino key={id} reprocesoId={id} alCerrar={cerrar} />;
	if (cajon === "despachar") return <CajonDespachar key={id} traspasoId={id} alCerrar={cerrar} />;
	return null;
}
