/**
 * `inventario.devolver_a_proveedor`: Aduana saca al proveedor lo de más que Dirección rechazó. Si esperaba en aduana,
 * los rollos escogidos (o la cantidad) se reparten del A- de la orden a la devolución; si Bodega ya la surtió y
 * Aduana la recibió, sale tal cual. Los rollos van enteros y quedan `devuelto`.
 * Fase 11 · docs/modulos/inventario/recepciones-en-aduana.md (reglas 5 y 6, «`inventario.devolver_a_proveedor`»)
 */

import { aMilesimos, cantidadEnTexto, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { devolverAProveedor } from "@uniformame/compartido/contratos/inventario/recepciones";
import { and, eq, isNull, sql } from "drizzle-orm";
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
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import { cambiarEstadoTraspaso } from "../dominio/traspasos.ts";
import { traspasoLineas, traspasos } from "../tablas.ts";

/**
 * Reparte del A- del material de una orden, que está en aduana, lo que regresa: cada rollo de su renglón, o la
 * cantidad del renglón sin rollo.
 * @param contexto El contexto de la acción.
 * @param ordenCompraId La orden.
 * @param regresa Lo que regresa, por material y rollo.
 */
async function repartirDelA(
	contexto: ContextoDeAccion,
	ordenCompraId: string,
	regresa: readonly { materialId: string; rolloId: string | null; milesimos: bigint }[],
): Promise<void> {
	const aDeLaOrden = contexto.transaccion
		.select({ id: traspasos.id })
		.from(traspasos)
		.where(
			and(
				eq(traspasos.tipo, "material_proveedor"),
				eq(traspasos.ordenCompraId, ordenCompraId),
				eq(traspasos.estado, "en_aduana"),
			),
		);
	for (const suyo of regresa) {
		await contexto.transaccion
			.update(traspasoLineas)
			.set({ cantidadRepartida: sql`${traspasoLineas.cantidadRepartida} + ${deMilesimos(suyo.milesimos)}::numeric` })
			.where(
				and(
					sql`${traspasoLineas.traspasoId} IN (${aDeLaOrden})`,
					eq(traspasoLineas.materialId, suyo.materialId),
					suyo.rolloId === null ? isNull(traspasoLineas.rolloId) : eq(traspasoLineas.rolloId, suyo.rolloId),
				),
			);
	}
}

export const accionDevolverAProveedor = implementarAccion(devolverAProveedor, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await tomarCandadosDeInventario(transaccion, { traspasoIds: [datos.traspaso_id] });
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
		await repartirDelA(contexto, devolucion.ordenCompraId ?? "", await loQueRegresa(contexto, devolucion.id));
	}
	const lineas = await loQueRegresa(contexto, devolucion.id);
	const regresa = lineas.reduce((suma, linea) => suma + linea.milesimos, 0n);
	if (datosDe.esTela && regresa !== loDeMas) {
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
