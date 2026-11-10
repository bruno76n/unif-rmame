/**
 * Lo que el núcleo declara en la base: la secuencia global de versiones.
 * Fase 2 · docs/cimientos/BASE-DE-DATOS.md («Columnas comunes»)
 *
 * Las tablas de negocio viven en el `tablas.ts` de su módulo; aquí solo lo que es de todas.
 */
import { pgSequence } from "drizzle-orm/pg-core";

/** De aquí sale la `version` de cada escritura: una sola secuencia para toda la base. */
export const versionGlobal = pgSequence("version_global");
