/**
 * El contrato de la pestaña Respaldos: `admin.respaldos`, con la recuperación del proveedor, el respaldo semanal, la
 * última restauración probada y el historial de pruebas.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Respaldos») y docs/modulos/admin/respaldos.md
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { tonoDeLinea } from "./vistas.ts";

export const respaldosDeAdmin = definirConsulta({
	nombre: "admin.respaldos",
	descripcion:
		"Respaldos: la recuperación a un punto en el tiempo, el último respaldo semanal, la última restauración probada, cuándo toca la siguiente y las pruebas",
	entrada: z.object({}),
	salida: z.object({
		es_duena: z.boolean().describe("Solo la dueña registra una restauración"),
		recuperacion_dias: z
			.number()
			.int()
			.nullable()
			.describe("Los días de recuperación del proveedor; nulo es «Sin dato del proveedor»"),
		semanal: z
			.object({
				texto: z.string().describe("«11 oct · 03:00»"),
				correcto: z.boolean(),
				tamano: z.string().nullable().describe("«1.8 GB»"),
			})
			.nullable(),
		ultima_prueba: z
			.object({
				texto: z.string().describe("«29 jul · hace 81 días»"),
				tono: tonoDeLinea.describe("Ámbar desde `admin.restauracion_aviso_dias`"),
				siguiente: z
					.string()
					.describe("«Se prueba cada {n} días en el ambiente de pruebas · la siguiente toca a más tardar el {fecha}»"),
			})
			.nullable(),
		cada_dias: z.number().int().describe("`admin.restauracion_cada_dias`"),
		pruebas: z.array(
			z.object({
				restauracion_id: z.uuid(),
				fecha: z.string().describe("«29 jul · 11:00»"),
				que: z.string().describe("«Respaldo semanal del 27 jul» o «Punto en el tiempo: 28 jul · 23:00»"),
				cuadro: z.boolean(),
				evidencia_archivo_id: z.uuid(),
				evidencia: z.string().describe("El nombre del archivo"),
			}),
		),
		respaldos_correctos: z
			.array(z.object({ respaldo_id: z.uuid(), texto: z.string() }))
			.describe("Los últimos respaldos correctos, para escoger cuál se restauró"),
	}),
	permiso: { departamento: "admin" },
});
