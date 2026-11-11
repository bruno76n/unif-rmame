/**
 * Los contratos de los productos y las tallas de un producto.
 * Fase 8 · docs/modulos/catalogo/productos.md y tallas-y-tipos-de-prenda.md («Acciones»)
 *
 * Los precios van en centavos y son pesos enteros; su tope (`catalogo.precio_max_centavos`) lo revisa la
 * acción, porque lo decide la dueña.
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/**
 * Un precio de lista: pesos enteros, en centavos. El tope (`catalogo.precio_max_centavos`) lo revisa la acción,
 * con el mensaje que lo nombra.
 */
export const precioDeLista = z
	.number("Un precio entero, de $1 en adelante.")
	.int("Un precio entero, de $1 en adelante.")
	.positive("Un precio entero, de $1 en adelante.")
	.refine((centavos) => centavos % 100 === 0, "Un precio entero, de $1 en adelante.")
	.describe("Pesos enteros, en centavos");

/** El recargo de pedido especial: pesos enteros, en centavos, de cero en adelante. */
export const recargoDePedidoEspecial = z
	.number()
	.int("El recargo va en pesos enteros.")
	.nonnegative("El recargo va en pesos enteros.")
	.refine((centavos) => centavos % 100 === 0, "El recargo va en pesos enteros.")
	.describe("Se suma al precio base en las tallas de pedido especial");

/** Dónde se vende un producto. */
export const canales = ["mostrador", "en_linea", "externos"] as const;

/** La talla de un producto, con su motivo. */
const conMotivo = {
	variante_id: z.uuid().describe("La talla del producto"),
	motivo: z.string().trim().max(200).describe("Por qué, al menos `general.largo_minimo_motivo` letras"),
};

/** Una talla del producto que regresa el alta. */
const varianteNueva = z.object({
	variante_id: z.uuid(),
	talla_id: z.uuid(),
	talla: z.string().describe("El nombre de la talla"),
	codigo: z.string().describe("Su código de barras"),
});

/** Catálogo da de alta un producto: desde cero, a partir de otro o desde un pedido de Ventas. */
export const crearProducto = definirAccion({
	nombre: "catalogo.crear_producto",
	descripcion: "Da de alta un producto con sus tallas, sus códigos seguidos y sus precios base",
	entrada: z.object({
		modo: z.enum(["desde_cero", "a_partir_de"]).describe("Desde cero o a partir de otro producto"),
		origen: z.enum(["catalogo", "pedido", "desarrollo"]).describe("De qué pantalla viene"),
		producto_base_id: z.uuid("Escoge el producto base.").optional().describe("Con `a_partir_de`"),
		cliente_id: z.uuid().optional().describe("Con `origen = pedido`: da la lista del cliente"),
		desarrollo_id: z.uuid().optional().describe("Con `origen = desarrollo`: el desarrollo en ficha técnica"),
		nombre: z
			.string("Escribe el nombre de la prenda.")
			.trim()
			.min(4, "Escribe el nombre de la prenda.")
			.max(80, "Escribe el nombre de la prenda.")
			.describe("El nombre de la prenda"),
		seccion_id: z.uuid("Escoge la sección.").describe("Su sección"),
		escuela_id: z.uuid().nullable().describe("Su escuela; vacío: «Ninguna escuela: básico o general»"),
		tipo_prenda_id: z.uuid().optional().describe("Si falta: el del base; si no, el de la sección"),
		flujo_id: z
			.uuid()
			.optional()
			.describe("Su flujo del taller. Si falta: el del base; si no, el de su tipo de prenda. Vacío en servicios"),
		categoria_mayoreo_id: z.uuid().describe("Su categoría de mayoreo"),
		es_servicio: z.boolean().optional().describe("Un servicio de mostrador"),
		tallas: z
			.array(z.object({ talla_id: z.uuid(), es_pedido_especial: z.boolean() }), "Marca al menos un grupo de tallas.")
			.min(1, "Marca al menos un grupo de tallas.")
			.describe("Sus tallas"),
		canales: z
			.array(z.enum(canales), "Marca al menos un lugar donde se vende.")
			.min(1, "Marca al menos un lugar donde se vende.")
			.describe("Dónde se vende"),
		precios: z
			.array(z.object({ lista_id: z.uuid(), precio_centavos: precioDeLista }))
			.describe("El precio base de cada lista"),
		medidas: z
			.array(
				z.object({
					medida: z.string().trim().min(3),
					orden: z.number().int().nonnegative(),
					valores: z.array(
						z.object({
							talla_id: z.uuid(),
							valor_cm: z.number().positive("Las medidas van en centímetros, mayores que cero.").nullable(),
						}),
					),
				}),
			)
			.optional()
			.describe("Solo a partir de otro: van a la receta (fase 10)"),
		recargo_pedido_especial_centavos: recargoDePedidoEspecial.optional(),
	}),
	salida: z.object({
		producto_id: z.uuid().describe("El producto"),
		variantes: z.array(varianteNueva).describe("Sus tallas con su código"),
		codigo_desde: z.string().describe("El primer código"),
		codigo_hasta: z.string().describe("El último código"),
		receta_id: z.uuid().nullable().describe("Su receta, si su sección lleva receta"),
		receta_estado: z
			.enum(["sin_receta", "sin_verificar", "verificada"])
			.nullable()
			.describe("El estado de su receta: «Crear y seguir con la receta» abre Patronaje"),
	}),
	// Catálogo, con cualquier origen; Ventas a externos, solo desde un pedido: lo revisa la acción (decisión 440).
	permiso: {},
	errores: [
		{ codigo: "nombre_repetido", mensaje: "Ya existe una prenda con ese nombre para ese modelo." },
		{ codigo: "escuela_dada_de_baja", mensaje: "Su escuela está dada de baja: reactívala antes." },
		{ codigo: "falta_precio_mostrador", mensaje: "Falta el precio de mostrador." },
		{ codigo: "falta_precio_en_linea", mensaje: "Falta el precio de la tienda en línea." },
		{ codigo: "falta_precio_cliente", mensaje: "Falta el precio del cliente." },
		{ codigo: "en_linea_solo_sin_escuela", mensaje: "Solo productos de «Ninguna escuela» se venden en línea." },
		{ codigo: "servicio_en_linea", mensaje: "Los servicios de mostrador no se venden en línea" },
		{ codigo: "externos_obligatorio", mensaje: "Desde un pedido, el producto se vende a externos." },
		{ codigo: "falta_tipo_prenda", mensaje: "Escoge el tipo de prenda." },
		{
			codigo: "especial_desde_cero",
			mensaje: "Desde cero no hay tallas de pedido especial: se agregan después en la ficha.",
		},
		{ codigo: "talla_no_disponible", mensaje: "Esa talla ya no está en su grupo." },
		{ codigo: "base_no_disponible", mensaje: "Ese producto ya no está activo: escoge otro producto base." },
		{ codigo: "sin_codigos", mensaje: "No quedan códigos de barras de fábrica. Avisa a soporte." },
		{
			codigo: "desarrollo_no_disponible",
			mensaje: "Ese desarrollo ya no está en Ficha técnica: revisa el desarrollo.",
		},
	],
});

/** Catálogo le agrega una talla a un producto: normal o de pedido especial. */
export const agregarTalla = definirAccion({
	nombre: "catalogo.agregar_talla",
	descripcion: "Agrega una talla a un producto con el siguiente código de barras",
	entrada: z.object({
		producto_id: z.uuid().describe("El producto"),
		talla_id: z.uuid().describe("La talla"),
		es_pedido_especial: z.boolean().describe("Si es de pedido especial"),
	}),
	salida: z.object({ variante_id: z.uuid(), codigo: z.string() }),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "talla_ya_existe", mensaje: "El producto ya tiene esa talla." },
		{ codigo: "talla_de_otro_grupo", mensaje: "Esa talla no es de los grupos de tallas del producto." },
		{ codigo: "producto_descontinuado", mensaje: "El producto está descontinuado: reactívalo para cambiarlo." },
		{ codigo: "sin_codigos", mensaje: "No quedan códigos de barras de fábrica. Avisa a soporte." },
	],
	edita: true,
});

/** Catálogo deja de fabricar una talla: se vende hasta acabarla. */
export const descontinuarTalla = definirAccion({
	nombre: "catalogo.descontinuar_talla",
	descripcion: "Deja de fabricar y etiquetar una talla; se vende hasta acabarla",
	entrada: z.object(conMotivo),
	salida: z.object({}),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "talla_ya_descontinuada", mensaje: "Esa talla ya está descontinuada." },
		{ codigo: "talla_dada_de_baja", mensaje: "Esa talla ya está dada de baja." },
	],
	edita: true,
});

/** Catálogo vuelve a fabricar una talla descontinuada. */
export const reactivarTalla = definirAccion({
	nombre: "catalogo.reactivar_talla",
	descripcion: "Vuelve a fabricar una talla descontinuada",
	entrada: z.object({ variante_id: z.uuid().describe("La talla del producto") }),
	salida: z.object({}),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "talla_no_descontinuada", mensaje: "Esa talla no está descontinuada." },
		{ codigo: "talla_dada_de_baja", mensaje: "Esa talla está dada de baja: agrégala otra vez y lleva código nuevo." },
	],
	edita: true,
});

/** Catálogo da de baja una talla que nada retiene: su código no se vuelve a usar. */
export const darBajaTalla = definirAccion({
	nombre: "catalogo.dar_baja_talla",
	descripcion: "Da de baja una talla que nada retiene; su código queda retirado para siempre",
	entrada: z.object(conMotivo),
	salida: z.object({}),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "talla_dada_de_baja", mensaje: "Esa talla ya está dada de baja." },
		{ codigo: "talla_con_existencia", mensaje: "Todavía hay piezas de esa talla: descontinúala." },
		{ codigo: "talla_con_reservas", mensaje: "Esa talla tiene piezas apartadas." },
		{ codigo: "talla_con_lotes", mensaje: "La talla {t} está en lotes sin terminar: {lotes}." },
	],
	edita: true,
});

/** Catálogo guarda la foto de referencia de un producto, en el momento. */
export const subirFotoProducto = definirAccion({
	nombre: "catalogo.subir_foto_producto",
	descripcion: "Guarda la foto de referencia de un producto; la anterior queda como historial",
	entrada: z.object({
		producto_id: z.uuid().describe("El producto"),
		archivo_id: z.uuid().describe("El archivo que dio la subida, con el propósito `foto`"),
	}),
	salida: z.object({}),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "foto_formato", mensaje: "La foto debe ser JPG, PNG o WebP." },
		{ codigo: "foto_pesada", mensaje: "La foto pesa demasiado. Súbela más ligera." },
	],
	edita: true,
});

/** Catálogo descontinúa uno o varios productos, con motivo. */
export const descontinuarProductos = definirAccion({
	nombre: "catalogo.descontinuar_productos",
	descripcion: "Descontinúa uno o varios productos; conservan sus códigos, precios, historial y canales",
	entrada: z.object({
		productos: z
			.array(z.object({ producto_id: z.uuid(), version: z.number().int().nonnegative() }))
			.min(1)
			.describe("Los productos, con la versión que se leyó de cada uno"),
		motivo: z.string().trim().max(200).describe("Por qué, al menos `general.largo_minimo_motivo` letras"),
	}),
	salida: z.object({ descontinuados: z.number().int().describe("Cuántos") }),
	permiso: { departamento: "catalogo" },
	errores: [{ codigo: "ya_descontinuados", mensaje: "Esos productos ya están descontinuados" }],
});

/** Catálogo vuelve a vender un producto descontinuado. */
export const reactivarProducto = definirAccion({
	nombre: "catalogo.reactivar_producto",
	descripcion: "Vuelve a vender un producto descontinuado, con los canales que tenía",
	entrada: z.object({ producto_id: z.uuid().describe("El producto") }),
	salida: z.object({}),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "producto_activo", mensaje: "Ya está activo." },
		{ codigo: "escuela_dada_de_baja", mensaje: "Su escuela está dada de baja: reactívala antes." },
	],
	edita: true,
});
