/**
 * El cajón de Compras que dice la dirección (`?cajon=…&id=…`): Levantar orden, el «por qué» de un material, la orden de
 * compra, el material o el proveedor. Así cualquier pestaña, y cualquier otro departamento con un enlace, abre el
 * mismo cajón.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Cajones») y .claude/rules/react.md (regla 5)
 */

import { useDireccionDeCompras } from "../direccion.ts";
import { CajonLevantarOrden } from "./levantar-orden.tsx";
import { CajonMaterial } from "./material.tsx";
import { CajonOrden } from "./orden.tsx";
import { CajonPorQue } from "./por-que.tsx";
import { CajonProveedor } from "./proveedor.tsx";

/** El cajón abierto, si hay uno. */
export function CajonesDeCompras() {
	const { busqueda, cerrarCajon } = useDireccionDeCompras();
	const { cajon, id } = busqueda;
	// La llave hace que otro documento abra un cajón nuevo, sin lo capturado del anterior.
	const llave = `${cajon ?? ""}:${id ?? ""}:${busqueda.materiales ?? ""}`;
	if (cajon === "levantar") {
		return (
			<CajonLevantarOrden
				key={llave}
				materiales={busqueda.materiales}
				cantidades={busqueda.cantidades}
				alCerrar={cerrarCajon}
			/>
		);
	}
	if (id === undefined) return null;
	switch (cajon) {
		case "por_que":
			return <CajonPorQue key={llave} materialId={id} alCerrar={cerrarCajon} />;
		case "orden":
			return <CajonOrden key={llave} ordenId={id} alCerrar={cerrarCajon} />;
		case "material":
			return <CajonMaterial key={llave} materialId={id} alCerrar={cerrarCajon} />;
		case "proveedor":
			return <CajonProveedor key={llave} proveedorId={id} alCerrar={cerrarCajon} />;
		default:
			return null;
	}
}
