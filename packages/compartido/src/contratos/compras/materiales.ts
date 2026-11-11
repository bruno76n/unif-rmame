/**
 * Los contratos de los materiales de Compras y de sus proveedores: el alta con su proveedor y su costo, «Cómo se
 * pide», la baja, la reactivación, y agregar, quitar o hacer habitual un proveedor.
 * Fase 10 · docs/modulos/compras/materiales.md y proveedores-y-precios.md («Acciones»)
 *
 * Los topes que dicen los parámetros (el precio máximo, lo más que cubre un pedido) los revisa la acción, con el
 * mensaje que los nombra. Las cantidades con decimales viajan como texto decimal con hasta tres decimales, para
 * que nunca pasen por un número con decimales.
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Los tipos de material. */
export const tiposDeMaterial = ["tela", "avio", "consumible"] as const;

/** Las unidades en que Patronaje puede capturar un material en sus recetas. */
export const unidadesDeReceta = ["m", "cm", "pza"] as const;

/**
 * Un decimal en texto, con hasta tres decimales.
 * @param mensaje El mensaje si no lo es.
 */
function decimal(mensaje: string) {
	return z
		.string(mensaje)
		.trim()
		.regex(/^\d{1,9}(\.\d{1,3})?$/, mensaje);
}

/** Un factor de conversión: mayor que cero. */
const factor = (mensaje: string) =>
	decimal(mensaje)
		.refine((texto) => Number(texto) > 0, mensaje)
		.describe("Cuántas de esa unidad hacen una de inventario; mayor que cero");

/** Un precio de compra: centavos por unidad de inventario, mayor que cero. El tope lo revisa la acción. */
export const precioDeCompra = (mensaje: string) =>
	z
		.number(mensaje)
		.int(mensaje)
		.positive(mensaje)
		.describe("Centavos por unidad de inventario; hasta `compras.precio_max_centavos`");

/** El mínimo que debe quedar: entero, de cero en adelante. */
const minimo = z
	.number("Escribe un número entero, puede ser 0")
	.int("Escribe un número entero, puede ser 0")
	.min(0, "Escribe un número entero, puede ser 0")
	.max(9_999_999, "Escribe un número entero, puede ser 0")
	.describe("Lo mínimo que debe quedar, en su unidad");

/** El múltiplo de compra: entero, de uno en adelante. */
const multiploCompra = z
	.number("Escribe un número entero mayor a 0")
	.int("Escribe un número entero mayor a 0")
	.min(1, "Escribe un número entero mayor a 0")
	.max(9_999_999, "Escribe un número entero mayor a 0")
	.describe("Toda cantidad de una orden es múltiplo de él");

/** Los días que cubre cada pedido: el tope es `compras.dias_cubre_maximo`. */
const diasCubre = z.number("Escribe los días").int("Escribe los días").describe("«Cada pedido cubre», en días");

/** Lo que se puede cambiar en «Cómo se pide» y en el alta. */
const comoSePide = {
	presentacion: z.string().trim().max(60).describe("«Ancho 1.50 m», «Cono de 5,000 m»: solo para la pantalla"),
	color: z
		.string("Escoge un color")
		.regex(/^#[0-9A-Fa-f]{6}$/, "Escoge un color")
		.describe("`#RRGGBB`: la muestra de color de las listas"),
	unidad_tablet: z.string().trim().min(1).max(20).describe("Cómo la nombra la tablet: «agujas», «cuartos»"),
	factor_tablet: factor("Escribe cuántas hacen una de inventario"),
	consumo_diario_inicial: decimal("Escribe el consumo por día, puede ser 0").describe(
		"El consumo por día de un mes normal mientras no se mide",
	),
};

/** El material repetido. */
const nombreRepetido = { codigo: "nombre_repetido", mensaje: "Ya existe un material con ese nombre" } as const;

/** Los errores de la conversión, que comparten el alta y «Cómo se pide». */
const erroresDeConversion = [
	{ codigo: "falta_conversion", mensaje: "Escribe cuántas trae una unidad de inventario." },
	{ codigo: "solo_consumible_en_tablet", mensaje: "Solo un consumible se toma en la tablet." },
] as const;

/** El proveedor dado de baja. */
const proveedorDadoDeBaja = { codigo: "proveedor_dado_de_baja", mensaje: "Ese proveedor está dado de baja." } as const;

/** Compras da de alta un material con su proveedor habitual y su costo. */
export const crearMaterial = definirAccion({
	nombre: "compras.crear_material",
	descripcion: "Da de alta un material sin existencia, con su proveedor habitual y el primer precio de su historial",
	entrada: z.object({
		nombre: z
			.string("Escribe el nombre del material")
			.trim()
			.min(3, "Escribe el nombre del material")
			.max(80, "Escribe el nombre del material")
			.describe("Único sin importar acentos ni mayúsculas"),
		tipo: z.enum(tiposDeMaterial, "Escoge el tipo").describe("`tela`, `avio` o `consumible`"),
		unidad: z.string("Escoge cómo se mide.").trim().min(1).describe("La clave de una unidad de «Unidades de material»"),
		presentacion: comoSePide.presentacion.optional(),
		color: comoSePide.color.optional(),
		unidad_receta: z.enum(unidadesDeReceta).optional().describe("Si Patronaje lo captura en otra unidad"),
		factor_receta: factor("Escribe cuántas trae una unidad de inventario").optional(),
		unidad_tablet: comoSePide.unidad_tablet.optional(),
		factor_tablet: comoSePide.factor_tablet.optional(),
		proveedor_id: z.uuid("Escoge el proveedor.").describe("Su proveedor habitual"),
		costo_centavos: precioDeCompra("Escribe el costo, por ejemplo 78 o 6.50"),
		minimo,
		multiplo_compra: multiploCompra,
		dias_cubre: diasCubre,
		consumo_diario_inicial: comoSePide.consumo_diario_inicial.optional(),
	}),
	salida: z.object({ material_id: z.uuid().describe("El material") }),
	permiso: { departamento: "compras" },
	errores: [
		nombreRepetido,
		{ codigo: "unidad_no_existe", mensaje: "Escoge cómo se mide." },
		{ codigo: "tela_en_metros", mensaje: "La tela se mide en metros." },
		...erroresDeConversion,
		proveedorDadoDeBaja,
	],
});

/** Compras cambia «Cómo se pide» de un material: solo lo que cambia. */
export const guardarMaterial = definirAccion({
	nombre: "compras.guardar_material",
	descripcion: "Cambia cómo se pide un material: su mínimo, su múltiplo, sus días, su consumo y su presentación",
	entrada: z.object({
		material_id: z.uuid().describe("El material"),
		minimo: minimo.optional(),
		multiplo_compra: multiploCompra.optional(),
		dias_cubre: diasCubre.optional(),
		consumo_diario_inicial: comoSePide.consumo_diario_inicial.nullable().optional(),
		presentacion: comoSePide.presentacion.nullable().optional(),
		color: comoSePide.color.nullable().optional(),
		unidad_tablet: comoSePide.unidad_tablet.nullable().optional(),
		factor_tablet: comoSePide.factor_tablet.nullable().optional(),
	}),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [...erroresDeConversion, { codigo: "sin_cambios", mensaje: "Sin cambios" }],
	edita: true,
});

/** Compras da de baja un material que nada usa. */
export const darBajaMaterial = definirAccion({
	nombre: "compras.dar_baja_material",
	descripcion: "Da de baja un material sin existencia: sale de Por pedir, de las recetas nuevas y de la tablet",
	entrada: z.object({
		material_id: z.uuid().describe("El material"),
		motivo: z.string().trim().max(200).describe("Por qué, al menos `general.largo_minimo_motivo` letras"),
	}),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [
		{ codigo: "material_dado_de_baja", mensaje: "Ya está dado de baja." },
		{ codigo: "material_con_existencia", mensaje: "Todavía hay de ese material en el inventario." },
	],
	edita: true,
});

/** Compras reactiva un material dado de baja, si su proveedor habitual sigue activo. */
export const reactivarMaterial = definirAccion({
	nombre: "compras.reactivar_material",
	descripcion: "Reactiva un material dado de baja, si su proveedor habitual sigue activo",
	entrada: z.object({ material_id: z.uuid().describe("El material") }),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [
		{ codigo: "material_activo", mensaje: "Ya está activo." },
		{ codigo: "habitual_dado_de_baja", mensaje: "Su proveedor habitual está dado de baja." },
	],
	edita: true,
});

/** El material y el proveedor de los tres cambios de proveedor. */
const materialYProveedor = {
	material_id: z.uuid().describe("El material"),
	proveedor_id: z.uuid("Escoge el proveedor.").describe("El proveedor"),
};

/** Compras agrega un proveedor que surte un material, con su precio. */
export const agregarProveedorMaterial = definirAccion({
	nombre: "compras.agregar_proveedor_material",
	descripcion: "Agrega un proveedor que surte un material, con su precio; sube la versión del material",
	entrada: z.object({ ...materialYProveedor, precio_centavos: precioDeCompra("Escribe el precio.") }),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [{ codigo: "ya_lo_surte", mensaje: "Ese proveedor ya surte el material." }, proveedorDadoDeBaja],
	edita: true,
});

/** Compras quita un proveedor que ya no surte un material. */
export const quitarProveedorMaterial = definirAccion({
	nombre: "compras.quitar_proveedor_material",
	descripcion: "Un proveedor deja de surtir un material; su historial de precios se queda",
	entrada: z.object({
		...materialYProveedor,
		motivo: z.string().trim().max(200).describe("Por qué, al menos `general.largo_minimo_motivo` letras"),
	}),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [
		{ codigo: "proveedor_habitual", mensaje: "Es el habitual: haz habitual a otro antes de quitarlo." },
		{ codigo: "no_lo_surte", mensaje: "Ese proveedor no surte el material." },
	],
	edita: true,
});

/** Compras hace habitual a otro proveedor de un material. */
export const hacerHabitual = definirAccion({
	nombre: "compras.hacer_habitual",
	descripcion: "Hace habitual a un proveedor que ya surte el material; Por pedir usa desde ahora su plazo",
	entrada: z.object(materialYProveedor),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [
		{ codigo: "no_lo_surte", mensaje: "Ese proveedor no surte el material: agrégalo primero." },
		{ codigo: "ya_es_habitual", mensaje: "Ya es el habitual." },
		proveedorDadoDeBaja,
	],
	edita: true,
});
