/**
 * El módulo `patronaje`: la receta de cada prenda, sus versiones, la cuenta de material y el desperdicio.
 * Fase 8 · docs/fases/08-catalogo.md (parte 1, «Excepciones permitidas»): sus parámetros del rango de una medida.
 * Fase 10 · docs/modulos/patronaje/recetas.md y cuenta-de-material.md
 *
 * Y los desarrollos de productos nuevos (docs/modulos/patronaje/desarrollos.md), con el efecto de
 * `aprobar_desarrollo`.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import {
	accionDescartarDesarrollo,
	accionEmpezarMuestra,
	accionEntregarMuestra,
	accionPedirCambiosMuestra,
	accionRegistrarAprobacionCliente,
	accionRegistrarSolicitud,
} from "./acciones/desarrollos.ts";
import { accionGuardarReceta } from "./acciones/guardar-receta.ts";
import { aplicarDecisionDesarrollo, ligarProductoDesarrollo } from "./internas/desarrollos.ts";
import { iniciarReceta, verificarReceta } from "./internas/recetas.ts";
import { desarrollosEnProcesoDeEscuela } from "./lecturas/desarrollos.ts";
import { calcularMaterial, desperdicioPrenda, recetaCubreTallas, recetasConMaterial } from "./lecturas/recetas.ts";
import { semillaDeParametrosDePatronaje } from "./parametros.ts";
import { lectoresDePatronaje } from "./permisos.ts";

export default definirModulo({
	nombre: "patronaje",
	acciones: [
		accionGuardarReceta,
		accionRegistrarSolicitud,
		accionEmpezarMuestra,
		accionEntregarMuestra,
		accionPedirCambiosMuestra,
		accionRegistrarAprobacionCliente,
		accionDescartarDesarrollo,
	],
	internas: {
		iniciar_receta: iniciarReceta,
		verificar_receta: verificarReceta,
		aplicar_decision_desarrollo: aplicarDecisionDesarrollo,
		ligar_producto_desarrollo: ligarProductoDesarrollo,
	},
	lecturas: {
		receta_cubre_tallas: recetaCubreTallas,
		recetas_con_material: recetasConMaterial,
		calcular_material: calcularMaterial,
		desperdicio_prenda: desperdicioPrenda,
		desarrollos_en_proceso_de_escuela: desarrollosEnProcesoDeEscuela,
	},
	efectosDeAutorizacion: { aprobar_desarrollo: "aplicar_decision_desarrollo" },
	semillas: [semillaDeParametrosDePatronaje],
	lectores: lectoresDePatronaje,
});
