/**
 * Los contratos de las consultas de los pedidos en las pantallas de Ventas a externos: Pendientes, la lista de
 * pedidos, el cajón del pedido, el editor del pedido nuevo y de su modificación, el buscador de prendas, el precio
 * sugerido y la revisión antes de mandar a producción.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pendientes», «Pedidos», «Cajones»)
 *
 * Todas son de Ventas; el cajón del pedido también lo abren Contaduría y Dirección, solo para leer. Los textos llegan
 * armados y los estados con su color: la pantalla no calcula etapas, alertas ni fechas.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";
import { formasDePago } from "./pedidos.ts";
import { clientePintado, estadoArmado, etapasDePedido, fechaConTexto, tono, tramo } from "./vistas.ts";

/** Los grupos de Pendientes. */
export const gruposDePendientes = ["pedidos", "entregas", "clientes"] as const;

/** Una cifra de la barra de indicadores de Pendientes. */
const cifra = z.object({
	clave: z.enum(["pedidos_abiertos", "piezas_por_entregar", "entregas_proximas", "notas_entrega", "clientes"]),
	nombre: z.string().describe("«Pedidos abiertos», «Entregas en 7 días»"),
	numero: z.number().int(),
	contexto: z.array(z.object({ texto: z.string(), tono })).describe("La línea de abajo, lo rojo y lo ámbar primero"),
	reparto: z.array(tramo).nullable().describe("La barra repartida por estado, si la lleva"),
	pestana: z.enum(["pedidos", "notas", "clientes"]).describe("La pestaña a la que lleva"),
});

/** Un renglón de Pendientes, ya armado. */
const renglonPendiente = z.object({
	clave: z.string().describe("Única en la lista"),
	grupo: z.enum(gruposDePendientes),
	tipo: z.enum(["borrador", "entrega", "pedido", "nota", "credito"]),
	titulo: z.string().describe("«PE-0150 · Colegio Morelos»"),
	detalle: z.string().describe("La línea de abajo de la referencia"),
	fecha: fechaConTexto.nullable(),
	importe_centavos: z.number().int().nullable().optional().describe("El total o lo que valen las listas"),
	piezas: z.number().int().nullable().describe("En lugar del importe: «{n} pz» de una nota"),
	estado: estadoArmado,
	accion: z.object({
		tipo: z.enum(["revisar", "armar_nota", "mandar", "ver_pedido", "confirmar_entrega", "ver_cliente"]),
		texto: z.string().describe("El texto del botón"),
		pedido_id: z.uuid().nullable(),
		nota_id: z.uuid().nullable(),
		cliente_id: z.uuid().nullable(),
	}),
});

/** Pendientes de Ventas a externos: la barra de indicadores y la cola de trabajo. */
export const pendientesVentas = definirConsulta({
	nombre: "ventas.pendientes",
	descripcion: "Pendientes de Ventas a externos: los indicadores y los renglones por resolver, por grupo",
	entrada: z.object({
		grupo: z
			.enum(["todos", ...gruposDePendientes])
			.optional()
			.describe("El grupo que se ve; sin él, todos"),
	}),
	salida: z.object({
		cifras: z.array(cifra),
		conteos: z.object({
			todos: z.number().int(),
			pedidos: z.number().int(),
			entregas: z.number().int(),
			clientes: z.number().int(),
		}),
		renglones: z.array(renglonPendiente).describe("Los del grupo, sin ordenar: la tabla los ordena por color"),
		rojo: z.boolean().describe("Si algún renglón es rojo"),
	}),
	permiso: { departamento: "ventas" },
});

/** La etapa de un pedido, con su clave y su texto. */
const etapa = z.object({ clave: z.enum(etapasDePedido), texto: z.string() });

/** Un pedido en la lista de Pedidos. */
const pedidoEnLista = z.object({
	pedido_id: z.uuid(),
	folio: z.string(),
	version_vigente: z.number().int().describe("Su número de versión; «versión {v}» desde la 2"),
	cliente_id: z.uuid(),
	cliente: z.string(),
	prendas: z.string().describe("Los nombres de sus prendas"),
	prendas_detalle: z.string().describe("«2 productos · tallas 6 a 14»"),
	piezas: z.number().int(),
	entrega: fechaConTexto,
	avance: z
		.object({ texto: z.string().describe("«{n} de {m} entregadas»"), tramos: z.array(tramo) })
		.nullable()
		.describe("Nulo en borrador: «Sin confirmar»"),
	etapa,
	estado: estadoArmado.describe("La etapa con su alerta abajo"),
	notas: z.object({ cuantas: z.number().int(), ultimas: z.array(z.string()).describe("Los dos últimos folios") }),
	total_centavos: z.number().int().optional(),
});

/** La lista de Pedidos, por cliente o por estado. */
export const pedidosVentas = definirConsulta({
	nombre: "ventas.pedidos",
	descripcion:
		"Los pedidos abiertos (y los entregados, si se piden), por cliente o por etapa, con su avance y su alerta",
	entrada: z.object({
		vista: z.enum(["cliente", "estado"]).optional().describe("Por cliente (con los grupos) o por estado"),
		buscar: z.string().trim().max(80).optional().describe("Folio, prenda, nota o cliente: todas las palabras"),
		etapa: z.enum(etapasDePedido).optional().describe("Solo los de esa etapa"),
		mostrar_entregados: z.enum(["si", "no"]).optional().describe("Si salen los entregados"),
	}),
	salida: z.object({
		etapas: z
			.array(z.object({ clave: z.enum(etapasDePedido), texto: z.string(), color: colorDeEstado, conteo: z.number() }))
			.describe("Los filtros por etapa, con su conteo sin el filtro de etapa"),
		clientes: z
			.array(
				clientePintado.extend({
					descripcion: z.string().describe("«Escuela en Yurécuaro · 2 pedidos»"),
					credito: z.object({ texto: z.string(), color: colorDeEstado }),
					detenido: z.boolean(),
				}),
			)
			.describe("Por cliente: los grupos, en su orden; vacía por estado"),
		pedidos: z.array(pedidoEnLista).describe("Los entregados al final; los demás por entrega"),
	}),
	permiso: { departamento: "ventas" },
});

/** Una fila de la tabla por talla de una prenda del pedido. */
const filaPorTalla = z.object({
	concepto: z.string().describe("Pedido, Entregado, En nota, Listo en aduana, De bodega, En producción…"),
	piezas: z.array(z.number().int()).describe("Una por talla, en el orden de las tallas"),
	total: z.number().int(),
});

/** El cajón del pedido. */
export const pedidoVentas = definirConsulta({
	nombre: "ventas.pedido",
	descripcion: "El pedido con su avance, sus avisos, sus prendas por talla, sus notas y lo que se puede hacer con él",
	entrada: z.object({ pedido_id: z.uuid().describe("El pedido") }),
	salida: z.object({
		pedido_id: z.uuid(),
		folio: z.string(),
		version: z.number().int().describe("La versión del registro, para las acciones"),
		version_vigente: z.number().int(),
		estado: z.enum(["borrador", "confirmado", "entregado", "cancelado"]),
		cliente: clientePintado,
		etapa,
		estado_armado: estadoArmado,
		relacionados: z.object({
			lotes: z.object({ cuantos: z.number().int(), texto: z.string() }),
			listas_en_aduana: z.number().int(),
			notas: z.number().int(),
			anticipo_recibido_centavos: z.number().int().nullable().optional().describe("Nulo: «sin anticipo»"),
			credito: z.string().describe("El semáforo del cliente"),
		}),
		avance: z.object({ texto: z.string(), tramos: z.array(tramo) }),
		entrega: fechaConTexto,
		forma_pago: z.string().describe("«Crédito 30 días», «Anticipo», «Contado»"),
		levanto: z.string(),
		total_centavos: z.number().int().optional(),
		avisos: z.array(
			z.object({
				color: z.enum(["azul", "ambar", "verde", "rojo"]),
				texto: z.string(),
				boton: z.enum(["mandar", "armar_nota"]).nullable(),
			}),
		),
		prendas: z.array(
			z.object({
				producto_id: z.uuid(),
				nombre: z.string(),
				precio: z.string().describe("«Colegio Morelos · Lista Morelos $215» o «Precio dado $200 · sugerido $215»"),
				importe_centavos: z.number().int().optional(),
				piezas: z.number().int(),
				tallas: z.array(z.string()),
				filas: z.array(filaPorTalla).describe("Solo las que tienen piezas"),
			}),
		),
		notas: z.array(
			z.object({
				nota_id: z.uuid(),
				folio: z.string(),
				fecha: z.string(),
				prendas: z.string(),
				piezas: z.number().int(),
				estado: estadoArmado,
				total_centavos: z.number().int().optional(),
			}),
		),
		listo_por_talla: z
			.array(z.object({ variante_id: z.uuid(), prenda: z.string(), talla: z.string(), listas: z.number().int() }))
			.describe("Lo listo en aduana sin nota, para «Pasar a bodega»"),
		lotes_a_temporada: z.number().int().describe("Los lotes que pasan a temporada si se cancela"),
		puede: z.object({
			confirmar: z.boolean(),
			editar: z.boolean(),
			modificar: z.boolean(),
			cancelar: z.boolean(),
			pasar_a_bodega: z.boolean(),
			armar_nota: z.boolean(),
			mandar: z.boolean(),
			pdf: z.boolean(),
		}),
	}),
	permiso: { departamento: ["ventas", "contaduria", "direccion"] },
});

/** Una talla de una prenda del editor. */
const tallaDelEditor = z.object({
	variante_id: z.uuid(),
	talla: z.string(),
	especial: z.boolean().describe("Pedido especial: lleva recargo"),
	recargo_centavos: z.number().int().optional(),
	minimo: z.number().int().describe("Entregado + en nota + listo en aduana: no se baja de ahí"),
	cantidad: z.number().int().describe("Lo que lleva hoy el pedido; 0 si es nueva"),
});

/** Una prenda del editor del pedido, con su precio sugerido y sus tallas vigentes. */
export const prendaDelEditor = z.object({
	producto_id: z.uuid(),
	nombre: z.string(),
	escuela: z.string().describe("La escuela o «Básico»"),
	sugerido_centavos: z.number().int().nullable().optional().describe("Nulo: «Sin precio para este cliente»"),
	origen: z.string().nullable().describe("«su lista», «12% sobre mostrador», «mayoreo» o «mostrador»"),
	precio_dado_centavos: z.number().int().nullable().optional(),
	se_quita: z.boolean().describe("Falso si ya tiene piezas entregadas o en aduana"),
	tallas: z.array(tallaDelEditor),
});

/** Un cliente que se puede escoger en el pedido. */
const clienteDelEditor = clientePintado.extend({
	detenido: z.boolean(),
	tiene_credito: z.boolean(),
	cerca_del_limite: z.boolean(),
	dias_credito: z.number().int(),
});

/** El editor del pedido nuevo y de Modificar pedido. */
export const editorPedido = definirConsulta({
	nombre: "ventas.editor_pedido",
	descripcion: "Lo que necesita el pedido nuevo o su modificación: los clientes, el pedido como está y sus prendas",
	entrada: z.object({
		pedido_id: z.uuid().optional().describe("El pedido que se modifica; sin él, uno nuevo"),
		cliente_id: z.uuid().optional().describe("El cliente con que abre un pedido nuevo"),
	}),
	salida: z.object({
		folio: z.string().describe("El suyo, o el que sigue para uno nuevo"),
		modo: z.enum(["nuevo", "borrador", "confirmado"]),
		version: z.number().int().nullable().describe("La versión del registro, para guardar"),
		version_siguiente: z.number().int().nullable().describe("La versión que nace al guardar un confirmado"),
		hoy: z.iso.date(),
		forma_pago_inicial: z.enum(formasDePago),
		piezas_max_talla: z.number().int(),
		clientes: z.array(clienteDelEditor).describe("Los activos"),
		pedido: z
			.object({
				cliente_id: z.uuid(),
				fecha_entrega: z.iso.date(),
				forma_pago: z.enum(formasDePago),
			})
			.nullable(),
		prendas: z.array(prendaDelEditor),
	}),
	permiso: { departamento: "ventas" },
});

/** Un producto del buscador de prendas. */
const productoEncontrado = z.object({
	producto_id: z.uuid(),
	nombre: z.string(),
	detalle: z.string().describe("«{escuela} · tallas {rango}»"),
	precio_centavos: z.number().int().nullable().optional().describe("Nulo: «Sin precio»"),
	origen: z.string().nullable(),
});

/** El buscador de prendas del pedido. */
export const buscarPrendas = definirConsulta({
	nombre: "ventas.buscar_prendas",
	descripcion: "Las prendas que se venden a externos, por grupo, con su precio sugerido para el cliente",
	entrada: z.object({
		cliente_id: z.uuid().describe("El cliente del pedido"),
		buscar: z.string().trim().max(80).optional().describe("Prenda, escuela o sección"),
	}),
	salida: z.object({
		grupos: z.array(
			z.object({
				clave: z.enum(["cliente", "lista", "basicos", "otras"]),
				titulo: z.string().describe("«Modelos de {cliente}», «En la lista de {lista}»…"),
				productos: z.array(productoEncontrado),
			}),
		),
		cliente: z.string(),
	}),
	permiso: { departamento: "ventas" },
});

/** El precio sugerido de una prenda para un cliente, talla por talla. */
export const precioSugeridoVentas = definirConsulta({
	nombre: "ventas.precio_sugerido",
	descripcion: "Una prenda para el pedido: su precio sugerido para el cliente y sus tallas vigentes",
	entrada: z.object({ cliente_id: z.uuid(), producto_id: z.uuid() }),
	salida: z.object({ prenda: prendaDelEditor }),
	permiso: { departamento: "ventas" },
});

/** Una línea de la revisión con su tono. */
const lineaConTono = z.object({ texto: z.string(), color: z.enum(["verde", "ambar", "rojo"]) });

/** La revisión antes de mandar a producción. */
export const revisionMandar = definirConsulta({
	nombre: "ventas.revision_mandar",
	descripcion: "Lo que se va a producción de un pedido: lo libre en bodega, el lote, la receta y el material",
	entrada: z.object({ pedido_id: z.uuid() }),
	salida: z.object({
		pedido_id: z.uuid(),
		folio: z.string(),
		version: z.number().int(),
		cliente: clientePintado,
		piezas: z.number().int(),
		prendas_cuantas: z.number().int(),
		entrega: fechaConTexto,
		hilo: z.array(
			z.object({
				parada: z.enum(["pedido", "corte", "costura", "calidad", "aduana", "entrega"]),
				piezas: z.number().int(),
				linea: z.string(),
				tono,
			}),
		),
		avisos: z.array(lineaConTono).describe("Arriba: sin receta, falta material o llega después"),
		prendas: z.array(
			z.object({
				producto_id: z.uuid(),
				nombre: z.string(),
				tallas: z.string().describe("«14: 10 · 16: 5»"),
				piezas: z.number().int(),
				bodega: z
					.object({ texto: z.string(), piezas: z.number().int() })
					.nullable()
					.describe("«Bodega tiene libres: 14: 10», con lo que se puede surtir"),
				lote: z.string(),
				material: z.array(lineaConTono),
			}),
		),
	}),
	permiso: { departamento: "ventas" },
	errores: [{ codigo: "nada_por_mandar", mensaje: "Todo el pedido ya está en producción" }],
});
