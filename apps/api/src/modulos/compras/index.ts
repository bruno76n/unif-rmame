/**
 * El módulo `compras`: proveedores, materiales, sus precios de compra, las órdenes de compra, la cuenta de cada
 * material y los consumibles que bajan a la tablet; desde la fase 19, las consultas de sus pantallas y su pastilla.
 * Fase 10 · docs/modulos/compras/
 * Fase 19 · docs/interfaz/fabrica/compras.md
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import {
	accionCrearMaterial,
	accionDarBajaMaterial,
	accionGuardarMaterial,
	accionReactivarMaterial,
} from "./acciones/materiales.ts";
import {
	accionCancelarOrden,
	accionCerrarOrdenConFaltante,
	accionGuardarBorradorOrden,
	accionLevantarOrden,
	accionMarcarOrdenEnviada,
} from "./acciones/ordenes.ts";
import {
	accionCrearProveedor,
	accionDarBajaProveedor,
	accionGuardarProveedor,
	accionReactivarProveedor,
} from "./acciones/proveedores.ts";
import {
	accionAgregarProveedorMaterial,
	accionHacerHabitual,
	accionQuitarProveedorMaterial,
} from "./acciones/proveedores-de-material.ts";
import { bajadaDeCompras } from "./bajada.ts";
import { consultaConciliacionFacturas } from "./consultas/conciliacion-facturas.ts";
import { consultaLevantarOrdenPropuesta } from "./consultas/levantar-orden-propuesta.ts";
import { consultaMaterial } from "./consultas/material.ts";
import { consultaMaterialPorQue } from "./consultas/material-por-que.ts";
import { consultaMateriales } from "./consultas/materiales.ts";
import { consultaOrden } from "./consultas/orden.ts";
import { consultaOrdenes } from "./consultas/ordenes.ts";
import { consultaPendientesDeCompras, pastillaCompras } from "./consultas/pendientes.ts";
import { consultaPorPedir } from "./consultas/por-pedir.ts";
import { consultaProveedor } from "./consultas/proveedor.ts";
import { consultaProveedores } from "./consultas/proveedores.ts";
import {
	cerrarOrdenPagada,
	reabrirOrdenPagada,
	recalcularEstadoOrden,
	registrarPreciosNota,
} from "./internas/ordenes.ts";
import { costoMaterial } from "./lecturas/costo-material.ts";
import { cuentaMaterial } from "./lecturas/cuenta-material.ts";
import { datosMateriales } from "./lecturas/datos-materiales.ts";
import { ordenesParaFactura, ordenesPorRecibir, precioVigenteLineas } from "./lecturas/ordenes.ts";
import { veDocumento } from "./lecturas/ve-documento.ts";
import { semillaDeParametrosDeCompras } from "./parametros.ts";
import { lectoresDeCompras } from "./permisos.ts";
import { semillaDeUnidades } from "./siembra.ts";

export default definirModulo({
	nombre: "compras",
	acciones: [
		accionCrearProveedor,
		accionGuardarProveedor,
		accionDarBajaProveedor,
		accionReactivarProveedor,
		accionCrearMaterial,
		accionGuardarMaterial,
		accionDarBajaMaterial,
		accionReactivarMaterial,
		accionAgregarProveedorMaterial,
		accionQuitarProveedorMaterial,
		accionHacerHabitual,
		accionLevantarOrden,
		accionGuardarBorradorOrden,
		accionMarcarOrdenEnviada,
		accionCancelarOrden,
		accionCerrarOrdenConFaltante,
	],
	consultas: [
		consultaPendientesDeCompras,
		consultaPorPedir,
		consultaOrdenes,
		consultaMateriales,
		consultaProveedores,
		consultaConciliacionFacturas,
		consultaLevantarOrdenPropuesta,
		consultaMaterialPorQue,
		consultaOrden,
		consultaMaterial,
		consultaProveedor,
	],
	internas: {
		recalcular_estado_orden: recalcularEstadoOrden,
		cerrar_orden_pagada: cerrarOrdenPagada,
		reabrir_orden_pagada: reabrirOrdenPagada,
		registrar_precios_nota: registrarPreciosNota,
	},
	lecturas: {
		costo_material: costoMaterial,
		cuenta_material: cuentaMaterial,
		datos_materiales: datosMateriales,
		ordenes_por_recibir: ordenesPorRecibir,
		ordenes_para_factura: ordenesParaFactura,
		precio_vigente_lineas: precioVigenteLineas,
		ve_documento: veDocumento,
	},
	semillas: [semillaDeUnidades, semillaDeParametrosDeCompras],
	pastillas: { compras: pastillaCompras },
	bajada: bajadaDeCompras,
	lectores: lectoresDeCompras,
});
