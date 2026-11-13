/**
 * El contrato de Pendientes de Administración del sistema: `admin.pendientes`, con las cuatro cifras (usuarios,
 * dispositivos, bitácora y respaldos) y la cola de altas por confirmar, aparatos sin sincronizar, alertas de seguridad
 * sin revisar y la prueba de restauración por probar.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Pendientes»)
 *
 * Los renglones llegan armados, con su estado y su color; la pantalla solo los pinta y abre lo que dice su botón. Las
 * altas por confirmar solo le llegan a la dueña, que es quien las decide.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { cifraDeAdmin, estadoDeAdmin } from "./vistas.ts";

/** Los grupos de Pendientes: el filtro de la pantalla. */
export const gruposDePendientesDeAdmin = ["usuarios", "dispositivos", "seguridad"] as const;

/** Los tipos de pendiente. */
export const tiposDePendienteDeAdmin = ["alta_usuario", "dispositivo", "alerta", "respaldo"] as const;

/** Lo que hace el botón de un pendiente. */
export const accionesDePendienteDeAdmin = [
	"revisar",
	"ver_dispositivo",
	"marcar_revisada",
	"ver_bitacora",
	"ver_respaldos",
] as const;

export const pendientesDeAdmin = definirConsulta({
	nombre: "admin.pendientes",
	descripcion:
		"Pendientes de Administración del sistema: las cifras de usuarios, dispositivos, bitácora y respaldos, y las altas por confirmar, los aparatos sin sincronizar, las alertas sin revisar y la prueba de restauración",
	entrada: z.object({
		grupo: z
			.enum(["todos", ...gruposDePendientesDeAdmin])
			.optional()
			.describe("El filtro; sin él, todos"),
	}),
	salida: z.object({
		cifras: z.object({
			usuarios: cifraDeAdmin.describe("Las cuentas con acceso, sin soporte; ámbar si hay altas por confirmar"),
			dispositivos: cifraDeAdmin.describe("Los aparatos vigentes; rojo si alguno no sincroniza"),
			bitacora: cifraDeAdmin.describe("Los movimientos de hoy, con las alertas y las consultas sensibles"),
			respaldos: cifraDeAdmin.describe(
				"Los días sin probar una restauración; ámbar desde `admin.restauracion_aviso_dias`",
			),
		}),
		renglones: z.array(
			z.object({
				clave: z.string(),
				grupo: z.enum(gruposDePendientesDeAdmin),
				tipo: z.enum(tiposDePendienteDeAdmin),
				titulo: z.string().describe("Quién pidió el alta, el aparato, lo que pasó o «Prueba de restauración»"),
				detalle: z.string().describe("La línea de abajo de la referencia"),
				fecha: z
					.object({
						momento: z.string().describe("Para ordenar"),
						texto: z.string().describe("«9 oct» o «9 oct · 10:42»"),
					})
					.nullable(),
				tiempo: z.string().nullable().describe("«hace 5 h», en los aparatos sin sincronizar"),
				estado: estadoDeAdmin,
				accion: z.object({
					tipo: z.enum(accionesDePendienteDeAdmin),
					texto: z.string().describe("El texto del botón"),
					id: z.uuid().nullable().describe("La autorización, el aparato o la alerta"),
				}),
			}),
		),
		conteos: z.object({
			todos: z.number().int(),
			usuarios: z.number().int(),
			dispositivos: z.number().int(),
			seguridad: z.number().int(),
		}),
	}),
	permiso: { departamento: "admin" },
});
