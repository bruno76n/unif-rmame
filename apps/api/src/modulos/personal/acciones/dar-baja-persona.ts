/**
 * `personal.dar_baja_persona`: Personal da de baja a una persona, con su motivo. Nada se borra.
 * Fase 7 · docs/modulos/personal/personas.md («`personal.dar_baja_persona`», reglas 2, 6 y 8)
 *
 * La persona de la dueña no se da de baja. En la misma transacción se le quita lo que la deja entrar: se anula
 * su PIN del taller y se cierra su cuenta de Google (o se rechaza su solicitud); desde la fase 13, las máquinas que
 * traía quedan sin quién las trae.
 */

import { darBajaPersona } from "@uniformame/compartido/contratos/personal/personas";
import { eq } from "drizzle-orm";
import { z } from "zod";
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
	const { cerrada } = z
		.object({ cerrada: z.enum(["activa", "solicitada"]).nullable() })
		.parse(await contexto.interna("admin.cerrar_cuenta_de_persona", { persona_id: persona.id }));
	// Las máquinas que traía quedan sin quién las trae (fase 13).
	const { maquinas } = z
		.object({ maquinas: z.number() })
		.parse(await contexto.interna("mantenimiento.soltar_maquinas_de_persona", { persona_id: persona.id }));
	const quitado = [
		...(pin.anulado ? ["PIN del taller"] : []),
		...(cerrada === "activa" ? ["Cuenta de Google"] : []),
		...(cerrada === "solicitada" ? ["Solicitud de cuenta"] : []),
	];
	contexto.bitacora({
		descripcion: `Dio de baja a ${persona.nombre}: ${datos.motivo}`,
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
		antes: { activa: true },
		despues: {
			activa: false,
			motivo: datos.motivo,
			...(quitado.length > 0 ? { acceso_quitado: quitado } : {}),
			...(maquinas > 0 ? { maquinas_soltadas: maquinas } : {}),
		},
		// Cerrarle una cuenta activa le quita sus departamentos: alerta, como «Quitar acceso».
		...(cerrada === "activa" ? { esAlerta: true } : {}),
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
			mensaje: `${persona.nombre} dada de baja${pin.anulado ? ". Su PIN ya no entra" : ""}${cerrada === "activa" ? ". Su cuenta de Google ya no entra" : ""}`,
			version: await versionActual(transaccion, personas, persona.id),
		},
		entidad: { nombre: "personas", id: persona.id },
	};
});
