/**
 * Lo que comparten surtir y devolver lo de más al proveedor: lo que dice Compras de la devolución (su orden, su
 * proveedor y su material), los rollos que regresan y los renglones de la devolución con esos rollos.
 * Fase 11 · docs/modulos/inventario/recepciones-en-aduana.md (reglas 5 y 6, «`inventario.devolver_a_proveedor`») y
 * surtido-y-despachos.md («`inventario.surtir_a_aduana`»)
 *
 * Una devolución nace por lo rechazado, con un renglón sin rollo. Cuando se escogen los rollos que de verdad regresan,
 * sus renglones pasan a ser esos rollos, enteros: lo que la línea de la orden baja de su recibido es lo que regresa.
 */

import { aMilesimosConSigno, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { rollos, traspasoLineas, type traspasos } from "../tablas.ts";

/** Un traspaso como se guarda. */
type Traspaso = typeof traspasos.$inferSelect;

/** Lo que dice Compras de una devolución: su orden, su proveedor y su material. */
export interface DatosDeDevolucion {
	folioOrden: string;
	proveedor: string;
	materialId: string;
	material: string;
	unidad: string;
	esTela: boolean;
}

/** Lo que regresa `compras.ordenes_por_recibir`, en lo que usa una devolución. */
const deLaOrden = z.object({
	ordenes: z.array(
		z
			.object({
				folio: z.string(),
				proveedor: z.string(),
				lineas: z.array(
					z.object({ material_id: z.uuid(), material: z.string(), unidad: z.string(), tipo: z.string() }).passthrough(),
				),
			})
			.passthrough(),
	),
});

/**
 * Los renglones de una devolución, en su orden.
 * @param contexto El contexto de la acción.
 * @param traspasoId La devolución.
 */
export function lineasDeDevolucion(contexto: ContextoDeAccion, traspasoId: string) {
	return contexto.transaccion
		.select()
		.from(traspasoLineas)
		.where(eq(traspasoLineas.traspasoId, traspasoId))
		.orderBy(asc(traspasoLineas.renglon));
}

/**
 * Lo que dice Compras de una devolución al proveedor.
 * @param contexto El contexto de la acción.
 * @param devolucion La devolución.
 * @throws Error si no es de una orden: toda devolución al proveedor lo es.
 */
export async function datosDeDevolucion(contexto: ContextoDeAccion, devolucion: Traspaso): Promise<DatosDeDevolucion> {
	const [linea] = await lineasDeDevolucion(contexto, devolucion.id);
	if (devolucion.ordenCompraId === null || linea?.materialId == null) {
		throw new Error(`${devolucion.folio} no es la devolución de una orden`);
	}
	const { materialId } = linea;
	const [orden] = deLaOrden.parse(
		await contexto.lectura("compras.ordenes_por_recibir", { orden_compra_ids: [devolucion.ordenCompraId] }),
	).ordenes;
	const suya = orden?.lineas.find((linea) => linea.material_id === materialId);
	if (orden === undefined || suya === undefined)
		throw new Error(`la orden de ${devolucion.folio} no tiene su material`);
	return {
		folioOrden: orden.folio,
		proveedor: orden.proveedor,
		materialId,
		material: suya.material,
		unidad: suya.unidad,
		esTela: suya.tipo === "tela",
	};
}

/** Un rollo que regresa, con lo que tiene en su ubicación. */
export interface RolloQueRegresa {
	rolloId: string;
	folio: string;
	milesimos: bigint;
}

/**
 * Revisa los rollos que regresan: de ese material y de esa orden, no devueltos, y con metros en la ubicación de donde
 * salen; regresan enteros, con todo lo que tienen ahí.
 * @param donde La ubicación de donde salen, y cómo se dice («aduana» o «bodega»).
 * @throws `422 rollo_ajeno`: «{rollo} no es de {material} de {OC}, o no está en {donde}.».
 */
export async function rollosQueRegresan(
	contexto: ContextoDeAccion,
	devolucion: Traspaso,
	datos: DatosDeDevolucion,
	rolloIds: readonly string[],
	donde: { ubicacionId: string; nombre: string },
): Promise<RolloQueRegresa[]> {
	const suyos = await contexto.transaccion
		.select({
			id: rollos.id,
			folio: rollos.folio,
			materialId: rollos.materialId,
			ordenCompraId: rollos.ordenCompraId,
			estado: rollos.estado,
			// Calificado a mano: dentro de un select, Drizzle escribe la columna sin su tabla.
			hay: sql<string>`coalesce((SELECT sum(e.cantidad) FROM existencias_material e
				WHERE e.rollo_id = "rollos"."id" AND e.ubicacion_id = ${donde.ubicacionId}), 0)::numeric(12, 3)::text`,
		})
		.from(rollos)
		.where(inArray(rollos.id, [...rolloIds]));
	return rolloIds.map((id) => {
		const rollo = suyos.find((suyo) => suyo.id === id);
		const hay = aMilesimosConSigno(rollo?.hay ?? "0");
		if (
			rollo === undefined ||
			rollo.materialId !== datos.materialId ||
			rollo.ordenCompraId !== devolucion.ordenCompraId ||
			rollo.estado === "devuelto" ||
			hay <= 0n
		) {
			throw errorDeRegla(
				"rollo_ajeno",
				`${rollo?.folio ?? "Ese rollo"} no es de ${datos.material} de ${datos.folioOrden}, o no está en ${donde.nombre}.`,
			);
		}
		return { rolloId: rollo.id, folio: rollo.folio, milesimos: hay };
	});
}

/**
 * Pone en la devolución los rollos que de verdad regresan: su primer renglón pasa a ser el primer rollo y cada otro
 * rollo es un renglón nuevo, con sus metros como lo enviado.
 * @param contexto El contexto de la acción.
 * @param devolucion La devolución.
 * @param regresan Los rollos.
 */
export async function ponerRollosEnDevolucion(
	contexto: ContextoDeAccion,
	devolucion: Traspaso,
	regresan: readonly RolloQueRegresa[],
): Promise<void> {
	const lineas = await lineasDeDevolucion(contexto, devolucion.id);
	const [primera] = lineas;
	const [primero, ...otros] = regresan;
	if (primera === undefined || primero === undefined) return;
	await contexto.transaccion
		.update(traspasoLineas)
		.set({ rolloId: primero.rolloId, cantidadEnviada: deMilesimos(primero.milesimos) })
		.where(eq(traspasoLineas.id, primera.id));
	if (otros.length === 0) return;
	const ultimo = Math.max(...lineas.map((linea) => linea.renglon));
	await contexto.transaccion.insert(traspasoLineas).values(
		otros.map((rollo, i) => ({
			id: uuidv7(),
			traspasoId: devolucion.id,
			renglon: ultimo + i + 1,
			materialId: primera.materialId,
			rolloId: rollo.rolloId,
			cantidadEnviada: deMilesimos(rollo.milesimos),
			creadoPor: quienCambia(contexto),
		})),
	);
}

/**
 * Lo que regresa cada rollo de una devolución ya escogida, o su cantidad: para quien lo saca o lo recibe.
 * @param contexto El contexto de la acción.
 * @param devolucionId La devolución.
 */
export async function loQueRegresa(contexto: ContextoDeAccion, devolucionId: string) {
	const lineas = await lineasDeDevolucion(contexto, devolucionId);
	return lineas.map((linea) => ({
		lineaId: linea.id,
		materialId: linea.materialId ?? "",
		rolloId: linea.rolloId,
		milesimos: aMilesimosConSigno(linea.cantidadEnviada ?? "0"),
	}));
}

/** Los rollos de unas líneas pasan a `devuelto`. */
export async function rollosDevueltos(contexto: ContextoDeAccion, rolloIds: readonly string[]): Promise<void> {
	if (rolloIds.length === 0) return;
	await contexto.transaccion
		.update(rollos)
		.set({ estado: "devuelto" })
		.where(and(inArray(rollos.id, [...rolloIds])));
}
