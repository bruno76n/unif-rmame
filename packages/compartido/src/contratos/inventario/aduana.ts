/**
 * Los contratos de las consultas de las pestañas de Aduana: el Andén, Recepción, En camino a aduana, Despacho,
 * Inventario en aduana, En tránsito e Historial. Solo los piden las cuentas con Aduana, y nunca llevan precios ni
 * costos.
 * Fase 19 · docs/interfaz/fabrica/aduana.md
 *
 * Los textos llegan armados y los estados con su color: la pantalla no calcula antigüedades, salidas ni a dónde va
 * cada cosa. Lo que viene del taller nunca dice lo que aprobó Calidad más que en la lista de Recepción.
 */

import { z } from "zod";
import { definirConsulta, paginaDe, parametrosDePagina } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

/** Un texto con su color de estado. */
export const textoConColor = z.object({ texto: z.string(), color: colorDeEstado });

/**
 * Los carriles del andén y los destinos: el código de una ubicación (`T1`, `T2`, `BOD`) o uno de fuera.
 * `entra` es el carril de lo que llega; `proveedor`, lo que regresa a un proveedor (no tiene carril).
 */
export const carrilDeAduana = z
	.string()
	.describe("El destino: el código de su ubicación (`T1`, `T2`, `BOD`), `externos`, `linea`, `calidad` o `proveedor`");

/** Lo que abre una tarjeta o un renglón: un cajón de Aduana con su documento, o la pestaña Empaque en línea. */
export const loQueAbre = z
	.object({
		a: z
			.enum(["taller", "material", "camino", "reproceso", "despachar", "empaque"])
			.describe("El cajón (o `empaque`, la pestaña de los pedidos en línea)"),
		id: z.uuid().describe("El lote, la orden, el traspaso o el reproceso"),
	})
	.describe("Qué abre al tocarlo");

/** Lo que está en aduana: un renglón de Despacho e Inventario en aduana, y una tarjeta de un carril de destino. */
export const partidaEnAduana = z.object({
	traspaso_id: z.uuid(),
	folio: z.string().describe("El A-"),
	version: z.number().int().describe("La versión del traspaso, para despacharlo"),
	titulo: z.string().describe("Qué es: la prenda, «Nota {NV} · {prendas}», «Solicitud de {tienda}»…"),
	detalle: z.string().describe("Su detalle: «{cliente} · {PE} · sin nota», «Reabasto de {tienda}»…"),
	cantidad: z.string().describe("«{n} piezas», «{n} m» o «{n} {unidad}»"),
	piezas: z.number().int().describe("Las piezas de prenda; el material no suma"),
	carril: carrilDeAduana,
	destino: z.string().describe("A dónde va: «Tienda 1», el cliente, «Calidad decide», el proveedor"),
	llego: z.string().describe("El día que llegó a aduana: «13 oct»"),
	antiguedad: textoConColor.describe("«Llegó hoy», «1 día en aduana», «{n} días en aduana», en verde, ámbar o rojo"),
	sale: z.string().nullable().describe("«Sale hoy» o «Sale mañana» (rojo), si su salida es hoy, mañana o ya pasó"),
	fecha_salida: z.string().nullable().describe("El día en que la esperan, en ISO; nada si no tiene fecha"),
	etiquetas_por_imprimir: z.boolean().describe("Lo recibido del taller y los rollos, hasta que se imprimen"),
	boton: z
		.enum(["despachar", "sin_nota", "ver_pedido", "ver", "devolver"])
		.describe("«Despachar», «Sin nota», «Ver pedido» (en línea), «Ver» (Calidad) o «Devolver al proveedor»"),
	devolucion: z
		.object({
			proveedor: z.string(),
			material: z.string(),
			orden: z.string().describe("El folio OC-"),
			cantidad: z.string().describe("Lo que regresa, en su unidad"),
			unidad: z.string(),
			es_tela: z.boolean(),
			rollos: z
				.array(z.object({ rollo_id: z.uuid(), folio: z.string(), metros: z.string() }))
				.describe("Si es tela: los rollos de esa orden que están en aduana"),
		})
		.nullable()
		.describe("Solo en lo que regresa a un proveedor: lo que lleva su ventana «Devolver a {proveedor}»"),
});

/** Una tarjeta de un carril del andén. */
const tarjetaDelAnden = z.object({
	clave: z.string().describe("Única en el andén"),
	titulo: z.string(),
	detalle: z.string(),
	cantidad: z.string(),
	etiqueta: textoConColor.nullable().describe("Junto al título: «Sale hoy», «Sale mañana» o «Atrasada {n} días»"),
	marca: z
		.object({ texto: z.string(), color: colorDeEstado.nullable() })
		.describe("Abajo a la derecha: de dónde viene, cuándo llega o su antigüedad"),
	abre: loQueAbre,
});

/** El andén de Aduana: las cuatro cifras, los carriles y el conteo de cada pestaña. */
export const andenDeAduana = definirConsulta({
	nombre: "inventario.anden",
	descripcion:
		"El andén de Aduana: lo que espera entrar y lo que está en aduana por destino, con sus cifras y el conteo de cada pestaña",
	entrada: z.object({}),
	salida: z.object({
		cifras: z.object({
			por_recibir: z.number().int().describe("Todo lo que espera entrar"),
			atrasadas: z.number().int().describe("Las órdenes de compra atrasadas"),
			salidas: z.number().int().describe("Lo que está en aduana con salida hoy, mañana o ya pasada"),
			parados: z.number().int().describe("Lo que pasó de `inventario.horas_aduana_parado`"),
			dias_parado: z.number().int().describe("`inventario.horas_aduana_parado` en días, para «Más de {d} días»"),
			sin_confirmar: z.number().int().describe("Los despachos que su destino no ha confirmado"),
		}),
		pestanas: z
			.object({
				recepcion: z.number().int().describe("Lo que falta por recibir"),
				en_camino: z.number().int().describe("Lo que viene en camino a aduana"),
				parados: z.number().int().describe("Lo parado en aduana (en rojo)"),
				en_transito: z.number().int().describe("Los despachos sin confirmar"),
				empaque: z.number().int().describe("Los pedidos en línea listos para empacar"),
			})
			.describe("La pastilla de cada pestaña"),
		carriles: z
			.array(
				z.object({
					clave: z.string().describe("`entra` o el destino"),
					nombre: z.string(),
					tipo: z.enum(["entra", "tienda", "linea", "externos", "bodega", "calidad"]).describe("Para su ícono"),
					tarjetas: z.array(tarjetaDelAnden),
				}),
			)
			.describe("«Entra», «Tienda 1», «Tienda 2», «En línea», «Clientes externos», «Bodega» y «Calidad»"),
	}),
	permiso: { departamento: "aduana" },
});

/** Un renglón de Recepción: lo que espera entrar. */
const porRecibir = z.object({
	clave: z.string(),
	titulo: z.string(),
	detalle: z.string(),
	cantidad: z.string().describe("Lo del taller lleva lo aprobado: es lo único que lo dice"),
	carril: carrilDeAduana,
	destino: z.string().describe("A dónde va"),
	abre: loQueAbre,
});

/** Recepción: los cuatro grupos de lo que espera entrar. */
export const recepcionDeAduana = definirConsulta({
	nombre: "inventario.aduana_recepcion",
	descripcion:
		"Lo que espera entrar a aduana: del taller, de bodega, de proveedores (en la ventana de días o todas) y de los clientes",
	entrada: z.object({
		todas_las_ordenes: z.coerce
			.boolean()
			.optional()
			.describe("Si va, también las órdenes que no entran en `inventario.dias_ventana_ordenes`"),
	}),
	salida: z.object({
		grupos: z
			.array(
				z.object({
					clave: z.enum(["taller", "bodega", "proveedores", "clientes"]),
					titulo: z.string(),
					resumen: z.string().describe("«{n} por recibir · {descripción}» o «Nada por recibir»"),
					renglones: z.array(porRecibir),
				}),
			)
			.describe("Siempre los cuatro, en su orden"),
		ordenes_fuera: z.number().int().describe("Las órdenes por recibir que no entran en la ventana de días"),
	}),
	permiso: { departamento: "aduana" },
});

/** Un renglón de En camino a aduana. */
const enCamino = z.object({
	traspaso_id: z.uuid(),
	folio: z.string(),
	fecha: z.string().describe("Cuándo salió: «13 oct»"),
	que: z.string().describe("Qué viene"),
	detalle: z.string().describe("«{tipo} · va a {destino}»"),
	cantidad: z.string(),
	responde: z.string().describe("Quien lo mandó: Bodega, la tienda o el cliente"),
	salio: textoConColor.describe("«Salió hoy» (verde), «1 día» (ámbar) o «{n} días» (rojo desde el parámetro)"),
});

/** En camino a aduana: lo que ya salió y Aduana no ha recibido. */
export const enCaminoAduana = definirConsulta({
	nombre: "inventario.en_camino_aduana",
	descripcion: "Lo que ya salió de Bodega o de una tienda hacia aduana y Aduana no ha recibido, lo más viejo primero",
	entrada: z.object({ ...parametrosDePagina(100) }),
	salida: z.object({ ...paginaDe(enCamino) }),
	permiso: { departamento: "aduana" },
});

/** Despacho: un grupo por destino con lo que puede despacharse. */
export const despachoDeAduana = definirConsulta({
	nombre: "inventario.aduana_despacho",
	descripcion:
		"Lo que está en aduana por destino (Tienda 1, Tienda 2, Clientes externos y Bodega), sin los pedidos en línea ni lo que espera a Calidad",
	entrada: z.object({}),
	salida: z.object({
		grupos: z.array(
			z.object({
				carril: carrilDeAduana,
				nombre: z.string(),
				resumen: z.string().describe("«{n} por despachar · {m} piezas»"),
				renglones: z.array(partidaEnAduana),
			}),
		),
	}),
	permiso: { departamento: "aduana" },
});

/** Inventario en aduana: el cuadre arriba y lo que está aquí, de lo más viejo a lo más nuevo. */
export const inventarioEnAduana = definirConsulta({
	nombre: "inventario.inventario_en_aduana",
	descripcion:
		"El cuadre de las piezas de prenda por ubicación y lo que está en aduana, de lo más viejo a lo más nuevo",
	entrada: z.object({ ...parametrosDePagina(100) }),
	salida: z.object({
		cuadre: z
			.array(z.object({ nombre: z.string(), piezas: z.number().int(), resaltada: z.boolean() }))
			.describe("Aduana, Bodega, las tiendas, Taller, Tránsito y En camino a aduana"),
		total: z.number().int(),
		...paginaDe(partidaEnAduana),
	}),
	permiso: { departamento: "aduana" },
});

/** Un renglón de En tránsito: un despacho sin confirmar. */
const despachoEnTransito = z.object({
	despacho_id: z.uuid(),
	folio: z.string(),
	version: z.number().int(),
	salio: z.string().describe("El día que salió: «13 oct»"),
	que: z.string().describe("Qué salió"),
	a: z.string().describe("«A {destino o cliente}»"),
	cantidad: z.string(),
	debe_confirmar: z.string().describe("«Bodega», «Encargada de {tienda}» o el cliente, con «· {n} recordatorios»"),
	sin_confirmar: textoConColor,
	boton: z.enum(["confirmar_nota", "confirmar_tienda", "recordar"]),
	tienda: z.string().nullable().describe("La tienda sin caja, para «Confirmar entrega en {tienda}»"),
	nota: z
		.object({
			nota_id: z.uuid(),
			folio: z.string(),
			version: z.number().int(),
			cliente: z.string(),
			piezas: z.number().int(),
		})
		.nullable()
		.describe("La nota de entrega, sin su total"),
	renglones: z
		.array(z.object({ traspaso_linea_id: z.uuid(), prenda: z.string(), piezas: z.number().int() }))
		.describe("Lo que salió por renglón, para «Llegó con diferencias» de una tienda sin caja"),
});

/** En tránsito: los despachos sin confirmar, el más nuevo primero. */
export const enTransito = definirConsulta({
	nombre: "inventario.en_transito",
	descripcion: "Los despachos que su destino no ha confirmado, el más nuevo primero",
	entrada: z.object({ ...parametrosDePagina(100) }),
	salida: z.object({ ...paginaDe(despachoEnTransito) }),
	permiso: { departamento: "aduana" },
});

/** Un renglón del historial de aduana. */
const movimientoDeAduana = z.object({
	clave: z.string(),
	fecha: z.string().describe("«13 oct»"),
	movimiento: textoConColor.describe("«Entró» (verde) o «Salió» (ámbar)"),
	referencia: z.string().describe("El folio"),
	que: z.string(),
});

/** Historial: todo lo que entró y salió de aduana, lo más reciente primero. */
export const historialDeAduana = definirConsulta({
	nombre: "inventario.aduana_historial",
	descripcion: "Todo lo que entró y salió de aduana, lo más reciente primero",
	entrada: z.object({ ...parametrosDePagina(100) }),
	salida: z.object({ ...paginaDe(movimientoDeAduana) }),
	permiso: { departamento: "aduana" },
});
