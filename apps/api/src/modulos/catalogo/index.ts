/**
 * El módulo `catalogo`: escuelas, secciones, grupos de tallas, tipos de prenda, listas de precios, productos,
 * sus tallas, sus precios y sus etiquetas.
 * Fase 8 · docs/modulos/catalogo/
 *
 * El tipo de etiqueta `prenda`, con su dibujo, llega en la fase 20.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionAgregarSeccion } from "./acciones/agregar-seccion.ts";
import { accionAplicarCambiosProducto } from "./acciones/aplicar-cambios-producto.ts";
import { accionCambiarPorcentajesCliente } from "./acciones/cambiar-porcentajes-cliente.ts";
import { accionCambiarPreciosEnBloque } from "./acciones/cambiar-precios-en-bloque.ts";
import { accionCrearProducto } from "./acciones/crear-producto.ts";
import {
	accionAgregarEscuela,
	accionDarBajaEscuela,
	accionEditarEscuela,
	accionReactivarEscuela,
} from "./acciones/escuelas.ts";
import { accionGuardarGrupoTalla } from "./acciones/guardar-grupo-talla.ts";
import { accionGuardarTipoPrenda } from "./acciones/guardar-tipo-prenda.ts";
import { accionImprimirEtiquetas } from "./acciones/imprimir-etiquetas.ts";
import { accionDescontinuarProductos, accionReactivarProducto, accionSubirFotoProducto } from "./acciones/productos.ts";
import {
	accionAgregarTalla,
	accionDarBajaTalla,
	accionDescontinuarTalla,
	accionReactivarTalla,
} from "./acciones/tallas-del-producto.ts";
import { bajadaDeCatalogo } from "./bajada.ts";
import { cambiarPrecioEnLinea } from "./internas/cambiar-precio-en-linea.ts";
import { crearEscuelaParaCliente } from "./internas/crear-escuela-para-cliente.ts";
import {
	crearListaCliente,
	darBajaListaCliente,
	reactivarListaCliente,
	sincronizarNombreCliente,
} from "./internas/listas-de-cliente.ts";
import { precioSugerido, precioTalla } from "./lecturas/precios.ts";
import { variantePorCodigo } from "./lecturas/variantes.ts";
import { semillaDeParametrosDeCatalogo } from "./parametros.ts";
import { lectoresDeCatalogo } from "./permisos.ts";
import {
	semillaDeCategoriasMayoreo,
	semillaDeGruposTalla,
	semillaDeListasPrecios,
	semillaDeSecciones,
} from "./siembra.ts";
import { revisarCodigosDeBarras } from "./trabajos/revisar-codigos-de-barras.ts";

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
		accionCrearProducto,
		accionAgregarTalla,
		accionDescontinuarTalla,
		accionReactivarTalla,
		accionDarBajaTalla,
		accionSubirFotoProducto,
		accionDescontinuarProductos,
		accionReactivarProducto,
		accionAplicarCambiosProducto,
		accionCambiarPreciosEnBloque,
		accionImprimirEtiquetas,
	],
	internas: {
		crear_escuela_para_cliente: crearEscuelaParaCliente,
		crear_lista_cliente: crearListaCliente,
		sincronizar_nombre_cliente: sincronizarNombreCliente,
		dar_baja_lista_cliente: darBajaListaCliente,
		reactivar_lista_cliente: reactivarListaCliente,
		cambiar_precio_en_linea: cambiarPrecioEnLinea,
	},
	lecturas: { precio_talla: precioTalla, precio_sugerido: precioSugerido, variante_por_codigo: variantePorCodigo },
	semillas: [
		semillaDeSecciones,
		semillaDeGruposTalla,
		semillaDeListasPrecios,
		semillaDeCategoriasMayoreo,
		semillaDeParametrosDeCatalogo,
	],
	trabajos: [revisarCodigosDeBarras],
	bajada: bajadaDeCatalogo,
	lectores: lectoresDeCatalogo,
});
