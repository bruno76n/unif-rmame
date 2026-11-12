/**
 * Los contratos de las diferencias y los conteos: aclarar una DF-, guardar un conteo ciego y la carga inicial.
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md («`inventario.aclarar_diferencia`») y
 * conteos.md («`inventario.guardar_conteo`», «`inventario.registrar_carga_inicial`»,
 * «`inventario.registrar_carga_inicial_material`»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Cómo se aclara una diferencia: las cuatro de recepción y las dos de material. */
export const aclaracionesDeDiferencia = [
	"llego",
	"no_salio",
	"venia_en_otro",
	"perdida",
	"ajuste",
	"aclarada",
] as const;

/** Bodega dice dónde estaba de verdad lo pendiente de una DF- de recepción, o cómo se cierra una de material. */
export const aclararDiferencia = definirAccion({
	nombre: "inventario.aclarar_diferencia",
	descripcion: "Aclara una diferencia por aclarar: mueve lo pendiente adonde estaba, o pide un ajuste a Dirección",
	entrada: z.object({
		diferencia_id: z.uuid().describe("La diferencia"),
		aclaracion: z
			.enum(aclaracionesDeDiferencia)
			.describe("`llego`, `no_salio`, `venia_en_otro` o `perdida` (recepción); `ajuste` o `aclarada` (material)"),
		motivo: z.string().trim().max(500).describe("Lo que pasó, de `general.largo_minimo_motivo` letras o más"),
		otra_diferencia_id: z.uuid().optional().describe("Obligatoria en `venia_en_otro`: su espejo"),
		motivo_id: z.uuid().optional().describe("De «Motivos de ajuste»: obligatorio en `perdida` y `ajuste`"),
	}),
	salida: z.object({
		ajuste_id: z.uuid().optional().describe("El AJ- que nació, en `perdida` y `ajuste`"),
		traspaso_id: z.uuid().optional().describe("El A- en que entró a aduana lo aclarado, si nació uno"),
	}),
	permiso: { departamento: "bodega" },
	errores: [
		{ codigo: "no_por_aclarar", mensaje: "{DF} no está por aclarar." },
		{ codigo: "aclaracion_no_aplica", mensaje: "Esa aclaración no aplica a {DF}." },
		{ codigo: "sigue_en_negativo", mensaje: "{material} sigue en negativo en {ubicación}: aclárala con ajuste." },
		{
			codigo: "espejo_no_corresponde",
			mensaje:
				"{DF} no es su espejo: tiene que ser de la misma prenda y talla, con las mismas piezas al revés, y estar por aclarar.",
		},
	],
	edita: true,
});

/** Bodega o Aduana guardan un conteo ciego: por sección, o de una DF- por contar. */
export const guardarConteo = definirAccion({
	nombre: "inventario.guardar_conteo",
	descripcion: "Guarda un conteo ciego con lo que decía el sistema a su hora; si no cuadra, pide un ajuste",
	entrada: z.object({
		ubicacion_id: z.uuid().describe("Bodega o Aduana"),
		seccion_id: z.uuid().optional().describe("En un conteo nuevo: la sección que se contó"),
		diferencia_id: z.uuid().optional().describe("En el conteo de una diferencia: la DF- por contar"),
		contado_en: z.iso
			.datetime({ offset: true })
			.optional()
			.describe("La hora real del conteo; si no viene, ahora. Nunca después de ahora"),
		renglones: z
			.array(
				z.object({
					variante_id: z.uuid().describe("La prenda y talla"),
					piezas: z.number("Piezas").int("Piezas").min(0, "Piezas").max(9999, "Piezas").describe("Lo contado"),
				}),
			)
			.min(1, "Cuenta al menos una prenda.")
			.describe("Lo contado, una vez por variante"),
		motivo_id: z.uuid().optional().describe("De «Motivos de ajuste»: obligatorio si hay diferencias"),
		motivo_texto: z.string().trim().max(200).optional().describe("Lo que quieras agregar al motivo"),
	}),
	salida: z.object({
		conteo_id: z.uuid().describe("El conteo"),
		folio: z.string().describe("Su folio CN-"),
		ajuste_id: z.uuid().optional().describe("El AJ- que nació si no cuadró"),
	}),
	permiso: { departamento: ["bodega", "aduana"] },
	errores: [
		{ codigo: "ubicacion_no_contable", mensaje: "Aquí solo se cuenta en Bodega o en Aduana." },
		{ codigo: "variante_ajena", mensaje: "{prenda} talla {t} no es de {sección}." },
		{ codigo: "diferencia_no_por_contar", mensaje: "{DF} ya no está por contar." },
		{
			codigo: "ajuste_pendiente",
			mensaje: "{prenda} talla {t} tiene el {AJ} esperando autorización: cuéntala cuando Dirección lo decida.",
		},
	],
});

/** Bodega carga la existencia de arranque de unas prendas en Bodega o en Aduana: sin ajuste. */
export const registrarCargaInicial = definirAccion({
	nombre: "inventario.registrar_carga_inicial",
	descripcion: "Carga la existencia de arranque de unas prendas, sin ajuste, donde todavía no tienen movimientos",
	entrada: z.object({
		ubicacion_id: z.uuid().describe("Bodega o Aduana"),
		alcance: z.enum(["prenda", "seccion", "toda"]).describe("Una prenda, una sección o todo"),
		producto_id: z.uuid().optional().describe("Con alcance `prenda`"),
		seccion_id: z.uuid().optional().describe("Con alcance `seccion`"),
		contado_en: z.iso.datetime({ offset: true }).optional().describe("La hora del conteo; si no viene, ahora"),
		renglones: z
			.array(
				z.object({
					variante_id: z.uuid().describe("La prenda y talla"),
					piezas: z.number("Piezas").int("Piezas").min(0, "Piezas").describe("Lo que hay"),
				}),
			)
			.min(1, "Cuenta al menos una prenda.")
			.describe("Lo contado, una vez por variante"),
	}),
	salida: z.object({ conteo_id: z.uuid().describe("El conteo inicial"), folio: z.string().describe("Su CN-") }),
	permiso: { departamento: "bodega" },
	errores: [
		{ codigo: "ubicacion_no_contable", mensaje: "Aquí solo se cuenta en Bodega o en Aduana." },
		{ codigo: "variante_ajena", mensaje: "{prenda} talla {t} no es de {alcance}." },
		{
			codigo: "ya_tiene_movimientos",
			mensaje: "{prenda} talla {t} ya tiene movimientos en {ubicación}: usa un conteo.",
		},
	],
});

/** Un rollo de la carga inicial de tela: sus metros y, si se sabe, el código de su partida. */
const rolloDeCarga = z.object({
	metros: z
		.string("Metros")
		.trim()
		.regex(/^\d{1,6}(\.\d{1,3})?$/, "Metros")
		.refine((texto) => Number(texto) > 0, "Metros")
		.describe("Los metros del rollo, mayores que 0"),
	partida: z
		.string("Partida")
		.trim()
		.min(1, "Partida")
		.max(20, "Partida")
		.optional()
		.describe("El código de la partida del proveedor habitual; se guarda en mayúsculas"),
});

/** Bodega carga lo que hay hoy de un material: la tela por rollo, lo demás por cantidad. */
export const registrarCargaInicialMaterial = definirAccion({
	nombre: "inventario.registrar_carga_inicial_material",
	descripcion: "Carga lo que hay hoy de un material: la tela con sus rollos y su costo; lo demás por cantidad",
	entrada: z.object({
		material_id: z.uuid().describe("El material"),
		cantidad: z
			.string("Escribe lo que contaste, puede ser 0.")
			.trim()
			.regex(/^\d{1,9}(\.\d{1,3})?$/, "Escribe lo que contaste, puede ser 0.")
			.describe("Lo que hay, en su unidad de inventario; entera si se cuenta entera"),
		rollos: z.array(rolloDeCarga).optional().describe("Solo en tela: sus rollos, que suman la cantidad"),
	}),
	salida: z.object({
		movimiento_id: z.uuid().optional().describe("El movimiento de la carga, si había algo"),
		rollos: z.array(z.object({ rollo_id: z.uuid(), folio: z.string() })).describe("Los rollos que nacieron"),
	}),
	permiso: { departamento: "bodega" },
	errores: [{ codigo: "ya_tiene_carga_inicial", mensaje: "{material} ya tiene carga inicial o movimientos." }],
});
