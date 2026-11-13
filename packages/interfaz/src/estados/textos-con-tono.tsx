/**
 * Los textos en su tono: la línea corta de una fecha o un estado (normal, ámbar o rojo) y la línea de aviso dentro de
 * una pantalla (roja si detiene, ámbar si advierte, azul si informa, verde si está bien), con los colores de texto de
 * la guía.
 * Fase 19 · docs/interfaz/DISENO.md («Los colores»: el texto de error, de advertencia y de algo bien hecho)
 */

import type { ReactNode } from "react";
import { unirClases } from "../clases.ts";

/** El tono de una línea corta. */
export type TonoDeTexto = "normal" | "ambar" | "rojo";

/** La clase de cada tono de una línea corta. */
const claseDelTono: Readonly<Record<TonoDeTexto, string>> = {
	rojo: "font-bold text-estado-rojo",
	ambar: "font-bold text-texto-advertencia",
	normal: "text-tinta3",
};

/**
 * Una línea corta en su tono.
 * @param props El tono y el texto.
 */
export function TextoConTono({ tono, children }: { tono: TonoDeTexto; children: ReactNode }) {
	return <span className={unirClases("text-etiqueta", claseDelTono[tono])}>{children}</span>;
}

/** El tono de una línea de aviso. */
export type TonoDeAviso = "error" | "advertencia" | "info" | "bien";

/** La clase de cada tono de una línea de aviso. */
const claseDelAviso: Readonly<Record<TonoDeAviso, string>> = {
	error: "text-texto-error",
	advertencia: "text-texto-advertencia",
	info: "text-estado-azul",
	bien: "text-texto-bien",
};

/**
 * Una línea de aviso dentro de la pantalla.
 * @param props Su tono y su texto.
 */
export function LineaDeAviso({ tono, children }: { tono: TonoDeAviso; children: ReactNode }) {
	return (
		<p role={tono === "error" ? "alert" : undefined} className={unirClases("m-0 font-semibold", claseDelAviso[tono])}>
			{children}
		</p>
	);
}
