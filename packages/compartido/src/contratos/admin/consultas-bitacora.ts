/**
 * El contrato de la pestaña Bitácora: `admin.bitacora`, lo más reciente arriba, con el buscador, las fechas, los
 * filtros por tipo con su conteo y «Ver más».
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Bitácora») y docs/modulos/admin/bitacora.md
 *
 * Sin «ven sueldos y tarifas», el renglón que lleva sueldos o tarifas llega con su descripción recortada.
 */

import { z } from "zod";
import { definirConsulta, paginaDe, parametrosDePagina } from "../definir.ts";

/** Los filtros por tipo de la bitácora. */
export const filtrosDeBitacora = ["cambio", "acceso", "consulta_sensible"] as const;

export const bitacoraDeAdmin = definirConsulta({
	nombre: "admin.bitacora",
	descripcion:
		"La bitácora para leer: quién hizo qué y cuándo, con su buscador sin importar acentos ni mayúsculas, sus fechas y sus filtros",
	entrada: z.object({
		buscar: z.string().trim().max(80).optional().describe("Persona, departamento o qué pasó"),
		tipo: z.enum(filtrosDeBitacora).optional().describe("Cambios, accesos o consultas sensibles"),
		solo_alertas: z.enum(["si", "no"]).optional().describe("«si» para ver solo las alertas"),
		desde: z.iso.date().optional().describe("Desde este día, en hora de México"),
		hasta: z.iso.date().optional().describe("Hasta este día, en hora de México"),
		...parametrosDePagina(100),
	}),
	salida: z.object({
		es_duena: z.boolean().describe("Solo la dueña marca revisada una alerta"),
		conteos: z
			.object({
				todo: z.number().int(),
				cambio: z.number().int(),
				acceso: z.number().int(),
				consulta_sensible: z.number().int(),
				alertas: z.number().int(),
			})
			.describe("Con el buscador y las fechas"),
		...paginaDe(
			z.object({
				id: z.uuid(),
				fecha: z.string().describe("«9 nov»"),
				hora: z.string().describe("«10:42»"),
				tipo: z.enum(filtrosDeBitacora),
				tipo_texto: z.string().describe("«Cambios», «Accesos», «Consultas sensibles»"),
				es_alerta: z.boolean(),
				revisada: z.boolean().describe("Si es una alerta: si ya se revisó"),
				quien: z.string().describe("La persona; un aparato con su persona; o «Sistema»"),
				departamento: z.string().nullable(),
				descripcion: z.string().describe("Qué pasó; sin el permiso de sueldos, recortada"),
				folio: z.string().nullable(),
			}),
		),
	}),
	permiso: { departamento: "admin" },
});
