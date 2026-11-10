/**
 * Correr algo dentro de una transacción con el contexto de una acción, para probar internas y lecturas.
 * Fase 4 · docs/fases/04-servicios-comunes.md («Cómo se construye»)
 */

import { Temporal } from "temporal-polyfill";
import { crearContexto, escribirBitacoraConAdmin, guardarEventosConAdmin } from "../acciones/corredor.ts";
import type { Almacen } from "../almacen.ts";
import type { Base } from "../base/conexion.ts";
import { enTransaccion } from "../base/transacciones.ts";
import type { ContextoDeAccion, QuienEscribe, RegistroDeModulos } from "../modulos.ts";
import { quienesDePrueba } from "./cuentas-de-prueba.ts";

/**
 * Corre `hacer` en una transacción con el contexto de una acción del módulo `prueba`.
 * @param base La base de la prueba.
 * @param registro Lo que registraron los módulos (sus internas y lecturas).
 * @param hacer Lo que se prueba.
 * @param opciones La hora (por omisión, la de ahora), quién (por omisión, la dueña), el almacén y si guarda,
 * como el corredor al terminar, los eventos que juntó (para probar lo que pasa al procesarlos) y sus renglones
 * de bitácora.
 */
export function enAccionDePrueba<T>(
	base: Base,
	registro: RegistroDeModulos,
	hacer: (contexto: ContextoDeAccion) => Promise<T>,
	opciones: {
		ahora?: Temporal.Instant;
		quien?: QuienEscribe;
		almacen?: Almacen;
		guardarEventos?: boolean;
		escribirBitacora?: boolean;
	} = {},
): Promise<T> {
	const quien = opciones.quien ?? quienesDePrueba.duena;
	if (quien === undefined) throw new Error("falta la dueña de prueba");
	return enTransaccion(base, async (transaccion) => {
		const { contexto, eventos, renglones } = crearContexto(
			registro,
			transaccion,
			quien,
			"prueba.accion",
			opciones.ahora ?? Temporal.Now.instant(),
			undefined,
			opciones.almacen,
		);
		const resultado = await hacer(contexto);
		if (opciones.escribirBitacora === true) await escribirBitacoraConAdmin(contexto, renglones);
		if (opciones.guardarEventos === true) await guardarEventosConAdmin(contexto, eventos);
		return resultado;
	});
}
