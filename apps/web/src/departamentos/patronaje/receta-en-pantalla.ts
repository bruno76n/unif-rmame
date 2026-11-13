/**
 * Lo que la página de la receta muestra y manda mientras se escribe: lo capturado (medidas, telas y avíos), lo que
 * lleva el próximo corte con la cuenta de material del paquete compartido (`cuentaDeMaterial`), los metros «Para
 * cortar» de cada talla y la conversión de un avío (`pideLaReceta`), y lo que manda «Guardar» a
 * `patronaje.guardar_receta`, que repite la misma cuenta al guardar. Ninguna cuenta vive aquí: solo se juntan lo
 * capturado y los insumos que dio `patronaje.receta`, y se escriben sus textos.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («La página de la receta») y docs/modulos/patronaje/cuenta-de-material.md
 * (regla 7: una sola cuenta)
 *
 * Los textos son los de la guía: «214 m», «190 pza», «1 cono», «Un cono de 5,000 m alcanza para 333 prendas», «En
 * bodega: 0.7 m por prenda».
 */

import {
	aMilesimos,
	cantidadEnTexto,
	cuentaDeMaterial,
	type LineaDeLaCuenta,
	pideLaReceta,
} from "@uniformame/compartido/calculos/cuenta-material";
import type { recetaDeLaPrenda } from "@uniformame/compartido/contratos/patronaje/receta";
import {
	cantidad,
	type guardarReceta,
	type papelesDeLaReceta,
} from "@uniformame/compartido/contratos/patronaje/recetas";
import type { z } from "zod";

/** Lo que regresa `patronaje.receta`. */
export type RecetaLeida = z.infer<typeof recetaDeLaPrenda.resultado>;
/** Un material que puede llevar la receta. */
export type MaterialDeLaReceta = RecetaLeida["materiales"][number];

/** Un material capturado: su cantidad igual en todas las tallas o la de cada talla, como se escribe. */
export interface LineaCapturada {
	papel: (typeof papelesDeLaReceta)[number];
	material_id: string;
	modo: "igual" | "por_talla";
	unidad_receta: "m" | "cm" | "pza";
	/** La conversión: la congelada en la versión o, si se agregó, la del material. */
	receta_por_unidad_inventario: string;
	cantidad: string;
	tallas: Readonly<Record<string, string>>;
}

/** Una medida capturada, con su valor por talla como se escribe. */
export interface MedidaCapturada {
	medida: string;
	valores: Readonly<Record<string, string>>;
}

/** Lo capturado en la página. */
export interface RecetaCapturada {
	medidas: readonly MedidaCapturada[];
	lineas: readonly LineaCapturada[];
	motivo: string;
}

/** Cómo se dice cada unidad de captura en palabras. */
export const unidadEnPalabras = { m: "metros", cm: "centímetros", pza: "piezas" } as const;

/**
 * Una cantidad como se escribe en una cajita, sin ceros de más: «0.920» → «0.92».
 * @param texto Como la guarda la versión.
 */
export function comoSeEscribe(texto: string): string {
	return esNumero(texto) ? cantidadEnTexto(aMilesimos(texto)) : texto;
}

/**
 * Lo que se escribe en una cajita: números y un punto; la coma se vuelve punto.
 * @param texto Lo que se escribió.
 */
export function limpiarCajita(texto: string): string {
	return texto.replace(/,/g, ".").replace(/[^\d.]/g, "");
}

/**
 * Si una cajita trae un número que acepta el contrato (decimal con hasta tres decimales).
 * @param texto Lo escrito.
 */
export function esNumero(texto: string): boolean {
	return cantidad.safeParse(texto).success;
}

/**
 * Lo capturado al abrir la página: lo de la versión que se ve, como se escribe.
 * @param receta Lo que regresa la consulta.
 */
export function recetaCapturada(receta: RecetaLeida): RecetaCapturada {
	return {
		medidas: receta.medidas.map((medida) => ({
			medida: medida.medida,
			valores: Object.fromEntries(medida.valores.map((valor) => [valor.talla_id, comoSeEscribe(valor.valor_cm)])),
		})),
		lineas: receta.lineas.map((linea) => ({
			papel: linea.papel,
			material_id: linea.material_id,
			modo: linea.modo,
			unidad_receta: linea.unidad_receta,
			receta_por_unidad_inventario: linea.receta_por_unidad_inventario,
			cantidad: linea.cantidad === null ? "" : comoSeEscribe(linea.cantidad),
			tallas: Object.fromEntries(linea.tallas.map((talla) => [talla.talla_id, comoSeEscribe(talla.cantidad)])),
		})),
		motivo: "",
	};
}

/**
 * Si lo capturado cambió contra lo que se abrió (el motivo no cuenta).
 * @param base Lo que se abrió.
 * @param capturada Lo capturado.
 */
export function hayCambios(base: RecetaCapturada, capturada: RecetaCapturada): boolean {
	const contenido = (receta: RecetaCapturada) => JSON.stringify({ medidas: receta.medidas, lineas: receta.lineas });
	return contenido(base) !== contenido(capturada);
}

/**
 * Un material capturado como lo usa la cuenta, con solo lo que es número; una cantidad igual que no es número lo deja
 * fuera.
 * @param linea El material capturado.
 * @param material Su material.
 */
function lineaDeLaCuenta(linea: LineaCapturada, material: MaterialDeLaReceta | undefined): LineaDeLaCuenta | null {
	if (linea.modo === "igual" && !esNumero(linea.cantidad)) return null;
	return {
		materialId: linea.material_id,
		esTelaPrincipal: linea.papel === "tela_principal",
		cantidad: linea.modo === "igual" ? linea.cantidad : null,
		porTalla: Object.fromEntries(Object.entries(linea.tallas).filter(([, valor]) => esNumero(valor))),
		recetaPorUnidadInventario: linea.receta_por_unidad_inventario,
		seCuentaEntera: material?.se_cuenta_entera ?? false,
	};
}

/**
 * Una cantidad entera con su unidad de inventario: «214 m», «190 pza», «1 cono».
 * @param cuanto La cantidad.
 * @param unidad La unidad de inventario («m», «pza», «conos»).
 */
export function enSuUnidad(cuanto: number, unidad: string): string {
	const unidadDicha = cuanto === 1 && unidad.endsWith("s") ? unidad.slice(0, -1) : unidad;
	return `${new Intl.NumberFormat("es-MX").format(cuanto)} ${unidadDicha}`;
}

/**
 * «Con esta receta, el corte {lote} de {n} piezas lleva»: cada material en su unidad de inventario, o «—» mientras
 * falte un dato. Es `cuentaDeMaterial` con las piezas del corte y el desperdicio de la prenda.
 * @param receta Lo que regresa la consulta.
 * @param capturada Lo capturado.
 * @returns Por material, su nombre y lo que lleva; sin corte programado, nada.
 */
export function loQueLlevaElCorte(
	receta: RecetaLeida,
	capturada: RecetaCapturada,
): { material_id: string; nombre: string; lleva: string }[] | null {
	const corte = receta.proximo_corte;
	if (corte === null) return null;
	const material = (id: string) => receta.materiales.find((uno) => uno.material_id === id);
	const lineas = capturada.lineas.flatMap((linea) => {
		const deLaCuenta = lineaDeLaCuenta(linea, material(linea.material_id));
		return deLaCuenta === null ? [] : [deLaCuenta];
	});
	const piezas = Object.fromEntries(corte.piezas_por_talla.map((talla) => [talla.talla_id, talla.piezas]));
	const cuenta = cuentaDeMaterial(lineas, piezas, receta.desperdicio.pct);
	return capturada.lineas.map((linea) => {
		const cuanto = cuenta[linea.material_id];
		const suyo = material(linea.material_id);
		return {
			material_id: linea.material_id,
			nombre: suyo?.nombre ?? "",
			lleva: cuanto === null || cuanto === undefined ? "—" : enSuUnidad(cuanto, suyo?.unidad ?? ""),
		};
	});
}

/**
 * «Para cortar»: los metros por prenda de una talla de la tela principal, ya con el desperdicio de la prenda.
 * @param linea La tela principal capturada.
 * @param tallaId La talla.
 * @param desperdicioPct El desperdicio de la prenda.
 */
export function paraCortar(linea: LineaCapturada, tallaId: string, desperdicioPct: string): string {
	const metros = linea.tallas[tallaId] ?? "";
	if (!esNumero(metros)) return "—";
	const [pide] = Object.values(
		pideLaReceta(
			[
				{
					materialId: linea.material_id,
					esTelaPrincipal: true,
					cantidad: metros,
					porTalla: {},
					recetaPorUnidadInventario: "1",
					seCuentaEntera: false,
				},
			],
			{ [tallaId]: 1 },
			desperdicioPct,
		),
	);
	return pide === null || pide === undefined ? "—" : `${Number(cantidadEnTexto(pide)).toFixed(2)} m`;
}

/**
 * La conversión de un avío igual en todas las tallas cuando su unidad de captura no es la de inventario: «Un cono de
 * 5,000 m alcanza para 333 prendas» si se cuenta entero, o «En bodega: 0.7 m por prenda».
 * @param linea El avío capturado.
 * @param material Su material.
 * @returns El texto, o nada si no aplica.
 */
export function conversionDelAvio(linea: LineaCapturada, material: MaterialDeLaReceta | undefined): string | null {
	if (material === undefined || !esNumero(linea.cantidad) || aMilesimos(linea.cantidad) === 0n) return null;
	const factor = aMilesimos(linea.receta_por_unidad_inventario);
	if (factor === 1000n) return null;
	if (material.se_cuenta_entera) {
		const unidad = material.unidad.endsWith("s") ? material.unidad.slice(0, -1) : material.unidad;
		const prendas = factor / aMilesimos(linea.cantidad);
		const numero = new Intl.NumberFormat("es-MX");
		return `Un ${unidad} de ${numero.format(Number(cantidadEnTexto(factor)))} ${linea.unidad_receta} alcanza para ${numero.format(Number(prendas))} prendas`;
	}
	const [enBodega] = Object.values(
		pideLaReceta(
			[
				{
					materialId: linea.material_id,
					esTelaPrincipal: false,
					cantidad: linea.cantidad,
					porTalla: {},
					recetaPorUnidadInventario: linea.receta_por_unidad_inventario,
					seCuentaEntera: false,
				},
			],
			{ prenda: 1 },
			"0",
		),
	);
	return enBodega === null || enBodega === undefined
		? null
		: `En bodega: ${cantidadEnTexto(enBodega)} ${material.unidad} por prenda`;
}

/**
 * Lo que manda «Guardar»: las medidas con sus valores escritos, y las telas (la principal primero) y los avíos, cada
 * uno con su orden en su tabla. Las cajitas vacías no van: la acción las da por faltantes.
 * @param receta Lo que regresa la consulta.
 * @param capturada Lo capturado.
 * @returns Los datos y, por posición, la medida o el material de cada renglón (para los errores de la acción).
 */
export function datosParaGuardar(receta: RecetaLeida, capturada: RecetaCapturada) {
	const telas = capturada.lineas.filter((linea) => linea.papel !== "avio");
	const avios = capturada.lineas.filter((linea) => linea.papel === "avio");
	const lineas = [...telas, ...avios];
	const datos: z.input<typeof guardarReceta.entrada> = {
		producto_id: receta.producto_id,
		...(receta.vigente === null ? {} : { motivo: capturada.motivo }),
		medidas: capturada.medidas.map((medida, orden) => ({
			medida: medida.medida,
			orden,
			valores: Object.entries(medida.valores)
				.filter(([, valor]) => valor.trim() !== "")
				.map(([talla_id, valor]) => ({ talla_id, valor_cm: valor })),
		})),
		lineas: lineas.map((linea) => ({
			papel: linea.papel,
			material_id: linea.material_id,
			modo: linea.modo,
			unidad_receta: linea.unidad_receta,
			...(linea.modo === "igual"
				? linea.cantidad.trim() === ""
					? {}
					: { cantidad: linea.cantidad }
				: {
						tallas: Object.entries(linea.tallas)
							.filter(([, valor]) => valor.trim() !== "")
							.map(([talla_id, valor]) => ({ talla_id, cantidad: valor })),
					}),
			orden: linea.papel === "avio" ? avios.indexOf(linea) : telas.indexOf(linea),
		})),
	};
	return {
		datos,
		medidas: capturada.medidas.map((medida) => medida.medida),
		lineas: lineas.map((linea) => linea.material_id),
	};
}

/**
 * «Llenar {medida o material}»: el valor de cada talla desde la de base y cuánto sube por talla; las medidas a medio
 * centímetro, lo demás a centésimos.
 * @param tallas Las tallas de la prenda, en orden.
 * @param tallaBaseId La talla de base.
 * @param base El valor en esa talla.
 * @param paso Cuánto sube por talla.
 * @param esMedida Si es una medida (en centímetros).
 * @returns Por talla, el valor como se escribe; nada si lo escrito no es número.
 */
export function valoresLlenados(
	tallas: readonly { talla_id: string }[],
	tallaBaseId: string,
	base: string,
	paso: string,
	esMedida: boolean,
): Record<string, string> | null {
	const deBase = tallas.findIndex((talla) => talla.talla_id === tallaBaseId);
	if (deBase < 0 || !esNumero(base) || !esNumero(paso)) return null;
	const redondear = (valor: number) => (esMedida ? Math.round(valor * 2) / 2 : Math.round(valor * 100) / 100);
	return Object.fromEntries(
		tallas.map((talla, numero) => [
			talla.talla_id,
			String(Math.max(0, redondear(Number(base) + Number(paso) * (numero - deBase)))),
		]),
	);
}

/**
 * Lo pegado desde una hoja de cálculo: renglones por salto de línea y columnas por tabulador, cada valor como se
 * escribe en una cajita.
 * @param texto Lo pegado.
 * @returns La tabla de valores; nada si es un solo valor (se pega como siempre).
 */
export function pegadoDeLaHoja(texto: string): string[][] | null {
	const limpio = texto.replace(/\r/g, "").replace(/\n+$/, "");
	if (!/[\t\n]/.test(limpio)) return null;
	return limpio.split("\n").map((renglon) => renglon.split("\t").map((valor) => limpiarCajita(valor.trim())));
}
