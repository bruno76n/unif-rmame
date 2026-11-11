/**
 * `personal.poner_tarifa_operacion`: Personal, con «ven sueldos y tarifas», pone la tarifa por pieza de una
 * operación del flujo.
 * Fase 7 · docs/modulos/personal/tarifas.md (reglas 1, 2 y 5, «`personal.poner_tarifa_operacion`»)
 *
 * Fase 12 · docs/fases/12-produccion.md (parte 1): el nombre de la operación y de su flujo, y `operacion_de_baja`
 *
 * Cierra la vigente y abre la nueva desde ahora; la misma tarifa no escribe nada (solo revisa la versión). Un candado
 * por operación hace que dos a la vez esperen una a la otra. La bitácora va como sueldo. La primera tarifa llega a los
 * registros de la tablet que la esperaban (`produccion.poner_tarifa_a_registros`).
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { ponerTarifaOperacion } from "@uniformame/compartido/contratos/personal/tarifas";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { revisarVersion, tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { flujoOperaciones, flujos, operaciones } from "../../produccion/tablas.ts";
import { tarifasOperacion } from "../tablas.ts";

/** Una tarifa como se lee en los mensajes: «$1.20». */
export function textoDeTarifa(tarifaCentavos: number): string {
	return centavosATexto(centavos(tarifaCentavos), { conCentavos: true });
}

/**
 * La operación del flujo que recibe la tarifa, con su nombre y el de su flujo. La bloquea con `FOR SHARE`: mientras se
 * pone la tarifa, Producción no la quita.
 * @throws `404` si no existe; `422 operacion_de_baja`: «Esa operación ya no está en el flujo».
 */
async function operacionDeLaTarifa(contexto: ContextoDeAccion, flujoOperacionId: string) {
	const [suya] = await contexto.transaccion
		.select({ operacion: operaciones.nombre, flujo: flujos.nombre, bajaEn: flujoOperaciones.bajaEn })
		.from(flujoOperaciones)
		.innerJoin(operaciones, eq(operaciones.id, flujoOperaciones.operacionId))
		.innerJoin(flujos, eq(flujos.id, flujoOperaciones.flujoId))
		.where(eq(flujoOperaciones.id, flujoOperacionId))
		.for("share", { of: flujoOperaciones });
	if (suya === undefined) throw noExiste();
	if (suya.bajaEn !== null) throw errorDeRegla("operacion_de_baja", "Esa operación ya no está en el flujo");
	return suya;
}

export const accionPonerTarifaOperacion = implementarAccion(ponerTarifaOperacion, async (contexto, datos) => {
	const { transaccion, quien } = contexto;
	const quienPone = quien.tipo === "cuenta" ? quien.usuarioId : null;
	await transaccion.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`tarifa:${datos.flujo_operacion_id}`}, 0))`,
	);
	const { operacion, flujo } = await operacionDeLaTarifa(contexto, datos.flujo_operacion_id);
	const [vigente] = await transaccion
		.select()
		.from(tarifasOperacion)
		.where(and(eq(tarifasOperacion.flujoOperacionId, datos.flujo_operacion_id), isNull(tarifasOperacion.vigenteHasta)));
	const nueva = textoDeTarifa(datos.tarifa_centavos);
	if (vigente !== undefined) {
		const visible = async () => ({
			flujo_operacion_id: vigente.flujoOperacionId,
			tarifa_centavos: vigente.tarifaCentavos,
		});
		// La misma tarifa no escribe nada: solo revisa la versión, y la vigente sigue desde cuando estaba.
		if (vigente.tarifaCentavos === datos.tarifa_centavos) {
			await revisarVersion(contexto, tarifasOperacion, vigente.id, datos.version, visible);
			return {
				resultado: {
					tarifa_operacion_id: vigente.id,
					version: await versionActual(transaccion, tarifasOperacion, vigente.id),
					mensaje: `${operacion}: ${nueva} por pieza desde ahora`,
				},
				entidad: { nombre: "tarifas_operacion", id: vigente.id },
				sinBitacora: true,
			};
		}
		await tomarVersion(contexto, tarifasOperacion, vigente.id, datos.version, visible);
		await transaccion
			.update(tarifasOperacion)
			.set({ vigenteHasta: contexto.ahora.toString() })
			.where(eq(tarifasOperacion.id, vigente.id));
	}
	const id = uuidv7();
	await transaccion.insert(tarifasOperacion).values({
		id,
		flujoOperacionId: datos.flujo_operacion_id,
		tarifaCentavos: datos.tarifa_centavos,
		vigenteDesde: contexto.ahora.toString(),
		creadoPor: quienPone,
	});
	contexto.bitacora({
		// Es sueldo: la descripción va como plantilla, para armarla también sin el permiso.
		descripcion: {
			plantilla: "Tarifa de «{operacion}» en {flujo}: {antes} → {despues}",
			valores: {
				operacion,
				flujo,
				antes: vigente === undefined ? "Sin tarifa" : { sueldo: textoDeTarifa(vigente.tarifaCentavos) },
				despues: { sueldo: nueva },
			},
		},
		entidad: "tarifas_operacion",
		entidadId: id,
		antes: { tarifa_centavos: vigente?.tarifaCentavos ?? null },
		despues: { tarifa_centavos: datos.tarifa_centavos },
	});
	// La primera tarifa de la operación llega a los registros que la esperaban.
	const avisos: string[] = [];
	if (vigente === undefined && contexto.hayLectura("produccion.registros_para_nomina")) {
		const { tomaron } = z.object({ tomaron: z.number() }).parse(
			await contexto.interna("produccion.poner_tarifa_a_registros", {
				flujo_operacion_id: datos.flujo_operacion_id,
				tarifa_operacion_id: id,
				tarifa_centavos: datos.tarifa_centavos,
			}),
		);
		if (tomaron > 0) {
			avisos.push(tomaron === 1 ? "1 registro sin tarifa ya la tomó" : `${tomaron} registros sin tarifa ya la tomaron`);
		}
	}
	contexto.guardarEvento({
		tipo: "tarifa.puesta",
		datos: { flujo_operacion_id: datos.flujo_operacion_id },
		tablas: ["tarifas_operacion"],
		entidad: "tarifas_operacion",
		entidadId: id,
	});
	return {
		resultado: {
			tarifa_operacion_id: id,
			version: await versionActual(transaccion, tarifasOperacion, id),
			mensaje: `${operacion}: ${nueva} por pieza desde ahora`,
		},
		avisos,
		entidad: { nombre: "tarifas_operacion", id },
	};
});
