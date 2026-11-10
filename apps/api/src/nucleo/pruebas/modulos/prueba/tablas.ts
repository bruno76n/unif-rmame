/**
 * Las tablas del módulo de prueba: solo existen en la base de las pruebas de la fase 3.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md («Cómo se construye»)
 */

import { bigint, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { columnasComunes } from "../../../base/columnas.ts";

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
