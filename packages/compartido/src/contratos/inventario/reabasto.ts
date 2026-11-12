/**
 * Los contratos del reabasto: mover de Bodega a una tienda y sugerir a Producción qué fabricar.
 * Fase 14 · docs/modulos/inventario/minimos-y-reabasto.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Bodega mueve a las tiendas lo que les falta: un A- `reabasto` por tienda, con el RB- de esa tienda de hoy. */
export const moverATienda = definirAccion({
	nombre: "inventario.mover_a_tienda",
	descripcion: "Mueve de Bodega a una tienda, sin pasar de lo disponible: un A- por tienda con su RB- del día",
	entrada: z.object({
		renglones: z
			.array(
				z.object({
					variante_id: z.uuid().describe("La prenda y talla"),
					ubicacion_destino_id: z.uuid().describe("La tienda"),
					piezas: z.number("Piezas").int("Piezas").positive("Piezas").describe("Cuántas mover"),
				}),
			)
			.min(1, "Escoge qué mover.")
			.describe("Lo que se mueve"),
	}),
	salida: z.object({
		traspasos: z.array(z.object({ traspaso_id: z.uuid(), folio: z.string(), folio_rb: z.string() })).describe("Los A-"),
	}),
	permiso: { departamento: "bodega" },
	errores: [
		{ codigo: "destino_no_tienda", mensaje: "Escoge a qué tienda va." },
		{ codigo: "sin_libres", mensaje: "{prenda} talla {t}: solo hay 0 libres en bodega." },
	],
});

/** Bodega le sugiere a Producción fabricar lo que falta. */
export const sugerirFabricar = definirAccion({
	nombre: "inventario.sugerir_fabricar",
	descripcion: "Le sugiere a Producción fabricar unas piezas para Bodega o una tienda",
	entrada: z.object({
		renglones: z
			.array(
				z.object({
					variante_id: z.uuid().describe("La prenda y talla"),
					ubicacion_id: z.uuid().describe("Para quién: Bodega o una tienda"),
					piezas: z.number("Piezas").int("Piezas").positive("Piezas").describe("Cuántas fabricar"),
				}),
			)
			.min(1, "Escoge qué fabricar.")
			.describe("Lo que se sugiere"),
	}),
	salida: z.object({ sugerencia_ids: z.array(z.uuid()).describe("Las sugerencias que nacieron") }),
	permiso: { departamento: "bodega" },
	errores: [{ codigo: "ubicacion_sin_minimo", mensaje: "{ubicación} no lleva mínimo." }],
});
