/**
 * El contrato de la pestaña Corte: los lotes por cortar y, del escogido, todo lo que la captura necesita para correr
 * mientras se escribe la misma cuenta que repite `produccion.cerrar_corte` al cerrar (la receta de cada tela, el
 * desperdicio, los rollos que se pueden usar en su orden, las tallas y quién corta).
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Corte») y docs/modulos/produccion/corte-y-bultos.md (regla 12)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";
import { paraQuien, recetaDeLaPrenda } from "./pantallas.ts";

/** Una etiqueta de color («Tela entregada», «Sin verificar»). */
const etiqueta = z.object({ texto: z.string(), color: colorDeEstado });

/** Un decimal con hasta tres decimales, como lo usa la cuenta de material. */
const decimal = z.string().regex(/^\d+(\.\d{1,3})?$/);

export const capturaDeCorte = definirConsulta({
	nombre: "produccion.corte",
	descripcion:
		"Los lotes por cortar y la captura del escogido: su receta por tela, el desperdicio, los rollos en el orden en que se usan, las tallas y quién corta. Sin dinero",
	entrada: z.object({
		lote_id: z.uuid().optional().describe("El lote escogido; sin él, el primero por fecha de corte"),
	}),
	salida: z.object({
		lotes: z
			.array(
				z.object({
					lote_id: z.uuid(),
					folio: z.string(),
					fecha_corte: z.string().describe("Ya escrita"),
					corte_pronto: z.boolean().describe("A `inventario.dias_entrega_corte` días o menos: ámbar"),
					prenda: z.string(),
					detalle: z.string().describe("«190 piezas · Distribuidora Escolar Zamora»"),
					tela: etiqueta.nullable().describe("«Tela entregada» o «Tela por entregar»; más lejos, nada"),
					receta: recetaDeLaPrenda,
				}),
			)
			.describe("Los lotes por cortar, por fecha de corte"),
		captura: z
			.object({
				lote_id: z.uuid(),
				version: z.number().int().describe("La versión del lote, para «Cerrar corte»"),
				folio: z.string(),
				orden: z.string(),
				prenda: z.string(),
				producto_id: z.uuid(),
				para: paraQuien,
				fecha_corte: z.string().describe("Ya escrita: «15 oct»"),
				tela: etiqueta.describe("La etiqueta de la tela: aquí siempre sale"),
				receta: recetaDeLaPrenda,
				receta_version_id: z.uuid().nullable(),
				aviso_version: z.string().nullable().describe("Si Bodega entregó tela para otra versión de la receta"),
				desperdicio_pct: decimal.describe("El desperdicio de la prenda, para lo que pide la receta"),
				frontera: decimal.describe("`inventario.metros_frontera_rollo`"),
				rendimiento_rojo: z.number().describe("`produccion.rendimiento_rojo_porcentaje`"),
				tallas: z.array(
					z.object({
						variante_id: z.uuid(),
						talla_id: z.uuid(),
						talla: z.string(),
						planeadas: z.number().int(),
					}),
				),
				telas: z
					.array(
						z.object({
							material_id: z.uuid(),
							nombre: z.string(),
							papel: z.enum(["tela_principal", "combinacion", "forro"]),
							receta: z.object({
								cantidad: decimal.nullable().describe("Por prenda, si va igual en todas las tallas"),
								por_talla: z.array(z.object({ talla_id: z.uuid(), cantidad: decimal })),
								receta_por_unidad_inventario: decimal,
							}),
							rollos: z
								.array(
									z.object({
										rollo_id: z.uuid(),
										folio: z.string(),
										partida: z.string().nullable(),
										metros: decimal,
										entregado: z.boolean().describe("Entregado a este corte"),
										sugerido: z.boolean().describe("Sugerido para este lote"),
									}),
								)
								.describe("Los que se pueden usar, en el orden en que conviene usarlos"),
						}),
					)
					.describe("Una por tela de la receta: la principal primero"),
				personas: z
					.array(z.object({ persona_id: z.uuid(), nombre: z.string() }))
					.describe("Las activas del Taller; primero quien hace de base el corte en el flujo de la prenda"),
			})
			.nullable(),
	}),
	permiso: { departamento: "produccion" },
});
