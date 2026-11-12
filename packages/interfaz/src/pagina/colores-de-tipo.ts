/**
 * Los colores de cada tipo (el ícono de un pendiente, de una cifra o de un departamento), con su cuadro claro.
 * Fase 19 · docs/interfaz/DISENO.md («Los de cada tipo», regla 6)
 */

/** Los colores de tipo. */
export type ColorDeTipo = "azul" | "verde" | "ambar" | "rojo" | "violeta" | "verde-azulado" | "pizarra" | "rosa";

/** El ícono de un tipo va sobre un cuadro claro de su color. */
export const iconoDeTipo: Readonly<Record<ColorDeTipo, string>> = {
	azul: "bg-azul/12 text-azul",
	verde: "bg-verde/12 text-verde",
	ambar: "bg-ambar/12 text-ambar",
	rojo: "bg-rojo/12 text-rojo",
	violeta: "bg-violeta/12 text-violeta",
	"verde-azulado": "bg-verde-azulado/12 text-verde-azulado",
	pizarra: "bg-pizarra/12 text-pizarra",
	rosa: "bg-rosa/12 text-rosa",
};
