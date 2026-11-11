/**
 * El módulo `compras`: proveedores, materiales, sus precios de compra y los consumibles que bajan a la tablet.
 * Fase 10 · docs/modulos/compras/
 *
 * Las órdenes de compra llegan en la parte 4 y la proyección de material, en la 5.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import {
	accionCrearMaterial,
	accionDarBajaMaterial,
	accionGuardarMaterial,
	accionReactivarMaterial,
} from "./acciones/materiales.ts";
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
import { costoMaterial } from "./lecturas/costo-material.ts";
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
	],
	lecturas: { costo_material: costoMaterial },
	semillas: [semillaDeUnidades, semillaDeParametrosDeCompras],
	bajada: bajadaDeCompras,
	lectores: lectoresDeCompras,
});
