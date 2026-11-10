/**
 * `personal.dar_baja_persona`: Personal da de baja a una persona, con su motivo. Nada se borra.
 * Fase 7 · docs/modulos/personal/personas.md («`personal.dar_baja_persona`», reglas 2, 6 y 8)
 *
 * La persona de la dueña no se da de baja. Quitarle lo que la deja entrar (su PIN y su cuenta) llega con el
 * PIN del taller y con lo que faltaba de las cuentas (partes 3 y 4), en esta misma transacción.
 */

import { darBajaPersona } from "@uniformame/compartido/contratos/personal/personas";
import { eq } from "drizzle-orm";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { esDeLaDuena, leerPersona } from "../dominio/personas.ts";
import { personas } from "../tablas.ts";

export const accionDarBajaPersona = implementarAccion(darBajaPersona, async (contexto, datos, version) => {
	const { transaccion, quien } = contexto;
	const persona = await leerPersona(transaccion, datos.persona_id);
	if (persona.bajaEn !== null) throw errorDeRegla("ya_dada_de_baja", `${persona.nombre} ya está dada de baja.`);
	if (await esDeLaDuena(transaccion, persona.id)) throw errorDeRegla("es_la_duena", "La dueña no se da de baja.");
	await tomarVersion(contexto, personas, persona.id, version, async () => ({ persona_id: persona.id }));
	await transaccion
		.update(personas)
		.set({
			bajaEn: contexto.ahora.toString(),
			bajaPor: quien.tipo === "cuenta" ? quien.usuarioId : null,
			motivoBaja: datos.motivo,
		})
		.where(eq(personas.id, persona.id));
	contexto.bitacora({
		descripcion: `Dio de baja a ${persona.nombre}: ${datos.motivo}`,
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
		antes: { activa: true },
		despues: { activa: false, motivo: datos.motivo },
	});
	contexto.guardarEvento({
		tipo: "persona.baja",
		datos: { persona_id: persona.id },
		tablas: ["personas"],
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
	});
	return {
		resultado: {
			mensaje: `${persona.nombre} dada de baja`,
			version: await versionActual(transaccion, personas, persona.id),
		},
		entidad: { nombre: "personas", id: persona.id },
	};
});
