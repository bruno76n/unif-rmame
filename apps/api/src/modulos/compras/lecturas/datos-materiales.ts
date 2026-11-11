/**
 * `compras.datos_materiales`: lo que otros módulos necesitan saber de unos materiales, nunca su costo.
 * Fase 11 · docs/modulos/compras/materiales.md («Lecturas»): la usa `inventario.tomar_consumible`, que se construye
 * en la fase 11 (la fase 12 la usa desde la tablet).
 */

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { listas, listaValores } from "../../admin/tablas.ts";
import { listaDeUnidades } from "../siembra.ts";
import { materiales } from "../tablas.ts";

/** Lo que recibe: los materiales. */
const pedido = z.object({ material_ids: z.array(z.uuid()) }).strict();

/** Lo que regresa de cada material. */
export interface DatosDeMaterial {
	nombre: string;
	tipo: string;
	unidad: string;
	se_cuenta_entera: boolean;
	unidad_tablet: string | null;
	factor_tablet: string | null;
	proveedor_habitual_id: string;
	de_baja: boolean;
}

/**
 * Lee los datos de unos materiales.
 * @param contexto El contexto de quien lee.
 * @param datos `material_ids`.
 * @returns Por material, su nombre, su tipo, su unidad y si se cuenta entera, su unidad y su factor de la tablet, su
 * proveedor habitual y si está de baja. Un material que no existe no viene.
 */
export async function datosMateriales(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<Record<string, DatosDeMaterial>> {
	const { material_ids } = pedido.parse(datos);
	if (material_ids.length === 0) return {};
	const filas = await contexto.transaccion
		.select({
			id: materiales.id,
			nombre: materiales.nombre,
			tipo: materiales.tipo,
			unidad: materiales.unidad,
			entera: listaValores.seCuentaEntera,
			unidadTablet: materiales.unidadTablet,
			factorTablet: materiales.factorTablet,
			proveedorHabitualId: materiales.proveedorHabitualId,
			bajaEn: materiales.bajaEn,
		})
		.from(materiales)
		.innerJoin(listas, eq(listas.clave, listaDeUnidades))
		.leftJoin(listaValores, and(eq(listaValores.listaId, listas.id), eq(listaValores.clave, materiales.unidad)))
		.where(inArray(materiales.id, material_ids));
	return Object.fromEntries(
		filas.map((fila) => [
			fila.id,
			{
				nombre: fila.nombre,
				tipo: fila.tipo,
				unidad: fila.unidad,
				se_cuenta_entera: fila.entera === true,
				unidad_tablet: fila.unidadTablet,
				factor_tablet: fila.factorTablet,
				proveedor_habitual_id: fila.proveedorHabitualId,
				de_baja: fila.bajaEn !== null,
			},
		]),
	);
}
