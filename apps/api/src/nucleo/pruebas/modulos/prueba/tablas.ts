/**
 * Las tablas del módulo de prueba: solo existen en la base de las pruebas de la fase 3.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md («Cómo se construye»)
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md («Cómo se construye»): `prueba_lotes` baja a la
 * tablet de su ubicación mientras no esté cerrado, y `prueba_bultos` depende de su lote.
 */

import { bigint, boolean, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { columnasComunes, columnaXidEscritura } from "../../../base/columnas.ts";

/** Una nota: el encabezado del agregado. */
export const notas = pgTable("prueba_notas", {
	id: uuid("id").primaryKey(),
	texto: text("texto").notNull(),
	montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
	...columnasComunes(),
});

/** Los renglones de una nota: cambiarlos sube la versión de la nota. */
export const renglones = pgTable("prueba_renglones", {
	id: uuid("id").primaryKey(),
	notaId: uuid("nota_id")
		.notNull()
		.references(() => notas.id),
	cantidad: integer("cantidad").notNull(),
	...columnasComunes(),
});

/** Lo que escribe la interna `prueba.contar`, para ver que corre en la transacción de quien la llama. */
export const conteos = pgTable("prueba_conteos", {
	id: uuid("id").primaryKey(),
	notaId: uuid("nota_id").notNull(),
	...columnasComunes(),
});

/** Un lote de prueba: baja a la tablet de su ubicación mientras no esté cerrado. */
export const lotes = pgTable("prueba_lotes", {
	id: uuid("id").primaryKey(),
	nombre: text("nombre").notNull(),
	/** La ubicación de la tablet a la que baja (sin llave: las ubicaciones son de `inventario`). */
	ubicacionId: uuid("ubicacion_id").notNull(),
	cerrado: boolean("cerrado").notNull().default(false),
	...columnasComunes(),
	...columnaXidEscritura(),
});

/** Un bulto de un lote: baja con su lote; lo registra la tablet, con el id que hace ella. */
export const bultos = pgTable("prueba_bultos", {
	id: uuid("id").primaryKey(),
	loteId: uuid("lote_id")
		.notNull()
		.references(() => lotes.id),
	piezas: integer("piezas").notNull(),
	atendido: boolean("atendido").notNull().default(false),
	cancelado: boolean("cancelado").notNull().default(false),
	...columnasComunes(),
	...columnaXidEscritura(),
});
