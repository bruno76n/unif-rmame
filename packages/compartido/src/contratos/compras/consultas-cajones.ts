/**
 * Los contratos de las consultas de los cajones de Compras: Levantar orden, el «por qué» de un material, la orden de
 * compra, el material y el proveedor. Solo las piden las cuentas con Compras.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Cajones» y «Ventanas»)
 *
 * El «por qué» trae los insumos de la proyección: la pantalla corre `proyectarMaterial` del paquete compartido
 * mientras se escribe la cantidad («Con {cantidad} alcanza hasta…» y su gráfica), con los mismos números que la cuenta.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { estadoArmado, estadosDeMaterial, tonosDeExistencia } from "./consultas-pestanas.ts";

/** Una cantidad en texto decimal, en la unidad de inventario. Los montos (`*_centavos`) son opcionales: el servidor
 * los recorta a quien no debe verlos (la cuenta de soporte). */
const cantidad = z.string().describe("Texto decimal con tres decimales, en la unidad de inventario");

/** Una lista de ids separados por comas, como viaja en la dirección. */
const listaDeIds = z
	.string()
	.regex(/^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36})*$/)
	.describe("Ids separados por comas");

/** Lo que regresa cada consulta de un material: su estado en la proyección. */
const proyectado = {
	estado: z.enum(estadosDeMaterial),
	estado_armado: estadoArmado,
	linea: z.string(),
};

/** Un proveedor que surte un material, con su último precio. */
const surtidor = z.object({
	proveedor_id: z.uuid(),
	nombre: z.string(),
	ultimo_precio_centavos: z.number().int().optional(),
	habitual: z.boolean(),
});

export const levantarOrdenPropuesta = definirConsulta({
	nombre: "compras.levantar_orden_propuesta",
	descripcion:
		"Lo que propone Levantar orden: los materiales escogidos (o los sin tiempo de entrega y los de esta semana) con su pedido sugerido, sus proveedores con su último precio y el borrador de cada proveedor",
	entrada: z.object({
		material_ids: listaDeIds.optional().describe("Los materiales; sin ellos, los sin tiempo y los de esta semana"),
		cantidades: z
			.string()
			.regex(/^\d+(,\d+)*$/)
			.optional()
			.describe("La cantidad de cada material, en el mismo orden; sin ellas, el pedido sugerido"),
	}),
	salida: z.object({
		umbral_cambio_precio_pct: z.number().describe("`compras.umbral_cambio_precio_pct`"),
		cantidad_maxima: z.number().int().describe("`compras.cantidad_maxima_linea`"),
		escogidos: z.array(z.object({ material_id: z.uuid(), cantidad: z.number().int() })),
		materiales: z
			.array(
				z.object({
					material_id: z.uuid(),
					nombre: z.string(),
					unidad: z.string(),
					multiplo: z.number().int(),
					sugerido: z.number().int(),
					...proyectado,
					proveedor_habitual_id: z.uuid(),
					surtidores: z.array(surtidor),
				}),
			)
			.describe("Todos los activos, de lo más urgente a lo menos"),
		proveedores: z.array(
			z.object({
				proveedor_id: z.uuid(),
				nombre: z.string(),
				condicion: z.string(),
				plazo: z.number().int(),
				borrador: z.string().nullable().describe("El folio de su borrador, si tiene"),
			}),
		),
	}),
	permiso: { departamento: "compras" },
});

/** Un lote por cortar que compromete el material. */
const comprometidoConLote = z.object({
	lote_id: z.uuid(),
	folio: z.string(),
	detalle: z.string().describe("«Pantalón azul marino, Distribuidora Escolar Zamora»"),
	cantidad,
});

/** Lo que viene de una orden. */
const enCamino = z.object({
	orden_compra_id: z.uuid(),
	folio: z.string(),
	dia: z.string(),
	cantidad,
	atrasada: z.boolean(),
});

export const materialPorQue = definirConsulta({
	nombre: "compras.material_por_que",
	descripcion:
		"El «por qué» de un material: su resumen, la cuenta (hay, en camino, comprometido y libre), el consumo por mes, de dónde sale, el pedido sugerido y los insumos de la proyección",
	entrada: z.object({ material_id: z.uuid() }),
	salida: z.object({
		material: z.object({
			material_id: z.uuid(),
			nombre: z.string(),
			tipo: z.enum(["tela", "avio", "consumible"]),
			unidad: z.string(),
			proveedor: z.string(),
			condicion: z.string(),
			...proyectado,
			en_borrador: z.object({ orden_compra_id: z.uuid(), folio: z.string() }).nullable(),
		}),
		resumen: z.string(),
		cuenta: z.object({
			hay_bodega: cantidad,
			hay_aduana: cantidad,
			en_camino: z.array(enCamino),
			en_camino_total: cantidad,
			comprometido: z.array(comprometidoConLote),
			comprometido_total: cantidad,
			libre: cantidad,
		}),
		consumo: z.object({
			medido: z.boolean(),
			normal: cantidad.nullable().describe("El de un mes normal, por día"),
			meses: z.array(z.object({ nombre: z.string(), por_dia: cantidad, factor: z.string() })),
			temporada: z.string().nullable().describe("«Julio es el mes más fuerte: …»"),
			se_usa_en: z.array(z.string()),
		}),
		sugerido: z.object({ cantidad: z.number().int(), texto: z.string() }),
		cantidad_maxima: z.number().int(),
		insumos: z
			.object({
				hoy: z.string(),
				libre: z.string().describe("En milésimos"),
				llegadas: z.array(z.object({ dia: z.string(), cantidad: z.string().describe("En milésimos") })),
				consumo_normal: z.string().nullable().describe("En milésimos"),
				factores: z.array(z.string()).describe("Los doce, en milésimos del factor"),
				plazo: z.number().int(),
				minimo: z.string().describe("En milésimos"),
				multiplo: z.string().describe("En milésimos"),
				dias_cubre: z.number().int(),
				limites: z.object({
					dias_maximos: z.number().int(),
					dias_pedir_esta_semana: z.number().int(),
					dias_mas_de_seis_meses: z.number().int(),
				}),
			})
			.describe("Lo que necesita `proyectarMaterial` para correr en la pantalla"),
	}),
	permiso: { departamento: "compras" },
});

export const ordenDeCompra = definirConsulta({
	nombre: "compras.orden",
	descripcion:
		"Una orden de compra: sus datos, sus avisos, lo que se pidió contra lo recibido con su precio, y qué se puede hacer con ella",
	entrada: z.object({ orden_compra_id: z.uuid() }),
	salida: z.object({
		orden: z.object({
			orden_compra_id: z.uuid(),
			version: z.number().int(),
			folio: z.string(),
			estado: z.enum([
				"borrador",
				"enviada",
				"recibida_en_parte",
				"recibida",
				"cerrada",
				"cerrada_con_faltante",
				"cancelada",
			]),
			estado_armado: estadoArmado,
			proveedor_id: z.uuid(),
			proveedor: z.string(),
			condicion: z.string(),
			levanto: z.string(),
			creada: z.string(),
			enviada: z.string().nullable(),
			fecha_prometida: z.string().nullable(),
			llego: z.string().nullable(),
			dice_tardar: z.number().int(),
			fecha_propuesta: z.string().describe("Hoy más lo que dice tardar el proveedor"),
			fecha_maxima: z.string().describe("Hoy más `compras.dias_max_fecha_prometida`"),
			avisos: z.array(z.string()),
			pdf_archivo_id: z.uuid().nullable(),
		}),
		lineas: z.array(
			z.object({
				orden_compra_linea_id: z.uuid(),
				material_id: z.uuid(),
				material: z.string(),
				unidad: z.string(),
				multiplo: z.number().int(),
				pedido: cantidad,
				recibido: cantidad,
				falta: cantidad,
				falta_rojo: z.boolean(),
				precio_centavos: z.number().int().optional().describe("El vigente"),
				precio_orden_centavos: z
					.number()
					.int()
					.nullable()
					.optional()
					.describe("«La orden decía», si la nota cobró otro"),
				importe_centavos: z.number().int().optional(),
			}),
		),
		total_centavos: z.number().int().optional(),
		cantidad_maxima: z.number().int(),
		puede: z.object({
			editar: z.boolean(),
			cancelar: z.boolean(),
			cerrar_con_faltante: z.boolean(),
			capturar_factura: z.boolean().describe("Con algo recibido y si la cuenta tiene Contaduría"),
		}),
	}),
	permiso: { departamento: "compras" },
});

export const materialDeCompras = definirConsulta({
	nombre: "compras.material",
	descripcion:
		"Un material: sus cifras, lo comprometido y lo que viene, sus proveedores con su último precio, sus últimos precios y cómo se pide",
	entrada: z.object({ material_id: z.uuid() }),
	salida: z.object({
		material: z.object({
			material_id: z.uuid(),
			version: z.number().int(),
			nombre: z.string(),
			tipo: z.enum(["tela", "avio", "consumible"]),
			unidad: z.string(),
			presentacion: z.string().nullable(),
			color: z.string().nullable(),
			...proyectado,
			hay: cantidad,
			libre: cantidad,
			comprometido: cantidad,
			minimo: cantidad,
			tono_existencia: z.enum(tonosDeExistencia),
			multiplo_compra: cantidad,
			dias_cubre: z.number().int(),
			consumo_diario_inicial: cantidad.nullable(),
			unidad_tablet: z.string().nullable(),
			factor_tablet: z.string().nullable(),
			dado_de_baja: z.boolean(),
		}),
		comprometido: z.array(comprometidoConLote),
		en_camino: z.array(enCamino),
		proveedores: z.array(
			z.object({
				proveedor_id: z.uuid(),
				nombre: z.string(),
				plazo: z.number().int(),
				ultima_compra: z.string().nullable(),
				ultimo_precio_centavos: z.number().int().optional(),
				habitual: z.boolean(),
			}),
		),
		otros_proveedores: z
			.array(z.object({ proveedor_id: z.uuid(), nombre: z.string(), surte: z.string().nullable() }))
			.describe("Los activos que no lo surten, para «Otro proveedor»"),
		ultimo_precio_centavos: z
			.number()
			.int()
			.nullable()
			.optional()
			.describe("La última compra, con cualquier proveedor"),
		precios: z.array(
			z.object({
				precio_centavos: z.number().int().optional(),
				proveedor: z.string(),
				folio: z.string().nullable(),
				origen: z.string().describe("«en la orden», «según la nota», «al agregar al proveedor» o «alta»"),
				cambio: z.object({ texto: z.string(), ambar: z.boolean() }).nullable(),
				fecha: z.string(),
			}),
		),
	}),
	permiso: { departamento: "compras" },
});

export const proveedorDeCompras = definirConsulta({
	nombre: "compras.proveedor",
	descripcion:
		"Un proveedor: lo que dice que tarda y lo que tarda, sus últimas entregas, su ficha, los materiales que surte y sus últimas órdenes",
	entrada: z.object({ proveedor_id: z.uuid() }),
	salida: z.object({
		proveedor: z.object({
			proveedor_id: z.uuid(),
			version: z.number().int(),
			nombre: z.string(),
			rfc: z.string().nullable(),
			ciudad: z.string(),
			telefono: z.string(),
			dias_credito: z.number().int(),
			dias_dice_tardar: z.number().int(),
			surte: z.string().nullable(),
			dado_de_baja: z.boolean(),
		}),
		plazo: z.object({
			tarda: z.number().int().nullable(),
			tono: z.enum(["verde", "ambar", "rojo", "gris"]),
			a_tiempo: z.number().int(),
			entregas: z.number().int(),
		}),
		entregas: z.array(
			z.object({ recepcion_id: z.uuid(), folio: z.string(), dias: z.number().int(), a_tiempo: z.boolean() }),
		),
		materiales: z.array(
			z.object({
				material_id: z.uuid(),
				nombre: z.string(),
				ultimo_precio_centavos: z.number().int().optional(),
				habitual: z.boolean(),
				estado: estadoArmado,
			}),
		),
		ordenes: z.array(
			z.object({
				orden_compra_id: z.uuid(),
				folio: z.string(),
				creada: z.string(),
				estado: estadoArmado,
				total_centavos: z.number().int().optional(),
			}),
		),
		dias_dice_tardar_maximo: z.number().int(),
	}),
	permiso: { departamento: "compras" },
});
