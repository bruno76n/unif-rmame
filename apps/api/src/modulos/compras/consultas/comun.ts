/**
 * Lo que comparten las consultas de las pantallas de Compras: leer con las reglas del módulo en una transacción que
 * solo lee, la cuenta de los materiales, sus datos, el estado armado de un material y de una orden, el resumen de las
 * órdenes con lo recibido, y el detalle de los lotes que comprometen material.
 * Fase 19 · docs/interfaz/fabrica/compras.md
 *
 * Las consultas no repiten reglas: la cuenta de cada material es `compras.cuenta_material`; lo recibido y lo que falta,
 * `faltanteDeLineas` e `inventario.recibido_de_ordenes`; el plazo real, `plazosReales`. Las tablas de otros módulos
 * (terceros, lotes, productos) se leen sin escribir.
 */

import { aMilesimosConSigno } from "@uniformame/compartido/calculos/cuenta-material";
import { plural } from "@uniformame/compartido/calculos/textos";
import type { estadoArmado } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { condicionDePago } from "@uniformame/compartido/contratos/compras/textos";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { listas, listaValores } from "../../admin/tablas.ts";
import { terceros } from "../../contaduria/tablas.ts";
import { recibidoDeOrdenes } from "../dominio/ordenes.ts";
import { type CuentaDeMaterial, cuentaMaterial } from "../lecturas/cuenta-material.ts";
import { listaDeUnidades } from "../siembra.ts";
import { materiales, materialProveedores, ordenCompraLineas, ordenesCompra, proveedores } from "../tablas.ts";

/** Un estado armado, como lo pide el contrato. */
export type EstadoArmado = z.infer<typeof estadoArmado>;

/**
 * La cuenta de los materiales: todos los activos o los que se piden.
 * @param accion El contexto de la lectura.
 * @param ids Los materiales, o nada para todos los activos.
 */
export async function cuentas(
	accion: ContextoDeAccion,
	ids?: readonly string[],
): Promise<Record<string, CuentaDeMaterial>> {
	return cuentaMaterial(accion, ids === undefined ? {} : { material_ids: [...ids] });
}

/** Cómo se dice y de qué color va cada estado de un material. */
const nombreDelEstado: Readonly<Record<CuentaDeMaterial["estado"], { texto: string; color: EstadoArmado["color"] }>> = {
	sin_tiempo_de_entrega: { texto: "Sin tiempo de entrega", color: "rojo" },
	pedir_esta_semana: { texto: "Pedir esta semana", color: "ambar" },
	alcanza: { texto: "Alcanza", color: "verde" },
};

/**
 * El estado de un material con su línea abajo: «Sin tiempo de entrega» y «Faltará material 4 días».
 * @param cuenta La cuenta del material.
 */
export function estadoDeMaterial(cuenta: Pick<CuentaDeMaterial, "estado" | "linea">): EstadoArmado {
	return { ...nombreDelEstado[cuenta.estado], abajo: cuenta.linea };
}

/**
 * El estado de un material dicho con su línea, en el color de su estado: «Faltará material 4 días» en rojo.
 * @param cuenta La cuenta del material.
 */
export function estadoEnSuLinea(cuenta: Pick<CuentaDeMaterial, "estado" | "linea">): EstadoArmado {
	return { texto: cuenta.linea, color: nombreDelEstado[cuenta.estado].color, abajo: null };
}

/**
 * El tono de la barra de lo libre de un material: azul sobre el mínimo, ámbar bajo el mínimo, rojo bajo la mitad del
 * mínimo o en cero.
 * @param cuenta La cuenta del material.
 * @param minimo Su mínimo, como texto decimal.
 */
export function tonoDeExistencia(
	cuenta: Pick<CuentaDeMaterial, "libre_para_comprar" | "bajo_minimo">,
	minimo: string,
): "azul" | "ambar" | "rojo" {
	const libre = aMilesimosConSigno(cuenta.libre_para_comprar);
	if (libre <= 0n || libre * 2n < aMilesimosConSigno(minimo)) return "rojo";
	return cuenta.bajo_minimo ? "ambar" : "azul";
}

/** Los datos de un material para sus pantallas. */
export interface DatosDeMaterial {
	id: string;
	version: number;
	nombre: string;
	tipo: "tela" | "avio" | "consumible";
	unidad: string;
	presentacion: string | null;
	color: string | null;
	minimo: string;
	multiploCompra: string;
	diasCubre: number;
	consumoDiarioInicial: string | null;
	unidadTablet: string | null;
	factorTablet: string | null;
	bajaEn: string | null;
	proveedorId: string;
	proveedor: string;
	diasDiceTardar: number;
	diasCredito: number;
}

/** El tipo de un material, como lo guarda la tabla. */
const tipoDeMaterial = z.enum(["tela", "avio", "consumible"]);

/**
 * Los datos de unos materiales con su proveedor habitual y el nombre de su unidad, por nombre.
 * @param accion El contexto de la lectura.
 * @param filtro Los materiales, o todos (con o sin los dados de baja).
 */
export async function datosDeMateriales(
	accion: ContextoDeAccion,
	filtro: { ids?: readonly string[]; conBajas?: boolean },
): Promise<DatosDeMaterial[]> {
	const filas = await accion.transaccion
		.select({
			id: materiales.id,
			version: materiales.version,
			nombre: materiales.nombre,
			tipo: materiales.tipo,
			unidad: sql<string>`coalesce(${listaValores.nombre}, ${materiales.unidad})`,
			presentacion: materiales.presentacion,
			color: materiales.color,
			minimo: materiales.minimo,
			multiploCompra: materiales.multiploCompra,
			diasCubre: materiales.diasCubre,
			consumoDiarioInicial: materiales.consumoDiarioInicial,
			unidadTablet: materiales.unidadTablet,
			factorTablet: materiales.factorTablet,
			bajaEn: materiales.bajaEn,
			proveedorId: proveedores.id,
			proveedor: terceros.nombre,
			diasDiceTardar: proveedores.diasDiceTardar,
			diasCredito: proveedores.diasCredito,
		})
		.from(materiales)
		.innerJoin(proveedores, eq(proveedores.id, materiales.proveedorHabitualId))
		.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
		.innerJoin(listas, eq(listas.clave, listaDeUnidades))
		.leftJoin(listaValores, and(eq(listaValores.listaId, listas.id), eq(listaValores.clave, materiales.unidad)))
		.where(
			and(
				filtro.ids === undefined ? undefined : inArray(materiales.id, [...filtro.ids]),
				filtro.ids !== undefined || filtro.conBajas === true ? undefined : isNull(materiales.bajaEn),
			),
		)
		.orderBy(asc(materiales.nombre));
	return filas.map((fila) => ({ ...fila, tipo: tipoDeMaterial.parse(fila.tipo) }));
}

/** Un proveedor que surte un material, con su último precio. */
export interface Surtidor {
	materialId: string;
	proveedorId: string;
	nombre: string;
	ultimoPrecioCentavos: number;
	diasDiceTardar: number;
	diasCredito: number;
	activo: boolean;
}

/**
 * Los proveedores que surten unos materiales (los renglones del par que no están de baja), con su último precio.
 * @param accion El contexto de la lectura.
 * @param ids Los materiales, o nada para todos.
 */
export async function surtidores(accion: ContextoDeAccion, ids?: readonly string[]): Promise<Surtidor[]> {
	return accion.transaccion
		.select({
			materialId: materialProveedores.materialId,
			proveedorId: proveedores.id,
			nombre: terceros.nombre,
			ultimoPrecioCentavos: materialProveedores.ultimoPrecioCentavos,
			diasDiceTardar: proveedores.diasDiceTardar,
			diasCredito: proveedores.diasCredito,
			activo: sql<boolean>`${proveedores.bajaEn} IS NULL`,
		})
		.from(materialProveedores)
		.innerJoin(proveedores, eq(proveedores.id, materialProveedores.proveedorId))
		.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
		.where(
			and(
				isNull(materialProveedores.bajaEn),
				ids === undefined ? undefined : inArray(materialProveedores.materialId, [...ids]),
			),
		)
		.orderBy(asc(terceros.nombre));
}

/** El estado de una orden como se lee y su color. */
const estadosDeOrden: Readonly<Record<string, { texto: string; color: EstadoArmado["color"] }>> = {
	borrador: { texto: "Borrador", color: "gris" },
	enviada: { texto: "Enviada", color: "azul" },
	recibida_en_parte: { texto: "Recibida en parte", color: "naranja" },
	recibida: { texto: "Recibida", color: "verde" },
	cerrada: { texto: "Cerrada", color: "verde" },
	cerrada_con_faltante: { texto: "Cerrada con faltante", color: "verde" },
	cancelada: { texto: "Cancelada", color: "rojo" },
};

/**
 * El estado de una orden: «Atrasada» con sus días en lugar de Enviada o Recibida en parte.
 * @param estado El estado guardado.
 * @param diasAtraso Los días de atraso; 0 si no va atrasada.
 */
export function estadoDeOrden(estado: string, diasAtraso: number): EstadoArmado {
	if (diasAtraso > 0) return { texto: "Atrasada", color: "rojo", abajo: plural(diasAtraso, "día", "días") };
	return { ...(estadosDeOrden[estado] ?? { texto: estado, color: "gris" }), abajo: null };
}

/** Una línea de una orden con lo recibido. */
export interface LineaResumida {
	id: string;
	materialId: string;
	material: string;
	presentacion: string | null;
	unidad: string;
	multiplo: string;
	pedido: bigint;
	recibido: bigint;
	falta: bigint;
	precioCentavos: number;
	precioOrdenCentavos: number;
	precioNotaCentavos: number | null;
	importeCentavos: number;
}

/** Una orden con su proveedor, sus líneas, lo recibido y su atraso. */
export interface OrdenResumida {
	id: string;
	version: number;
	folio: string;
	estado: string;
	fecha: string;
	fechaPrometida: string | null;
	enviadaEn: string | null;
	creadoPor: string | null;
	proveedorId: string;
	proveedor: string;
	diasCredito: number;
	diasDiceTardar: number;
	pdfArchivoId: string | null;
	canceladoEn: string | null;
	canceladoPor: string | null;
	motivoCancelacion: string | null;
	cerradaEn: string | null;
	cerradaPor: string | null;
	motivoCierre: string | null;
	lineas: LineaResumida[];
	totalCentavos: number;
	diasAtraso: number;
	/** Los días de sus recepciones, del primero al último. */
	recepciones: string[];
}

/** Las que se pueden recibir: enviadas o recibidas en parte. */
const porRecibir = ["enviada", "recibida_en_parte"];

/**
 * Lo recibido de unas líneas y las recepciones de unas órdenes, de `inventario.recibido_de_ordenes`.
 * @param accion El contexto de la lectura.
 * @param lineaIds Las líneas.
 * @param ordenIds Las órdenes.
 */
async function recibido(
	accion: ContextoDeAccion,
	lineaIds: string[],
	ordenIds: string[],
): Promise<{ lineas: Record<string, string>; recepciones: Record<string, { dia: string }[]> }> {
	if (ordenIds.length === 0 || !accion.hayLectura("inventario.recibido_de_ordenes")) {
		return { lineas: {}, recepciones: {} };
	}
	return recibidoDeOrdenes.parse(
		await accion.lectura("inventario.recibido_de_ordenes", {
			orden_compra_linea_ids: lineaIds,
			orden_compra_ids: ordenIds,
		}),
	);
}

/**
 * Las órdenes que cumplen un filtro, con su proveedor, sus líneas, lo recibido, el total y su atraso; la más nueva
 * primero.
 * @param accion El contexto de la lectura.
 * @param filtro Unas órdenes, las de un proveedor o las de unos estados.
 */
export async function ordenesResumidas(
	accion: ContextoDeAccion,
	filtro: { ids?: readonly string[]; proveedorId?: string; estados?: readonly string[] },
): Promise<OrdenResumida[]> {
	const ordenes = await accion.transaccion
		.select({
			orden: ordenesCompra,
			proveedor: terceros.nombre,
			diasCreditoProveedor: proveedores.diasCredito,
			diasDiceTardar: proveedores.diasDiceTardar,
		})
		.from(ordenesCompra)
		.innerJoin(proveedores, eq(proveedores.id, ordenesCompra.proveedorId))
		.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
		.where(
			and(
				filtro.ids === undefined ? undefined : inArray(ordenesCompra.id, [...filtro.ids]),
				filtro.proveedorId === undefined ? undefined : eq(ordenesCompra.proveedorId, filtro.proveedorId),
				filtro.estados === undefined ? undefined : inArray(ordenesCompra.estado, [...filtro.estados]),
			),
		)
		.orderBy(sql`${ordenesCompra.folio} DESC`);
	if (ordenes.length === 0) return [];
	const ids = ordenes.map((fila) => fila.orden.id);
	const lineas = await accion.transaccion
		.select({
			id: ordenCompraLineas.id,
			ordenId: ordenCompraLineas.ordenCompraId,
			materialId: materiales.id,
			material: materiales.nombre,
			presentacion: materiales.presentacion,
			unidad: sql<string>`coalesce(${listaValores.nombre}, ${materiales.unidad})`,
			multiplo: materiales.multiploCompra,
			cantidad: ordenCompraLineas.cantidad,
			precioOrdenCentavos: ordenCompraLineas.precioOrdenCentavos,
			precioNotaCentavos: ordenCompraLineas.precioNotaCentavos,
		})
		.from(ordenCompraLineas)
		.innerJoin(materiales, eq(materiales.id, ordenCompraLineas.materialId))
		.innerJoin(listas, eq(listas.clave, listaDeUnidades))
		.leftJoin(listaValores, and(eq(listaValores.listaId, listas.id), eq(listaValores.clave, materiales.unidad)))
		.where(inArray(ordenCompraLineas.ordenCompraId, ids))
		.orderBy(asc(materiales.nombre));
	const llegado = await recibido(
		accion,
		lineas.map((linea) => linea.id),
		ids,
	);
	const hoy = accion.diaDeNegocio;
	return ordenes.map(({ orden, proveedor, diasCreditoProveedor, diasDiceTardar }) => {
		const suyas = lineas
			.filter((linea) => linea.ordenId === orden.id)
			.map((linea) => {
				const pedido = aMilesimosConSigno(linea.cantidad);
				const recibidoDeLinea = aMilesimosConSigno(llegado.lineas[linea.id] ?? "0");
				const falta = pedido - recibidoDeLinea;
				const precioCentavos = linea.precioNotaCentavos ?? linea.precioOrdenCentavos;
				return {
					id: linea.id,
					materialId: linea.materialId,
					material: linea.material,
					presentacion: linea.presentacion,
					unidad: linea.unidad,
					multiplo: linea.multiplo,
					pedido,
					recibido: recibidoDeLinea,
					falta: falta > 0n ? falta : 0n,
					precioCentavos,
					precioOrdenCentavos: linea.precioOrdenCentavos,
					precioNotaCentavos: linea.precioNotaCentavos,
					// El total es cada cantidad por su precio vigente (regla 15), al centavo.
					importeCentavos: Number((pedido * BigInt(precioCentavos) + 500n) / 1000n),
				};
			});
		const prometida = orden.fechaPrometida === null ? null : Temporal.PlainDate.from(orden.fechaPrometida);
		const atrasada =
			porRecibir.includes(orden.estado) && prometida !== null && Temporal.PlainDate.compare(prometida, hoy) < 0;
		return {
			id: orden.id,
			version: orden.version,
			folio: orden.folio,
			estado: orden.estado,
			fecha: orden.fecha,
			fechaPrometida: orden.fechaPrometida,
			enviadaEn: orden.enviadaEn,
			creadoPor: orden.creadoPor,
			proveedorId: orden.proveedorId,
			proveedor,
			diasCredito: orden.diasCredito ?? diasCreditoProveedor,
			diasDiceTardar,
			pdfArchivoId: orden.pdfArchivoId,
			canceladoEn: orden.canceladoEn,
			canceladoPor: orden.canceladoPor,
			motivoCancelacion: orden.motivoCancelacion,
			cerradaEn: orden.cerradaEn,
			cerradaPor: orden.cerradaPor,
			motivoCierre: orden.motivoCierre,
			lineas: suyas,
			totalCentavos: suyas.reduce((suma, linea) => suma + linea.importeCentavos, 0),
			diasAtraso: atrasada && prometida !== null ? prometida.until(hoy).days : 0,
			recepciones: (llegado.recepciones[orden.id] ?? []).map((recepcion) => recepcion.dia).sort(),
		};
	});
}

/**
 * La condición de pago de una orden: la que se copió al enviarla o, en borrador, la de su proveedor.
 * @param orden La orden.
 */
export function condicionDeOrden(orden: Pick<OrdenResumida, "diasCredito">): string {
	return condicionDePago(orden.diasCredito);
}

/** El detalle de un lote que compromete material. */
const deLotes = z.array(
	z.object({ id: z.uuid(), folio: z.string(), prenda: z.string(), destino: z.string(), para: z.string().nullable() }),
);

/**
 * Por lote, su folio y su detalle: «Pantalón azul marino, Distribuidora Escolar Zamora», o la tienda, o «Temporada ·
 * bodega».
 * @param accion El contexto de la lectura.
 * @param ids Los lotes.
 */
export async function detallesDeLotes(
	accion: ContextoDeAccion,
	ids: readonly string[],
): Promise<Map<string, { folio: string; detalle: string }>> {
	if (ids.length === 0) return new Map();
	const lista = sql.join(
		ids.map((id) => sql`${id}::uuid`),
		sql`, `,
	);
	const filas = deLotes.parse(
		(
			await accion.transaccion.execute(sql`SELECT l.id, l.folio, p.nombre AS prenda, l.destino,
				coalesce(t.nombre, u.nombre) AS para
			FROM lotes l JOIN productos p ON p.id = l.producto_id
			LEFT JOIN pedidos pe ON pe.id = l.pedido_id LEFT JOIN clientes c ON c.id = pe.cliente_id
			LEFT JOIN terceros t ON t.id = c.tercero_id LEFT JOIN ubicaciones u ON u.id = l.ubicacion_destino_id
			WHERE l.id IN (${lista})`)
		).rows,
	);
	return new Map(
		filas.map((fila) => [
			fila.id,
			{
				folio: fila.folio,
				detalle: `${fila.prenda}, ${fila.destino === "temporada" ? "Temporada · bodega" : (fila.para ?? "")}`,
			},
		]),
	);
}

/**
 * Lo comprometido de un material, lote por lote, con su folio y su detalle.
 * @param accion El contexto de la lectura.
 * @param cuenta La cuenta del material.
 */
export async function comprometidoConLotes(accion: ContextoDeAccion, cuenta: CuentaDeMaterial) {
	const lotes = await detallesDeLotes(
		accion,
		cuenta.comprometido_por_lote.map((suyo) => suyo.lote_id),
	);
	return cuenta.comprometido_por_lote.map((suyo) => ({
		lote_id: suyo.lote_id,
		folio: lotes.get(suyo.lote_id)?.folio ?? "",
		detalle: lotes.get(suyo.lote_id)?.detalle ?? "",
		cantidad: suyo.cantidad,
	}));
}

/**
 * Lo que viene de un material, orden por orden.
 * @param cuenta La cuenta del material.
 */
export function enCaminoDe(cuenta: CuentaDeMaterial) {
	return cuenta.en_camino.map((viene) => ({
		orden_compra_id: viene.orden_compra_id,
		folio: viene.folio,
		dia: viene.llegada_esperada,
		cantidad: viene.cantidad,
		atrasada: viene.atrasada,
	}));
}

/**
 * Si un texto cumple una búsqueda: todas sus palabras están, sin importar acentos ni mayúsculas.
 * @param buscar Lo que se escribió.
 * @param textos Donde se busca.
 */
export function cumpleBusqueda(buscar: string | undefined, textos: readonly (string | null)[]): boolean {
	if (buscar === undefined || buscar.trim() === "") return true;
	const normal = (texto: string) =>
		texto
			.normalize("NFD")
			.replace(/\p{Diacritic}/gu, "")
			.toLocaleLowerCase("es-MX");
	const donde = normal(textos.filter((texto) => texto !== null).join(" "));
	return normal(buscar)
		.split(/\s+/)
		.filter((palabra) => palabra.length > 0)
		.every((palabra) => donde.includes(palabra));
}
