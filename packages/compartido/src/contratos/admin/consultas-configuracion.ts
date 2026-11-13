/**
 * Los contratos de las consultas de Configuración: `admin.configuracion` (las decisiones de operación, los permisos
 * finos, las ubicaciones, las listas, los parámetros, la empresa, las impresoras y los folios) y
 * `admin.historial_parametro` (los valores que tuvo un parámetro).
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Configuración») y docs/modulos/admin/configuracion.md
 *
 * Un parámetro en pesos viaja en `valor_centavos`, opcional, para que el servidor se lo quite a la cuenta de soporte;
 * los demás, en `valor`. Los mínimos de existencia los da `inventario.minimos_vigentes`.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { permisosFinosDeCuenta } from "./cuentas.ts";

/** Los tipos de valor de un parámetro. */
export const tiposDeValorDeParametro = [
	"entero",
	"centavos",
	"porcentaje",
	"opcion",
	"booleano",
	"texto",
	"hora",
] as const;

/** Un parámetro como lo pinta su casilla. */
export const parametroParaVer = z.object({
	clave: z.string(),
	ubicacion_id: z.uuid().nullable().describe("Para un valor por ubicación"),
	version: z.number().int().describe("La versión, para cambiarlo"),
	nombre: z.string(),
	explicacion: z.string().nullable(),
	tipo: z.enum(tiposDeValorDeParametro),
	unidad: z.string().nullable(),
	valor: z
		.union([z.number(), z.string(), z.boolean(), z.null()])
		.describe("El valor con su tipo; nulo si está vacío o si es en pesos"),
	valor_centavos: z.number().int().nullable().optional().describe("El valor de un parámetro en pesos"),
	opciones: z.array(z.object({ valor: z.string(), texto: z.string() })).describe("Las de una opción"),
	minimo: z.number().nullable(),
	maximo: z.number().nullable(),
	permite_vacio: z.boolean(),
	por_decidir: z.boolean().describe("Sale con «Por decidir» hasta que la dueña lo cambia"),
});

/** Una lista con sus valores, como su tarjeta. */
const listaParaVer = z.object({
	clave: z.string().describe("La clave de la lista, o `secciones_catalogo` para las secciones del catálogo"),
	nombre: z.string(),
	valores: z.array(z.string()).describe("Sus nombres, en su orden"),
	puede_agregar: z.boolean().describe("Si quien ve puede agregar a esta lista"),
});

export const configuracionDeAdmin = definirConsulta({
	nombre: "admin.configuracion",
	descripcion:
		"Configuración: las decisiones de operación, los permisos finos de cada cuenta, las ubicaciones, las listas, los parámetros, la empresa, las impresoras de etiquetas y los siguientes folios",
	entrada: z.object({}),
	salida: z.object({
		es_duena: z.boolean().describe("Solo la dueña cambia"),
		decisiones: z.array(parametroParaVer).describe("La sección `decision_operacion`, en el orden de cada módulo"),
		permisos_finos: z.array(
			z.object({
				usuario_id: z.uuid(),
				version: z.number().int(),
				nombre: z.string(),
				es_duena: z.boolean().describe("Su casilla va marcada y fija"),
				permisos: z.array(z.enum(permisosFinosDeCuenta)),
			}),
		),
		parametros: z.array(parametroParaVer).describe("La sección `parametro`"),
		tecnicos: z.array(parametroParaVer).describe("La sección `tecnico`"),
		ubicaciones: z.array(
			z.object({
				nombre: z.string(),
				responsable: z.string().describe("Su responsable, o quien lo es según su tipo"),
				que_es: z.string(),
			}),
		),
		listas: z.array(listaParaVer),
		tipos_prenda: z
			.array(z.object({ id: z.uuid(), nombre: z.string() }))
			.describe("Para la sección nueva del catálogo: el tipo de prenda que propone"),
		empresa: z
			.object({
				version: z.number().int(),
				razon_social: z.string(),
				nombre_comercial: z.string(),
				rfc: z.string(),
				domicilio: z.string(),
			})
			.nullable(),
		impresoras: z.array(
			z.object({
				impresora_id: z.uuid(),
				version: z.number().int(),
				nombre: z.string(),
				modelo: z.string(),
				ubicacion_id: z.uuid(),
				ubicacion: z.string(),
				dispositivo_id: z.uuid().nullable().describe("Su programa puente"),
				puente: z.string().nullable(),
				conectada: z.boolean(),
			}),
		),
		puentes: z
			.array(z.object({ dispositivo_id: z.uuid(), nombre: z.string() }))
			.describe("Los programas de impresión vigentes, para escoger"),
		ubicaciones_para_escoger: z.array(z.object({ ubicacion_id: z.uuid(), nombre: z.string() })),
		folios: z.array(z.object({ nombre: z.string(), folio: z.string() })).describe("Los siguientes PE-, NV-, OC-, G-"),
		codigo_barras: z.string().describe("«100245 · fábrica 100001–499999»"),
	}),
	permiso: { departamento: "admin" },
});

export const historialParametroDeAdmin = definirConsulta({
	nombre: "admin.historial_parametro",
	descripcion: "Los valores que tuvo un parámetro, el más nuevo arriba: desde cuándo y quién lo puso",
	entrada: z.object({
		clave: z.string().min(1).describe("La clave del parámetro"),
		ubicacion_id: z.uuid().optional().describe("Para un valor por ubicación"),
	}),
	salida: z.object({
		nombre: z.string(),
		renglones: z.array(
			z.object({
				valor: z.string().nullable().describe("Como se lee: «3 días», «Sí»; nulo si es en pesos"),
				valor_centavos: z.number().int().nullable().optional().describe("El valor de un parámetro en pesos"),
				desde: z.string().describe("«9 nov · 10:42»"),
				quien: z.string().describe("Quién lo puso, o «Valor inicial»"),
			}),
		),
	}),
	permiso: { departamento: "admin" },
	errores: [{ codigo: "no_existe", mensaje: "Ese parámetro no existe." }],
});
