/**
 * Los contratos de las consultas de los cajones y las ventanas de Mantenimiento: la falla, la máquina y las listas de
 * las ventanas. Solo las piden las cuentas con Mantenimiento.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Cajones» y «Ventanas»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { estadoEscrito } from "./consultas-pestanas.ts";

/** Los estados de una falla, como los guarda la base. */
export const estadosDeFalla = ["reportada", "en_reparacion", "resuelta"] as const;

/** Un monto que el servidor puede recortar. */
const monto = (descripcion: string) => z.number().int().optional().describe(`${descripcion}, en centavos`);

/** Algo de una lista, para escoger. */
const deLaLista = z.object({ id: z.uuid(), nombre: z.string() });

export const fallaDeMantenimiento = definirConsulta({
	nombre: "mantenimiento.falla",
	descripcion:
		"Una falla: su estado, su paro, quién la reportó y quién traía la máquina, su técnico, su nota de seguimiento, los lotes que detiene y su servicio",
	entrada: z.object({ falla_id: z.uuid().describe("La falla") }),
	salida: z.object({
		falla_id: z.uuid(),
		version: z.number().int(),
		folio: z.string(),
		fecha: z.string(),
		estado_clave: z.enum(estadosDeFalla),
		estado: estadoEscrito,
		maquina_id: z.uuid(),
		maquina: z.string(),
		titulo: z.string().describe("«{máquina}: {lo que le pasa, en minúsculas}»"),
		motivo: z.string(),
		detuvo: z.boolean().describe("Si la falla detuvo la máquina"),
		horas_paro: z.number().int(),
		horas_propuestas: z.number().int().describe("Las horas de paro que propone la reparación"),
		reparacion_centavos: monto("El costo de su servicio, si ya se resolvió"),
		reporto: z.string().describe("«{persona}, desde la tablet», o quien la reportó en Mantenimiento"),
		la_trae: z.string().nullable().describe("Quien traía la máquina al fallar"),
		maquina_detalle: z.string().describe("«{tipo} {marca} {modelo} · {serie}»"),
		tecnico_id: z.uuid().nullable(),
		tecnico: z.string().nullable().describe("El técnico de la reparación"),
		nota_seguimiento: z.string().nullable(),
		deteniendo: z.array(
			z.object({
				lote_id: z.uuid(),
				folio: z.string(),
				texto: z.string().describe("«{prenda} para {destino}»"),
				entrega: z.string(),
			}),
		),
		servicio: z
			.object({
				folio: z.string(),
				fecha: z.string(),
				que_se_hizo: z.string(),
				costo_centavos: monto("Su costo"),
				horas_paro: z.number().int(),
				paro_centavos: monto("Sus horas de paro por `mantenimiento.costo_hora_paro`"),
			})
			.nullable(),
	}),
	permiso: { departamento: "mantenimiento" },
});

export const maquinaDeMantenimiento = definirConsulta({
	nombre: "mantenimiento.maquina",
	descripcion: "Una máquina: su estado, lo que ha costado en el año, sus datos, quién la trae y su historial",
	entrada: z.object({ maquina_id: z.uuid().describe("La máquina") }),
	salida: z.object({
		maquina_id: z.uuid(),
		version: z.number().int(),
		folio: z.string(),
		nombre: z.string(),
		area: z.string(),
		estado: estadoEscrito,
		tipo: z.string(),
		marca_modelo: z.string().nullable(),
		serie: z.string().nullable(),
		la_trae: deLaLista.nullable().describe("Quien la trae"),
		reparaciones_centavos: monto("Sus servicios del año"),
		horas_paro: z.number().int().describe("Las de sus servicios del año y las de su falla abierta, si la detuvo"),
		paro_centavos: monto("Su paro en pesos"),
		fallas_en_el_anio: z.number().int(),
		historial: z.array(
			z.discriminatedUnion("tipo", [
				z.object({
					tipo: z.literal("falla"),
					clave: z.string(),
					fecha: z.string(),
					texto: z.string().describe("«Falla: {lo que le pasa}, reportó {persona}»"),
				}),
				z.object({
					tipo: z.literal("servicio"),
					clave: z.string(),
					fecha: z.string(),
					que_se_hizo: z.string(),
					tecnico: z.string(),
					costo_centavos: monto("Su costo"),
					horas_paro: z.number().int(),
				}),
			]),
		),
		falla_abierta: z.string().nullable().describe("El folio de su falla abierta, si tiene"),
		dada_de_baja: z.object({ desde: z.string(), motivo: z.string() }).nullable(),
		puede: z
			.object({
				dar_de_baja: z.boolean().describe("Si se puede dar de baja (`mantenimiento.baja_maquina`): sin falla abierta"),
				razon: z
					.string()
					.nullable()
					.describe("Por qué no, para leer junto al botón; nulo si se puede o ya está de baja"),
			})
			.describe("Lo que se puede hacer con la máquina"),
	}),
	permiso: { departamento: "mantenimiento" },
});

export const opcionesDeMantenimiento = definirConsulta({
	nombre: "mantenimiento.opciones",
	descripcion:
		"Las listas de las ventanas de Mantenimiento: tipos, áreas, gente del Taller, técnicos, motivos de falla y máquinas activas",
	entrada: z.object({}),
	salida: z.object({
		tipos: z.array(deLaLista),
		areas: z.array(deLaLista).describe("La lista «Áreas del taller»"),
		personas: z.array(deLaLista).describe("La gente activa del Taller"),
		tecnicos: z.array(deLaLista).describe("Los técnicos vigentes"),
		motivos: z.array(deLaLista.extend({ detiene: z.boolean() })).describe("En su orden"),
		maquinas: z.array(
			z.object({
				id: z.uuid(),
				nombre: z.string(),
				folio: z.string(),
				version: z.number().int().describe("Para un servicio suelto"),
				con_falla_abierta: z.boolean(),
			}),
		),
	}),
	permiso: { departamento: "mantenimiento" },
});
