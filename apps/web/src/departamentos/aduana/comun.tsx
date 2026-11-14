/**
 * Lo que comparten las pestañas, los cajones y las ventanas de Aduana: el color de cada destino y la orilla de su
 * carril, el destino con su punto, lo que abre una tarjeta o un renglón, y el botón de lo que está en aduana.
 * Fase 19 · docs/interfaz/fabrica/aduana.md
 */

import type { loQueAbre, partidaEnAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { type ColorDeEstado, puntoDelEstado } from "@uniformame/interfaz/estados/colores";
import { useCallback } from "react";
import type { z } from "zod";
import { useDireccionDeAduana } from "./direccion.ts";

/** La orilla de arriba de un carril, del color de su destino (clases completas, para que Tailwind las vea). */
const orillaDelColor: Readonly<Record<ColorDeEstado, string>> = {
	rojo: "border-t-estado-rojo",
	ambar: "border-t-estado-ambar",
	azul: "border-t-estado-azul",
	verde: "border-t-estado-verde",
	gris: "border-t-estado-gris",
	morado: "border-t-estado-morado",
	"verde-azulado": "border-t-estado-verde-azulado",
	naranja: "border-t-estado-naranja",
};

/**
 * La clase de la orilla de un carril del andén: «Entra» (sin color) en tinta, como en la muestra; los demás, del color
 * de su destino, como lo manda la consulta.
 * @param color El color de su destino, o nada.
 */
export function orillaDelCarril(color: ColorDeEstado | null): string {
	return color === null ? "border-t-tinta" : orillaDelColor[color];
}

/**
 * Un destino con su punto de color: «● Tienda 1».
 * @param props El color de su destino (de la consulta) y su nombre.
 */
export function DestinoConPunto({ color, nombre }: { color: ColorDeEstado; nombre: string }) {
	return (
		<span className="inline-flex items-center gap-2">
			<span aria-hidden className={`size-2.5 shrink-0 rounded-full ${puntoDelEstado[color]}`} />
			{nombre}
		</span>
	);
}

/** Lo que abre una tarjeta o un renglón. */
export type LoQueAbre = z.infer<typeof loQueAbre>;

/**
 * Cómo abrir lo que dice una tarjeta o un renglón: su cajón por la dirección, o la pestaña Empaque en línea.
 * @returns La función que lo abre.
 */
export function useAbrir() {
	const { navegar } = useDireccionDeAduana();
	return useCallback(
		(abre: LoQueAbre) => (abre.a === "empaque" ? navegar({}, "empaque") : navegar({ cajon: abre.a, id: abre.id })),
		[navegar],
	);
}

/** Lo que está en aduana. */
export type PartidaEnAduana = z.infer<typeof partidaEnAduana>;

/** El texto del botón de lo que está en aduana. */
export const textosDelBoton: Readonly<Record<PartidaEnAduana["boton"], string>> = {
	despachar: "Despachar",
	sin_nota: "Sin nota",
	ver_pedido: "Ver pedido",
	ver: "Ver",
	devolver: "Devolver al proveedor",
};
