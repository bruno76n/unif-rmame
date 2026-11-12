/**
 * Las acciones de las máquinas: `mantenimiento.alta_maquina`, `mantenimiento.baja_maquina` y
 * `mantenimiento.cambiar_asignacion_maquina`.
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (reglas 2, 3 y 12, «Acciones»)
 */

import {
	altaMaquina,
	bajaMaquina,
	cambiarAsignacionMaquina,
} from "@uniformame/compartido/contratos/mantenimiento/maquinas";
import { and, eq, ne, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { personas } from "../../personal/tablas.ts";
import { areaDelTaller, maquinaBloqueada, personaQueLaTrae, tipoDeLaMaquina } from "../dominio/maquinas.ts";
import { fallas, maquinas } from "../tablas.ts";

export const accionAltaMaquina = implementarAccion(altaMaquina, async (contexto, datos) => {
	const { transaccion } = contexto;
	const area = await areaDelTaller(contexto, datos.area_id);
	await personaQueLaTrae(contexto, datos.persona_id);
	const [repetida] = await transaccion
		.select({ id: maquinas.id })
		.from(maquinas)
		.where(sql`lower(${maquinas.nombre}) = lower(${datos.nombre})`);
	if (repetida !== undefined) throw errorDeRegla("maquina_repetida", "Ya hay una máquina con ese nombre.");
	const serie = datos.serie === undefined || datos.serie === "" ? null : datos.serie;
	if (serie !== null) {
		const [conSerie] = await transaccion.select({ id: maquinas.id }).from(maquinas).where(eq(maquinas.serie, serie));
		if (conSerie !== undefined) throw errorDeRegla("serie_repetida", "Ya hay una máquina con esa serie.");
	}
	const tipo = await tipoDeLaMaquina(contexto, datos);
	// Su folio por tipo: el consecutivo vive en los folios, con el prefijo como alcance (regla 2).
	const { folio } = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "maquina", alcance: tipo.prefijo }));
	const maquinaId = uuidv7();
	const vacio = (texto: string | undefined) => (texto === undefined || texto === "" ? null : texto);
	await transaccion.insert(maquinas).values({
		id: maquinaId,
		folio,
		nombre: datos.nombre,
		tipoMaquinaId: tipo.id,
		areaId: datos.area_id,
		marca: vacio(datos.marca),
		modelo: vacio(datos.modelo),
		serie,
		personaId: datos.persona_id,
		creadoPor: quienCambia(contexto),
	});
	contexto.guardarEvento({
		tipo: "maquina.creada",
		datos: { maquina_id: maquinaId },
		tablas: ["maquinas"],
		entidad: "maquinas",
		entidadId: maquinaId,
		entidadFolio: folio,
	});
	contexto.bitacora({
		descripcion: `Dio de alta la máquina ${datos.nombre} (${folio}) en ${area}`,
		entidad: "maquinas",
		entidadId: maquinaId,
		entidadFolio: folio,
		despues: { ...datos, folio },
	});
	return {
		resultado: { mensaje: `${datos.nombre} (${folio}) dada de alta en ${area}`, maquina_id: maquinaId, folio },
		entidad: { nombre: "maquinas", id: maquinaId },
	};
});

export const accionBajaMaquina = implementarAccion(bajaMaquina, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const maquina = await maquinaBloqueada(contexto, datos.maquina_id);
	await tomarVersion(contexto, maquinas, maquina.id, version, async () => ({
		maquina_id: maquina.id,
		baja_en: maquina.bajaEn,
	}));
	await revisarMotivo(contexto, datos.motivo);
	if (maquina.bajaEn !== null) {
		throw errorDeRegla("maquina_ya_de_baja", `${maquina.nombre} ya está dada de baja.`);
	}
	const [abierta] = await transaccion
		.select({ id: fallas.id })
		.from(fallas)
		.where(and(eq(fallas.maquinaId, maquina.id), ne(fallas.estado, "resuelta")));
	if (abierta !== undefined) {
		throw errorDeRegla(
			"maquina_con_falla_abierta",
			`${maquina.nombre} tiene una falla abierta: resuélvela antes de darla de baja`,
		);
	}
	await transaccion
		.update(maquinas)
		.set({ bajaEn: contexto.ahora.toString(), bajaPor: quienCambia(contexto), motivoBaja: datos.motivo })
		.where(eq(maquinas.id, maquina.id));
	contexto.guardarEvento({
		tipo: "maquina.dada_de_baja",
		datos: { maquina_id: maquina.id },
		tablas: ["maquinas"],
		entidad: "maquinas",
		entidadId: maquina.id,
		entidadFolio: maquina.folio,
	});
	contexto.bitacora({
		descripcion: `Dio de baja la máquina ${maquina.nombre} (${maquina.folio}): ${datos.motivo}`,
		entidad: "maquinas",
		entidadId: maquina.id,
		entidadFolio: maquina.folio,
		despues: { motivo: datos.motivo },
	});
	return { resultado: { mensaje: `${maquina.nombre} dada de baja` }, entidad: { nombre: "maquinas", id: maquina.id } };
});

export const accionCambiarAsignacionMaquina = implementarAccion(
	cambiarAsignacionMaquina,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		const maquina = await maquinaBloqueada(contexto, datos.maquina_id);
		await tomarVersion(contexto, maquinas, maquina.id, version, async () => ({
			maquina_id: maquina.id,
			persona_id: maquina.personaId,
		}));
		if (maquina.bajaEn !== null) {
			throw errorDeRegla("maquina_ya_de_baja", `${maquina.nombre} ya está dada de baja.`);
		}
		const nueva = await personaQueLaTrae(contexto, datos.persona_id);
		const [antes] =
			maquina.personaId === null
				? []
				: await transaccion
						.select({ nombre: personas.nombre })
						.from(personas)
						.where(eq(personas.id, maquina.personaId));
		// Una falla abierta conserva a quien la traía al fallar (regla 12): solo cambia la máquina.
		await transaccion.update(maquinas).set({ personaId: datos.persona_id }).where(eq(maquinas.id, maquina.id));
		contexto.guardarEvento({
			tipo: "maquina.reasignada",
			datos: { maquina_id: maquina.id },
			tablas: ["maquinas"],
			entidad: "maquinas",
			entidadId: maquina.id,
			entidadFolio: maquina.folio,
		});
		contexto.bitacora({
			descripcion: `Cambió quién trae ${maquina.nombre}: ${antes?.nombre ?? "nadie"} → ${nueva}`,
			entidad: "maquinas",
			entidadId: maquina.id,
			entidadFolio: maquina.folio,
			antes: { persona_id: maquina.personaId },
			despues: { persona_id: datos.persona_id },
		});
		return {
			resultado: { mensaje: `${maquina.nombre} ahora la trae ${nueva}` },
			entidad: { nombre: "maquinas", id: maquina.id },
		};
	},
);
