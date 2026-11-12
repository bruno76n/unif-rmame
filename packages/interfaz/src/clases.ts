/**
 * Une las clases de Tailwind de un componente, saltando las que no aplican.
 * Fase 19 · docs/interfaz/DISENO.md
 *
 * La usan los componentes del sistema de diseño para armar sus variantes; las pantallas no la necesitan.
 * @param clases Las clases, o `false`, `null` o `undefined` para las que no aplican.
 * @returns Las clases unidas con un espacio.
 */
export function unirClases(...clases: (string | false | null | undefined)[]): string {
	return clases.filter((clase): clase is string => typeof clase === "string" && clase !== "").join(" ");
}
