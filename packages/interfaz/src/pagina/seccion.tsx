/**
 * Una sección de una pantalla o de un cajón: su título con su nota chica, lo que va a su derecha y su contenido; y el
 * título de un bloque solo, con su detalle a la derecha.
 * Fase 19 · docs/interfaz/DISENO.md (la letra y los paneles) y docs/interfaz/comunes.md («El cajón»)
 *
 * Uso: `<Seccion titulo="Operación por operación" nota="…" derecha={<Boton chico>…</Boton>}>…</Seccion>`; con
 * `enPanel`, va en un panel blanco con su sombra.
 */

import type { ReactNode } from "react";

/** Lo que recibe una sección. */
export interface PropsDeSeccion {
	titulo: string;
	/** La línea chica junto al título. */
	nota?: string | undefined;
	/** Lo que va a la derecha del título (botones chicos). */
	derecha?: ReactNode;
	children: ReactNode;
	/** Si va en un panel blanco con su sombra. */
	enPanel?: boolean;
}

/**
 * Una sección con su título.
 * @param props El título, su nota, lo de la derecha, si va en panel y su contenido.
 */
export function Seccion({ titulo, nota, derecha, children, enPanel = false }: PropsDeSeccion) {
	return (
		<section
			className={enPanel ? "flex flex-col gap-3 rounded-grande bg-panel p-5 shadow-panel" : "flex flex-col gap-3"}
		>
			<header className="flex flex-wrap items-center gap-3">
				<h3 className="m-0 font-bold text-subtitulo">{titulo}</h3>
				{nota === undefined ? null : <span className="text-etiqueta text-tinta3">{nota}</span>}
				{derecha === undefined ? null : <div className="ml-auto flex flex-wrap gap-2">{derecha}</div>}
			</header>
			{children}
		</section>
	);
}

/**
 * El título de un bloque dentro de un cajón, con su detalle a la derecha.
 * @param props El título y su detalle.
 */
export function TituloDeBloque({ titulo, detalle }: { titulo: string; detalle?: string | undefined }) {
	return (
		<div className="flex items-baseline justify-between gap-3 pt-2">
			<h3 className="m-0 font-bold text-subtitulo">{titulo}</h3>
			{detalle === undefined ? null : <span className="text-etiqueta text-tinta3">{detalle}</span>}
		</div>
	);
}
