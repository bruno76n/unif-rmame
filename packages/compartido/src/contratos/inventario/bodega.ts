/**
 * Los contratos de las consultas de las pestañas de Bodega: Pendientes (con «Variantes en cero»), Existencias,
 * Materiales, Reabasto, Diferencias, Conteos y ajustes y Excepciones. Solo las piden las cuentas con Bodega, que nunca
 * ven precios ni costos: ninguna salida los lleva.
 * Fase 19 · docs/interfaz/fabrica/bodega.md (cada pestaña con su «Consulta»)
 *
 * Los estados llegan escritos, con su color: la pantalla solo los pinta (decisión 753). Las cuentas (la del reabasto,
 * los rollos sugeridos, lo que pide un corte) las hace la API; la pantalla solo muestra lo que trae la consulta.
 */

import { z } from "zod";
import { definirConsulta, paginaDe, parametrosDePagina } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

/** Un estado ya escrito, en su forma de la guía de textos, con su color. */
export const estadoDeBodega = z.object({
	texto: z.string().describe("El estado: «Por surtir», «En tránsito», «Por entregar · corte hoy»…"),
	color: colorDeEstado,
});

/** Una variante como la nombran las pantallas de Bodega. */
export const varianteDeBodega = z.object({
	variante_id: z.uuid(),
	prenda: z.string().describe("El nombre del producto"),
	talla: z.string(),
	escuela: z.string().describe("La escuela o «Básico»"),
	codigo: z.string().nullable().describe("El código de la etiqueta"),
});

/** Los grupos de Pendientes. */
export const gruposDePendientesDeBodega = [
	"surtido",
	"recepciones",
	"materiales",
	"diferencias",
	"excepciones",
] as const;

/** Los tipos de renglón de Pendientes. */
export const tiposDePendienteDeBodega = [
	"excepcion",
	"pedido_externo",
	"pedido_linea",
	"devolucion_proveedor",
	"recepcion",
	"entrega_corte",
	"retazo",
	"rollo_corte",
	"diferencia",
	"diferencia_recepcion",
	"diferencia_material",
] as const;

/** Lo que hace el botón de un pendiente. */
export const botonesDePendienteDeBodega = [
	"resolver",
	"surtir",
	"surtir_rollos",
	"confirmar_llegada",
	"entregar_tela",
	"recibir_corte",
	"contar",
	"aclarar",
] as const;

/** Una pieza apartada en Bodega que todavía no se surte, para «No la encuentro». */
const apartadaEnBodega = z.object({
	reserva_id: z.uuid(),
	prenda: z.string(),
	talla: z.string(),
	piezas: z.number().int(),
});

/** Un rollo de una orden de compra que está en Bodega, para escoger los que regresan al proveedor. */
export const rolloQueRegresa = z.object({
	rollo_id: z.uuid(),
	folio: z.string(),
	partida: z.string().nullable(),
	metros: z.string().describe("Lo que tiene en Bodega"),
});

/** Un renglón de Pendientes. */
export const pendienteDeBodega = z.object({
	clave: z.string().describe("Única en la lista"),
	grupo: z.enum(gruposDePendientesDeBodega),
	tipo: z.enum(tiposDePendienteDeBodega),
	titulo: z.string().describe("La referencia: «PE-0150 · Colegio Morelos», «D-0412 · Aduana»…"),
	detalle: z.string().describe("Abajo de la referencia"),
	fecha: z.string().nullable().describe("La fecha que importa, escrita («Entrega 14 nov», «Corte 13 oct»), o nada"),
	orden: z.string().describe("La fecha con que se ordena, en ISO"),
	cantidad: z.string().describe("Las piezas o los metros, escritos («24 pz», «92.5 m»), o «—»"),
	estado: estadoDeBodega,
	boton: z.enum(botonesDePendienteDeBodega).nullable().describe("Lo que hace su botón; nada si no lleva"),
	documento_id: z
		.uuid()
		.describe("El documento: el PE-, el W-, la devolución, el D-, el lote, el rollo, la DF- o la excepción"),
	version: z.number().int().nullable().describe("La versión del documento, si su acción la pide"),
	apartadas: z.array(apartadaEnBodega).describe("En un pedido: lo apartado en Bodega, para «No la encuentro»"),
	rollos: z.array(rolloQueRegresa).describe("En una devolución de tela: los rollos de su orden que están en Bodega"),
	devolucion: z
		.object({ proveedor: z.string(), cantidad: z.string(), unidad: z.string(), material: z.string(), oc: z.string() })
		.nullable()
		.describe("En una devolución: lo que regresa, para su ventana"),
});

/** Una variante en cero de «Variantes en cero». */
export const varianteEnCero = varianteDeBodega.extend({
	ubicacion_id: z.uuid(),
	ubicacion: z.string(),
	disponible: z.enum(["en_camino", "bodega", "sin_existencia"]).describe("Qué dice «Disponible en»"),
	piezas: z.number().int().describe("Las que vienen en camino o las libres en Bodega"),
	mover: z.number().int().describe("Lo que dice la cuenta del reabasto que se mueve de Bodega"),
});

export const pendientesDeBodega = definirConsulta({
	nombre: "inventario.bodega_pendientes",
	descripcion:
		"Pendientes de Bodega: las cifras, lo que toca hacer (surtir, recibir, entregar al corte, contar, aclarar, resolver) y las variantes en cero",
	entrada: z.object({
		grupo: z
			.enum(["todos", ...gruposDePendientesDeBodega])
			.optional()
			.describe("El filtro; sin él, todos"),
	}),
	salida: z.object({
		indicadores: z.object({
			existencia: z.object({
				total: z.number().int().describe("Las piezas en todas las ubicaciones, en tránsito y en camino a aduana"),
				bodega: z.number().int(),
				tiendas: z.number().int(),
				demas: z.number().int().describe("Aduana, taller, tránsito y en camino a aduana"),
			}),
			por_surtir: z.object({ total: z.number().int(), en_linea: z.number().int() }),
			en_cero: z.number().int().describe("Variante y ubicación con mínimo en cero"),
			diferencias: z.object({ piezas: z.number().int(), registros: z.number().int() }),
			ajustes: z.number().int().describe("Los ajustes que esperan a Dirección"),
		}),
		conteos: z.record(z.string(), z.number().int()).describe("Cuántos renglones tiene cada grupo y `todos`"),
		renglones: z.array(pendienteDeBodega),
		pastilla: z
			.object({ conteo: z.number().int(), rojo: z.boolean() })
			.describe("La de la pestaña: sin los «Esperando receta»; roja si algo va en rojo"),
		en_cero: z.object({
			total: z.number().int(),
			renglones: z.array(varianteEnCero).describe("Hasta 8, en el orden del panel"),
		}),
	}),
	permiso: { departamento: "bodega" },
});

/** Los filtros de Existencias. */
export const filtrosDeExistencias = ["todas", "bajo_minimo", "en_cero", "con_comprometido", "con_diferencia"] as const;

/** Las cinco ubicaciones que son columna en Existencias, en su orden. */
export const columnasDeExistencias = ["ADU", "BOD", "T1", "T2", "TAL"] as const;

/** Una celda de Existencias. */
const celdaDeExistencia = z.object({
	codigo: z.enum(columnasDeExistencias).describe("La ubicación"),
	piezas: z.number().int().describe("Puede ser negativa"),
	minimo: z.number().int().nullable().describe("El mínimo, si esa ubicación lo lleva"),
	tono: z.enum(["rojo", "ambar", "gris"]).nullable().describe("Rojo en cero con mínimo, ámbar bajo él, gris en cero"),
	en_diferencia: z.number().int().describe("Las piezas de sus diferencias abiertas ahí"),
});

/** Una variante de Existencias. */
export const varianteDeExistencias = varianteDeBodega.extend({
	celdas: z.array(celdaDeExistencia),
	transito: z.number().int(),
	en_camino: z.number().int().describe("En camino a aduana"),
	total: z.number().int(),
	comprometido: z.number().int().describe("La suma de sus reservas activas"),
	libre: z.number().int(),
});

export const existenciasDeBodega = definirConsulta({
	nombre: "inventario.existencias",
	descripcion: "Existencias por producto y variante en cada ubicación, con lo comprometido y lo libre, por páginas",
	entrada: z.object({
		texto: z.string().trim().max(60).optional().describe("Prenda y talla, o código"),
		seccion_id: z.uuid().optional(),
		escuela: z.string().optional().describe("El id de una escuela, o `basicos`"),
		filtro: z.enum(filtrosDeExistencias).optional(),
		...parametrosDePagina(200),
	}),
	salida: z.object({
		secciones: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
		escuelas: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
		resumen: z.object({ variantes: z.number().int(), piezas: z.number().int() }).describe("De todo lo filtrado"),
		...paginaDe(
			z.object({
				producto_id: z.uuid(),
				prenda: z.string(),
				escuela: z.string(),
				variantes: z.array(varianteDeExistencias),
			}),
		),
	}),
	permiso: { departamento: "bodega" },
});

/** Una tela por entregar de un lote. */
const telaPorEntregar = z.object({
	material_id: z.uuid(),
	tela: z.string(),
	papel: z.string().nullable().describe("«combinación» o «forro»; nada en la principal"),
	metros: z.string().describe("Lo que pide el corte"),
	sugeridos: z
		.object({ rollos: z.number().int(), metros: z.string(), partidas: z.array(z.string()) })
		.nullable()
		.describe("Los rollos sugeridos; nada si «No alcanza»"),
});

export const materialesDeBodega = definirConsulta({
	nombre: "inventario.materiales",
	descripcion: "Materiales de Bodega: las entregas al corte, lo que regresa del corte y lo que hay de cada tela y avío",
	entrada: z.object({}),
	salida: z.object({
		entregas: z.array(
			z.object({
				lote_id: z.uuid(),
				folio: z.string(),
				prenda: z.string(),
				piezas: z.number().int(),
				fecha_corte: z.string(),
				en_dias: z.string().describe("«en 2 días», «hoy», «hace 3 días»"),
				tono: z.enum(["rojo", "ambar"]).nullable(),
				avios: z.number().int().nullable().describe("Los avíos que todavía no se entregan"),
				telas: z.array(telaPorEntregar),
			}),
		),
		entregados: z.array(z.object({ folio: z.string(), rollos: z.number().int() })),
		regresa: z.array(
			z.object({
				rollo_id: z.uuid(),
				folio: z.string().describe("El R- o el RZ-"),
				es_retazo: z.boolean(),
				tela: z.string(),
				partida: z.string().nullable(),
				lote: z.string().nullable(),
				fecha: z.string().nullable(),
				metros: z.string(),
				version: z.number().int().describe("La del rollo, que pide «Recibir»"),
			}),
		),
		telas: z.array(
			z.object({
				material_id: z.uuid(),
				nombre: z.string(),
				color: z.string().nullable(),
				detalle: z.string().nullable(),
				en_bodega: z.string(),
				en_aduana: z.string(),
				en_taller: z.string(),
				rollos: z.number().int(),
				retazos: z.number().int(),
				rollos_taller: z.number().int(),
				partidas: z.array(z.string()),
				rollo_ids: z.array(z.uuid()).describe("Los rollos y retazos en Bodega, para sus etiquetas"),
			}),
		),
		avios: z.array(
			z.object({
				material_id: z.uuid(),
				nombre: z.string(),
				presentacion: z.string().nullable(),
				existencia: z.string(),
				unidad: z.string(),
				usos: z.array(z.string()).describe("Sus dos primeros usos"),
			}),
		),
		sin_carga: z.array(
			z.object({ material_id: z.uuid(), nombre: z.string(), es_tela: z.boolean(), unidad: z.string() }),
		),
	}),
	permiso: { departamento: "bodega" },
});

/** Los grupos de Reabasto. */
export const gruposDeReabasto = ["traspaso", "traspaso_y_fabricacion", "fabricacion", "sugerido"] as const;

/** Un renglón de Reabasto. */
export const renglonDeReabasto = varianteDeBodega.extend({
	ubicacion_id: z.uuid(),
	ubicacion: z.string(),
	libres: z.number().int(),
	minimo: z.number().int(),
	en_cero: z.boolean(),
	en_camino: z.number().int(),
	mover: z.number().int(),
	fabricar: z.number().int(),
	pedidas: z.number().int().describe("Lo ya sugerido a Producción"),
});

export const reabastoDeBodega = definirConsulta({
	nombre: "inventario.reabasto",
	descripcion: "Reabasto: lo que falta en cada ubicación con mínimo, cuánto mover de Bodega y cuánto fabricar",
	entrada: z.object({}),
	salida: z.object({
		grupos: z.array(z.object({ clave: z.enum(gruposDeReabasto), renglones: z.array(renglonDeReabasto) })),
	}),
	permiso: { departamento: "bodega" },
});

/** Una diferencia de recepción o de material por aclarar. */
export const diferenciaPorAclarar = z.object({
	diferencia_id: z.uuid(),
	folio: z.string(),
	version: z.number().int(),
	es_material: z.boolean(),
	prenda: z.string().describe("La prenda y talla, o el material"),
	descripcion: z.string(),
	a_cargo: z.string().describe("Quien responde: Aduana, Bodega, el Taller…"),
	recibio: z.string().describe("«Recibió Bodega», «Recibió Aduana»"),
	espejos: z
		.array(z.object({ diferencia_id: z.uuid(), folio: z.string(), descripcion: z.string() }))
		.describe("Con qué otra pudo cruzarse: la misma prenda y talla, las mismas piezas al revés"),
	sigue_en_negativo: z.boolean().describe("En material: si su existencia sigue en negativo"),
});

export const diferenciasDeBodega = definirConsulta({
	nombre: "inventario.diferencias",
	descripcion: "Diferencias: por contar, de recepción, de material y las resueltas por páginas",
	entrada: z.object({ ...parametrosDePagina(100) }),
	salida: z.object({
		por_contar: z.array(
			z.object({
				diferencia_id: z.uuid(),
				folio: z.string(),
				fecha: z.string(),
				piezas: z.number().int(),
				prenda: z.string(),
				talla: z.string(),
				descripcion: z.string(),
				ubicacion: z.string(),
				contada: z.boolean().describe("Si ya se contó y espera la autorización"),
			}),
		),
		de_recepcion: z.array(diferenciaPorAclarar),
		material: z.array(diferenciaPorAclarar),
		motivos_ajuste: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
		resueltas: z.object(
			paginaDe(
				z.object({
					diferencia_id: z.uuid(),
					folio: z.string(),
					prenda: z.string(),
					ubicacion: z.string(),
					como: z.string().describe("El folio del ajuste o del conteo, o la aclaración con su motivo"),
				}),
			),
		),
	}),
	permiso: { departamento: "bodega" },
});

/** Un renglón de un ajuste. */
const cambioDeAjuste = z.object({
	prenda: z.string().describe("«{prenda} · {talla}», o el material"),
	texto: z.string().describe("«Al contar: sistema 12, contado 10, diferencia −2», o su DF-"),
});

/** Un ajuste, en autorización o resuelto. */
export const ajusteDeBodega = z.object({
	ajuste_id: z.uuid(),
	autorizacion_id: z.uuid().nullable(),
	version: z.number().int().nullable().describe("La de su autorización"),
	folio: z.string(),
	fecha: z.string(),
	iniciales: z.string(),
	ubicacion: z.string(),
	cambios: z.array(cambioDeAjuste),
	motivo: z.string(),
	resultado: estadoDeBodega.nullable().describe("En los resueltos: autorizado o rechazado"),
	detalle_resultado: z.string().nullable().describe("La fecha de la autorización o la razón del rechazo"),
});

export const conteosYAjustesDeBodega = definirConsulta({
	nombre: "inventario.conteos_y_ajustes",
	descripcion: "Conteos y ajustes: los ajustes en autorización, los conteos y los ajustes resueltos, por páginas",
	entrada: z.object({
		lista: z.enum(["conteos", "resueltos"]).optional().describe("Qué lista pagina el cursor"),
		...parametrosDePagina(100),
	}),
	salida: z.object({
		en_autorizacion: z.array(ajusteDeBodega),
		puede_decidir: z.boolean().describe("Si la cuenta es la dueña: ve «Autorizar» y «Rechazar»"),
		conteos: z.object(
			paginaDe(
				z.object({
					conteo_id: z.uuid(),
					folio: z.string(),
					fecha: z.string(),
					ubicacion: z.string(),
					seccion: z.string(),
					responsable: z.string(),
					variantes: z.number().int(),
					resultado: estadoDeBodega,
				}),
			),
		),
		resueltos: z.object(paginaDe(ajusteDeBodega)),
	}),
	permiso: { departamento: "bodega" },
});

/** Una excepción de Bodega. */
export const excepcionDeBodega = z.object({
	excepcion_id: z.uuid(),
	version: z.number().int(),
	tipo: z.string(),
	detectada_en: z.string().describe("La hora y la fecha, escritas"),
	descripcion: z.string(),
	de_donde: z.string().nullable().describe("El aparato y la persona"),
	documento: z.string().nullable(),
	comando_id: z.uuid().nullable().describe("En `dispositivo_revocado`: el comando que se puede aplicar"),
	lo_que_llego: z.string().nullable().describe("Solo a la dueña: los datos tal cual"),
	resolucion: z.string().nullable(),
	resuelta_por: z.string().nullable(),
	resuelta_en: z.string().nullable(),
});

export const excepcionesDeBodega = definirConsulta({
	nombre: "inventario.excepciones",
	descripcion: "Excepciones de Bodega: las por resolver, de la más vieja, y las resueltas por páginas",
	entrada: z.object({
		estado: z.enum(["por_revisar", "resuelta"]).optional().describe("Sin él, las por resolver"),
		...parametrosDePagina(100),
	}),
	salida: z.object({
		conteos: z.object({ por_revisar: z.number().int(), resueltas: z.number().int() }),
		puede_aplicar: z.boolean().describe("Si la cuenta es la dueña"),
		...paginaDe(excepcionDeBodega),
	}),
	permiso: { departamento: "bodega" },
});
