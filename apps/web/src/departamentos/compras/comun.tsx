/**
 * Lo que comparten las pestañas y los formularios de Compras: el buscador que escribe en la dirección y cómo se lee
 * un número escrito en un campo antes de revisarlo con el esquema del contrato.
 * Fase 19 · docs/interfaz/fabrica/compras.md
 */

import { Buscador as BuscadorDelSistema } from "@uniformame/interfaz/captura/buscador";
import { useDireccionDeCompras } from "./direccion.ts";

/**
 * El buscador de una pestaña de Compras: el del sistema de diseño, con lo escrito en la dirección (`buscar`).
 * @param props Su etiqueta y lo que dice adentro.
 */
export function Buscador({ etiqueta, ejemplo }: { etiqueta: string; ejemplo: string }) {
	const { busqueda, ir } = useDireccionDeCompras();
	return (
		<div className="min-w-0 flex-1 basis-72">
			<BuscadorDelSistema
				etiqueta={etiqueta}
				ayuda={ejemplo}
				valor={busqueda.buscar ?? ""}
				alBuscar={(texto) => ir({ buscar: texto === "" ? undefined : texto })}
			/>
		</div>
	);
}

/**
 * Un número escrito en un campo, o `undefined` si está vacío: así el esquema del contrato dice «falta» y no lo toma
 * por un cero.
 * @param texto Lo que se escribió.
 */
export function numeroEscrito(texto: string | undefined): number | undefined {
	const limpio = (texto ?? "").replaceAll(",", "").trim();
	return limpio === "" ? undefined : Number(limpio);
}
