/**
 * Compras y Patronaje de la muestra: sus siete proveedores, sus 24 materiales, las recetas de sus prendas, sus
 * cinco desarrollos y sus órdenes de compra abiertas.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md («Cómo se construye») y la muestra
 * (`docs/interfaz/muestra/sistema-alameda.html`: `CP_PROVS`, `CP_MATS`, `CP_ORD`, `PA_SPEC` y `DES`)
 *
 * Se carga con las mismas acciones del sistema, como Rosa Méndez (Compras y Patronaje), en una sesión que se
 * cierra al terminar. Lo que el sistema todavía no puede hacer se ajusta (decisión 553):
 * - las recetas entran en su versión vigente, sin verificar: la verificación llega con el corte (fase 12);
 * - las órdenes se levantan con su acción y se marcan enviadas directo, porque enviar guarda su PDF con la hoja de
 *   la fase 20; las que la muestra tiene recibidas (y la recibida en parte) entran enviadas, y sus recepciones las
 *   carga Aduana y Bodega (fase 11); las cerradas se cierran con sus pagos (fase 17);
 * - el desarrollo que ya está en catálogo se liga con la interna que llama el alta del producto, porque su
 *   producto ya lo dio de alta el catálogo de la muestra.
 * Si los proveedores ya están, no hace nada.
 */

import { join } from "node:path";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { escuelas, gruposTalla, productos, tallas, variantes } from "../src/modulos/catalogo/tablas.ts";
import { ordenesCompra, proveedores } from "../src/modulos/compras/tablas.ts";
import { terceros } from "../src/modulos/contaduria/tablas.ts";
import { desarrollos, recetas } from "../src/modulos/patronaje/tablas.ts";
import type { CuentaQueLlama } from "../src/nucleo/acceso/quien.ts";
import { crearContexto, escribirBitacoraConAdmin, guardarEventosConAdmin } from "../src/nucleo/acciones/corredor.ts";
import type { Base } from "../src/nucleo/base/conexion.ts";
import { enTransaccion } from "../src/nucleo/base/transacciones.ts";
import { cargarModulos, type RegistroDeModulos } from "../src/nucleo/modulos.ts";
import { escuelasDeLaMuestra, productosDeLaMuestra } from "./catalogo.ts";
import { enSesionDeCarga, type Hacer, idDe } from "./correr.ts";

/** Rosa Méndez (`cuentas.ts`), con Compras y Patronaje, en la sesión de esta carga. */
const rosa: CuentaQueLlama = {
	tipo: "cuenta",
	usuarioId: "01936f2e-0000-7000-8000-000000000006",
	sesionId: "01936f2e-0000-7000-8000-0000000000f2",
	esDuena: false,
	esSoporte: false,
	departamentos: ["compras", "patronaje"],
	permisosFinos: [],
	confirmadoConGoogleEn: undefined,
};

/** Un proveedor de la muestra: nombre, ciudad, teléfono, días de crédito (0 es contado), lo que dice que tarda y qué surte. */
type ProveedorDeLaMuestra = [string, string, string, number, number, string];

// biome-ignore format: una tabla se lee mejor con un proveedor por renglón
const proveedoresDeLaMuestra: Record<string, ProveedorDeLaMuestra> = {
	p1: ["Textiles Aurora", "León, Gto.", "477 555 0142", 30, 12, "Gabardinas y popelinas lisas"],
	p2: ["Telas Jalisco", "Guadalajara, Jal.", "33 5550 0178", 15, 8, "Cuadros y rayados escolares"],
	p3: ["Textiles San Marcos", "Puebla, Pue.", "222 555 0116", 30, 10, "Piqué, jersey y felpa"],
	p4: ["Mercería La Central", "Ciudad de México", "55 5550 0163", 0, 5, "Botones, resorte y etiquetas"],
	p5: ["Cierres Aguilar", "Guadalajara, Jal.", "33 5550 0121", 15, 4, "Cierres de todos los largos"],
	p6: ["Hilos del Centro", "Querétaro, Qro.", "442 555 0189", 30, 6, "Hilo poliéster en cono"],
	p7: ["Refacciones Ochoa", "Guadalajara, Jal.", "33 5550 0105", 0, 3, "Agujas, aceite y bandas"],
};

/** Un material de la muestra, como lo escribe ella. */
interface MaterialDeLaMuestra {
	nombre: string;
	tipo: "tela" | "avio" | "consumible";
	unidad: string;
	presentacion: string;
	proveedor: string;
	/** En pesos, con centavos. */
	costo: number;
	minimo: number;
	multiplo: number;
	dias: number;
	consumo: string;
	color: string;
	/** La unidad en que lo captura Patronaje y cuántas trae una de inventario. */
	receta?: ["cm" | "m", string];
	/** Un consumible: cómo lo nombra la tablet y cuántas hacen una de inventario. */
	tablet?: [string, string];
}

/** Arma un material en el orden en que lo escribe la muestra. */
function m(
	nombre: string,
	tipo: MaterialDeLaMuestra["tipo"],
	unidad: string,
	presentacion: string,
	proveedor: string,
	costo: number,
	[minimo, multiplo, dias]: [number, number, number],
	consumo: string,
	color: string,
	receta?: MaterialDeLaMuestra["receta"],
	tablet?: MaterialDeLaMuestra["tablet"],
): MaterialDeLaMuestra {
	const material = { nombre, tipo, unidad, presentacion, proveedor, costo, minimo, multiplo, dias, consumo, color };
	return { ...material, ...(receta === undefined ? {} : { receta }), ...(tablet === undefined ? {} : { tablet }) };
}

// biome-ignore format: una tabla se lee mejor con un material por renglón
const materialesDeLaMuestra: Record<string, MaterialDeLaMuestra> = {
	m01: m("Gabardina azul marino", "tela", "m", "Ancho 1.50 m", "p1", 78, [150, 50, 60], "34", "#27315F"),
	m02: m("Gabardina gris oxford", "tela", "m", "Ancho 1.50 m", "p1", 82, [120, 50, 60], "18", "#6B7280"),
	m03: m("Popelina blanca", "tela", "m", "Ancho 1.50 m", "p1", 54, [150, 50, 60], "26", "#E5E7EB"),
	m04: m("Piqué blanco", "tela", "m", "Ancho 1.60 m", "p3", 96, [200, 50, 60], "30", "#F3F4F6"),
	m05: m("Jersey azul rey", "tela", "m", "Ancho 1.50 m", "p3", 72, [80, 50, 60], "12", "#1D4ED8"),
	m06: m("Cuadros vino, Colegio Morelos", "tela", "m", "Ancho 1.50 m · exclusiva", "p2", 88, [100, 50, 60], "16", "#8A2C3B"),
	m07: m("Felpa marino", "tela", "m", "Ancho 1.60 m", "p3", 64, [150, 50, 60], "20", "#1F2A44"),
	m08: m("Cuadros rosa, Jardín Gabriela Mistral", "tela", "m", "Ancho 1.50 m · exclusiva", "p2", 79, [40, 25, 60], "4", "#D9779C"),
	m09: m("Cierre 14 cm negro", "avio", "pza", "Por pieza", "p5", 6.5, [400, 100, 60], "38", "#15161B"),
	m10: m("Cierre 18 cm marino", "avio", "pza", "Por pieza", "p5", 9.8, [100, 100, 60], "6", "#27315F"),
	m11: m("Resorte 3 cm blanco", "avio", "m", "Rollo de 100 m", "p4", 4.2, [200, 100, 60], "40", "#F3F4F6", ["cm", "100"]),
	m12: m("Botón 4 hoyos blanco", "avio", "pza", "Bolsa de 500", "p4", 0.38, [1500, 500, 60], "220", "#E5E7EB"),
	m13: m("Hilo poliéster blanco", "avio", "conos", "Cono de 5,000 m", "p6", 118, [30, 12, 60], "1.1", "#F9FAFB", ["m", "5000"]),
	m14: m("Hilo poliéster marino", "avio", "conos", "Cono de 5,000 m", "p6", 118, [10, 12, 60], "0.7", "#27315F", ["m", "5000"]),
	m15: m("Etiqueta tejida de talla", "avio", "pza", "Rollo de 1,000", "p4", 0.85, [2000, 1000, 60], "160", "#9CA3AF"),
	m16: m("Agujas 14/90", "consumible", "cajas", "Caja de 100", "p7", 260, [4, 2, 45], "0.35", "#9CA3AF", undefined, ["agujas", "100"]),
	m17: m("Aceite para máquina", "consumible", "l", "Garrafa de 5 L", "p7", 185, [3, 5, 45], "0.5", "#D4A73B", undefined, ["cuartos de litro", "4"]),
	m18: m("Banda de transmisión", "consumible", "pza", "Por pieza", "p7", 95, [2, 2, 90], "0.05", "#6B7280", undefined, ["bandas", "1"]),
	m19: m("Tejido de punto vino", "tela", "m", "Ancho 1.60 m", "p3", 92, [80, 50, 60], "6", "#7A1F33"),
	m20: m("Tejido de punto verde", "tela", "m", "Ancho 1.60 m · exclusiva", "p3", 95, [60, 50, 60], "3", "#1F6B45"),
	m21: m("Tejido de punto azul", "tela", "m", "Ancho 1.60 m", "p3", 90, [60, 50, 60], "3", "#2D4E9B"),
	m22: m("Jersey blanco", "tela", "m", "Ancho 1.80 m", "p3", 58, [100, 50, 60], "8", "#F4F5F7"),
	m23: m("Jersey vino", "tela", "m", "Ancho 1.80 m", "p3", 62, [60, 50, 60], "3", "#8A2C3B"),
	m24: m("Felpa azul cielo", "tela", "m", "Ancho 1.60 m", "p3", 66, [40, 50, 60], "2", "#7FB3E0"),
};

/**
 * La receta de una prenda en la muestra: la tela con lo que se midió en la talla de en medio y lo que aumenta por
 * talla; los avíos fijos (por prenda) o por talla (en la talla de en medio y lo que aumenta), en la unidad de
 * inventario; y el desperdicio con que se midió la tela.
 */
interface RecetaDeLaMuestra {
	tela: [string, number, number];
	avios: ([string, "fijo", number] | [string, "talla", number, number])[];
	desperdicio?: number;
}

// biome-ignore format: una tabla se lee mejor con una receta por renglón
const recetasDeLaMuestra: Record<string, RecetaDeLaMuestra> = {
	P01: { tela: ["m04", 0.92, 0.035], avios: [["m12", "fijo", 3], ["m15", "fijo", 1], ["m13", "fijo", 0.004]], desperdicio: 0.06 },
	P02: { tela: ["m04", 0.93, 0.035], avios: [["m12", "fijo", 3], ["m15", "fijo", 1], ["m13", "fijo", 0.004]], desperdicio: 0.07 },
	P03: { tela: ["m04", 0.93, 0.035], avios: [["m12", "fijo", 3], ["m15", "fijo", 1], ["m13", "fijo", 0.004]], desperdicio: 0.06 },
	P05: { tela: ["m22", 0.78, 0.03], avios: [["m15", "fijo", 1], ["m13", "fijo", 0.004]] },
	P07: { tela: ["m03", 1.38, 0.05], avios: [["m12", "fijo", 7], ["m15", "fijo", 1], ["m13", "fijo", 0.005]], desperdicio: 0.05 },
	P08: { tela: ["m03", 1.4, 0.05], avios: [["m12", "fijo", 7], ["m15", "fijo", 1], ["m13", "fijo", 0.005]], desperdicio: 0.06 },
	P09: { tela: ["m03", 1.12, 0.045], avios: [["m12", "fijo", 6], ["m15", "fijo", 1], ["m13", "fijo", 0.004]], desperdicio: 0.05 },
	P11: { tela: ["m19", 0.88, 0.035], avios: [["m15", "fijo", 1]], desperdicio: 0.07 },
	P12: { tela: ["m19", 0.62, 0.03], avios: [["m15", "fijo", 1]], desperdicio: 0.08 },
	P13: { tela: ["m20", 0.9, 0.035], avios: [["m15", "fijo", 1]] },
	P15: { tela: ["m21", 0.86, 0.035], avios: [["m15", "fijo", 1]], desperdicio: 0.06 },
	P16: { tela: ["m02", 0.6, 0.03], avios: [["m12", "fijo", 4], ["m15", "fijo", 1]], desperdicio: 0.05 },
	P17: { tela: ["m07", 1.3, 0.05], avios: [["m15", "fijo", 1], ["m14", "fijo", 0.003]], desperdicio: 0.09 },
	P18: { tela: ["m07", 1.08, 0.05], avios: [["m11", "talla", 0.55, 0.03], ["m15", "fijo", 1], ["m14", "fijo", 0.003]], desperdicio: 0.07 },
	P19: { tela: ["m05", 1.6, 0.06], avios: [["m11", "talla", 0.55, 0.03], ["m10", "fijo", 1], ["m15", "fijo", 1]], desperdicio: 0.13 },
	P20: { tela: ["m24", 0.82, 0.05], avios: [["m11", "talla", 0.55, 0.03], ["m15", "fijo", 1]], desperdicio: 0.06 },
	P22: { tela: ["m23", 0.48, 0.03], avios: [["m11", "talla", 0.56, 0.03], ["m15", "fijo", 1]] },
	P23: { tela: ["m06", 1.35, 0.06], avios: [["m09", "fijo", 1], ["m12", "fijo", 2], ["m15", "fijo", 1]], desperdicio: 0.14 },
	P24: { tela: ["m01", 1.05, 0.05], avios: [["m09", "fijo", 1], ["m15", "fijo", 1]], desperdicio: 0.08 },
	P25: { tela: ["m08", 1.1, 0.05], avios: [["m15", "fijo", 1]], desperdicio: 0.11 },
	P26: { tela: ["m01", 1.3, 0.06], avios: [["m09", "fijo", 1], ["m12", "fijo", 2], ["m15", "fijo", 1]], desperdicio: 0.07 },
	P27: { tela: ["m02", 1.05, 0.04], avios: [["m09", "fijo", 1], ["m12", "fijo", 1], ["m15", "fijo", 1]], desperdicio: 0.12 },
	P28: { tela: ["m01", 1.12, 0.04], avios: [["m09", "fijo", 1], ["m12", "fijo", 1], ["m15", "fijo", 1], ["m14", "fijo", 0.003]], desperdicio: 0.06 },
};

/** Un desarrollo de la muestra: escuela, prenda, tela, tallas, qué pidieron, hasta dónde llegó y, si ya, su producto. */
interface DesarrolloDeLaMuestra {
	escuela: string;
	prenda: string;
	tela: string;
	tallas: string;
	descripcion: string;
	etapa: "solicitud" | "muestra" | "aprobacion" | "ficha_tecnica" | "en_catalogo";
	muestraTalla?: string;
	producto?: string;
}

/** Los desarrollos, del más viejo al más nuevo. */
const desarrollosDeLaMuestra: readonly DesarrolloDeLaMuestra[] = [
	{
		escuela: "st",
		prenda: "Playera polo blanca con escudo",
		tela: "m04",
		tallas: "8 a 16 y CH a XG",
		descripcion: "Polo de piqué con el escudo de la secundaria.",
		etapa: "en_catalogo",
		producto: "P04",
	},
	{
		escuela: "st",
		prenda: "Suéter verde con escudo",
		tela: "m20",
		tallas: "8 a 16 y CH a G",
		descripcion: "Suéter cuello V, verde institucional, escudo bordado.",
		etapa: "ficha_tecnica",
	},
	{
		escuela: "st",
		prenda: "Bata blanca de laboratorio con escudo",
		tela: "m03",
		tallas: "CH a XG",
		descripcion: "Bata de manga larga con 3 bolsas y escudo de la secundaria en el pecho.",
		etapa: "muestra",
		muestraTalla: "M",
	},
	{
		escuela: "gm",
		prenda: "Chamarra azul cielo con escudo",
		tela: "m24",
		tallas: "3 a 8",
		descripcion: "Chamarra con cierre de 18 cm y escudo bordado al frente, juego con el pants azul cielo.",
		etapa: "aprobacion",
		muestraTalla: "6",
	},
	{
		escuela: "al",
		prenda: "Falda short gris con escudo",
		tela: "m02",
		tallas: "6 a 14",
		descripcion: "Quieren una falda short para educación física, mismo gris que el chaleco.",
		etapa: "solicitud",
	},
];

/** Una orden de la muestra: proveedor, si ya se envió (envío y llegada prometida) y sus líneas. */
interface OrdenDeLaMuestra {
	proveedor: string;
	envio: { enviada: string; prometida: string } | null;
	lineas: [string, number, number][];
}

/** Una orden de la muestra que ya llegó: proveedor, envío, día en que Aduana la recibió y sus líneas. */
export interface OrdenRecibidaDeLaMuestra {
	proveedor: string;
	enviada: string;
	prometida: string;
	recibida: string;
	lineas: [string, number, number][];
}

/**
 * Las órdenes de la muestra que ya llegaron (OC-0218 a OC-0223), del envío más viejo al más nuevo, con el día en que
 * Aduana las recibió: aquí se levantan y se marcan enviadas; las recibe la carga de Aduana y Bodega (fase 11).
 */
export const recibidasDeLaMuestra: readonly OrdenRecibidaDeLaMuestra[] = [
	{
		proveedor: "p5",
		enviada: "2026-09-02",
		prometida: "2026-09-07",
		recibida: "2026-09-07",
		lineas: [["m10", 500, 9.8]],
	},
	{
		proveedor: "p1",
		enviada: "2026-09-10",
		prometida: "2026-09-22",
		recibida: "2026-09-28",
		lineas: [["m01", 500, 78]],
	},
	{
		proveedor: "p3",
		enviada: "2026-09-12",
		prometida: "2026-09-24",
		recibida: "2026-10-02",
		lineas: [["m04", 400, 96]],
	},
	{
		proveedor: "p6",
		enviada: "2026-09-14",
		prometida: "2026-09-21",
		recibida: "2026-09-29",
		lineas: [["m13", 24, 118]],
	},
	{
		proveedor: "p3",
		enviada: "2026-09-22",
		prometida: "2026-10-02",
		recibida: "2026-10-04",
		lineas: [["m07", 600, 68]],
	},
];

/** El nombre de un proveedor de la muestra por su clave. */
export const nombreDeProveedor = (clave: string) => proveedoresDeLaMuestra[clave]?.[0] ?? clave;

/** El nombre de un material de la muestra por su clave. */
export const nombreDeMaterial = (clave: string) => materialesDeLaMuestra[clave]?.nombre ?? clave;

/** Las órdenes abiertas de la muestra (OC-0224 a OC-0229), en su orden. Precio en pesos. */
const ordenesDeLaMuestra: readonly OrdenDeLaMuestra[] = [
	{
		proveedor: "p1",
		envio: { enviada: "2026-09-25", prometida: "2026-10-06" },
		lineas: [
			["m03", 400, 54],
			["m02", 300, 82],
		],
	},
	{
		proveedor: "p7",
		envio: { enviada: "2026-10-08", prometida: "2026-10-12" },
		lineas: [
			["m16", 10, 260],
			["m18", 6, 95],
		],
	},
	{ proveedor: "p2", envio: { enviada: "2026-09-21", prometida: "2026-10-20" }, lineas: [["m06", 600, 88]] },
	{ proveedor: "p3", envio: { enviada: "2026-10-01", prometida: "2026-10-15" }, lineas: [["m05", 300, 72]] },
	{
		proveedor: "p4",
		envio: { enviada: "2026-10-06", prometida: "2026-10-13" },
		lineas: [
			["m11", 600, 4.2],
			["m15", 3000, 0.85],
		],
	},
	{ proveedor: "p5", envio: null, lineas: [["m09", 1000, 6.5]] },
];

/** Pesos con centavos a centavos. */
const aCentavos = (pesos: number) => Math.round(pesos * 100);

/** Un decimal de la receta, a dos decimales, como lo escribe Patronaje. */
const aTexto = (valor: number) => (Math.round(valor * 100) / 100).toFixed(2);

/**
 * Carga Compras y Patronaje de la muestra con las acciones del sistema.
 * @param base La base, con el rol dueño.
 */
export async function cargarComprasYPatronajeDeLaMuestra(base: Base): Promise<void> {
	const [yaEsta] = await base
		.select({ id: proveedores.id })
		.from(proveedores)
		.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
		.where(eq(terceros.nombre, "Textiles Aurora"));
	if (yaEsta !== undefined) return;
	const registro = await cargarModulos(join(import.meta.dirname, "../src/modulos"));
	await enSesionDeCarga(base, registro, rosa, async (hacer) => {
		const proveedorIds = new Map<string, string>();
		for (const [clave, [nombre, ciudad, telefono, diasCredito, diasDiceTardar, surte]] of Object.entries(
			proveedoresDeLaMuestra,
		)) {
			const datos = { nombre, ciudad, telefono, dias_credito: diasCredito, dias_dice_tardar: diasDiceTardar, surte };
			proveedorIds.set(clave, idDe(await hacer("compras.crear_proveedor", datos), "proveedor_id"));
		}
		const materialIds = new Map<string, string>();
		for (const [clave, material] of Object.entries(materialesDeLaMuestra)) {
			const creado = await hacer("compras.crear_material", {
				nombre: material.nombre,
				tipo: material.tipo,
				unidad: material.unidad,
				presentacion: material.presentacion,
				color: material.color,
				...(material.receta === undefined
					? {}
					: { unidad_receta: material.receta[0], factor_receta: material.receta[1] }),
				...(material.tablet === undefined
					? {}
					: { unidad_tablet: material.tablet[0], factor_tablet: material.tablet[1] }),
				proveedor_id: proveedorIds.get(material.proveedor),
				costo_centavos: aCentavos(material.costo),
				minimo: material.minimo,
				multiplo_compra: material.multiplo,
				dias_cubre: material.dias,
				consumo_diario_inicial: material.consumo,
			});
			materialIds.set(clave, idDe(creado, "material_id"));
		}
		const productoIds = await productosPorClave(base);
		await cargarRecetas(base, hacer, productoIds, materialIds);
		await cargarDesarrollos(base, registro, hacer, productoIds, materialIds);
		await cargarOrdenes(base, hacer, proveedorIds, materialIds);
	});
}

/**
 * Los productos del catálogo de la muestra por su clave en ella (`P01` es el primero).
 * @param base La base.
 */
export async function productosPorClave(base: Base): Promise<Map<string, string>> {
	const claves = new Map<string, string>();
	for (const [indice, producto] of productosDeLaMuestra.entries()) {
		const escuela = producto.escuela === null ? null : (escuelasDeLaMuestra[producto.escuela]?.nombre ?? "");
		const [encontrado] = await base
			.select({ id: productos.id })
			.from(productos)
			.leftJoin(escuelas, eq(escuelas.id, productos.escuelaId))
			.where(
				and(
					eq(productos.nombre, producto.nombre),
					escuela === null ? isNull(productos.escuelaId) : eq(escuelas.nombre, escuela),
				),
			);
		if (encontrado !== undefined) claves.set(`P${String(indice + 1).padStart(2, "0")}`, encontrado.id);
	}
	return claves;
}

/**
 * Guarda la receta de cada prenda de la muestra: la tela escala por talla desde lo medido en la talla de en medio
 * (entre 1 más el desperdicio con que se midió), y los avíos en la unidad en que los captura Patronaje.
 */
async function cargarRecetas(
	base: Base,
	hacer: Hacer,
	productoIds: ReadonlyMap<string, string>,
	materialIds: ReadonlyMap<string, string>,
): Promise<void> {
	for (const [clave, receta] of Object.entries(recetasDeLaMuestra)) {
		const productoId = productoIds.get(clave);
		if (productoId === undefined) throw new Error(`no está el producto ${clave} de la muestra`);
		// Sus tallas activas en el orden de la lista; la de en medio es la de en medio de las normales.
		const suyas = await base
			.select({ id: variantes.tallaId, especial: variantes.esPedidoEspecial })
			.from(variantes)
			.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
			.innerJoin(gruposTalla, eq(gruposTalla.id, tallas.grupoTallaId))
			.where(and(eq(variantes.productoId, productoId), isNull(variantes.bajaEn)))
			.orderBy(asc(gruposTalla.orden), asc(tallas.orden));
		const normales = suyas.filter((talla) => !talla.especial);
		const enMedio = suyas.findIndex((talla) => talla.id === normales[Math.floor((normales.length - 1) / 2)]?.id);
		const porTalla = (base: number, aumento: number) =>
			suyas.map((talla, indice) => ({ talla_id: talla.id, cantidad: aTexto(base + aumento * (indice - enMedio)) }));
		const [tela, medido, aumento] = receta.tela;
		const lineas = [
			{
				papel: "tela_principal",
				material_id: materialIds.get(tela),
				modo: "por_talla",
				unidad_receta: "m",
				tallas: porTalla(medido / (1 + (receta.desperdicio ?? 0)), aumento),
				orden: 0,
			},
			...receta.avios.map((avio, indice) => {
				const material = materialesDeLaMuestra[avio[0]];
				const unidad = material?.receta?.[0] ?? "pza";
				const factor = Number(material?.receta?.[1] ?? "1");
				return {
					papel: "avio",
					material_id: materialIds.get(avio[0]),
					unidad_receta: unidad,
					orden: indice + 1,
					...(avio[1] === "fijo"
						? { modo: "igual", cantidad: aTexto(avio[2] * factor) }
						: { modo: "por_talla", tallas: porTalla(avio[2] * factor, avio[3] * factor) }),
				};
			}),
		];
		const [suReceta] = await base
			.select({ version: recetas.version })
			.from(recetas)
			.where(eq(recetas.productoId, productoId));
		await hacer(
			"patronaje.guardar_receta",
			{ producto_id: productoId, medidas: [], lineas },
			Number(suReceta?.version),
		);
	}
}

/** La versión de un desarrollo. */
async function versionDelDesarrollo(base: Base, id: string): Promise<number> {
	const [desarrollo] = await base
		.select({ version: desarrollos.version })
		.from(desarrollos)
		.where(eq(desarrollos.id, id));
	return Number(desarrollo?.version);
}

/**
 * Lleva cada desarrollo hasta su etapa con sus acciones; el que ya está en catálogo se liga a su producto con la
 * interna que llama el alta del producto.
 */
async function cargarDesarrollos(
	base: Base,
	registro: RegistroDeModulos,
	hacer: Hacer,
	productoIds: ReadonlyMap<string, string>,
	materialIds: ReadonlyMap<string, string>,
): Promise<void> {
	const orden = ["solicitud", "muestra", "aprobacion", "ficha_tecnica", "en_catalogo"];
	const escuelaPorNombre = new Map(
		(await base.select({ id: escuelas.id, nombre: escuelas.nombre }).from(escuelas)).map((e) => [e.nombre, e.id]),
	);
	for (const desarrollo of desarrollosDeLaMuestra) {
		const llega = orden.indexOf(desarrollo.etapa);
		const id = idDe(
			await hacer("patronaje.registrar_solicitud", {
				escuela_id: escuelaPorNombre.get(escuelasDeLaMuestra[desarrollo.escuela]?.nombre ?? "") ?? null,
				prenda: desarrollo.prenda,
				tela_material_id: materialIds.get(desarrollo.tela),
				tallas: desarrollo.tallas,
				descripcion: desarrollo.descripcion,
			}),
			"desarrollo_id",
		);
		const pasos: [number, string, Record<string, unknown>][] = [
			[
				1,
				"patronaje.empezar_muestra",
				desarrollo.muestraTalla === undefined ? {} : { muestra_talla: desarrollo.muestraTalla },
			],
			[2, "patronaje.entregar_muestra", {}],
			[3, "patronaje.registrar_aprobacion_cliente", {}],
		];
		for (const [etapa, accion, datos] of pasos) {
			if (llega >= etapa) {
				await hacer(accion, { desarrollo_id: id, ...datos }, await versionDelDesarrollo(base, id));
			}
		}
		if (desarrollo.producto !== undefined) {
			await ligarProducto(base, registro, id, productoIds.get(desarrollo.producto) ?? "");
		}
	}
}

/** Liga un desarrollo en ficha técnica a su producto, con la interna, su bitácora y sus eventos. */
async function ligarProducto(base: Base, registro: RegistroDeModulos, desarrolloId: string, productoId: string) {
	await enTransaccion(base, async (transaccion) => {
		const { contexto, renglones, eventos } = crearContexto(
			registro,
			transaccion,
			rosa,
			"catalogo.crear_producto",
			Temporal.Now.instant(),
			undefined,
		);
		await contexto.interna("patronaje.ligar_producto_desarrollo", {
			desarrollo_id: desarrolloId,
			producto_id: productoId,
		});
		await escribirBitacoraConAdmin(contexto, renglones);
		await guardarEventosConAdmin(contexto, eventos);
	});
}

/**
 * Levanta cada orden con su acción y, si ya se envió, la marca enviada con su fecha, su llegada prometida y la
 * condición de su proveedor.
 */
async function cargarOrdenes(
	base: Base,
	hacer: Hacer,
	proveedorIds: ReadonlyMap<string, string>,
	materialIds: ReadonlyMap<string, string>,
): Promise<void> {
	// Primero las que ya llegaron, como enviadas en su día; después las abiertas.
	const todas = [
		...recibidasDeLaMuestra.map((orden) => ({
			...orden,
			envio: { enviada: orden.enviada, prometida: orden.prometida },
		})),
		...ordenesDeLaMuestra,
	];
	for (const orden of todas) {
		const proveedorId = proveedorIds.get(orden.proveedor) ?? "";
		const levantada = await hacer("compras.levantar_orden", {
			renglones: orden.lineas.map(([material, cantidad, pesos]) => ({
				material_id: materialIds.get(material),
				proveedor_id: proveedorId,
				cantidad,
				precio_centavos: aCentavos(pesos),
			})),
		});
		const [{ orden_id: ordenId }] = z
			.object({ ordenes: z.tuple([z.object({ orden_id: z.uuid() })]) })
			.parse(levantada).ordenes;
		if (orden.envio === null) continue;
		const [proveedor] = await base
			.select({ diasCredito: proveedores.diasCredito })
			.from(proveedores)
			.where(eq(proveedores.id, proveedorId));
		await base
			.update(ordenesCompra)
			.set({
				estado: "enviada",
				enviadaEn: Temporal.Instant.from(`${orden.envio.enviada}T17:00:00Z`).toString(),
				enviadaPor: rosa.usuarioId,
				fechaPrometida: orden.envio.prometida,
				diasCredito: proveedor?.diasCredito ?? 0,
			})
			.where(eq(ordenesCompra.id, ordenId));
	}
}
