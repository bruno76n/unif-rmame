/**
 * Los contratos de las consultas de las pestañas de Compras: Pendientes, Por pedir, Órdenes de compra, Materiales,
 * Proveedores y Conciliación de facturas. Solo las piden las cuentas con Compras, que ven costos y precios.
 * Fase 19 · docs/interfaz/fabrica/compras.md (cada pestaña con su «Consulta»)
 *
 * Los números de cada material salen de la cuenta de `compras.cuenta_material`; los estados y sus líneas llegan
 * armados, con su color: la pantalla solo los muestra. Las cantidades van como texto decimal, como las guarda la base.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

/** Un estado ya armado: su texto, su color y, si la lleva, su línea de abajo. */
export const estadoArmado = z.object({
	texto: z.string().describe("El estado, en su forma de la guía de textos"),
	color: colorDeEstado,
	abajo: z.string().nullable().describe("La línea de abajo, en el mismo cuadro"),
});

/** El estado de un material en la proyección. */
export const estadosDeMaterial = ["sin_tiempo_de_entrega", "pedir_esta_semana", "alcanza"] as const;

/** «si» o «no», como llega de la dirección. */
const siONo = z.enum(["si", "no"]);

/** Una cantidad en texto decimal, en la unidad de inventario. Los montos (`*_centavos`) son opcionales: el servidor
 * los recorta a quien no debe verlos (la cuenta de soporte). */
const cantidad = z.string().describe("Texto decimal con tres decimales, en la unidad de inventario");

/** El tono de una cifra de la barra de indicadores. */
const tonoDeContexto = z.enum(["rojo", "ambar", "normal"]);

/** Una parte de la línea de contexto de una cifra. */
const contexto = z.array(z.object({ texto: z.string(), tono: tonoDeContexto })).describe("La línea de contexto");

/** Los grupos de Pendientes. */
export const gruposDePendientesDeCompras = ["materiales", "ordenes", "facturas"] as const;

export const pendientesDeCompras = definirConsulta({
	nombre: "compras.pendientes",
	descripcion:
		"Pendientes de Compras: los indicadores, los materiales sin tiempo o por pedir esta semana, las órdenes atrasadas o que llegan esta semana y las facturas que no cuadran o no han llegado",
	entrada: z.object({
		grupo: z
			.enum(["todos", ...gruposDePendientesDeCompras])
			.optional()
			.describe("El filtro; sin él, todos"),
	}),
	salida: z.object({
		indicadores: z.object({
			por_pedir: z.object({
				sin_tiempo: z.number().int(),
				esta_semana: z.number().int(),
				suficiente: z.number().int(),
				contexto,
			}),
			ordenes: z.object({
				en_camino: z.number().int().describe("Enviadas o recibidas en parte"),
				por_semana: z.array(z.number().int()).describe("Las que llegan cada una de las próximas 4 semanas"),
				contexto,
			}),
			materiales: z.object({ activos: z.number().int(), contexto }),
			proveedores: z.object({ activos: z.number().int(), contexto }),
			facturas: z.object({ sin_conciliar: z.number().int(), contexto }),
		}),
		renglones: z.array(
			z.object({
				clave: z.string(),
				grupo: z.enum(gruposDePendientesDeCompras),
				tipo: z.enum(["material", "orden", "factura"]),
				referencia: z.string(),
				detalle: z.string(),
				fecha: z.string().nullable().describe("La fecha que importa, ISO"),
				fecha_roja: z.boolean(),
				cifra: z.string().nullable().describe("La cantidad o el total, ya escritos"),
				estado: estadoArmado,
				abre: z.object({
					cajon: z.enum(["material", "orden", "conciliacion"]),
					id: z.uuid().nullable(),
				}),
			}),
		),
		conteos: z.object({
			todos: z.number().int(),
			materiales: z.number().int(),
			ordenes: z.number().int(),
			facturas: z.number().int(),
		}),
		pastilla: z.object({ conteo: z.number().int(), rojo: z.boolean() }).describe("La pastilla del menú"),
	}),
	permiso: { departamento: "compras" },
});

/** Una llegada de una orden en la línea de tiempo. */
const llegada = z.object({
	orden_compra_id: z.uuid(),
	folio: z.string(),
	dia: z.string().describe("Su llegada esperada"),
	cantidad,
	atrasada: z.boolean(),
});

export const porPedir = definirConsulta({
	nombre: "compras.por_pedir",
	descripcion:
		"Por pedir: cada material activo con su estado, cuándo se acaba, cuándo llegaría un pedido de hoy, lo que viene y su pedido sugerido, para la línea de tiempo",
	entrada: z.object({
		buscar: z.string().trim().max(80).optional().describe("Material o proveedor: todas las palabras"),
		proveedor_id: z.uuid().optional().describe("Solo los que surte ese proveedor"),
		horizonte: z.enum(["corto", "regreso_clases"]).optional().describe("Hasta dónde llega la línea de tiempo"),
	}),
	salida: z.object({
		hoy: z.string(),
		horizonte: z.object({
			tipo: z.enum(["corto", "regreso_clases"]),
			hasta: z.string().describe("El último día de la línea de tiempo"),
			semanas: z.number().int().describe("`compras.horizonte_corto_semanas`"),
			regreso_clases: z.string().describe("`compras.fecha_regreso_clases`"),
			mes_regreso: z.string().describe("El mes del regreso a clases, para «Hasta {mes}»"),
		}),
		meses: z
			.array(
				z.object({ inicio: z.string(), nombre: z.string(), factor: z.string().describe("En veces un mes normal") }),
			)
			.describe("Los meses de la línea de tiempo, con su factor de consumo"),
		proveedores: z.array(z.object({ proveedor_id: z.uuid(), nombre: z.string() })),
		materiales: z.array(
			z.object({
				material_id: z.uuid(),
				nombre: z.string(),
				color: z.string().nullable(),
				unidad: z.string(),
				proveedor: z.string(),
				plazo: z.number().int(),
				estado: z.enum(estadosDeMaterial),
				linea: z.string(),
				alcanza: z.string().describe("«Alcanza {n} días», «Ya no alcanza» o «Sin consumo»"),
				se_acaba: z.string().nullable(),
				llegaria_hoy: z.string(),
				dias_sin_material: z.number().int(),
				por_pedir: cantidad,
				por_pedir_texto: z.string(),
				llegadas: z.array(llegada),
				en_borrador: z.object({ orden_compra_id: z.uuid(), folio: z.string() }).nullable(),
			}),
		),
	}),
	permiso: { departamento: "compras" },
});

/** Los grupos de Órdenes de compra. */
export const gruposDeOrdenes = ["atrasadas", "esta_semana", "mas_adelante", "borradores", "terminadas"] as const;

export const ordenesDeCompra = definirConsulta({
	nombre: "compras.ordenes",
	descripcion: "Órdenes de compra por grupo: atrasadas, llegan esta semana, más adelante, borradores y terminadas",
	entrada: z.object({ buscar: z.string().trim().max(80).optional().describe("Folio, proveedor o material") }),
	salida: z.object({
		ordenes: z.array(
			z.object({
				orden_compra_id: z.uuid(),
				folio: z.string(),
				grupo: z.enum(gruposDeOrdenes),
				creada: z.string(),
				proveedor: z.string(),
				condicion: z.string(),
				material: z.string().describe("El primero"),
				material_detalle: z.string().describe("«y {n} materiales más» o su presentación"),
				avance: z.object({
					texto: z.string(),
					por_ciento: z.number().describe("Lo recibido, de 0 a 100"),
					tono: z.enum(["rojo", "naranja", "azul", "gris"]),
				}),
				llega: z.object({ texto: z.string(), detalle: z.string().nullable(), rojo: z.boolean() }),
				estado: estadoArmado,
				total_centavos: z.number().int().optional(),
			}),
		),
	}),
	permiso: { departamento: "compras" },
});

/** El tono de la barra de una existencia. */
export const tonosDeExistencia = ["azul", "ambar", "rojo"] as const;

export const materialesDeCompras = definirConsulta({
	nombre: "compras.materiales",
	descripcion:
		"Materiales por tipo, con su proveedor habitual, su último precio, lo libre y lo comprometido, su mínimo, lo que viene y su estado; y lo que pide «Nuevo material»",
	entrada: z.object({
		buscar: z.string().trim().max(80).optional().describe("Material, proveedor o medida"),
		incluir_bajas: siONo.optional().describe("«si» para ver los dados de baja"),
	}),
	salida: z.object({
		materiales: z.array(
			z.object({
				material_id: z.uuid(),
				version: z.number().int(),
				nombre: z.string(),
				tipo: z.enum(["tela", "avio", "consumible"]),
				color: z.string().nullable(),
				presentacion: z.string().nullable(),
				unidad: z.string(),
				proveedor: z.string(),
				proveedores_mas: z.number().int(),
				ultimo_precio_centavos: z.number().int().nullable().optional(),
				plazo: z.number().int(),
				hay: cantidad,
				libre: cantidad,
				comprometido: cantidad,
				minimo: cantidad,
				tono_existencia: z.enum(tonosDeExistencia),
				en_camino: z.object({ cantidad, dia: z.string(), varias: z.boolean() }).nullable(),
				estado: estadoArmado,
				dado_de_baja: z.boolean(),
			}),
		),
		para_nuevo: z.object({
			unidades: z.array(z.object({ clave: z.string(), nombre: z.string() })),
			proveedores: z.array(z.object({ proveedor_id: z.uuid(), nombre: z.string(), surte: z.string().nullable() })),
			dias_cubre_inicial: z.number().int(),
		}),
	}),
	permiso: { departamento: "compras" },
});

export const proveedoresDeCompras = definirConsulta({
	nombre: "compras.proveedores",
	descripcion:
		"Proveedores con lo que surten, lo que dicen que tardan y lo que tardan de verdad, sus entregas a tiempo, su condición y su teléfono",
	entrada: z.object({
		buscar: z.string().trim().max(80).optional().describe("Proveedor, ciudad o lo que surte"),
		incluir_bajas: siONo.optional().describe("«si» para ver los dados de baja"),
	}),
	salida: z.object({
		proveedores: z.array(
			z.object({
				proveedor_id: z.uuid(),
				version: z.number().int(),
				nombre: z.string(),
				ciudad: z.string(),
				surte: z.string().nullable(),
				dice: z.number().int(),
				tarda: z.number().int().nullable().describe("El plazo real; nulo sin entregas"),
				tono_plazo: z.enum(["verde", "ambar", "rojo", "gris"]),
				a_tiempo: z.number().int(),
				entregas: z.number().int(),
				tono_entregas: z.enum(["verde", "ambar", "rojo", "gris"]),
				condicion: z.string(),
				telefono: z.string(),
				dado_de_baja: z.boolean(),
			}),
		),
	}),
	permiso: { departamento: "compras" },
});

/** Un punto de la conciliación: lo que dice y si coincide, no coincide o todavía no existe. */
const punto = z.object({
	texto: z.string(),
	como: z.enum(["coincide", "no_coincide", "falta"]),
});

export const conciliacionFacturas = definirConsulta({
	nombre: "compras.conciliacion_facturas",
	descripcion:
		"Las facturas que no cuadran con su orden y su recepción, y las órdenes recibidas cuya factura no ha llegado. Solo consulta: se resuelve en Contaduría",
	entrada: z.object({}),
	salida: z.object({
		renglones: z.array(
			z.object({
				clave: z.string(),
				factura: z.string().nullable().describe("El FP-, o nulo si no ha llegado"),
				folio_proveedor: z.string().nullable(),
				orden_compra_id: z.uuid(),
				orden: z.string(),
				proveedor: z.string(),
				condicion: z.string(),
				puntos: z.object({ orden: punto, recepcion: punto, factura: punto }),
				que_no_cuadra: z.string(),
				estado: estadoArmado,
			}),
		),
	}),
	permiso: { departamento: "compras" },
});
