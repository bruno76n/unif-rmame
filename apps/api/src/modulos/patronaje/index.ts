/**
 * El módulo `patronaje`: por ahora, solo sus parámetros del rango de una medida.
 * Fase 8 · docs/fases/08-catalogo.md (parte 1, «Excepciones permitidas»)
 *
 * Las recetas, los desarrollos y lo demás de Patronaje llegan en la fase 10.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { semillaDeParametrosDePatronaje } from "./parametros.ts";

export default definirModulo({
	nombre: "patronaje",
	semillas: [semillaDeParametrosDePatronaje],
});
