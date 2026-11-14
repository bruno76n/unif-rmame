/**
 * Cómo se escriben los datos en las pantallas de Catálogo: las fechas cortas, las listas cortas y lo que detiene a un
 * producto. Solo forma: ninguna regla del negocio.
 * Fase 19 · docs/interfaz/TEXTOS.md (reglas 5 y 6) y docs/interfaz/fabrica/catalogo.md
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";

/** El día y la hora de un momento, en hora de México. */
const formatoDeMomento = new Intl.DateTimeFormat("es-MX", {
	day: "numeric",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
	timeZone: zonaDelNegocio,
});

/**
 * Las partes de un momento en hora de México.
 * @param momento ISO.
 */
function partesDe(momento: string) {
	const partes = formatoDeMomento.formatToParts(new Date(momento));
	const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((una) => una.type === tipo)?.value ?? "";
	return { dia: `${parte("day")} ${parte("month").replace(".", "")}`, hora: `${parte("hour")}:${parte("minute")}` };
}

/**
 * Un momento como día corto en hora de México: «13 oct».
 * @param momento ISO.
 */
export function diaCorto(momento: string): string {
	return partesDe(momento).dia;
}

/**
 * Un momento con día y hora en hora de México: «13 oct · 10:42».
 * @param momento ISO.
 */
export function diaYHora(momento: string): string {
	const { dia, hora } = partesDe(momento);
	return `${dia} · ${hora}`;
}

/**
 * Una lista corta: «8, 10, 12…» con hasta `maximo` y los puntos si hay más.
 * @param partes Lo que se enumera.
 * @param maximo Cuántos se dicen.
 */
export function enumerar(partes: readonly string[], maximo = 6): string {
	return partes.length <= maximo ? partes.join(", ") : `${partes.slice(0, maximo).join(", ")}…`;
}

/** Lo que detiene a un producto, como lo manda la consulta. */
interface LoQueDetiene {
	tipo: "descontinuado" | "sin_precio" | "sin_foto" | "sin_etiqueta";
	cuantas?: number | undefined;
	lista?: string | undefined;
}

/**
 * El texto de lo que detiene a un producto: «Sin foto», «9 sin etiqueta», «Sin precio · {lista}», «Descontinuado».
 * @param detiene Lo que lo detiene.
 */
export function textoDeLoQueDetiene(detiene: LoQueDetiene): string {
	switch (detiene.tipo) {
		case "descontinuado":
			return "Descontinuado";
		case "sin_precio":
			return `Sin precio · ${detiene.lista ?? ""}`;
		case "sin_foto":
			return "Sin foto";
		case "sin_etiqueta":
			return `${detiene.cuantas ?? 0} sin etiqueta`;
	}
}

/** El nombre de cada canal en las pantallas. */
export const nombreDeCanal = { mostrador: "Mostrador", en_linea: "En línea", externos: "Externos" } as const;

/**
 * Una escuela o «Básico».
 * @param escuela El nombre de la escuela, o nada.
 */
export function escuelaOBasico(escuela: string | null | undefined): string {
	return escuela ?? "Básico";
}
