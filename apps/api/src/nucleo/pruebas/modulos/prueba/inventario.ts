/**
 * La acción de inventario del módulo de prueba: escribe dos movimientos con claves derivadas, como hará una
 * acción que crea varios (un despacho con su recepción, una reversión con su ajuste).
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md («Cómo se construye»)
 *
 * Con `repetir`, pide otra vez los mismos dos dentro de la misma acción: el libro no los duplica.
 */

import { definirAccion } from "@uniformame/compartido/contratos/definir";
import { z } from "zod";
import { escribirMovimiento } from "../../../../modulos/inventario/dominio/escribir-movimiento.ts";
import { type AccionImplementada, implementarAccion } from "../../../modulos.ts";

/** Mete piezas a una ubicación con dos ajustes. */
export const moverInventario = definirAccion({
	nombre: "prueba.mover_inventario",
	descripcion: "Escribe dos ajustes de entrada con claves derivadas",
	entrada: z.object({
		ubicacion_id: z.uuid().describe("A dónde entran"),
		variante_id: z.uuid().describe("La variante"),
		piezas: z.number().int().positive().describe("Las piezas de cada ajuste"),
		repetir: z.boolean().describe("Pide otra vez los mismos dos"),
	}),
	salida: z.object({ movimiento_ids: z.array(z.uuid()) }),
	permiso: { departamento: "ventas" },
});

/** Las acciones de inventario del módulo de prueba. */
export const accionesDeInventario: AccionImplementada[] = [
	implementarAccion(moverInventario, async (contexto, datos) => {
		const escribir = (numero: number) =>
			escribirMovimiento(contexto, {
				tipo: "ajuste",
				documento: { tipo: "ajuste", id: datos.ubicacion_id },
				renglones: [{ origen: null, destino: datos.ubicacion_id, varianteId: datos.variante_id, piezas: datos.piezas }],
				numero,
			});
		const escritos = [await escribir(1), await escribir(2)];
		if (datos.repetir) escritos.push(await escribir(1), await escribir(2));
		contexto.bitacora({ descripcion: "Movió inventario de prueba" });
		return {
			resultado: { mensaje: "Movido", movimiento_ids: escritos.map((escrito) => escrito.movimientoId) },
		};
	}),
];
