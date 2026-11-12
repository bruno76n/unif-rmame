/**
 * Conteos y ajustes de la muestra: la existencia de arranque de las prendas en Bodega, los conteos de Bodega y sus
 * ajustes, en el día que dice la muestra.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Cómo se construye») y la
 * muestra (`docs/interfaz/muestra/sistema-alameda.html`: `existencia`, `CONTEOS` y `AJUSTES`)
 *
 * Se carga con las mismas acciones del sistema. Javier (Aduana y Bodega) registra la carga inicial de Bodega con la
 * existencia que calcula la muestra para cada variante, y cuenta como ella: el CN-021 de Playeras cuadra; el de Pants y
 * sudaderas no cuadra en el pants marino liso 14 y 16 y deja el AJ- esperando a Dirección; y el de la camisa manga
 * larga blanca 12 pide el ajuste que Carmen rechaza. Lo de las tiendas (sus conteos, sus ajustes y sus DF-) llega con
 * el POS; las recepciones del taller de la muestra son de lotes viejos que la carga de Producción no tiene, y la muestra
 * no trae sugerencias de fabricar. Los mínimos los trae la siembra. Los folios siguen a sus contadores. Si ya hay
 * conteos, no hace nada.
 */

import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { listas, listaValores } from "../src/modulos/admin/tablas.ts";
import { productos, secciones, tallas, variantes } from "../src/modulos/catalogo/tablas.ts";
import { autorizaciones } from "../src/modulos/direccion/tablas.ts";
import { ajustes, conteos, ubicaciones } from "../src/modulos/inventario/tablas.ts";
import type { CuentaQueLlama } from "../src/nucleo/acceso/quien.ts";
import type { Base } from "../src/nucleo/base/conexion.ts";
import { cargarModulos } from "../src/nucleo/modulos.ts";
import { enSesionDeCarga, idDe } from "./correr.ts";

/** Javier (`cuentas.ts`), con Aduana y Bodega, en la sesión de esta carga. */
const javier: CuentaQueLlama = {
	tipo: "cuenta",
	usuarioId: "01936f2e-0000-7000-8000-000000000007",
	sesionId: "01936f2e-0000-7000-8000-0000000000f8",
	esDuena: false,
	esSoporte: false,
	departamentos: ["aduana", "bodega"],
	permisosFinos: [],
	confirmadoConGoogleEn: undefined,
};

/** Carmen (`cuentas.ts`), la dueña, que decide los ajustes; confirma con Google al empezar. */
const carmen: CuentaQueLlama = {
	tipo: "cuenta",
	usuarioId: "01936f2e-0000-7000-8000-000000000001",
	sesionId: "01936f2e-0000-7000-8000-0000000000f9",
	esDuena: true,
	esSoporte: false,
	departamentos: [],
	permisosFinos: [],
	confirmadoConGoogleEn: Temporal.Instant.from("2026-10-01T17:59:00Z"),
};

/** El mediodía de un día de la muestra, en hora de México. */
const mediodia = (dia: string) => Temporal.Instant.from(`${dia}T18:00:00Z`);

/**
 * La existencia en Bodega que calcula la muestra para una variante (`existencia` de la muestra): un número de 18 a 168
 * a partir de su código, por 1.6 en las tallas de mayor venta.
 * @param codigo El código de barras de la variante.
 * @param talla El nombre de su talla.
 */
function existenciaDeLaMuestra(codigo: number, talla: string): number {
	const h = Number((BigInt(codigo) * 2654435761n) % 4294967296n);
	const r = (i: number) => ((h >>> (i * 4)) & 15) / 15;
	const pop = ["8", "10", "12", "M"].includes(talla) ? 1.6 : 1;
	return Math.round((18 + r(0) * 150) * pop);
}

/** Lo que el sistema decía de las variantes que la muestra cuenta distinto: prenda, talla y piezas. */
const sistemaDeLaMuestra: readonly [string, string, number][] = [
	["Pants marino liso", "14", 38],
	["Pants marino liso", "16", 22],
	["Camisa manga larga blanca", "12", 9],
];

/** Lo que contó Bodega distinto de lo que decía el sistema, por prenda y talla. */
const contadoDistinto: Readonly<Record<string, number>> = {
	"Pants marino liso|14": 36,
	"Pants marino liso|16": 23,
	"Camisa manga larga blanca|12": 7,
};

/** Una variante de la muestra con lo que tiene en Bodega. */
interface VarianteConExistencia {
	id: string;
	prenda: string;
	talla: string;
	seccion: string;
	piezas: number;
}

/**
 * Las variantes que la muestra tiene en Bodega: las vigentes, sin las de pedido especial ni los servicios.
 * @param base La base, con el rol dueño.
 */
async function variantesEnBodega(base: Base): Promise<VarianteConExistencia[]> {
	const filas = await base
		.select({
			id: variantes.id,
			codigo: variantes.codigo,
			prenda: productos.nombre,
			escuela: productos.escuelaId,
			talla: tallas.nombre,
			seccion: secciones.nombre,
		})
		.from(variantes)
		.innerJoin(productos, eq(productos.id, variantes.productoId))
		.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
		.innerJoin(secciones, eq(secciones.id, productos.seccionId))
		.where(
			and(
				isNull(variantes.bajaEn),
				eq(variantes.esPedidoEspecial, false),
				eq(productos.esServicio, false),
				isNull(productos.bajaEn),
			),
		);
	return filas.map((fila) => {
		const distinto =
			fila.escuela === null ? sistemaDeLaMuestra.find(([p, t]) => p === fila.prenda && t === fila.talla) : undefined;
		return {
			id: fila.id,
			prenda: fila.prenda,
			talla: fila.talla,
			seccion: fila.seccion,
			piezas: distinto?.[2] ?? existenciaDeLaMuestra(Number(fila.codigo), fila.talla),
		};
	});
}

/**
 * Carga los conteos y los ajustes de la muestra con las acciones del sistema.
 * @param base La base, con el rol dueño.
 */
export async function cargarConteosYAjustesDeLaMuestra(base: Base): Promise<void> {
	const [yaEsta] = await base.select({ id: conteos.id }).from(conteos).limit(1);
	if (yaEsta !== undefined) return;
	const registro = await cargarModulos(join(import.meta.dirname, "../src/modulos"));
	const [bodega] = await base.select({ id: ubicaciones.id }).from(ubicaciones).where(eq(ubicaciones.codigo, "BOD"));
	if (bodega === undefined) throw new Error("no está Bodega");
	const enBodega = await variantesEnBodega(base);
	/** El motivo de la lista «Motivos de ajuste» que dice la muestra. */
	const motivo = async (nombre: string) => {
		const [suyo] = await base
			.select({ id: listaValores.id })
			.from(listaValores)
			.innerJoin(listas, eq(listas.id, listaValores.listaId))
			.where(and(eq(listas.clave, "motivos_ajuste"), eq(listaValores.nombre, nombre)));
		if (suyo === undefined) throw new Error(`no está el motivo «${nombre}»`);
		return suyo.id;
	};
	/** Los renglones de un conteo de una sección: lo que decía el sistema, salvo lo que la muestra contó distinto. */
	const renglonesDe = (seccion: string, solo?: (variante: VarianteConExistencia) => boolean) =>
		enBodega
			.filter((variante) => variante.seccion === seccion && (solo === undefined || solo(variante)))
			.map((variante) => ({
				variante_id: variante.id,
				piezas: contadoDistinto[`${variante.prenda}|${variante.talla}`] ?? variante.piezas,
			}));
	/** El id de una sección por su nombre. */
	const seccionId = async (nombre: string) => {
		const [suya] = await base.select({ id: secciones.id }).from(secciones).where(eq(secciones.nombre, nombre));
		if (suya === undefined) throw new Error(`no está la sección ${nombre}`);
		return suya.id;
	};
	let rechazado = "";
	await enSesionDeCarga(base, registro, javier, async (hacer) => {
		// La existencia de arranque de Bodega, antes de los conteos de la muestra.
		await hacer(
			"inventario.registrar_carga_inicial",
			{
				ubicacion_id: bodega.id,
				alcance: "toda",
				renglones: enBodega.map((variante) => ({ variante_id: variante.id, piezas: variante.piezas })),
			},
			undefined,
			mediodia("2026-09-01"),
		);
		// 30 sep: la camisa manga larga blanca 12 decía 9 y había 7 (AJ-0041, que Dirección rechaza).
		const camisa = await hacer(
			"inventario.guardar_conteo",
			{
				ubicacion_id: bodega.id,
				seccion_id: await seccionId("Camisas y batas"),
				renglones: renglonesDe(
					"Camisas y batas",
					(variante) => variante.prenda === "Camisa manga larga blanca" && variante.talla === "12",
				),
				motivo_id: await motivo("Pieza dañada o manchada"),
			},
			undefined,
			mediodia("2026-09-30"),
		);
		rechazado = idDe(camisa, "ajuste_id");
		// 3 oct: el CN-021 de Playeras cuadra.
		await hacer(
			"inventario.guardar_conteo",
			{ ubicacion_id: bodega.id, seccion_id: await seccionId("Playeras"), renglones: renglonesDe("Playeras") },
			undefined,
			mediodia("2026-10-03"),
		);
		// 9 oct: el CN-023 de Pants y sudaderas no cuadra en el pants marino liso 14 y 16: su AJ- espera.
		await hacer(
			"inventario.guardar_conteo",
			{
				ubicacion_id: bodega.id,
				seccion_id: await seccionId("Pants y sudaderas"),
				renglones: renglonesDe("Pants y sudaderas"),
				motivo_id: await motivo("Error al capturar una entrada o salida"),
			},
			undefined,
			mediodia("2026-10-09"),
		);
	});
	// 1 oct: Carmen rechaza el de la camisa.
	const [suyo] = await base
		.select({ autorizacionId: ajustes.autorizacionId })
		.from(ajustes)
		.where(eq(ajustes.id, rechazado));
	const autorizacion = z.uuid().parse(suyo?.autorizacionId);
	const [suya] = await base
		.select({ version: autorizaciones.version })
		.from(autorizaciones)
		.where(eq(autorizaciones.id, autorizacion));
	await enSesionDeCarga(base, registro, carmen, async (hacer) => {
		await hacer(
			"direccion.decidir_autorizacion",
			{
				autorizacion_id: autorizacion,
				desde: "direccion",
				decision: "rechazar",
				motivo: "Las manchadas van a reproceso, no a ajuste",
			},
			suya?.version,
			mediodia("2026-10-01"),
		);
	});
}
