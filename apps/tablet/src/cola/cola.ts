/**
 * La cola: todo lo que hace la persona se guarda primero aquí, con su clave de idempotencia, su hora y quién estaba
 * adentro, y en la misma transacción de Dexie los renglones que nacen con él, marcados «guardada aquí». De aquí sube.
 * Fase 20 · docs/apps/tablet.md (regla 3 y «La copia local») y docs/cimientos/SINCRONIZACION.md («Subir»)
 */

import { v7 as uuidv7 } from "uuid";
import type { BaseDeLaTablet, ComandoEnCola, Renglon, TablaQueBaja } from "../copia/base.ts";

/** Lo que se guarda en la cola. */
export interface Encolado {
	accion: string;
	datos: Record<string, unknown>;
	/** Quien estaba adentro. */
	persona_id?: string;
	/** Los renglones que nacen con el comando en la copia, para que la pantalla los vea sin esperar al servidor. */
	renglones?: { tabla: TablaQueBaja; renglon: Renglon }[];
	/** La hora en que pasó; por omisión, ahora. */
	ocurrido_en?: string;
}

/**
 * Guarda un comando en la cola y sus renglones en la copia, en una sola transacción.
 * @param base La base local.
 * @param encolado Lo que se guarda.
 * @returns El comando guardado, con su clave.
 */
export async function encolar(base: BaseDeLaTablet, encolado: Encolado): Promise<ComandoEnCola> {
	const renglones = encolado.renglones ?? [];
	const comando: ComandoEnCola = {
		clave_idempotencia: uuidv7(),
		accion: encolado.accion,
		datos: encolado.datos,
		ocurrido_en: encolado.ocurrido_en ?? new Date().toISOString(),
		...(encolado.persona_id === undefined ? {} : { persona_id: encolado.persona_id }),
		renglones: renglones.map(({ tabla, renglon }) => ({ tabla, id: renglon.id })),
	};
	const tablas = ["cola", ...new Set(renglones.map(({ tabla }) => tabla))];
	await base.transaction("rw", tablas, async () => {
		await base.cola.add(comando);
		for (const { tabla, renglon } of renglones) await base.copia(tabla).put({ ...renglon, _local: "guardada" });
	});
	return comando;
}

/**
 * Cuántos comandos faltan por subir.
 * @param base La base local.
 */
export function pendientes(base: BaseDeLaTablet): Promise<number> {
	return base.cola.count();
}
