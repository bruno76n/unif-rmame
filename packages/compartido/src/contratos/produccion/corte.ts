/**
 * Los contratos del corte: cerrarlo con sus telas, sus rollos y sus piezas, e imprimir las etiquetas de los bultos.
 * Fase 12 · docs/modulos/produccion/corte-y-bultos.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Producción cierra el corte de un lote, ya hecho, de una vez. */
export const cerrarCorte = definirAccion({
	nombre: "produccion.cerrar_corte",
	descripcion: "Cierra el corte de un lote: la tela que se usó, lo que quedó, las piezas por talla y sus bultos",
	entrada: z.object({
		lote_id: z.uuid().describe("El lote por cortar"),
		receta_version_id: z.uuid().describe("La versión de la receta que mostró la captura"),
		telas: z
			.array(
				z.object({
					material_id: z.uuid().describe("La tela de la receta"),
					rollos: z
						.array(z.object({ rollo_id: z.uuid("Escoge el rollo").describe("El rollo") }))
						.min(1, "Escoge el rollo")
						.describe("Sus rollos en el orden en que se usaron; el último dejó lo que quedó"),
					metros_quedaron: z
						.string("Escribe los metros con números, por ejemplo 12.5")
						.trim()
						.regex(/^\d{1,6}(\.\d{1,3})?$/, "Escribe los metros con números, por ejemplo 12.5")
						.optional()
						.describe("Lo que quedó del último rollo, solo si fue distinto de lo calculado"),
					ya_no_sirve: z.boolean().optional().describe("Si lo que quedó, abajo de la frontera, es merma"),
				}),
			)
			.min(1)
			.describe("Una por cada tela de la receta"),
		tallas: z
			.array(
				z.object({
					variante_id: z.uuid().describe("La talla del lote"),
					piezas: z.number("Número entero").int("Número entero").min(0, "Número entero").max(9999, "Número entero"),
				}),
			)
			.min(1)
			.describe("Una por talla del lote, con las piezas que salieron"),
		corto_persona_id: z.uuid("¿Quién cortó?").describe("Quién cortó: una persona activa del Taller"),
	}),
	salida: z.object({
		corte_id: z.uuid().describe("El corte"),
		bultos: z
			.array(z.object({ bulto_id: z.uuid(), folio: z.string(), variante_id: z.uuid(), piezas: z.number() }))
			.describe("Los bultos que armó el servidor"),
		retazos: z.array(z.string()).describe("Los folios RZ- de los retazos que nacieron"),
		metros_por_pieza: z.string().describe("Los metros de la tela principal por pieza"),
	}),
	permiso: { departamento: "produccion" },
	errores: [
		{ codigo: "rollo_repetido", mensaje: "Ese rollo ya está en la lista." },
		{ codigo: "lote_no_por_cortar", mensaje: "{lote} ya está cortado." },
		{
			codigo: "sin_receta",
			mensaje: "Sin receta no se puede cortar: el sistema no sabe cuánta tela lleva cada talla.",
		},
		{
			codigo: "receta_cambio",
			mensaje: "La receta de {prenda} cambió mientras capturabas: revisa la tela y vuelve a cerrar.",
		},
		{ codigo: "falta_tela", mensaje: "La receta lleva {tela}: agrega sus rollos." },
		{ codigo: "tela_fuera_de_receta", mensaje: "{tela} no está en la receta de {prenda}." },
		{ codigo: "rollo_otra_tela", mensaje: "{rollo} no es de {tela}." },
		{ codigo: "rollo_no_disponible", mensaje: "{rollo} ya no está disponible para este corte." },
		{ codigo: "rollo_de_otro_lote", mensaje: "{rollo} está entregado a {lote}" },
		{ codigo: "piezas_mas_que_planeado", mensaje: "Máximo {planeado}" },
		{ codigo: "sin_piezas", mensaje: "Escribe cuántas piezas salieron" },
		{ codigo: "quedo_mas_que_rollo", mensaje: "Del rollo {rollo} no pueden quedar más de {m} m" },
		{ codigo: "rollo_sin_usar", mensaje: "Del rollo {rollo} no se usó nada: quítalo de la lista" },
		{ codigo: "cortador_no_valido", mensaje: "¿Quién cortó?" },
		{ codigo: "prenda_no_se_fabrica", mensaje: "{prenda} no pasa por el taller." },
	],
	edita: true,
});

/** Producción imprime las etiquetas de los bultos de un lote en la impresora del Taller. */
export const imprimirEtiquetasBulto = definirAccion({
	nombre: "produccion.imprimir_etiquetas_bulto",
	descripcion: "Manda a la impresora del Taller las etiquetas de los bultos de un lote",
	entrada: z.object({
		lote_id: z.uuid().describe("El lote"),
		bulto_ids: z.array(z.uuid()).optional().describe("Los bultos; vacío, todos los del lote"),
	}),
	salida: z.object({ cuantas: z.number().int(), primero: z.string(), ultimo: z.string() }),
	permiso: { departamento: "produccion" },
	errores: [
		{ codigo: "lote_sin_cortar", mensaje: "{lote} no tiene bultos: primero se cierra el corte." },
		{ codigo: "sin_impresora_taller", mensaje: "No hay impresora del taller: descarga el PDF de las etiquetas." },
	],
});
