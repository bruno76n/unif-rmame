/**
 * Una tarjeta: un panel blanco con su sombra, y su orilla izquierda en rojo o ámbar si lo que dice urge (una alerta
 * cruzada, una autorización que ya pasó su plazo). Lleva su nombre para el lector de pantalla.
 * Fase 19 · docs/interfaz/DISENO.md (los paneles) y docs/interfaz/fabrica/direccion.md («Alertas cruzadas»)
 *
 * Uso: `<Tarjeta nombre="L-2026-118 detenido en Costados" orilla="rojo">…</Tarjeta>`.
 */

import type { ReactNode } from "react";
import { unirClases } from "../clases.ts";

/** La orilla de cada color. */
const orillas = { rojo: "border-l-4 border-estado-rojo", ambar: "border-l-4 border-estado-ambar" } as const;

/** Lo que recibe una tarjeta. */
export interface PropsDeTarjeta {
	/** Su nombre, para el lector de pantalla. */
	nombre: string;
	orilla?: keyof typeof orillas | undefined;
	children: ReactNode;
}

/**
 * Una tarjeta.
 * @param props Su nombre, su orilla y su contenido.
 */
export function Tarjeta({ nombre, orilla, children }: PropsDeTarjeta) {
	return (
		<article
			aria-label={nombre}
			data-color={orilla}
			className={unirClases(
				"flex flex-col gap-1.5 rounded-grande bg-panel px-5 py-4 shadow-panel",
				orilla === undefined ? undefined : orillas[orilla],
			)}
		>
			{children}
		</article>
	);
}
