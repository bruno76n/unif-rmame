/**
 * El módulo `calidad`: la revisión de lotes, los reprocesos y el catálogo de defectos.
 * Fase 13 · docs/modulos/calidad/revision-de-lotes.md
 *
 * Los reclamos llegan en la parte 2; la revisión de devoluciones, en la fase 16.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionAgregarDefecto, accionAprobarReproceso, accionRevisarLote } from "./acciones/revision.ts";
import { aprobadasDelLote, enReprocesoDePedido } from "./lecturas/revision.ts";
import { semillaDeParametrosDeCalidad } from "./parametros.ts";

export default definirModulo({
	nombre: "calidad",
	acciones: [accionRevisarLote, accionAprobarReproceso, accionAgregarDefecto],
	lecturas: { aprobadas_del_lote: aprobadasDelLote, en_reproceso_de_pedido: enReprocesoDePedido },
	semillas: [semillaDeParametrosDeCalidad],
	// Calidad ve sus revisiones; Producción, Aduana y Ventas ven lo revisado y los reprocesos de sus lotes.
	lectores: {
		defectos: ["calidad", "produccion", "aduana"],
		defecto_operaciones: ["calidad", "produccion"],
		revisiones: ["calidad", "produccion", "aduana", "ventas", "direccion"],
		revision_tallas: ["calidad", "produccion", "aduana", "ventas", "direccion"],
		rechazos: ["calidad", "produccion", "direccion"],
		reprocesos: ["calidad", "produccion", "aduana", "ventas", "direccion"],
	},
});
