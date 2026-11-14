/**
 * Cómo se leen los renglones de la copia: cada tabla con las columnas que le bajan y su tipo. La copia guarda lo que
 * manda el servidor tal cual; las pantallas lo leen con estos esquemas, así un dato que falta no se cuela como otro.
 * Fase 20 · docs/apps/tablet.md («La copia local») y «Lo que baja a la tablet» de cada módulo
 */

import { z } from "zod";

/** Un número que puede bajar como texto (los enteros grandes de Postgres). */
const numero = z.coerce.number();

/** Lo que nació en la tablet y todavía no regresa: «guardada aquí» o apartado. */
const marcaLocal = z.enum(["guardada", "apartado"]).optional();

export const esquemas = {
	personas: z.object({ id: z.uuid(), nombre: z.string(), iniciales: z.string().nullable().optional() }),
	pines: z.object({
		id: z.uuid(),
		persona_id: z.uuid(),
		estado: z.string(),
		desbloqueado_en: z.string().nullable().optional(),
	}),
	productos: z.object({ id: z.uuid(), nombre: z.string() }),
	variantes: z.object({ id: z.uuid(), producto_id: z.uuid(), talla_id: z.uuid() }),
	tallas: z.object({ id: z.uuid(), nombre: z.string(), orden: numero }),
	lotes: z.object({
		id: z.uuid(),
		folio: z.string(),
		producto_id: z.uuid(),
		flujo_id: z.uuid().nullable(),
		fecha_entrega: z.string(),
		estado: z.string(),
		para_quien: z.string().nullable().optional(),
	}),
	lote_tallas: z.object({
		id: z.uuid(),
		lote_id: z.uuid(),
		piezas_cortadas: numero.nullable(),
		piezas_terminadas: numero.nullable(),
		piezas_merma: numero.nullable(),
	}),
	bultos: z.object({
		id: z.uuid(),
		folio: z.string(),
		lote_id: z.uuid(),
		variante_id: z.uuid(),
		numero,
		piezas: numero,
	}),
	operaciones: z.object({ id: z.uuid(), nombre: z.string(), es_corte: z.boolean() }),
	flujo_operaciones: z.object({
		id: z.uuid(),
		flujo_id: z.uuid(),
		operacion_id: z.uuid(),
		orden: numero,
		persona_base_id: z.uuid().nullable(),
	}),
	registros_operacion: z.object({
		id: z.uuid(),
		bulto_id: z.uuid().nullable(),
		lote_id: z.uuid().nullable().optional(),
		flujo_operacion_id: z.uuid(),
		persona_id: z.uuid().nullable(),
		piezas_buenas: numero,
		piezas_danadas: numero,
		hecho_en: z.string(),
		estado: z.string(),
		_local: marcaLocal,
	}),
	tarifas_operacion: z.object({
		id: z.uuid(),
		flujo_operacion_id: z.uuid(),
		tarifa_centavos: numero,
		vigente_desde: z.string(),
	}),
	maquinas: z.object({ id: z.uuid(), folio: z.string(), nombre: z.string(), persona_id: z.uuid().nullable() }),
	fallas: z.object({
		id: z.uuid(),
		maquina_id: z.uuid(),
		motivo_falla_id: z.uuid(),
		estado: z.string(),
		hecho_en: z.string(),
		_local: marcaLocal,
	}),
	motivos_falla: z.object({ id: z.uuid(), nombre: z.string(), detiene_maquina: z.boolean(), orden: numero }),
	materiales: z.object({
		id: z.uuid(),
		nombre: z.string(),
		unidad: z.string(),
		unidad_tablet: z.string().nullable(),
	}),
	parametros: z.object({
		clave: z.string(),
		valor_entero: numero.nullable().optional(),
		valor_texto: z.string().nullable().optional(),
		valor_booleano: z.boolean().nullable().optional(),
	}),
} as const;

/** Un renglón de una tabla, ya leído. */
export type RenglonDe<Tabla extends keyof typeof esquemas> = z.infer<(typeof esquemas)[Tabla]>;
