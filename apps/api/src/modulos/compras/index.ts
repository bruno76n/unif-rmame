/**
 * El módulo `compras`: proveedores, materiales, sus precios de compra, las órdenes de compra, la cuenta de cada
 * material y los consumibles que bajan a la tablet.
 * Fase 10 · docs/modulos/compras/
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
import {
	cerrarOrdenPagada,
	reabrirOrdenPagada,
	recalcularEstadoOrden,
	registrarPreciosNota,
} from "./internas/ordenes.ts";
import { costoMaterial } from "./lecturas/costo-material.ts";
import { cuentaMaterial } from "./lecturas/cuenta-material.ts";
import { datosMateriales } from "./lecturas/datos-materiales.ts";
import { ordenesPorRecibir, precioVigenteLineas } from "./lecturas/ordenes.ts";
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
		precio_vigente_lineas: precioVigenteLineas,
	},
	semillas: [semillaDeUnidades, semillaDeParametrosDeCompras],
	bajada: bajadaDeCompras,
	lectores: lectoresDeCompras,
});
