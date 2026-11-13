/**
 * Los contratos de las consultas de los cajones de Bodega: Variante, Entrega al corte, Llegada de aduana y el conteo
 * (nuevo, de una diferencia o la carga inicial). Solo los piden las cuentas con Bodega (el conteo, también Aduana), sin
 * precios ni costos.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»)
 *
 * El conteo es ciego: `inventario.detalle_conteo` nunca manda lo que tiene el sistema (docs/modulos/inventario/conteos.md,
 * regla 1).
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { varianteDeBodega } from "./bodega.ts";

export const detalleDeVariante = definirConsulta({
	nombre: "inventario.detalle_variante",
	descripcion: "El cajón Variante: lo que hay en cada ubicación con su mínimo, lo apartado y lo que se mueve",
	entrada: z.object({ variante_id: z.uuid().describe("La variante") }),
	salida: varianteDeBodega.extend({
		total: z.number().int(),
		comprometidas: z.number().int(),
		libres: z.number().int(),
		en_reabasto: z.number().int().describe("Los renglones de Reabasto de esta variante"),
		por_aclarar: z.number().int().describe("Sus diferencias abiertas"),
		bajo_minimo: z.boolean().describe("Si alguna ubicación está bajo su mínimo o en cero"),
		ubicaciones: z.array(
			z.object({
				codigo: z.string(),
				nombre: z.string(),
				piezas: z.number().int(),
				minimo: z.number().int().nullable(),
				etiqueta: z
					.object({ texto: z.string(), tono: z.enum(["rojo", "ambar"]) })
					.nullable()
					.describe("«{n} en diferencia», «En cero» o «Bajo mínimo»"),
			}),
		),
		apartadas: z.array(z.object({ documento: z.string(), ubicacion: z.string(), piezas: z.number().int() })),
		moviendose: z.array(z.object({ folio: z.string(), texto: z.string(), piezas: z.number().int() })),
		tiendas_sin_caja: z
			.array(z.object({ ubicacion_id: z.uuid(), nombre: z.string() }))
			.describe("Las tiendas a las que se manda con «Mandar a {tienda}»"),
		libres_en_bodega: z.number().int().describe("Lo disponible en Bodega"),
	}),
	permiso: { departamento: "bodega" },
	errores: [{ codigo: "no_existe", mensaje: "Esa variante no existe." }],
});

export const detalleDeEntregaCorte = definirConsulta({
	nombre: "inventario.detalle_entrega_corte",
	descripcion: "El cajón Entrega al corte: cada tela por entregar con sus rollos en Bodega, los sugeridos y los avíos",
	entrada: z.object({ lote_id: z.uuid().describe("El lote por cortar") }),
	salida: z.object({
		lote_id: z.uuid(),
		folio: z.string(),
		prenda: z.string(),
		fecha_corte: z.string(),
		piezas: z.number().int(),
		receta_version_id: z.uuid().describe("La versión con que se calculó: va en «Entregar al corte»"),
		metros_principal: z.string().describe("Lo que pide la tela principal"),
		telas: z.array(
			z.object({
				material_id: z.uuid(),
				tela: z.string(),
				papel: z.string().nullable().describe("«combinación» o «forro»; nada en la principal"),
				metros: z.string().describe("Lo que pide el corte"),
				metros_milesimos: z.number().int().describe("Lo mismo, en milésimos, para sumar lo marcado"),
				rollos: z.array(
					z.object({
						rollo_id: z.uuid(),
						folio: z.string(),
						es_retazo: z.boolean(),
						partida: z.string().nullable(),
						metros: z.string(),
						milesimos: z.number().int(),
						sugerido: z.boolean(),
					}),
				),
			}),
		),
		avios: z.array(z.object({ material: z.string(), se_entrega: z.string(), hay: z.string(), alcanza: z.boolean() })),
		personas: z.array(z.object({ persona_id: z.uuid(), nombre: z.string() })).describe("La gente del Taller"),
	}),
	permiso: { departamento: "bodega" },
	errores: [
		{ codigo: "lote_no_por_cortar", mensaje: "{lote} ya se cortó" },
		{ codigo: "sin_receta", mensaje: "{prenda} no tiene receta: no se corta hasta que Patronaje la capture" },
	],
});

export const detalleDeLlegadaAduana = definirConsulta({
	nombre: "inventario.detalle_llegada_aduana",
	descripcion: "El cajón Llegada de aduana: lo que trae un despacho en tránsito a Bodega",
	entrada: z.object({ despacho_id: z.uuid().describe("El despacho") }),
	salida: z.object({
		despacho_id: z.uuid(),
		folio: z.string(),
		version: z.number().int(),
		trae: z.string().describe("Lo que trae, en una línea"),
		salio: z.string().describe("Cuándo salió de aduana"),
		mando: z.string().describe("«{n} pz» o «{m} m»"),
		recibido: z.boolean().describe("Si ya se recibió"),
		renglones: z.array(
			z.object({
				traspaso_linea_id: z.uuid(),
				es_material: z.boolean(),
				prenda: z.string().describe("La prenda y talla, o el material"),
				rollo: z.string().nullable(),
				partida: z.string().nullable(),
				enviado: z.string().describe("Las piezas o los metros que mandó Aduana"),
			}),
		),
	}),
	permiso: { departamento: "bodega" },
	errores: [{ codigo: "no_existe", mensaje: "Ese despacho no existe." }],
});

export const detalleDeConteo = definirConsulta({
	nombre: "inventario.detalle_conteo",
	descripcion:
		"El conteo ciego: las variantes de una sección (o la de una diferencia) sin lo que dice el sistema; la carga inicial dice cuáles ya tienen movimientos",
	entrada: z.object({
		ubicacion_id: z.uuid().optional().describe("Bodega o Aduana"),
		seccion_id: z.uuid().optional().describe("La sección que se cuenta"),
		producto_id: z.uuid().optional().describe("En la carga inicial de una prenda"),
		diferencia_id: z.uuid().optional().describe("En el conteo de una diferencia"),
		carga_inicial: z.coerce.boolean().optional().describe("Si es para la carga inicial"),
	}),
	salida: z.object({
		ubicaciones: z.array(z.object({ id: z.uuid(), nombre: z.string() })).describe("Donde puede contar la cuenta"),
		secciones: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
		productos: z.array(z.object({ id: z.uuid(), nombre: z.string() })).describe("Para la carga inicial de una prenda"),
		motivos_ajuste: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
		diferencia: z
			.object({ folio: z.string(), ubicacion_id: z.uuid(), ubicacion: z.string() })
			.nullable()
			.describe("La diferencia que se cuenta"),
		variantes: z.array(
			z.object({
				variante_id: z.uuid(),
				prenda: z.string(),
				talla: z.string(),
				escuela: z.string(),
				con_movimientos: z.boolean().describe("En la carga inicial: ya tiene movimientos ahí"),
			}),
		),
	}),
	permiso: { departamento: ["bodega", "aduana"] },
	errores: [{ codigo: "no_por_contar", mensaje: "{DF} ya no está por contar." }],
});
