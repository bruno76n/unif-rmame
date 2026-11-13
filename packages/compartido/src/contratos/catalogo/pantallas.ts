/**
 * Los contratos de las consultas de las pantallas de Catálogo: Pendientes, Productos, Listas de precios, Etiquetas,
 * Escuelas y tallas, Bitácora, la ficha de un producto, el alta y la vista previa del cambio en bloque.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md
 *
 * Todas son de Catálogo (el alta, también de Ventas a externos desde un pedido). Catálogo ve todos los precios y la
 * existencia total de cada variante; nunca costos. Los textos de la pantalla los arma la pantalla con estos datos.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { canales } from "./productos.ts";

/** Un monto en centavos, o vacío («Sin precio»). */
const centavosONada = z.number().int().nullable().optional();

/** Una escuela como la ven las listas. */
const escuelaCorta = z.object({ id: z.uuid(), nombre: z.string(), color: z.string() });

/** Dónde se vende un producto. */
const canalesDelProducto = z.object({
	mostrador: z.boolean(),
	en_linea: z.boolean(),
	externos: z.boolean(),
});

/** Lo que detiene a un producto, de lo más grave a lo menos. */
export const loQueDetiene = z.object({
	tipo: z.enum(["descontinuado", "sin_precio", "sin_foto", "sin_etiqueta"]),
	cuantas: z.number().int().optional().describe("Con `sin_etiqueta`: cuántas variantes"),
	lista: z.string().optional().describe("Con `sin_precio`: la lista del cliente que no tiene su precio"),
});

/** Los grupos del panel de Pendientes. */
export const gruposDePendientes = ["todos", "productos", "etiquetas"] as const;

export const pendientesDeCatalogo = definirConsulta({
	nombre: "catalogo.pendientes",
	descripcion:
		"Pendientes de Catálogo: las cifras de la barra y los modelos sin precio, las etiquetas nuevas y las que se reimprimen",
	entrada: z.object({ grupo: z.enum(gruposDePendientes).optional().describe("El grupo del panel; todos si no viene") }),
	salida: z.object({
		cifras: z.object({
			productos_activos: z.number().int(),
			modelos_sin_precio: z.number().int(),
			listas: z.number().int().describe("Las listas de precios activas"),
			siguiente_codigo: z.string().nullable().describe("El siguiente código de barras de fábrica"),
			cambios_por_semana: z
				.array(z.number().int())
				.describe("Cambios de precio de las 6 semanas, de la más vieja a esta"),
			cambios_esta_semana: z.number().int().describe("Cambios de precio desde el lunes"),
			variantes_sin_etiqueta: z.number().int(),
			productos_con_etiquetas_nuevas: z.number().int(),
		}),
		renglones: z.array(
			z.object({
				tipo: z.enum(["modelo_sin_precio", "etiquetas", "reimprimir"]),
				grupo: z.enum(["productos", "etiquetas"]),
				producto_id: z.uuid(),
				producto: z.string(),
				escuela: z.string().nullable(),
				lista: z.string().nullable().describe("Con `modelo_sin_precio`: la lista del cliente"),
				tallas: z.array(z.string()).describe("Las tallas por etiquetar, en orden"),
			}),
		),
		conteos: z.object({ todos: z.number().int(), productos: z.number().int(), etiquetas: z.number().int() }),
	}),
	permiso: { departamento: "catalogo" },
});

/** Un producto en Productos. */
const productoDeLaLista = z.object({
	id: z.uuid(),
	version: z.number().int(),
	nombre: z.string(),
	escuela: escuelaCorta.nullable(),
	categoria: z.string().describe("Básico, Especial, Accesorio o Sin descuento"),
	canales: canalesDelProducto,
	tiene_foto: z.boolean(),
	tallas: z.string().describe("El rango de tallas: «4 a 16 y CH a XG»"),
	variantes: z.number().int().describe("Sus variantes vivas"),
	por_pedido: z.number().int().describe("Cuántas son de pedido especial"),
	etiquetables: z
		.number()
		.int()
		.describe("Sus tallas vivas normales, no descontinuadas: las que lleva «Imprimir etiquetas»"),
	mostrador_centavos: centavosONada.describe("El precio base de Mostrador"),
	tiene_precio: z.boolean().describe("Si tiene precio en alguna lista"),
	descontinuado: z.boolean(),
	detiene: z.array(loQueDetiene),
});

export const productosDeCatalogo = definirConsulta({
	nombre: "catalogo.productos",
	descripcion: "Productos de Catálogo por sección, con sus filtros y sus píldoras",
	entrada: z.object({
		buscar: z.string().trim().max(80).optional().describe("Producto, escuela o código (4 cifras o más)"),
		seccion_id: z.uuid().optional(),
		escuela: z
			.union([z.literal("basico"), z.uuid()])
			.optional()
			.describe("`basico` (sin escuela) o el id de la escuela"),
		estado: z.enum(["activos", "descontinuados", "todos"]).optional().describe("Activos si no viene"),
		canal: z.enum(canales).optional(),
		pildora: z.enum(["sin_foto", "sin_etiqueta", "sin_precio_cliente"]).optional(),
		orden: z.enum(["producto", "mayoreo", "tallas", "mostrador"]).optional(),
	}),
	salida: z.object({
		secciones: z.array(z.object({ id: z.uuid(), nombre: z.string(), productos: z.array(productoDeLaLista) })),
		total: z.number().int(),
		pildoras: z.object({
			todo: z.number().int(),
			sin_foto: z.number().int(),
			sin_etiqueta: z.number().int(),
			sin_precio_cliente: z.number().int(),
		}),
		filtros: z.object({
			secciones: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
			escuelas: z.array(escuelaCorta),
		}),
	}),
	permiso: { departamento: "catalogo" },
});

/** Una lista de precios para el selector. */
const listaParaEscoger = z.object({
	id: z.uuid(),
	nombre: z.string(),
	tipo: z.enum(["mostrador", "mayoreo", "en_linea", "cliente"]),
});

export const listasDePrecios = definirConsulta({
	nombre: "catalogo.listas_precios",
	descripcion: "Una lista de precios con sus productos por sección, su referencia y desde cuándo vale cada precio",
	entrada: z.object({
		lista_id: z.uuid().optional().describe("Mostrador si no viene"),
		buscar: z.string().trim().max(80).optional(),
	}),
	salida: z.object({
		listas: z.array(listaParaEscoger).describe("Las generales y las de los clientes activos"),
		lista: z.object({
			id: z.uuid(),
			version: z.number().int(),
			tipo: z.enum(["mostrador", "mayoreo", "en_linea", "cliente"]),
			nombre: z.string(),
			descripcion: z.string().nullable(),
			cliente: z.object({ tipo: z.enum(["escuela", "mayorista", "empresa_otro"]), municipio: z.string() }).nullable(),
			pct_basicos: z.string().nullable(),
			pct_especiales: z.string().nullable(),
			modelos_sin_precio: z.number().int(),
			referencia: z.string().describe("La lista de referencia: Mostrador, o En línea si se ve Mostrador"),
		}),
		secciones: z.array(
			z.object({
				id: z.uuid(),
				nombre: z.string(),
				productos: z.array(
					z.object({
						id: z.uuid(),
						version: z.number().int(),
						nombre: z.string(),
						escuela: z.string().nullable(),
						categoria: z.string(),
						etiquetables: z.number().int().describe("Las tallas que lleva «Imprimir etiquetas»"),
						precio_centavos: centavosONada,
						referencia_centavos: centavosONada,
						diferencia_centavos: centavosONada.describe("Precio menos referencia; vacío si falta uno"),
						vigente_desde: z.string().nullable().describe("Desde cuándo vale el precio (ISO)"),
						antes_centavos: centavosONada.describe("El precio que tenía antes, si cambió"),
					}),
				),
			}),
		),
		total: z.number().int(),
	}),
	permiso: { departamento: "catalogo" },
});

export const etiquetasDeCatalogo = definirConsulta({
	nombre: "catalogo.etiquetas",
	descripcion: "Las variantes nuevas sin etiqueta por producto y, de un producto, cada variante con su código",
	entrada: z.object({
		producto_id: z
			.uuid()
			.optional()
			.describe(
				"El producto de «Por variante»; sin él, el primero con etiquetas por imprimir o el primero de la lista",
			),
	}),
	salida: z.object({
		nuevas: z.array(
			z.object({
				producto_id: z.uuid(),
				nombre: z.string(),
				escuela: z.string().nullable(),
				variantes: z.number().int(),
				foto_archivo_id: z.uuid().nullable(),
			}),
		),
		productos: z.array(z.object({ id: z.uuid(), nombre: z.string(), escuela: z.string().nullable() })),
		producto: z
			.object({
				id: z.uuid(),
				nombre: z.string(),
				escuela: z.string().nullable(),
				variantes: z.array(
					z.object({
						id: z.uuid(),
						talla: z.string(),
						codigo: z.string(),
						es_pedido_especial: z.boolean(),
						estado_etiqueta: z.enum(["por_imprimir", "impresa", "por_reimprimir", "al_fabricar"]),
						descontinuada: z.boolean(),
						precio_centavos: centavosONada.describe(
							"Con `catalogo.etiqueta_lleva_precio`: el de Mostrador (con su recargo si es de pedido especial)",
						),
					}),
				),
			})
			.nullable(),
		maximo_por_talla: z.number().int().describe("`catalogo.etiquetas_max_por_talla`"),
		lleva_precio: z.boolean().describe("`catalogo.etiqueta_lleva_precio`"),
	}),
	permiso: { departamento: "catalogo" },
});

export const escuelasYTallas = definirConsulta({
	nombre: "catalogo.escuelas_y_tallas",
	descripcion: "Las escuelas con sus modelos, los grupos de tallas, los tipos de prenda y las secciones",
	entrada: z.object({}),
	salida: z.object({
		escuelas: z.array(
			z.object({
				id: z.uuid(),
				version: z.number().int(),
				nombre: z.string(),
				municipio: z.string(),
				color: z.string(),
				cliente_externo: z.boolean(),
				modelos: z.number().int().describe("Sus productos activos"),
				baja: z.boolean(),
			}),
		),
		grupos: z.array(
			z.object({
				id: z.uuid(),
				version: z.number().int(),
				nombre: z.string(),
				productos: z.number().int().describe("Los productos que la usan"),
				tallas: z.array(z.object({ id: z.uuid(), nombre: z.string(), orden: z.number().int() })),
			}),
		),
		tipos: z.array(
			z.object({
				id: z.uuid(),
				version: z.number().int(),
				nombre: z.string(),
				seccion_id: z.uuid(),
				seccion: z.string(),
				flujo_id: z.uuid().nullable(),
				flujo: z.string().nullable(),
				medidas: z.array(
					z.object({
						medida: z.string(),
						orden: z.number().int(),
						valores: z.array(z.object({ talla_id: z.uuid(), talla: z.string(), valor_cm: z.number().nullable() })),
					}),
				),
			}),
		),
		secciones: z.array(
			z.object({ id: z.uuid(), nombre: z.string(), lleva_receta: z.boolean(), productos: z.number().int() }),
		),
		flujos: z.array(z.object({ id: z.uuid(), nombre: z.string() })).describe("Los flujos vigentes del taller"),
	}),
	permiso: { departamento: "catalogo" },
});

/** Los tipos de cambio de la bitácora de Catálogo. */
export const tiposDeCambio = [
	"precio",
	"producto_nuevo",
	"variante_baja",
	"descontinuado",
	"reactivado",
	"talla_agregada",
	"canal",
	"categoria",
] as const;

export const bitacoraDeCatalogo = definirConsulta({
	nombre: "catalogo.bitacora",
	descripcion: "Los cambios de los productos, lo más reciente arriba",
	entrada: z.object({
		buscar: z.string().trim().max(80).optional().describe("Producto, persona o código"),
		tipo_cambio: z.enum(tiposDeCambio).optional(),
		lista_id: z.uuid().optional(),
		cursor: z.string().optional(),
		limite: z.coerce.number().int().min(1).max(200).optional(),
	}),
	salida: z.object({
		renglones: z.array(
			z.object({
				id: z.uuid(),
				ocurrido_en: z.string(),
				quien: z.string(),
				tipo_cambio: z.enum(tiposDeCambio).nullable(),
				producto_id: z.uuid().nullable(),
				producto: z.string().nullable(),
				escuela: z.string().nullable(),
				detalle: z.string(),
			}),
		),
		total: z.number().int(),
		cursor: z.string().nullable(),
		hay_mas: z.boolean(),
		listas: z.array(listaParaEscoger),
	}),
	permiso: { departamento: "catalogo" },
});

export const fichaDeProducto = definirConsulta({
	nombre: "catalogo.ficha_producto",
	descripcion: "La ficha de un producto: sus canales, su categoría, su matriz de tallas, códigos y precios, su receta",
	entrada: z.object({ producto_id: z.uuid() }),
	salida: z.object({
		producto: z.object({
			id: z.uuid(),
			version: z.number().int(),
			nombre: z.string(),
			seccion: z.object({ id: z.uuid(), nombre: z.string(), lleva_receta: z.boolean() }),
			escuela: z.object({ id: z.uuid(), nombre: z.string() }).nullable(),
			es_servicio: z.boolean(),
			descontinuado: z.boolean(),
			foto_archivo_id: z.uuid().nullable(),
			canales: canalesDelProducto,
			categoria_mayoreo_id: z.uuid(),
			recargo_centavos: z.number().int().optional(),
			tipo_prenda_id: z.uuid().nullable(),
			flujo_id: z.uuid().nullable(),
		}),
		detiene: z.array(loQueDetiene),
		categorias: z.array(z.object({ id: z.uuid(), nombre: z.string(), descripcion: z.string() })),
		flujos: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
		listas: z
			.array(
				z.object({
					id: z.uuid(),
					tipo: z.enum(["mostrador", "mayoreo", "en_linea", "cliente"]),
					nombre: z.string(),
				}),
			)
			.describe("Las columnas: las tres generales y las de cliente donde tiene precio"),
		otras_listas: z
			.array(z.object({ id: z.uuid(), nombre: z.string() }))
			.describe("Las listas de cliente activas donde todavía no tiene precio"),
		precios: z.array(
			z.object({ lista_id: z.uuid(), variante_id: z.uuid().nullable(), precio_centavos: z.number().int().optional() }),
		),
		variantes: z.array(
			z.object({
				id: z.uuid(),
				talla: z.string(),
				codigo: z.string(),
				es_pedido_especial: z.boolean(),
				estado: z.enum(["activa", "descontinuada", "baja"]),
				existencia: z.number().int().nullable().describe("En toda la fábrica; vacía si nunca se ha recibido"),
				baja: z.object({ en: z.string(), por: z.string(), motivo: z.string() }).nullable(),
			}),
		),
		pocas_piezas: z.number().int().describe("`catalogo.pocas_piezas`"),
		aviso_cambio_precio_pct: z.number().describe("`catalogo.aviso_cambio_precio_pct`: los «Ojo» de la ficha"),
		agregar: z.object({
			tallas: z.array(z.object({ talla_id: z.uuid(), talla: z.string(), grupo: z.string(), tuvo_baja: z.boolean() })),
			siguiente_codigo: z.string().nullable(),
		}),
		receta: z
			.object({
				estado: z.enum(["sin_receta", "sin_verificar", "verificada"]),
				version: z.number().int().nullable(),
				tela: z.string().nullable(),
				metros: z.string().nullable().describe("De la tela principal, por prenda, en la talla de en medio"),
				talla: z.string().nullable(),
				avios: z.number().int(),
			})
			.nullable()
			.describe("Vacía en una sección que no lleva receta"),
		medidas: z.array(
			z.object({
				medida: z.string(),
				valores: z.array(z.object({ talla: z.string(), valor_cm: z.number() })),
			}),
		),
		cambios: z.array(z.object({ ocurrido_en: z.string(), quien: z.string(), descripcion: z.string() })),
		puede_patronaje: z.boolean(),
	}),
	permiso: { departamento: "catalogo" },
});

export const altaDeProducto = definirConsulta({
	nombre: "catalogo.alta_producto",
	descripcion: "Lo que necesita el alta de un producto: secciones, escuelas, tallas, listas y, si lo hay, el base",
	entrada: z.object({
		origen: z.enum(["catalogo", "pedido", "desarrollo"]),
		producto_base_id: z.uuid().optional(),
		seccion_id: z.uuid().optional(),
		cliente_id: z.uuid().optional(),
		desarrollo_id: z.uuid().optional(),
	}),
	salida: z.object({
		siguiente_codigo: z.string().nullable(),
		secciones: z.array(
			z.object({
				id: z.uuid(),
				nombre: z.string(),
				lleva_receta: z.boolean(),
				tipo_prenda_defecto_id: z.uuid().nullable(),
			}),
		),
		tipos: z.array(z.object({ id: z.uuid(), nombre: z.string(), seccion_id: z.uuid(), flujo: z.string().nullable() })),
		escuelas: z.array(escuelaCorta),
		categorias: z.array(
			z.object({
				id: z.uuid(),
				nombre: z.string(),
				descripcion: z.string(),
				defecto_para: z.enum(["con_escuela", "sin_escuela"]).nullable(),
			}),
		),
		grupos: z.array(
			z.object({ id: z.uuid(), nombre: z.string(), tallas: z.array(z.object({ id: z.uuid(), nombre: z.string() })) }),
		),
		listas: z.array(listaParaEscoger.extend({ nombre_corto: z.string().nullable() })),
		productos_base: z.array(z.object({ id: z.uuid(), nombre: z.string(), escuela: z.string().nullable() })),
		base: z
			.object({
				id: z.uuid(),
				nombre: z.string(),
				seccion_id: z.uuid(),
				escuela_id: z.uuid().nullable(),
				categoria_mayoreo_id: z.uuid(),
				canales: canalesDelProducto,
				tallas: z.array(z.object({ talla_id: z.uuid(), grupo_id: z.uuid(), es_pedido_especial: z.boolean() })),
				precios: z.array(z.object({ lista_id: z.uuid(), precio_centavos: z.number().int() })),
				receta: z.object({ version: z.number().int().nullable() }).nullable(),
				medidas: z.array(
					z.object({
						medida: z.string(),
						orden: z.number().int(),
						valores: z.array(z.object({ talla_id: z.uuid(), valor_cm: z.number().nullable() })),
					}),
				),
			})
			.nullable(),
		cliente: z.object({ id: z.uuid(), nombre: z.string(), lista_id: z.uuid().nullable() }).nullable(),
		desarrollo: z
			.object({ id: z.uuid(), folio: z.string(), prenda: z.string(), escuela_id: z.uuid().nullable() })
			.nullable(),
		puede_patronaje: z.boolean(),
	}),
	// Catálogo, con cualquier origen; Ventas a externos, solo desde un pedido: lo revisa la consulta.
	permiso: { departamento: ["catalogo", "ventas"] },
});

export const cambioEnBloquePrevio = definirConsulta({
	nombre: "catalogo.cambio_en_bloque_previo",
	descripcion: "La vista previa de «Cambiar precios en bloque», con la misma cuenta que la acción",
	entrada: z.object({
		productos: z
			.string()
			.regex(/^[0-9a-f-]{36}(,[0-9a-f-]{36})*$/i)
			.describe("Los productos escogidos, separados por coma"),
		lista_id: z.uuid().optional().describe("La primera donde alguno tiene precio si no viene"),
		direccion: z.enum(["subir", "bajar"]),
		modo: z.enum(["por_ciento", "pesos"]),
		cantidad: z.coerce.number().int().min(1).max(999),
		redondear: z.enum(["si", "no"]),
	}),
	salida: z.object({
		listas: z.array(z.object({ id: z.uuid(), nombre: z.string() })).describe("Solo donde alguno tiene precio"),
		lista: z.object({ id: z.uuid(), nombre: z.string() }).nullable(),
		renglones: z
			.array(
				z.object({
					producto: z.string(),
					escuela: z.string().nullable(),
					antes_centavos: z.number().int().optional(),
					despues_centavos: z.number().int().optional(),
				}),
			)
			.describe("Hasta 5 productos que cambian, con su precio base"),
		cambian: z.number().int().describe("Cuántos productos cambian en la lista"),
		escogidos: z.number().int(),
		sin_precio: z.number().int().describe("Cuántos no tienen precio en la lista y se dejan igual"),
		precios: z.number().int().describe("Cuántos precios cambian, base y de talla"),
		redondeo_centavos: z.number().int().optional().describe("`catalogo.bloque_redondeo_centavos`: el «Redondear a $5»"),
		error: z.object({ codigo: z.string(), mensaje: z.string() }).nullable(),
	}),
	permiso: { departamento: "catalogo" },
});
