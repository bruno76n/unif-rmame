/**
 * El módulo `contaduria`: por ahora, solo la ficha de los terceros, que Compras necesita desde la fase 10.
 * Fase 10 · docs/modulos/contaduria/terceros-y-deudas.md y docs/fases/10-patronaje-y-compras.md («Excepciones
 * permitidas»)
 *
 * Lo demás de Contaduría llega en las fases 15 y 17.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { crearTercero, renombrarTercero } from "./internas/terceros.ts";
import { datosTerceros } from "./lecturas/terceros.ts";

export default definirModulo({
	nombre: "contaduria",
	internas: { crear_tercero: crearTercero, renombrar_tercero: renombrarTercero },
	lecturas: { datos_terceros: datosTerceros },
	lectores: { terceros: ["contaduria", "compras", "ventas", "direccion"] },
});
