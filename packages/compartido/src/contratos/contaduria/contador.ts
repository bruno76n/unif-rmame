/**
 * Los contratos del contador externo: mandar el paquete del mes, que se congela, y guardar lo que el contador regresa.
 * Fase 18 · docs/modulos/contaduria/contador-y-cuadres.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Contaduría manda el paquete de un mes al contador: sus renglones se congelan y su archivo se arma. */
export const marcarPaqueteEnviado = definirAccion({
	nombre: "contaduria.marcar_paquete_enviado",
	descripcion: "Marca el paquete de un mes como enviado al contador: sus cifras se congelan y se arma su archivo",
	entrada: z.object({ paquete_contador_id: z.uuid().describe("El paquete del mes") }),
	salida: z.object({ paquete_contador_id: z.uuid() }),
	permiso: { departamento: "contaduria" },
	errores: [{ codigo: "paquete_ya_enviado", mensaje: "El paquete de {mes} ya se mandó el {fecha}." }],
	edita: true,
});

/** Contaduría guarda un documento que regresó el contador: declaración, acuse, facturas u otro. */
export const adjuntarDocumentoContador = definirAccion({
	nombre: "contaduria.adjuntar_documento_contador",
	descripcion: "Guarda un documento que regresó el contador, con su tipo y, si se sabe, su mes y su paquete",
	entrada: z.object({
		archivo_id: z.uuid().describe("El archivo ya subido, con el propósito `documento_contador`"),
		tipo: z.enum(["declaracion", "acuse", "facturas", "documento"]).optional().describe("Qué es; sin él, documento"),
		mes: z.iso
			.date()
			.refine((fecha) => fecha.endsWith("-01"), "El primer día del mes")
			.optional()
			.describe("El mes al que se refiere, si se sabe"),
		paquete_contador_id: z.uuid().optional().describe("El paquete al que responde, si responde a uno"),
	}),
	salida: z.object({ documento_contador_id: z.uuid() }),
	permiso: { departamento: "contaduria" },
	errores: [
		{ codigo: "archivo_invalido", mensaje: "El archivo debe ser PDF, imagen, XML o ZIP." },
		{ codigo: "archivo_ya_guardado", mensaje: "Ese archivo ya está guardado." },
	],
});
