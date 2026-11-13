/**
 * Los contratos de las consultas de las pestañas de Mantenimiento: Pendientes, Máquinas, Fallas, Servicios y Costo por
 * máquina. Solo las piden las cuentas con Mantenimiento, que ven el costo de cada reparación y el paro en pesos.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md (cada pestaña con su «Consulta»)
 *
 * El estado de cada máquina y de cada falla llega escrito, con su color: la pantalla solo lo pinta. Los montos
 * (`*_centavos`) son opcionales: el servidor los recorta a quien no debe verlos (la cuenta de soporte).
 */

import { z } from "zod";
import { definirConsulta, paginaDe, parametrosDePagina } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

/** Un estado ya escrito, en su forma de la guía de textos, con su color. */
export const estadoEscrito = z.object({
	texto: z.string().describe("El estado: «Trabajando», «Parada», «Trabaja con falla», «Reportada»…"),
	color: colorDeEstado,
});

/** Un monto que el servidor puede recortar. */
const monto = (descripcion: string) => z.number().int().optional().describe(`${descripcion}, en centavos`);

/** Los grupos de la pestaña Fallas. */
export const gruposDeFallas = ["abiertas", "resueltas"] as const;

export const pendientesDeMantenimiento = definirConsulta({
	nombre: "mantenimiento.pendientes",
	descripcion:
		"Pendientes de Mantenimiento: las cifras de máquinas, fallas, servicios y costo, y una falla abierta por renglón con lo que detiene",
	entrada: z.object({}),
	salida: z.object({
		indicadores: z.object({
			maquinas: z.object({
				activas: z.number().int(),
				trabajando: z.number().int(),
				con_falla: z.number().int().describe("Las que trabajan con falla"),
				paradas: z.number().int(),
			}),
			fallas: z.object({ abiertas: z.number().int(), resueltas_en_el_anio: z.number().int() }),
			servicios: z.object({ en_el_anio: z.number().int(), este_mes_centavos: monto("Lo de los servicios del mes") }),
			costo: z.object({
				horas_paro: z
					.number()
					.int()
					.describe("Las de los servicios del año más las de las fallas abiertas que detuvieron su máquina"),
				por_paro_centavos: monto("Las horas de paro por `mantenimiento.costo_hora_paro`"),
				reparaciones_centavos: monto("Lo de los servicios del año"),
				horas_por_mes: z.array(z.number().int()).describe("Las horas de paro de los servicios de los últimos 6 meses"),
			}),
		}),
		renglones: z.array(
			z.object({
				falla_id: z.uuid(),
				referencia: z.string().describe("«{máquina} · {quien la trae}»"),
				detalle: z.string().describe("Lo que le pasa y, si aplica, «· detiene {lotes}»"),
				fecha: z.string().describe("El día del reporte"),
				horas_paro: z.number().int().nullable().describe("Las que lleva, si detuvo la máquina"),
				parada: z.boolean().describe("Si la falla detuvo la máquina"),
				estado: estadoEscrito,
			}),
		),
		pastilla: z.object({ conteo: z.number().int(), rojo: z.boolean() }).describe("La pastilla del menú"),
	}),
	permiso: { departamento: "mantenimiento" },
});

/** Una máquina en la lista de su área. */
const maquinaDeLaLista = z.object({
	maquina_id: z.uuid(),
	nombre: z.string(),
	folio: z.string(),
	tipo: z.string(),
	marca_modelo: z.string().nullable().describe("La marca y el modelo"),
	serie: z.string().nullable(),
	la_trae: z.string().nullable().describe("Quien la trae; vacío si esa persona se dio de baja"),
	ultimo_servicio: z.object({ fecha: z.string(), que_se_hizo: z.string() }).nullable(),
	estado: estadoEscrito,
});

export const maquinasDeMantenimiento = definirConsulta({
	nombre: "mantenimiento.maquinas",
	descripcion: "Las máquinas activas por área, con su estado y su último servicio, y las dadas de baja",
	entrada: z.object({}),
	salida: z.object({
		activas: z.number().int(),
		areas: z.array(z.object({ area_id: z.uuid(), nombre: z.string(), maquinas: z.array(maquinaDeLaLista) })),
		bajas: z.array(
			z.object({
				maquina_id: z.uuid(),
				nombre: z.string(),
				folio: z.string(),
				desde: z.string().describe("El día de la baja"),
				motivo: z.string(),
			}),
		),
	}),
	permiso: { departamento: "mantenimiento" },
});

export const fallasDeMantenimiento = definirConsulta({
	nombre: "mantenimiento.fallas",
	descripcion:
		"Las fallas de un grupo: las abiertas, todas; las resueltas, de la más reciente a la más vieja, por páginas",
	entrada: z.object({
		grupo: z.enum(gruposDeFallas).optional().describe("Sin él, las abiertas"),
		...parametrosDePagina(100),
	}),
	salida: z.object({
		conteos: z.object({ abiertas: z.number().int(), resueltas: z.number().int() }),
		...paginaDe(
			z.object({
				falla_id: z.uuid(),
				folio: z.string(),
				fecha: z.string(),
				maquina: z.string(),
				maquina_folio: z.string(),
				motivo: z.string().describe("Qué le pasa"),
				detuvo: z.boolean().describe("«La detuvo» o «Siguió trabajando»"),
				reporto: z.string(),
				horas_paro: z
					.number()
					.int()
					.nullable()
					.describe("De una resuelta, las de su servicio; de una abierta parada, las que lleva"),
				estado: estadoEscrito,
			}),
		),
	}),
	permiso: { departamento: "mantenimiento" },
});

export const serviciosDeMantenimiento = definirConsulta({
	nombre: "mantenimiento.servicios",
	descripcion: "Los servicios de un año, del más reciente al más viejo, por páginas, con lo que suman",
	entrada: z.object({
		anio: z.coerce.number().int().min(2000).max(2100).optional().describe("El año; sin él, el actual"),
		...parametrosDePagina(100),
	}),
	salida: z.object({
		anio: z.number().int(),
		anios: z.array(z.number().int()).describe("Los años con servicios y el actual, del más reciente al más viejo"),
		resumen: z.object({
			servicios: z.number().int(),
			total_centavos: monto("Lo que suman"),
			horas_paro: z.number().int(),
		}),
		...paginaDe(
			z.object({
				servicio_id: z.uuid(),
				folio: z.string(),
				fecha: z.string(),
				maquina: z.string(),
				maquina_folio: z.string(),
				tecnico: z.string(),
				que_se_hizo: z.string(),
				costo_centavos: monto("Su costo"),
				horas_paro: z.number().int(),
			}),
		),
	}),
	permiso: { departamento: "mantenimiento" },
});

export const costoPorMaquina = definirConsulta({
	nombre: "mantenimiento.costo_por_maquina",
	descripcion:
		"Lo gastado contra lo parado de cada máquina en el año: sus reparaciones y su paro en horas y en pesos, de la que más cuesta a la que menos",
	entrada: z.object({
		costo_hora_centavos: z.coerce
			.number()
			.int()
			.min(0)
			.max(99_999_999)
			.optional()
			.describe("Lo que cuesta una hora de paro solo para esta pantalla; sin él o en 0, el de Configuración"),
	}),
	salida: z.object({
		costo_hora_centavos: monto("El costo de la hora con que se calculó"),
		costo_hora_configuracion_centavos: monto("`mantenimiento.costo_hora_paro`"),
		reparaciones_centavos: monto("Las reparaciones del año"),
		horas_paro: z.number().int(),
		paro_centavos: monto("Las horas de paro por el costo de la hora"),
		maquinas: z.array(
			z.object({
				maquina_id: z.uuid(),
				nombre: z.string(),
				servicios: z.number().int(),
				la_trae: z.string().nullable(),
				reparaciones_centavos: monto("Sus servicios del año"),
				horas_paro: z.number().int(),
				paro_centavos: monto("Su paro en pesos"),
			}),
		),
	}),
	permiso: { departamento: "mantenimiento" },
});
