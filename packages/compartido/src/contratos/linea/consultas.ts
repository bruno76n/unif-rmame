/**
 * Los contratos de las consultas de las pantallas de Tienda en línea: Pendientes (con la pastilla del menú), el tablero
 * de Pedidos y el cajón del pedido en línea.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Pendientes», «Pedidos», «Cajones»)
 *
 * Los textos llegan armados y los estados con su color: la pantalla no calcula etapas, promesas, urgencias ni dónde
 * está cada prenda. Todo monto va en centavos y es opcional, para que el servidor lo recorte a quien no lo ve.
 */

import { z } from "zod";
import { definirConsulta, paginaDe, parametrosDePagina } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

/** Los estados de un W-, como los guarda su tabla. */
export const estadosDeW = [
	"esperando_pago",
	"por_surtir",
	"esperando_prendas",
	"listo_para_empacar",
	"cancelado",
	"vencido",
] as const;

/** Los estados de un W- abierto, en el orden de las columnas del tablero. */
export const estadosAbiertosDeW = ["esperando_pago", "por_surtir", "esperando_prendas", "listo_para_empacar"] as const;

/** El tono de una línea corta: normal, ámbar o rojo. */
const tono = z.enum(["normal", "ambar", "rojo"]).describe("Normal, ámbar o rojo");

/** Una parte de la línea de contexto de una cifra. */
const contexto = z
	.array(z.object({ texto: z.string(), tono }))
	.describe("La línea de abajo, lo rojo y lo ámbar primero");

/** Un texto con su color de estado. */
const conColor = z.object({ texto: z.string(), color: colorDeEstado });

/** Un monto que solo viaja a quien lo ve. */
const monto = (descripcion: string) => z.number().int().optional().describe(descripcion);

/** Pendientes de Tienda en línea: los tres indicadores, los W- abiertos y la pastilla del menú. */
export const pendientesLinea = definirConsulta({
	nombre: "linea.pendientes",
	descripcion:
		"Pendientes de Tienda en línea: los pedidos abiertos, las ventas de la semana, la disponibilidad, los W- por surtir, esperando prendas y listos para empacar, y la pastilla del menú",
	entrada: z.object({}),
	salida: z.object({
		cifras: z.object({
			pedidos: z.object({
				abiertos: z.number().int().describe("Los W- por surtir, esperando prendas y listos para empacar"),
				tono: z.enum(["rojo", "ambar"]).nullable().describe("Rojo si hay alguno por surtir; ámbar si hay abiertos"),
				contexto,
				reparto: z
					.array(z.object({ etiqueta: z.string(), valor: z.number().int(), color: colorDeEstado }))
					.describe("Por surtir · Esperando prendas · Listo para empacar"),
			}),
			ventas: z.object({
				semana_centavos: monto("El total con envío de los W- pagados en los últimos 7 días, sin los cancelados"),
				serie_centavos: z
					.array(z.number().int())
					.optional()
					.describe("Lo vendido cada uno de los últimos 14 días, del más viejo a hoy"),
				contexto: contexto.describe("«▲ {n}% contra la anterior»; vacía si la semana anterior no vendió"),
			}),
			disponibilidad: z.object({
				salen_hoy: z.number().int().describe("Las tallas de los productos en línea que salen hoy"),
				contexto: contexto.describe("«{m} agotadas» o «Ninguna agotada»"),
			}),
		}),
		renglones: z
			.array(
				z.object({
					pedido_linea_id: z.uuid(),
					folio: z.string(),
					titulo: z.string().describe("«W-1045 · Laura Méndez»"),
					detalle: z
						.string()
						.describe(
							"Lo que falta y dónde está lo primero, o «Completo en aduana · listo para empacar»; abajo de la referencia",
						),
					fecha: z.object({
						fecha: z.iso.datetime({ offset: true }).describe("Cuándo se pagó: ordena"),
						texto: z.string().describe("«Pagado 11 oct»"),
					}),
					total_centavos: monto("El total con envío"),
					estado: conColor.describe("La etapa, roja desde `linea.dias_pedido_rojo` días de pagado, ámbar antes"),
				}),
			)
			.describe("Del pagado hace más tiempo al más nuevo"),
		pastilla: z.object({
			conteo: z.number().int().describe("Los W- por surtir"),
			rojo: z.boolean().describe("Si algún W- abierto se pagó hace `linea.dias_pedido_rojo` días o más"),
		}),
	}),
	permiso: { departamento: "linea" },
});

/** Una prenda de una tarjeta del tablero. */
const prendaEnTarjeta = z.object({
	prenda: z.string(),
	talla: z.string(),
	piezas: z.number().int(),
	en_aduana: z.boolean().describe("Si todas sus piezas ya están en aduana: palomita; si no, reloj"),
	donde: z.string().nullable().describe("Dónde está lo que falta: «Bodega la surte», «En camino a aduana · A-0311»…"),
});

/** Una tarjeta del tablero de Pedidos: un W- abierto. */
const tarjeta = z.object({
	pedido_linea_id: z.uuid(),
	folio: z.string(),
	fecha: z.string().describe("«Pagado 11 oct» o, esperando el pago, «Vence 12 oct 18:30»"),
	cliente: z.string(),
	municipio: z.string().describe("A dónde va"),
	estado: z.enum(estadosAbiertosDeW),
	estado_desde: z.iso.datetime({ offset: true }).describe("Desde cuándo está en esa etapa"),
	promesa: conColor.nullable().describe("Por surtir o esperando prendas: «Sale hoy» (verde) o «Sale mañana» (ámbar)"),
	prendas: z.array(prendaEnTarjeta),
	total_centavos: monto("El total con envío; Aduana y Bodega no lo reciben"),
	version: z.number().int().describe("La versión del W-, para cancelarlo"),
});

/** Un W- cerrado: cancelado o vencido. */
const cerrado = z.object({
	pedido_linea_id: z.uuid(),
	folio: z.string(),
	estado: z.enum(["cancelado", "vencido"]),
	estado_texto: conColor,
	fecha: z.string().describe("Cuándo se cerró: «12 oct»"),
	detalle: z.string().describe("«{cliente} · {municipio} · {motivo}» o «… · Venció sin pago»"),
	total_centavos: monto("El total con envío; Aduana y Bodega no lo reciben"),
});

/** El tablero de Pedidos, con los cerrados abajo. */
export const pedidosLinea = definirConsulta({
	nombre: "linea.pedidos",
	descripcion:
		"Los W- por etapa (esperando pago, por surtir, esperando prendas y listos para empacar), con sus prendas y dónde está cada una, y los cerrados del más reciente al más viejo; sin totales para Aduana y Bodega",
	entrada: z.object({
		estado: z.enum(estadosDeW).optional().describe("Solo los de esa etapa"),
		buscar: z.string().trim().max(80).optional().describe("Folio o cliente"),
		...parametrosDePagina(100),
	}),
	salida: z.object({
		columnas: z
			.array(
				z.object({
					estado: z.enum(estadosAbiertosDeW),
					texto: z.string(),
					color: colorDeEstado,
					pedidos: z.array(tarjeta).describe("Del pagado hace más tiempo al más nuevo"),
				}),
			)
			.describe("«Esperando pago» solo si hay alguno; vacía en las páginas que siguen: solo traen cerrados"),
		cerrados: z.array(cerrado).describe("Cancelados y vencidos, el más reciente arriba: esta página"),
		cursor: paginaDe(cerrado).cursor,
		hay_mas: paginaDe(cerrado).hay_mas,
	}),
	permiso: { departamento: ["linea", "aduana", "bodega"] },
	recortables: ["total_centavos"],
});

/** Dónde está una parte de una prenda del W-. */
const donde = conColor.describe(
	"«Bodega la surte», «En camino a aduana · {A}», «En aduana» o «Sin pieza: Bodega la busca», con su punto",
);

/** El cajón del pedido en línea. */
export const pedidoLinea = definirConsulta({
	nombre: "linea.pedido",
	descripcion:
		"Un W- con su cliente, su envío, su pago, sus prendas y dónde está cada una, sus excepciones abiertas, su camino y lo que se puede hacer con él",
	entrada: z.object({
		pedido_linea_id: z.uuid().optional().describe("El W-"),
		folio: z.string().trim().max(20).optional().describe("O su folio"),
	}),
	salida: z.object({
		pedido_linea_id: z.uuid(),
		folio: z.string(),
		version: z.number().int().describe("La versión del W-, para cancelarlo"),
		estado: z.enum(estadosDeW),
		etapa: conColor,
		cliente: z.object({ nombre: z.string(), correo: z.string(), telefono: z.string().nullable() }),
		relacionados: z.object({
			en_aduana: z.number().int().describe("Las prendas que ya están en aduana"),
			prendas: z.number().int().describe("Todas sus prendas"),
			por_surtir_bodega: z.number().int().describe("Las que Bodega tiene apartadas por surtir"),
		}),
		cifras: z.object({
			total_centavos: monto("El total con envío"),
			total_linea: z.string().describe("«pagó, con envío» o «por pagar · vence {día} {hora}»"),
			municipio: z.string(),
			promesa: z
				.object({ texto: z.string(), linea: z.string() })
				.describe("Por surtir o esperando prendas: la promesa y «lo que se le prometió»; después, la etapa y «estado»"),
		}),
		envio: z.object({
			destinatario: z.string(),
			telefono: z.string().nullable(),
			direccion: z.array(z.string()).describe("La calle y su colonia; el código postal, el municipio y el estado"),
			referencias: z.string().nullable(),
			metodo: z.string().describe("«{método} · {paquetería}»"),
			costo_centavos: monto("Lo que pagó de envío"),
		}),
		pago: z.object({
			metodo: z.string().describe("«{pasarela} · {método}»"),
			referencia: z.string(),
			pagado: z.string().nullable().describe("«Pagado el {fecha} {hora}»; nulo si no se ha pagado"),
			comision_centavos: z.number().int().nullable().optional().describe("La comisión de la pasarela"),
		}),
		cupon: z.string().nullable(),
		avisos: z.array(z.string()).describe("Una por excepción abierta, con quién la resuelve"),
		prendas: z.array(
			z.object({
				renglon: z.number().int(),
				prenda: z.string(),
				talla: z.string(),
				piezas: z.number().int(),
				donde: z.array(donde).describe("Vacía si ya no tiene nada apartado (cancelado o vencido)"),
				precio_unitario_centavos: monto("El precio en línea con que se vendió"),
				importe_centavos: monto("Lo que paga por el renglón"),
				paquete: z.string().nullable().describe("«Paquete {n}», si vino en uno"),
				descuento_paquete_centavos: monto("Su parte de la rebaja del paquete"),
			}),
		),
		totales: z.object({
			subtotal_centavos: monto("Subtotal"),
			descuento_centavos: monto("Descuento"),
			envio_centavos: monto("Envío"),
			descuento_envio_centavos: monto("Descuento del envío"),
			total_centavos: monto("Total"),
		}),
		camino: z
			.array(z.object({ texto: z.string(), detalle: z.string().nullable(), hecho: z.boolean() }))
			.describe("«Pagó» · «Surtido a aduana» · «Prendas reunidas en aduana»"),
		cierre: z
			.string()
			.nullable()
			.describe("«Cancelado el {fecha} por {persona}: {motivo}» o «Venció sin pago el {fecha}»"),
		puede: z.object({
			cancelar: z.boolean().describe("Esperando pago, por surtir, esperando prendas o listo para empacar"),
			ver_en_aduana: z.boolean().describe("Listo para empacar"),
		}),
	}),
	permiso: { departamento: "linea" },
});
