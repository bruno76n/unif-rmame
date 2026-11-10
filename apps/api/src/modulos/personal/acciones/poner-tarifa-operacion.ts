/**
 * `personal.poner_tarifa_operacion`: Personal, con «ven sueldos y tarifas», pone la tarifa por pieza de una
 * operación del flujo.
 * Fase 7 · docs/modulos/personal/tarifas.md (reglas 1, 2 y 5, «`personal.poner_tarifa_operacion`»)
 *
 * Cierra la vigente y abre la nueva desde ahora; la misma tarifa no escribe nada. Un candado por operación
 * hace que dos a la vez esperen una a la otra. La bitácora va como sueldo. El nombre de la operación y del
 * flujo, la operación dada de baja y los registros que esperaban su tarifa llegan con Producción (fase 12).
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { ponerTarifaOperacion } from "@uniformame/compartido/contratos/personal/tarifas";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { tarifasOperacion } from "../tablas.ts";

/** Una tarifa como se lee en los mensajes: «$1.20». */
export function textoDeTarifa(tarifaCentavos: number): string {
	return centavosATexto(centavos(tarifaCentavos), { conCentavos: true });
}

export const accionPonerTarifaOperacion = implementarAccion(ponerTarifaOperacion, async (contexto, datos) => {
	const { transaccion, quien } = contexto;
	const quienPone = quien.tipo === "cuenta" ? quien.usuarioId : null;
	await transaccion.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`tarifa:${datos.flujo_operacion_id}`}, 0))`,
	);
	const [vigente] = await transaccion
		.select()
		.from(tarifasOperacion)
		.where(and(eq(tarifasOperacion.flujoOperacionId, datos.flujo_operacion_id), isNull(tarifasOperacion.vigenteHasta)));
	const nueva = textoDeTarifa(datos.tarifa_centavos);
	if (vigente !== undefined) {
		await tomarVersion(contexto, tarifasOperacion, vigente.id, datos.version, async () => ({
			flujo_operacion_id: vigente.flujoOperacionId,
			tarifa_centavos: vigente.tarifaCentavos,
		}));
		// La misma tarifa no abre otra: la vigente sigue desde cuando estaba.
		if (vigente.tarifaCentavos === datos.tarifa_centavos) {
			return {
				resultado: {
					tarifa_operacion_id: vigente.id,
					version: await versionActual(transaccion, tarifasOperacion, vigente.id),
					mensaje: `La operación: ${nueva} por pieza desde ahora`,
				},
				entidad: { nombre: "tarifas_operacion", id: vigente.id },
				sinBitacora: true,
			};
		}
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
			plantilla: "Tarifa de la operación: {antes} → {despues}",
			valores: {
				antes: vigente === undefined ? "Sin tarifa" : { sueldo: textoDeTarifa(vigente.tarifaCentavos) },
				despues: { sueldo: nueva },
			},
		},
		entidad: "tarifas_operacion",
		entidadId: id,
		antes: { tarifa_centavos: vigente?.tarifaCentavos ?? null },
		despues: { tarifa_centavos: datos.tarifa_centavos },
	});
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
			mensaje: `La operación: ${nueva} por pieza desde ahora`,
		},
		entidad: { nombre: "tarifas_operacion", id },
	};
});
