/**
 * `personal.reactivar_persona`: Personal reactiva a una persona dada de baja. No le regresa PIN ni cuenta.
 * Fase 7 · docs/modulos/personal/personas.md («`personal.reactivar_persona`»)
 */

import { reactivarPersona } from "@uniformame/compartido/contratos/personal/personas";
import { eq } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { leerPersona } from "../dominio/personas.ts";
import { personas } from "../tablas.ts";

export const accionReactivarPersona = implementarAccion(reactivarPersona, async (contexto, datos, version) => {
	const { transaccion, quien } = contexto;
	const persona = await leerPersona(transaccion, datos.persona_id);
	if (persona.bajaEn === null) throw errorDeRegla("no_esta_de_baja", `${persona.nombre} ya está activa.`);
	if (
		datos.fecha_ingreso !== undefined &&
		Temporal.PlainDate.compare(Temporal.PlainDate.from(datos.fecha_ingreso), contexto.diaDeNegocio) > 0
	) {
		throw errorDeCampo("fecha_ingreso", "La fecha de ingreso no puede ser después de hoy.");
	}
	await tomarVersion(contexto, personas, persona.id, version, async () => ({ persona_id: persona.id }));
	await transaccion
		.update(personas)
		.set({
			bajaEn: null,
			bajaPor: null,
			motivoBaja: null,
			reactivadoEn: contexto.ahora.toString(),
			reactivadoPor: quien.tipo === "cuenta" ? quien.usuarioId : null,
			...(datos.fecha_ingreso === undefined ? {} : { fechaIngreso: datos.fecha_ingreso }),
		})
		.where(eq(personas.id, persona.id));
	contexto.bitacora({
		descripcion: `Reactivó a ${persona.nombre}`,
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
		antes: { baja_en: persona.bajaEn, motivo_baja: persona.motivoBaja },
		despues: { activa: true, ...(datos.fecha_ingreso === undefined ? {} : { fecha_ingreso: datos.fecha_ingreso }) },
	});
	contexto.guardarEvento({
		tipo: "persona.reactivada",
		datos: { persona_id: persona.id },
		tablas: ["personas"],
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
	});
	const falta = persona.area === "taller" ? ". Falta asignarle PIN del taller" : "";
	return {
		resultado: {
			mensaje: `${persona.nombre} reactivada${falta}`,
			version: await versionActual(transaccion, personas, persona.id),
		},
		entidad: { nombre: "personas", id: persona.id },
	};
});
