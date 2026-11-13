/**
 * El cajón de Bodega que dice la dirección: Variante (`?cajon=variante&id=…`), Entrega al corte (`entrega`, el lote),
 * Llegada de aduana (`llegada`, el despacho), el conteo (`conteo`, con la DF- en `id` o sin ella para uno nuevo) y la
 * carga inicial (`carga`). Así cualquier pestaña, y cualquier otro departamento con un enlace, abre el mismo cajón.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones») y .claude/rules/react.md (regla 5)
 */

import { useDireccionDeBodega } from "../direccion.ts";
import { CajonCargaInicial } from "./carga-inicial.tsx";
import { CajonConteo } from "./conteo.tsx";
import { CajonEntregaCorte } from "./entrega-corte.tsx";
import { CajonLlegada } from "./llegada.tsx";
import { CajonVariante } from "./variante.tsx";

/** El cajón abierto, si hay uno. */
export function CajonesDeBodega() {
	const { busqueda, cerrar } = useDireccionDeBodega();
	const { cajon, id } = busqueda;
	// La llave hace que otro documento abra un cajón nuevo, sin lo del anterior.
	if (cajon === "conteo") return <CajonConteo key={id ?? "nuevo"} diferenciaId={id} alCerrar={cerrar} />;
	if (cajon === "carga") return <CajonCargaInicial alCerrar={cerrar} />;
	if (id === undefined) return null;
	if (cajon === "variante") return <CajonVariante key={id} varianteId={id} alCerrar={cerrar} />;
	if (cajon === "entrega") return <CajonEntregaCorte key={id} loteId={id} alCerrar={cerrar} />;
	if (cajon === "llegada") return <CajonLlegada key={id} despachoId={id} alCerrar={cerrar} />;
	return null;
}
