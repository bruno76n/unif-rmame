/**
 * La disposición que repiten las pantallas de Producción: una sección con su título, un dato con su etiqueta, una
 * línea de aviso dentro de la pantalla y la marca del cuadro de color de una escuela. Solo acomodan: los botones, las
 * tablas, los estados y los colores son del sistema de diseño y de sus tokens.
 * Fase 19 · docs/interfaz/DISENO.md (reglas 2 y 3) y docs/interfaz/fabrica/produccion.md
 */

import type { ReactNode } from "react";

/**
 * Una sección: su título, lo que va a su derecha y su contenido.
 * @param props El título, su línea chica, lo de la derecha y el contenido.
 */
export function Seccion({
	titulo,
	nota,
	derecha,
	children,
	enPanel = false,
}: {
	titulo: string;
	nota?: string;
	derecha?: ReactNode;
	children: ReactNode;
	enPanel?: boolean;
}) {
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
 * Un dato con su etiqueta arriba.
 * @param props La etiqueta y el valor.
 */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<dt className="font-semibold text-etiqueta text-tinta3">{etiqueta}</dt>
			<dd className="m-0 font-semibold tabular-nums">{children}</dd>
		</div>
	);
}

/**
 * Una línea de aviso dentro de la pantalla: roja si bloquea, ámbar si advierte, azul si informa, verde si está bien.
 * @param props Su tono y su texto.
 */
export function LineaDeAviso({
	tono,
	children,
}: {
	tono: "error" | "advertencia" | "info" | "bien";
	children: ReactNode;
}) {
	const clase = {
		error: "text-texto-error",
		advertencia: "text-texto-advertencia",
		info: "text-estado-azul",
		bien: "text-texto-bien",
	}[tono];
	return (
		<p role={tono === "error" ? "alert" : undefined} className={`m-0 font-semibold ${clase}`}>
			{children}
		</p>
	);
}

/**
 * El cuadro del color de la escuela de un cliente; sin color, nada.
 * @param props El color, como lo guarda la escuela.
 */
export function ColorDeEscuela({ color }: { color: string | null }) {
	return color === null ? null : (
		<span
			aria-hidden="true"
			className="inline-block size-3 flex-none rounded-chico"
			style={{ backgroundColor: color }}
		/>
	);
}

/**
 * Para quién es un lote: el cliente con su color (o la tienda, o la temporada) y su línea abajo.
 * @param props Lo que regresan las consultas en `para`.
 */
export function ParaQuien({ para }: { para: { nombre: string; color: string | null; linea: string } }) {
	return (
		<span className="flex min-w-0 items-center gap-2">
			<ColorDeEscuela color={para.color} />
			<span className="flex min-w-0 flex-col">
				<span className="truncate">{para.nombre}</span>
				<span className="text-etiqueta text-tinta2">{para.linea}</span>
			</span>
		</span>
	);
}
