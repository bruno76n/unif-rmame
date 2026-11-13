/**
 * Los contratos de las consultas de los cajones de Aduana: Recibir del taller, Recibir material, Recibir lo que viene
 * en camino y Despachar. Solo los piden las cuentas con Aduana, sin precios ni costos.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Cajones»)
 *
 * Lo del taller y los reprocesos se cuentan a ciegas: `inventario.detalle_recibir_taller` y el reproceso de
 * `inventario.detalle_recibir_en_camino` nunca mandan lo que aprobó Calidad (docs/modulos/inventario/
 * recepcion-del-taller.md, regla 3).
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";
import { carrilDeAduana, textoConColor } from "./aduana.ts";

export const detalleRecibirTaller = definirConsulta({
	nombre: "inventario.detalle_recibir_taller",
	descripcion: "El cajón Recibir del taller: las tallas que revisó Calidad, para contarlas a ciegas, y a dónde van",
	entrada: z.object({ lote_id: z.uuid().describe("El lote revisado") }),
	salida: z.object({
		lote_id: z.uuid(),
		folio: z.string(),
		prenda: z.string(),
		va_a: z.string().describe("«{destino}» o «{destino} y Bodega» si parte va a Bodega"),
		recibido: z.boolean().describe("Si ya se recibió en aduana"),
		tallas: z
			.array(
				z.object({
					variante_id: z.uuid(),
					talla: z.string(),
					parte_a_bodega: z.boolean().describe("«Parte va a bodega»"),
				}),
			)
			.describe("Sin lo aprobado: el conteo es a ciegas"),
	}),
	permiso: { departamento: "aduana" },
	errores: [{ codigo: "no_existe", mensaje: "Ese lote no existe." }],
});

export const detalleRecibirMaterial = definirConsulta({
	nombre: "inventario.detalle_recibir_material",
	descripcion: "El cajón Recibir material: lo que le falta a cada línea de una orden de compra, sin precios",
	entrada: z.object({ orden_compra_id: z.uuid().describe("La orden") }),
	salida: z.object({
		orden_compra_id: z.uuid(),
		folio: z.string(),
		proveedor: z.string(),
		se_puede_recibir: z.boolean().describe("Si está enviada o recibida en parte"),
		materiales: z
			.array(
				z.object({
					orden_compra_linea_id: z.uuid(),
					material: z.string(),
					es_tela: z.boolean(),
					unidad: z.string(),
					entera: z.boolean().describe("Si su unidad se cuenta entera"),
					faltaban: z.string().describe("Lo que faltaba, en su unidad"),
				}),
			)
			.describe("Las líneas a las que les falta algo"),
	}),
	permiso: { departamento: "aduana" },
	errores: [{ codigo: "no_existe", mensaje: "Esa orden no existe." }],
});

export const detalleRecibirEnCamino = definirConsulta({
	nombre: "inventario.detalle_recibir_en_camino",
	descripcion:
		"El cajón Recibir lo que viene en camino: lo que mandó Bodega, una devolución de un cliente o un reproceso (a ciegas)",
	entrada: z.object({
		traspaso_id: z.uuid().optional().describe("Lo que viene en camino, o la devolución de un cliente"),
		reproceso_id: z.uuid().optional().describe("Un reproceso aprobado"),
	}),
	salida: z.object({
		tipo: z.enum(["camino", "devolucion", "reproceso"]),
		id: z.uuid().describe("El traspaso o el reproceso"),
		version: z.number().int().nullable().describe("La del traspaso; un reproceso no la pide"),
		folio: z.string(),
		de: z.string().describe("Bodega, la tienda, Calidad o el cliente"),
		que: z.string().describe("Lo que es"),
		mandaron: z.string().describe("Cuánto mandaron; en un reproceso, vacío: se cuenta a ciegas"),
		salio: z.string().describe("Cuándo salió"),
		va_a: z.string().describe("A dónde va"),
		recibido: z.boolean().describe("Si ya se recibió"),
		renglones: z
			.array(
				z.object({
					traspaso_linea_id: z.uuid(),
					prenda: z.string().describe("La prenda y talla, o el material"),
					es_material: z.boolean(),
					mandaron: z.string().describe("Las piezas o la cantidad"),
				}),
			)
			.describe("Vacío en un reproceso"),
		defectos: z
			.array(z.object({ defecto_id: z.uuid(), nombre: z.string() }))
			.describe("El catálogo de defectos, para una devolución"),
	}),
	permiso: { departamento: "aduana" },
	errores: [{ codigo: "no_existe", mensaje: "Eso no viene en camino a aduana." }],
});

/** Un renglón de la tabla por talla: una prenda con sus piezas por talla. */
const prendaPorTalla = z.object({
	prenda: z.string(),
	tallas: z.array(z.object({ talla: z.string(), piezas: z.number().int() })),
	piezas: z.number().int(),
});

export const detalleDespachar = definirConsulta({
	nombre: "inventario.detalle_despachar",
	descripcion:
		"El cajón Despachar: lo que sale, por qué no puede salir si es el caso, lo que se puede juntar y sus etiquetas",
	entrada: z.object({ traspaso_id: z.uuid().describe("Lo que está en aduana") }),
	salida: z.object({
		traspaso_id: z.uuid(),
		folio: z.string(),
		version: z.number().int(),
		titulo: z.string(),
		destino: z.string().describe("«A {destino}»: la tienda, Bodega, el cliente o Calidad"),
		carril: carrilDeAduana,
		cantidad: z.string(),
		salen: z.string().describe("«salen» o «esperan nota»"),
		antiguedad: z.string().describe("«3 días en aduana»"),
		desde: z.string().describe("«desde el {fecha}»"),
		la_esperan: z.string().nullable().describe("La fecha en que la esperan, o nada: «sin fecha»"),
		antiguedad_color: colorDeEstado,
		dato_destino: z.string().describe("Destino (y el cliente)"),
		que_es: z.string(),
		caso: z
			.enum(["sin_nota", "nota", "lote", "calidad", "devolucion_pendiente", "en_linea", "proveedor", "otro"])
			.describe("Qué muestra el cajón"),
		aviso: z
			.string()
			.nullable()
			.describe("Por qué no sale: «Sin nota de entrega no sale…», «{folio} espera la revisión de Calidad»…"),
		pedido: z
			.object({ pedido_id: z.uuid(), folio: z.string() })
			.nullable()
			.describe("El pedido, para «Ver pedido {PE}» (solo con Ventas a externos)"),
		nota: z
			.object({ folio: z.string(), pedido: z.string(), cliente: z.string(), direccion: z.string() })
			.nullable()
			.describe("La nota de entrega, sin precios"),
		por_talla: z.array(prendaPorTalla).describe("La tabla por talla; vacía en lo demás"),
		total: z.number().int(),
		juntar: z
			.array(
				z.object({
					traspaso_id: z.uuid(),
					version: z.number().int(),
					folio: z.string(),
					titulo: z.string(),
					cantidad: z.string(),
				}),
			)
			.describe("Lo que también está en aduana para ese destino y puede salir ahora"),
		etiquetas: z
			.object({ estado: textoConColor, impresas: z.boolean() })
			.nullable()
			.describe("«Etiquetas por imprimir» o «Impresas el {fecha}», si las lleva"),
		queda_en_camino: z.string().nullable().describe("«Queda en camino hasta que {destino} confirme que lo recibió.»"),
		boton: z.string().nullable().describe("«Despachar a {destino o cliente}», si puede salir"),
	}),
	permiso: { departamento: "aduana" },
	errores: [{ codigo: "no_existe", mensaje: "Eso no está en aduana." }],
});
