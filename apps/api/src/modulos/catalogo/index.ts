/**
 * El módulo `catalogo`: escuelas, secciones, grupos de tallas y tipos de prenda.
 * Fase 8 · docs/modulos/catalogo/ (escuelas-y-secciones.md y tallas-y-tipos-de-prenda.md)
 *
 * Las listas de precios, los productos, los precios y las etiquetas llegan en las partes 2 a 5 de la fase.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionAgregarSeccion } from "./acciones/agregar-seccion.ts";
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
import { lectoresDeCatalogo } from "./permisos.ts";
import { semillaDeGruposTalla, semillaDeSecciones } from "./siembra.ts";

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
	],
	internas: { crear_escuela_para_cliente: crearEscuelaParaCliente },
	semillas: [semillaDeSecciones, semillaDeGruposTalla],
	bajada: bajadaDeCatalogo,
	lectores: lectoresDeCatalogo,
});
