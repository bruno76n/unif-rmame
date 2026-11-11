/**
 * El trabajo «Rollos sugeridos»: al terminar el cuadre nocturno, vuelve a calcular los rollos sugeridos de todas las
 * telas, una tela por transacción.
 * Fase 12 · docs/modulos/inventario/entregas-a-corte.md («Trabajos», «Rollos sugeridos»)
 *
 * Lo encola el evento `cuadre.terminado`. Es repetible: con los mismos rollos y lotes calcula lo mismo.
 */

import { eq } from "drizzle-orm";
import type { Trabajo } from "../../../nucleo/modulos.ts";
import { materiales } from "../../compras/tablas.ts";

export const rollosSugeridos: Trabajo = {
	nombre: "inventario.rollos_sugeridos",
	trasEventos: ["cuadre.terminado"],
	correr: async (contexto) => {
		const telas = await contexto.base.select({ id: materiales.id }).from(materiales).where(eq(materiales.tipo, "tela"));
		for (const tela of telas) {
			await contexto.enTransaccion((enEsta) =>
				enEsta.interna("inventario.recalcular_rollos_sugeridos", { material_id: tela.id }),
			);
		}
	},
};
