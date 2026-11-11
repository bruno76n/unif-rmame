/**
 * Aduana y Bodega de la muestra: lo recibido de las órdenes de compra, sus rollos con sus partidas y sus despachos a
 * Bodega, en el día que dice la muestra.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md («Cómo se construye») y la muestra
 * (`docs/interfaz/muestra/sistema-alameda.html`: `CP_ORD` y `ROLLOS`)
 *
 * Se carga con las mismas acciones del sistema, como Javier (Aduana y Bodega), en una sesión que se cierra al
 * terminar. Las órdenes que la muestra ya tiene recibidas las deja enviadas la carga de Compras; aquí Aduana las recibe
 * en su día, las despacha a Bodega y Bodega las recibe. La recibida en parte (OC-0226) recibe sus 300 m y se queda en
 * aduana. Los rollos de cada tela son los de la muestra con su partida; lo que
 * falta para lo pedido llega en un rollo más de la partida principal (decisión 576). Las cerradas se quedan recibidas:
 * se cierran al pagarse (fase 17). Si ya hay recepciones de proveedor, no hace nada.
 */

import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { materiales, ordenCompraLineas, ordenesCompra, proveedores } from "../src/modulos/compras/tablas.ts";
import { terceros } from "../src/modulos/contaduria/tablas.ts";
import { despachos, recepciones, traspasos } from "../src/modulos/inventario/tablas.ts";
import type { CuentaQueLlama } from "../src/nucleo/acceso/quien.ts";
import type { Base } from "../src/nucleo/base/conexion.ts";
import { cargarModulos } from "../src/nucleo/modulos.ts";
import {
	nombreDeMaterial,
	nombreDeProveedor,
	type OrdenRecibidaDeLaMuestra,
	recibidasDeLaMuestra,
} from "./compras-y-patronaje.ts";
import { enSesionDeCarga, type Hacer } from "./correr.ts";

/** Javier (`cuentas.ts`), con Aduana y Bodega, en la sesión de esta carga. */
const javier: CuentaQueLlama = {
	tipo: "cuenta",
	usuarioId: "01936f2e-0000-7000-8000-000000000007",
	sesionId: "01936f2e-0000-7000-8000-0000000000f3",
	esDuena: false,
	esSoporte: false,
	departamentos: ["aduana", "bodega"],
	permisosFinos: [],
	confirmadoConGoogleEn: undefined,
};

/** Los rollos de la muestra por tela: folio de la muestra (solo para ordenar), código de partida y metros. */
// biome-ignore format: una tabla se lee mejor con los rollos de una tela por renglón
const rollosDeLaMuestra: Record<string, [string, number][]> = {
	"Gabardina azul marino": [["2224", 92], ["2224", 88.5], ["2231", 95], ["2230", 90]],
	"Piqué blanco": [["2215", 96], ["2229", 94], ["2233", 97]],
	"Felpa marino": [["2210", 150], ["2210", 148], ["2232", 152]],
	"Cuadros vino, Colegio Morelos": [["2201", 100], ["2201", 100], ["2201", 100]],
};

/** El mediodía de un día de la muestra, en hora de México. */
const mediodia = (dia: string) => Temporal.Instant.from(`${dia}T18:00:00Z`);

/** Los rollos con que llega una tela: los de la muestra y, si no alcanzan, uno más de la partida principal. */
function rollosDe(material: string, metros: number): { metros: string; partida: string }[] {
	const suyos = rollosDeLaMuestra[material] ?? [];
	const rollos: { metros: string; partida: string }[] = [];
	let faltan = metros;
	for (const [partida, suyosMetros] of suyos) {
		if (faltan <= 0) break;
		const llegan = Math.min(suyosMetros, faltan);
		rollos.push({ metros: llegan.toFixed(1), partida });
		faltan -= llegan;
	}
	if (faltan > 0) rollos.push({ metros: faltan.toFixed(1), partida: suyos[0]?.[0] ?? "S/P" });
	return rollos;
}

/**
 * Carga Aduana y Bodega de la muestra con las acciones del sistema.
 * @param base La base, con el rol dueño.
 */
export async function cargarAduanaYBodegaDeLaMuestra(base: Base): Promise<void> {
	const [yaEsta] = await base
		.select({ id: recepciones.id })
		.from(recepciones)
		.where(eq(recepciones.tipo, "aduana_de_proveedor"))
		.limit(1);
	if (yaEsta !== undefined) return;
	const registro = await cargarModulos(join(import.meta.dirname, "../src/modulos"));
	// Las órdenes que dejó enviadas la carga de Compras, por su proveedor y el día en que se enviaron.
	const ordenes: { orden: OrdenRecibidaDeLaMuestra; id: string }[] = [];
	for (const orden of recibidasDeLaMuestra) {
		const [suya] = await base
			.select({ id: ordenesCompra.id })
			.from(ordenesCompra)
			.innerJoin(proveedores, eq(proveedores.id, ordenesCompra.proveedorId))
			.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
			.where(
				and(
					eq(terceros.nombre, nombreDeProveedor(orden.proveedor)),
					eq(sql`(${ordenesCompra.enviadaEn} AT TIME ZONE 'America/Mexico_City')::date`, orden.enviada),
				),
			);
		if (suya === undefined)
			throw new Error(`no está la orden de ${nombreDeProveedor(orden.proveedor)} del ${orden.enviada}`);
		ordenes.push({ orden, id: suya.id });
	}
	// La recibida en parte de la carga de Compras: llegan 300 m de cuadros vino el 5 de octubre.
	const [enParte] = await base
		.select({ id: ordenesCompra.id })
		.from(ordenesCompra)
		.innerJoin(ordenCompraLineas, eq(ordenCompraLineas.ordenCompraId, ordenesCompra.id))
		.innerJoin(materiales, eq(materiales.id, ordenCompraLineas.materialId))
		.where(and(eq(materiales.nombre, "Cuadros vino, Colegio Morelos"), eq(ordenesCompra.estado, "enviada")));
	await enSesionDeCarga(base, registro, javier, async (hacer) => {
		for (const { orden, id } of ordenes) {
			const lineas = orden.lineas.map(([material, cantidad, pesos]): [string, number, number] => [
				nombreDeMaterial(material),
				cantidad,
				pesos,
			]);
			const aDeLaOrden = await recibir(base, hacer, id, lineas, orden.recibida);
			// Aduana lo despacha a Bodega y Bodega lo recibe, el mismo día.
			const version = await versionDe(base, aDeLaOrden);
			const despachado = await hacer(
				"inventario.despachar",
				{ traspasos: [{ traspaso_id: aDeLaOrden, version }] },
				undefined,
				mediodia(orden.recibida),
			);
			const despacho = z.object({ despacho_id: z.uuid() }).parse(despachado).despacho_id;
			const [suyo] = await base
				.select({ version: despachos.version })
				.from(despachos)
				.where(eq(despachos.id, despacho));
			await hacer(
				"inventario.recibir_despacho",
				{ despacho_id: despacho, modo: "completo" },
				Number(suyo?.version),
				mediodia(orden.recibida),
			);
		}
		if (enParte !== undefined) {
			await recibir(base, hacer, enParte.id, [["Cuadros vino, Colegio Morelos", 300, 88]], "2026-10-05");
		}
	});
}

/**
 * Aduana recibe una orden en su día: la tela con sus rollos, lo demás por cantidad. Regresa su A-.
 */
async function recibir(
	base: Base,
	hacer: Hacer,
	ordenId: string,
	lineas: readonly [string, number, number][],
	dia: string,
): Promise<string> {
	const suyas = await base
		.select({ id: ordenCompraLineas.id, material: materiales.nombre, tipo: materiales.tipo })
		.from(ordenCompraLineas)
		.innerJoin(materiales, eq(materiales.id, ordenCompraLineas.materialId))
		.where(eq(ordenCompraLineas.ordenCompraId, ordenId));
	const materialesQueLlegan = lineas.map(([material, cantidad]) => {
		const linea = suyas.find((suya) => suya.material === material);
		if (linea === undefined) throw new Error(`la orden no tiene ${material}`);
		return linea.tipo === "tela"
			? { orden_compra_linea_id: linea.id, rollos: rollosDe(material, cantidad) }
			: { orden_compra_linea_id: linea.id, cantidad: String(cantidad) };
	});
	const recibida = await hacer(
		"inventario.recibir_de_proveedor",
		{ orden_compra_id: ordenId, materiales: materialesQueLlegan },
		undefined,
		mediodia(dia),
	);
	return z.object({ traspaso_id: z.uuid() }).parse(recibida).traspaso_id;
}

/** La versión de un traspaso. */
async function versionDe(base: Base, traspasoId: string): Promise<number> {
	const [suyo] = await base.select({ version: traspasos.version }).from(traspasos).where(eq(traspasos.id, traspasoId));
	return Number(suyo?.version);
}
