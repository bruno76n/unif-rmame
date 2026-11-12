/**
 * Los contratos de los gastos de la fábrica: registrarlos y cancelarlos.
 * Fase 17 · docs/modulos/contaduria/gastos.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";
import { medioDePago } from "./pagos.ts";

/** Contaduría registra un gasto con su categoría, dónde se gastó, de dónde salió y su comprobante. */
export const registrarGasto = definirAccion({
	nombre: "contaduria.registrar_gasto",
	descripcion: "Registra un gasto de la fábrica con su categoría, dónde se gastó y de dónde salió el dinero",
	entrada: z.object({
		categoria_id: z.uuid("Escoge la categoría.").describe("De la lista «Categorías de gasto»"),
		monto_centavos: z
			.number("Escribe el monto en pesos")
			.int("Escribe el monto en pesos")
			.positive("Escribe el monto en pesos")
			.multipleOf(100, "Escribe el monto en pesos")
			.describe("El monto, en pesos enteros"),
		area: z
			.enum(["fabrica", "ubicacion", "en_linea"], "¿Dónde se gastó?")
			.describe("La fábrica, una ubicación o en línea"),
		ubicacion_id: z.uuid("Escoge la ubicación").optional().describe("Con `ubicacion`: el Taller, una tienda…"),
		fecha: z.iso.date("Escribe la fecha").describe("El día del gasto: hoy o antes"),
		...medioDePago,
		comprobante_archivo_id: z.uuid().optional().describe("El comprobante ya subido: imagen, PDF o XML"),
		tipo_comprobante_id: z
			.uuid()
			.optional()
			.describe("De la lista «Tipos de comprobante de gasto»; sin comprobante, «Sin comprobante»"),
	}),
	salida: z.object({ gasto_id: z.uuid(), folio: z.string().describe("El G-") }),
	permiso: { departamento: "contaduria" },
	errores: [
		{ codigo: "categoria_del_sistema", mensaje: "Esa categoría la pone el sistema." },
		{ codigo: "categoria_de_baja", mensaje: "Esa categoría ya no se usa." },
	],
});

/** Contaduría cancela un gasto que registró, con motivo. */
export const cancelarGasto = definirAccion({
	nombre: "contaduria.cancelar_gasto",
	descripcion: "Cancela un gasto con su motivo; el de un servicio se corrige desde Mantenimiento",
	entrada: z.object({
		gasto_id: z.uuid().describe("El gasto"),
		motivo: z.string("Escribe el motivo").trim().min(1, "Escribe el motivo").max(200).describe("Por qué se cancela"),
	}),
	salida: z.object({ gasto_id: z.uuid() }),
	permiso: { departamento: "contaduria" },
	errores: [
		{ codigo: "gasto_cancelado", mensaje: "{G} ya está cancelado." },
		{ codigo: "gasto_de_mantenimiento", mensaje: "Este gasto viene del servicio {SM} de Mantenimiento." },
	],
	edita: true,
});
