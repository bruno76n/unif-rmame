/**
 * `personal.dar_alta_persona`: Personal da de alta a una persona, con su folio E- y sin PIN.
 * Fase 7 · docs/modulos/personal/personas.md («`personal.dar_alta_persona`»)
 *
 * Mandar el pago por día pide «ven sueldos y tarifas». La bitácora lleva la ficha, con el pago por día
 * marcado como sueldo.
 */

import { darAltaPersona } from "@uniformame/compartido/contratos/personal/personas";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import {
	columnasDeLaFicha,
	fichaParaBitacora,
	leerPersona,
	pedirPermisoDeSueldos,
	revisarFicha,
} from "../dominio/personas.ts";
import { personas } from "../tablas.ts";

export const accionDarAltaPersona = implementarAccion(darAltaPersona, async (contexto, datos) => {
	const { transaccion, quien } = contexto;
	if (datos.pago_dia_centavos !== undefined) pedirPermisoDeSueldos(contexto);
	const pagoDia = datos.pago_dia_centavos ?? null;
	await revisarFicha(contexto, datos, pagoDia);
	const { folio } = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "persona" }));
	const id = uuidv7();
	await transaccion.insert(personas).values({
		id,
		folio,
		...columnasDeLaFicha(datos, pagoDia),
		creadoPor: quien.tipo === "cuenta" ? quien.usuarioId : null,
	});
	const persona = await leerPersona(transaccion, id);
	contexto.bitacora({
		// Lleva el pago por día: la descripción va como plantilla, para armarla también sin sueldos.
		descripcion: { plantilla: "Dio de alta a {persona}", valores: { persona: persona.nombre } },
		entidad: "personas",
		entidadId: id,
		entidadFolio: folio,
		despues: fichaParaBitacora(persona),
	});
	contexto.guardarEvento({
		tipo: "persona.alta",
		datos: { persona_id: id },
		tablas: ["personas"],
		entidad: "personas",
		entidadId: id,
		entidadFolio: folio,
	});
	const falta = persona.area === "taller" ? ". Falta asignarle PIN del taller" : "";
	return {
		resultado: { persona_id: id, folio, mensaje: `${persona.nombre} dada de alta${falta}` },
		entidad: { nombre: "personas", id },
	};
});
