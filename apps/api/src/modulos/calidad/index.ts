/**
 * El módulo `calidad`: la revisión de lotes, los reprocesos, el catálogo de defectos, los reclamos y la revisión de
 * lo que regresa con defecto.
 * Fases 13 y 16 · docs/modulos/calidad/revision-de-lotes.md y reclamos-y-devoluciones.md
 * Fase 19 · las consultas de sus pantallas y la pastilla de Calidad (docs/interfaz/fabrica/calidad.md)
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionRevisarDevolucion } from "./acciones/devoluciones.ts";
import { accionRegistrarReclamo, accionResolverReclamo } from "./acciones/reclamos.ts";
import { accionAgregarDefecto, accionAprobarReproceso, accionRevisarLote } from "./acciones/revision.ts";
import { consultaDefectos } from "./consultas/defectos.ts";
import { consultaDevolucion } from "./consultas/devolucion.ts";
import { consultaOpcionesReclamo } from "./consultas/opciones-reclamo.ts";
import { consultaPendientes, pastillaCalidad } from "./consultas/pendientes.ts";
import { consultaPorRevisar, consultaRevisionLote } from "./consultas/por-revisar.ts";
import { consultaBuscar, consultaReclamos } from "./consultas/reclamos.ts";
import { aprobadasDelLote, enReprocesoDePedido, reprocesoParaAduana } from "./lecturas/revision.ts";
import { semillaDeParametrosDeCalidad } from "./parametros.ts";

export default definirModulo({
	nombre: "calidad",
	acciones: [
		accionRevisarLote,
		accionAprobarReproceso,
		accionAgregarDefecto,
		accionRegistrarReclamo,
		accionResolverReclamo,
		accionRevisarDevolucion,
	],
	consultas: [
		consultaPendientes,
		consultaPorRevisar,
		consultaRevisionLote,
		consultaDefectos,
		consultaReclamos,
		consultaBuscar,
		consultaOpcionesReclamo,
		consultaDevolucion,
	],
	pastillas: { calidad: pastillaCalidad },
	lecturas: {
		aprobadas_del_lote: aprobadasDelLote,
		en_reproceso_de_pedido: enReprocesoDePedido,
		reproceso_para_aduana: reprocesoParaAduana,
	},
	semillas: [semillaDeParametrosDeCalidad],
	// Calidad ve sus revisiones; Producción, Aduana y Ventas ven lo revisado y los reprocesos de sus lotes.
	lectores: {
		defectos: ["calidad", "produccion", "aduana"],
		defecto_operaciones: ["calidad", "produccion"],
		revisiones: ["calidad", "produccion", "aduana", "ventas", "direccion"],
		revision_tallas: ["calidad", "produccion", "aduana", "ventas", "direccion"],
		rechazos: ["calidad", "produccion", "direccion"],
		reprocesos: ["calidad", "produccion", "aduana", "ventas", "direccion"],
		reclamos: ["calidad", "produccion", "ventas", "direccion"],
		revisiones_devolucion: ["calidad", "aduana", "bodega", "ventas", "direccion"],
	},
});
