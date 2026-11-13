/**
 * El contrato de la página de la receta: la prenda con sus tallas, el estado y la versión que se ve, lo que se captura
 * (medidas, telas y avíos), los materiales que se pueden agregar, el próximo corte con sus piezas por talla y el
 * desperdicio (para la cuenta que corre mientras se escribe), el patrón contra el corte y las versiones.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («La página de la receta»)
 *
 * Las cantidades viajan como texto decimal con tres decimales, igual que las guarda la versión: la pantalla corre la
 * cuenta de material del paquete compartido con ellas, y la acción la repite al guardar.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";
import { papelesDeLaReceta, unidadesDeLaReceta } from "./recetas.ts";

/** Una talla de la prenda, en su orden. */
const tallaDeLaPrenda = z.object({
	talla_id: z.uuid(),
	nombre: z.string(),
	especial: z.boolean().describe("De pedido especial: dice «esp.» y no es obligatoria"),
});

/** El valor de una talla. */
const valorDeTalla = z.object({ talla_id: z.uuid(), cantidad: z.string().describe("Decimal con tres decimales") });

/** Un renglón de «Patrón contra corte, por talla» (también en el cajón Rendimiento). */
export const renglonPatronContraCorte = z.object({
	talla: z.string(),
	especial: z.boolean(),
	patron: z.string().nullable().describe("«0.92 m»; sin valor, vacío"),
	real: z.string().nullable().describe("«0.98 m», estimado: el patrón con el desperdicio de la prenda"),
	desperdicio: z.string().nullable().describe("«+6%»; sin lotes que la cortaran, vacío («Sin medir»)"),
	alto: z.boolean().describe("Si el desperdicio es alto"),
	lotes: z.number().int().describe("Los lotes cortados que la llevaban"),
	flojo: z.boolean().describe("Pocos lotes: dato flojo"),
});

export const recetaDeLaPrenda = definirConsulta({
	nombre: "patronaje.receta",
	descripcion:
		"La receta de una prenda para capturarla: sus tallas, su versión vigente (o una vieja), los materiales que puede llevar, su próximo corte, su desperdicio y sus versiones. Sin dinero",
	entrada: z.object({
		producto_id: z.uuid().describe("La prenda"),
		version_numero: z.coerce.number().int().positive().optional().describe("Para ver una versión vieja"),
	}),
	salida: z.object({
		producto_id: z.uuid(),
		receta_id: z.uuid(),
		prenda: z.string(),
		subtitulo: z.string().describe("«{escuela o Básico} · tallas {rango}»"),
		estado: z.object({ texto: z.string(), color: colorDeEstado }).describe("El estado de la receta"),
		version: z.number().int().describe("La versión de la receta (para guardar)"),
		vigente: z.number().int().nullable().describe("El número de la versión vigente; sin versión, vacío"),
		viendo: z.number().int().nullable().describe("El número de la versión que se ve, si es una vieja"),
		tallas: z.array(tallaDeLaPrenda).describe("Las tallas vivas de la prenda, en su orden"),
		talla_base_id: z.uuid().nullable().describe("La talla de en medio: la de base al llenar"),
		proximo_corte: z
			.object({
				texto: z.string().describe("«15 oct · en 4 días · L-2026-122, 190 piezas»"),
				lote: z.string(),
				piezas: z.number().int(),
				piezas_por_talla: z.array(z.object({ talla_id: z.uuid(), piezas: z.number().int() })),
			})
			.nullable()
			.describe("Sin corte programado, vacío"),
		desperdicio: z.object({
			pct: z.string().describe("El desperdicio de la prenda, en por ciento con tres decimales: el de la cuenta"),
			texto: z.string().describe("«+6% sobre el patrón, 3 lotes» o «+6% estimado, sin medir en corte»"),
			para_cortar: z.string().describe("«con 6% de desperdicio» o «con 6% de desperdicio, estimado»"),
		}),
		desarrollo: z
			.object({ desarrollo_id: z.uuid(), texto: z.string().describe("«DS-015 · Ficha técnica»") })
			.nullable()
			.describe("El desarrollo de donde salió la prenda"),
		medidas: z
			.array(z.object({ medida: z.string(), valores: z.array(z.object({ talla_id: z.uuid(), valor_cm: z.string() })) }))
			.describe("Las de la versión; sin medidas propias, las de su tipo de prenda"),
		lineas: z
			.array(
				z.object({
					papel: z.enum(papelesDeLaReceta),
					material_id: z.uuid(),
					modo: z.enum(["igual", "por_talla"]),
					unidad_receta: z.enum(unidadesDeLaReceta),
					cantidad: z.string().nullable().describe("Con `igual`"),
					tallas: z.array(valorDeTalla).describe("Con `por_talla`"),
					receta_por_unidad_inventario: z.string().describe("La conversión congelada en la versión"),
				}),
			)
			.describe("Los materiales de la versión, la tela principal primero; una receta nueva trae su tela y su avío"),
		materiales: z
			.array(
				z.object({
					material_id: z.uuid(),
					nombre: z.string(),
					tipo: z.enum(["tela", "avio", "consumible"]),
					detalle: z.string().describe("El ancho de la tela («Ancho 1.50 m»), si lo tiene"),
					unidad: z.string().describe("Su unidad de inventario («m», «pza», «conos»)"),
					unidad_captura: z.enum(unidadesDeLaReceta).describe("En la que se captura en la receta"),
					receta_por_unidad_inventario: z.string().describe("Cuántas de captura hacen una de inventario"),
					se_cuenta_entera: z.boolean().describe("Si su unidad de inventario se cuenta entera (conos)"),
				}),
			)
			.describe("Los materiales activos que puede llevar, y los de la versión aunque estén dados de baja"),
		patron_contra_corte: z
			.object({ tela: z.string(), tallas: z.array(renglonPatronContraCorte) })
			.nullable()
			.describe("Si ya tiene cortes"),
		versiones: z
			.array(
				z.object({
					numero: z.number().int(),
					vigente: z.boolean(),
					fecha: z.string().describe("«15 oct»"),
					persona: z.string(),
					motivo: z.string(),
					lotes: z.array(z.string()).describe("Los lotes cortados con esta versión"),
				}),
			)
			.describe("De la más nueva a la más vieja"),
	}),
	permiso: { departamento: "patronaje" },
});
