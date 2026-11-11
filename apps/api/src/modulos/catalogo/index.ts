/**
 * El módulo `catalogo`: escuelas, secciones, grupos de tallas, tipos de prenda y listas de precios.
 * Fase 8 · docs/modulos/catalogo/ (escuelas-y-secciones.md, tallas-y-tipos-de-prenda.md y listas-de-precios.md)
 *
 * Los productos, los precios y las etiquetas llegan en las partes 3 a 5 de la fase.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionAgregarSeccion } from "./acciones/agregar-seccion.ts";
import { accionCambiarPorcentajesCliente } from "./acciones/cambiar-porcentajes-cliente.ts";
import {
	accionAgregarEscuela,
	accionDarBajaEscuela,
	accionEditarEscuela,
	accionReactivarEscuela,
} from "./acciones/escuelas.ts";
import { accionGuardarGrupoTalla } from "./acciones/guardar-grupo-talla.ts";
import { accionGuardarTipoPrenda } from "./acciones/guardar-tipo-prenda.ts";
import { bajadaDeCatalogo } from "./bajada.ts";
import { crearEscuelaParaCliente } from "./internas/crear-escuela-para-cliente.ts";
import {
	crearListaCliente,
	darBajaListaCliente,
	reactivarListaCliente,
	sincronizarNombreCliente,
} from "./internas/listas-de-cliente.ts";
import { lectoresDeCatalogo } from "./permisos.ts";
import {
	semillaDeCategoriasMayoreo,
	semillaDeGruposTalla,
	semillaDeListasPrecios,
	semillaDeSecciones,
} from "./siembra.ts";

export default definirModulo({
	nombre: "catalogo",
	acciones: [
		accionAgregarEscuela,
		accionEditarEscuela,
		accionDarBajaEscuela,
		accionReactivarEscuela,
		accionAgregarSeccion,
		accionGuardarGrupoTalla,
		accionGuardarTipoPrenda,
		accionCambiarPorcentajesCliente,
	],
	internas: {
		crear_escuela_para_cliente: crearEscuelaParaCliente,
		crear_lista_cliente: crearListaCliente,
		sincronizar_nombre_cliente: sincronizarNombreCliente,
		dar_baja_lista_cliente: darBajaListaCliente,
		reactivar_lista_cliente: reactivarListaCliente,
	},
	semillas: [semillaDeSecciones, semillaDeGruposTalla, semillaDeListasPrecios, semillaDeCategoriasMayoreo],
	bajada: bajadaDeCatalogo,
	lectores: lectoresDeCatalogo,
});
