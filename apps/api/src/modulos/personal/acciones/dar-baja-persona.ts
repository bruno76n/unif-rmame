/**
 * `personal.dar_baja_persona`: Personal da de baja a una persona, con su motivo. Nada se borra.
 * Fase 7 · docs/modulos/personal/personas.md («`personal.dar_baja_persona`», reglas 2, 6 y 8)
 *
 * La persona de la dueña no se da de baja. En la misma transacción se anula su PIN del taller; cerrar su cuenta
 * llega con lo que faltaba de las cuentas (parte 4).
 */

import { darBajaPersona } from "@uniformame/compartido/contratos/personal/personas";
import { eq } from "drizzle-orm";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { esDeLaDuena, leerPersona } from "../dominio/personas.ts";
import { anularPin } from "../internas/pin.ts";
import { personas } from "../tablas.ts";

export const accionDarBajaPersona = implementarAccion(darBajaPersona, async (contexto, datos, version) => {
	const { transaccion, quien } = contexto;
	const persona = await leerPersona(transaccion, datos.persona_id);
	if (persona.bajaEn !== null) throw errorDeRegla("ya_dada_de_baja", `${persona.nombre} ya está dada de baja.`);
	if (await esDeLaDuena(transaccion, persona.id)) throw errorDeRegla("es_la_duena", "La dueña no se da de baja.");
	await tomarVersion(contexto, personas, persona.id, version, async () => ({ persona_id: persona.id }));
	const bajaPor = quien.tipo === "cuenta" ? quien.usuarioId : null;
	await transaccion
		.update(personas)
		.set({
			bajaEn: contexto.ahora.toString(),
			bajaPor,
			motivoBaja: datos.motivo,
		})
		.where(eq(personas.id, persona.id));
	const pin = await anularPin(contexto, { persona_id: persona.id, motivo: "baja_persona", anulado_por: bajaPor });
	contexto.bitacora({
		descripcion: `Dio de baja a ${persona.nombre}: ${datos.motivo}`,
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
		antes: { activa: true },
		despues: { activa: false, motivo: datos.motivo, ...(pin.anulado ? { acceso_quitado: ["PIN del taller"] } : {}) },
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
			mensaje: `${persona.nombre} dada de baja${pin.anulado ? ". Su PIN ya no entra" : ""}`,
			version: await versionActual(transaccion, personas, persona.id),
		},
		entidad: { nombre: "personas", id: persona.id },
	};
});
