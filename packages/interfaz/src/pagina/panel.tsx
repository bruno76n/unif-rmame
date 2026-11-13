/**
 * Un panel blanco con su sombra y, si lo lleva, su título con una raya abajo y lo que va a su derecha (botones,
 * filtros): los bloques de una pestaña, como en la muestra.
 * Fase 19 · docs/interfaz/DISENO.md (los paneles)
 *
 * Uso: `<Panel titulo="Listas de precios" derecha={<Boton chico>…</Boton>}>…</Panel>`.
 */

import type { ReactNode } from "react";

/** Lo que recibe un panel. */
export interface PropsDePanel {
	titulo?: ReactNode;
	derecha?: ReactNode;
	children: ReactNode;
}

/**
 * Un panel.
 * @param props Su título, lo de su derecha y su contenido.
 */
export function Panel({ titulo, derecha, children }: PropsDePanel) {
	return (
		<section className="rounded-grande bg-panel shadow-panel">
			{titulo === undefined ? null : (
				<header className="flex flex-wrap items-center gap-3 border-linea border-b px-5 py-4">
					<h2 className="m-0 font-bold text-subtitulo">{titulo}</h2>
					<span className="ml-auto flex flex-wrap items-center gap-2">{derecha}</span>
				</header>
			)}
			<div className="px-5 py-4">{children}</div>
		</section>
	);
}
