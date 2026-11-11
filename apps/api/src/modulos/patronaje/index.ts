/**
 * El módulo `patronaje`: la receta de cada prenda, sus versiones, la cuenta de material y el desperdicio.
 * Fase 8 · docs/fases/08-catalogo.md (parte 1, «Excepciones permitidas»): sus parámetros del rango de una medida.
 * Fase 10 · docs/modulos/patronaje/recetas.md y cuenta-de-material.md
 *
 * Los desarrollos llegan en la parte 3 de la fase 10.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionGuardarReceta } from "./acciones/guardar-receta.ts";
import { iniciarReceta, verificarReceta } from "./internas/recetas.ts";
import { calcularMaterial, desperdicioPrenda, recetaCubreTallas, recetasConMaterial } from "./lecturas/recetas.ts";
import { semillaDeParametrosDePatronaje } from "./parametros.ts";
import { lectoresDePatronaje } from "./permisos.ts";

export default definirModulo({
	nombre: "patronaje",
	acciones: [accionGuardarReceta],
	internas: { iniciar_receta: iniciarReceta, verificar_receta: verificarReceta },
	lecturas: {
		receta_cubre_tallas: recetaCubreTallas,
		recetas_con_material: recetasConMaterial,
		calcular_material: calcularMaterial,
		desperdicio_prenda: desperdicioPrenda,
	},
	semillas: [semillaDeParametrosDePatronaje],
	lectores: lectoresDePatronaje,
});
