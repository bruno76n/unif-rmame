/**
 * `inventario.devolver_a_proveedor`: Aduana saca al proveedor lo de más que Dirección rechazó. Si esperaba en aduana,
 * los rollos escogidos (o la cantidad) se reparten del A- de la orden a la devolución; si Bodega ya la surtió y
 * Aduana la recibió, sale tal cual. Los rollos van enteros y quedan `devuelto`.
 * Fase 11 · docs/modulos/inventario/recepciones-en-aduana.md (reglas 5 y 6, «`inventario.devolver_a_proveedor`»)
 */

import {
	aMilesimos,
	aMilesimosConSigno,
	cantidadEnTexto,
	deMilesimos,
	menor,
} from "@uniformame/compartido/calculos/cuenta-material";
import { devolverAProveedor } from "@uniformame/compartido/contratos/inventario/recepciones";
import { and, asc, eq } from "drizzle-orm";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { tomarCandadosDeInventario } from "../dominio/candados.ts";
import {
	datosDeDevolucion,
	loQueRegresa,
	ponerRollosEnDevolucion,
	rollosDevueltos,
	rollosQueRegresan,
} from "../dominio/devoluciones.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";
import { candadoDeLoRecibido, ubicacionDeTipo } from "../dominio/recepciones.ts";
import { cambiarEstadoTraspaso } from "../dominio/traspasos.ts";
import { traspasoLineas, traspasos } from "../tablas.ts";

/**
 * Reparte de los A- del material de una orden que siguen en aduana lo que regresa, como `repartirTraspaso` (ver
 * traspasos.md, «Repartir»): de cada renglón (del mismo material y rollo) como mucho lo que le queda en aduana, y lo
 * que falte, del siguiente, por folio. Un A- al que ya no le queda nada pasa a `repartido`.
 * @param contexto El contexto de la acción.
 * @param ordenCompraId La orden.
 * @param regresa Lo que regresa, por material y rollo.
 * @throws Error si los A- no tienen en aduana lo que regresa: la acción ya revisó que esté ahí.
 */
async function repartirDeLosA(
	contexto: ContextoDeAccion,
	ordenCompraId: string,
	regresa: readonly { materialId: string; rolloId: string | null; milesimos: bigint }[],
): Promise<void> {
	const { transaccion } = contexto;
	const lineas = await transaccion
		.select({
			id: traspasoLineas.id,
			traspasoId: traspasoLineas.traspasoId,
			materialId: traspasoLineas.materialId,
			rolloId: traspasoLineas.rolloId,
			recibida: traspasoLineas.cantidadRecibidaAduana,
			repartida: traspasoLineas.cantidadRepartida,
		})
		.from(traspasoLineas)
		.innerJoin(traspasos, eq(traspasos.id, traspasoLineas.traspasoId))
		.where(
			and(
				eq(traspasos.tipo, "material_proveedor"),
				eq(traspasos.ordenCompraId, ordenCompraId),
				eq(traspasos.estado, "en_aduana"),
			),
		)
		.orderBy(asc(traspasos.folio), asc(traspasoLineas.renglon));
	const queda = new Map(
		lineas.map((linea) => [linea.id, aMilesimosConSigno(linea.recibida ?? "0") - aMilesimosConSigno(linea.repartida)]),
	);
	for (const suyo of regresa) {
		let falta = suyo.milesimos;
		for (const linea of lineas) {
			if (falta === 0n) break;
			if (linea.materialId !== suyo.materialId || linea.rolloId !== suyo.rolloId) continue;
			const tiene = queda.get(linea.id) ?? 0n;
			const toma = menor(tiene, falta);
			if (toma <= 0n) continue;
			queda.set(linea.id, tiene - toma);
			falta -= toma;
			await transaccion
				.update(traspasoLineas)
				.set({ cantidadRepartida: deMilesimos(aMilesimosConSigno(linea.recibida ?? "0") - (tiene - toma)) })
				.where(eq(traspasoLineas.id, linea.id));
		}
		if (falta > 0n)
			throw new Error(`los A- de la orden no tienen en aduana lo que regresa (${deMilesimos(falta)} de más)`);
	}
	// Un A- al que ya no le queda nada en aduana pasa a repartido.
	for (const traspasoId of new Set(lineas.map((linea) => linea.traspasoId))) {
		const suyas = lineas.filter((linea) => linea.traspasoId === traspasoId);
		if (suyas.every((linea) => (queda.get(linea.id) ?? 0n) === 0n)) {
			await cambiarEstadoTraspaso(contexto, traspasoId, "repartido");
		}
	}
}

/**
 * Pone en fila lo que toca una devolución: ella y los A- de su orden que siguen en aduana (todos los traspasos, en una
 * sola llamada y en orden), y luego lo recibido de la orden, como `despachar`. Así dos devoluciones de la misma orden,
 * o una devolución y el despacho de su A-, no se pisan lo repartido. La orden de una devolución no cambia, así que se
 * lee antes del candado; los A- se vuelven a leer al repartir.
 * @param contexto El contexto de la acción.
 * @param devolucionId La devolución.
 */
async function candadosDeLaDevolucion(contexto: ContextoDeAccion, devolucionId: string): Promise<void> {
	const { transaccion } = contexto;
	const [suya] = await transaccion
		.select({ ordenCompraId: traspasos.ordenCompraId })
		.from(traspasos)
		.where(eq(traspasos.id, devolucionId));
	const ordenCompraId = suya?.ordenCompraId ?? null;
	const deLaOrden =
		ordenCompraId === null
			? []
			: await transaccion
					.select({ id: traspasos.id })
					.from(traspasos)
					.where(
						and(
							eq(traspasos.tipo, "material_proveedor"),
							eq(traspasos.ordenCompraId, ordenCompraId),
							eq(traspasos.estado, "en_aduana"),
						),
					);
	await tomarCandadosDeInventario(transaccion, { traspasoIds: [devolucionId, ...deLaOrden.map((a) => a.id)] });
	if (ordenCompraId !== null) await candadoDeLoRecibido(contexto, ordenCompraId);
}

export const accionDevolverAProveedor = implementarAccion(devolverAProveedor, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await candadosDeLaDevolucion(contexto, datos.traspaso_id);
	const [devolucion] = await transaccion.select().from(traspasos).where(eq(traspasos.id, datos.traspaso_id));
	if (devolucion === undefined || devolucion.tipo !== "devolucion_proveedor") throw noExiste();
	await tomarVersion(contexto, traspasos, devolucion.id, version, async () => ({
		traspaso_id: devolucion.id,
		estado: devolucion.estado,
	}));
	const aduana = await ubicacionDeTipo(transaccion, "aduana");
	const esperaEnAduana = devolucion.estado === "esperado" && devolucion.origenUbicacionId === aduana;
	if (!esperaEnAduana && devolucion.estado !== "en_aduana") {
		throw errorDeRegla("no_esta_en_aduana", `${devolucion.folio} no está en aduana.`);
	}
	const datosDe = await datosDeDevolucion(contexto, devolucion);
	const loDeMas = (await loQueRegresa(contexto, devolucion.id)).reduce((suma, linea) => suma + linea.milesimos, 0n);
	const avisos: string[] = [];
	// Si esperaba en aduana, se escoge lo que regresa y se reparte del A- de la orden.
	if (esperaEnAduana) {
		if (datosDe.esTela) {
			if ((datos.rollo_ids ?? []).length === 0) throw errorDeCampo("rollo_ids", "Escoge los rollos que regresan");
			const regresan = await rollosQueRegresan(contexto, devolucion, datosDe, datos.rollo_ids ?? [], {
				ubicacionId: aduana,
				nombre: "aduana",
			});
			await ponerRollosEnDevolucion(contexto, devolucion, regresan);
		} else if (datos.cantidad === undefined || aMilesimos(datos.cantidad) !== loDeMas) {
			throw errorDeRegla("cantidad_distinta", `Lo que regresa es ${cantidadEnTexto(loDeMas)} ${datosDe.unidad}.`);
		}
		await repartirDeLosA(contexto, devolucion.ordenCompraId ?? "", await loQueRegresa(contexto, devolucion.id));
	}
	// Lo que sale: lo escogido, o lo que Aduana recibió de lo que surtió Bodega.
	const lineas = (await loQueRegresa(contexto, devolucion.id, esperaEnAduana ? "enviado" : "en_aduana")).filter(
		(linea) => linea.milesimos > 0n,
	);
	// Si de lo que surtió Bodega no llegó nada, no hay nada en aduana que sacar: se queda en su tramo.
	if (lineas.length === 0) throw errorDeRegla("no_esta_en_aduana", `${devolucion.folio} no está en aduana.`);
	const regresa = lineas.reduce((suma, linea) => suma + linea.milesimos, 0n);
	// El aviso es de los rollos escogidos: lo que surtió Bodega y no llegó se queda en su tramo, sin aviso.
	if (esperaEnAduana && datosDe.esTela && regresa !== loDeMas) {
		avisos.push(
			`Los rollos suman ${cantidadEnTexto(regresa)} m y lo de más es ${cantidadEnTexto(loDeMas)} m: la diferencia se ve en la conciliación de Compras`,
		);
	}
	await escribirMovimiento(contexto, {
		tipo: "devolucion_proveedor",
		documento: { tipo: "traspaso", id: devolucion.id, folio: devolucion.folio },
		renglones: lineas.map((linea) => ({
			origen: aduana,
			destino: null,
			materialId: linea.materialId,
			rolloId: linea.rolloId,
			cantidad: deMilesimos(linea.milesimos),
			traspasoId: devolucion.id,
		})),
	});
	await cambiarEstadoTraspaso(contexto, devolucion.id, "salio");
	await rollosDevueltos(
		contexto,
		lineas.flatMap((linea) => (linea.rolloId === null ? [] : [linea.rolloId])),
	);
	// Lo que regresa es lo que baja lo recibido de la línea: la orden se recalcula.
	await contexto.interna("compras.recalcular_estado_orden", { orden_compra_id: devolucion.ordenCompraId });
	const cantidad = `${cantidadEnTexto(regresa)} ${datosDe.unidad} de ${datosDe.material}`;
	contexto.bitacora({
		descripcion: `Devolvió a ${datosDe.proveedor}`,
		entidad: "traspasos",
		entidadId: devolucion.id,
		entidadFolio: devolucion.folio,
		despues: { cantidad, rollos: lineas.flatMap((linea) => (linea.rolloId === null ? [] : [linea.rolloId])) },
	});
	contexto.guardarEvento({
		tipo: "traspaso.salio",
		datos: { traspaso_id: devolucion.id },
		tablas: ["traspasos", "traspaso_lineas", "rollos", "existencias_material"],
		entidad: "traspasos",
		entidadId: devolucion.id,
		entidadFolio: devolucion.folio,
	});
	return {
		resultado: {
			mensaje: `${cantidad} regresan a ${datosDe.proveedor}`,
			version: await versionActual(transaccion, traspasos, devolucion.id),
		},
		avisos,
		entidad: { nombre: "traspasos", id: devolucion.id },
	};
});
