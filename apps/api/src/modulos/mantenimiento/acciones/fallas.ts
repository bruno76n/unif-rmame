/**
 * Las acciones de las fallas y los servicios: `mantenimiento.reportar_falla` (de Mantenimiento o de la tablet, por su
 * cola), `mantenimiento.mandar_a_reparacion`, `mantenimiento.guardar_nota_seguimiento` y
 * `mantenimiento.registrar_servicio`.
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (reglas 4, 5, 8 a 10, «Acciones»)
 * Fase 17 · un servicio con costo pide su gasto a Contaduría (`contaduria.registrar_gasto_mantenimiento`)
 *
 * Una máquina tiene a lo más una falla abierta: el reporte bloquea la máquina y un único parcial lo respalda. Desde la
 * tablet, lo que no se puede aplicar (la máquina ya tiene falla abierta o está de baja) se aplica sin crear la falla y
 * el resultado lo dice; desde Mantenimiento es un error.
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import {
	guardarNotaSeguimiento,
	mandarAReparacion,
	registrarServicio,
	reportarFalla,
} from "@uniformame/compartido/contratos/mantenimiento/maquinas";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { revisarVersion, tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { usuarios } from "../../admin/tablas.ts";
import { personas } from "../../personal/tablas.ts";
import { maquinaBloqueada, tecnicoDe } from "../dominio/maquinas.ts";
import { fallas, maquinas, motivosFalla, servicios } from "../tablas.ts";

/** Toma un folio del contador. */
async function folioDe(contexto: ContextoDeAccion, tipo: "falla" | "servicio"): Promise<string> {
	return z.object({ folio: z.string() }).parse(await contexto.interna("admin.tomar_folio", { tipo })).folio;
}

/** Quién reporta: en la tablet, la persona que entró con su PIN; en Mantenimiento, la persona de la cuenta. */
async function quienReporta(contexto: ContextoDeAccion): Promise<{ personaId: string | null; nombre: string }> {
	const { quien, transaccion } = contexto;
	const personaId =
		quien.tipo === "aparato"
			? (quien.personaId ?? null)
			: ((
					await transaccion
						.select({ personaId: usuarios.personaId })
						.from(usuarios)
						.where(eq(usuarios.id, quienCambia(contexto) ?? ""))
				)[0]?.personaId ?? null);
	if (personaId === null) return { personaId, nombre: "Mantenimiento" };
	const [persona] = await transaccion
		.select({ nombre: personas.nombre })
		.from(personas)
		.where(eq(personas.id, personaId));
	return { personaId, nombre: persona?.nombre ?? "Mantenimiento" };
}

/** Una falla bloqueada con su máquina, para cambiarla con su versión. */
async function fallaConSuMaquina(contexto: ContextoDeAccion, fallaId: string, version: number | undefined) {
	const [falla] = await contexto.transaccion
		.select({
			id: fallas.id,
			folio: fallas.folio,
			estado: fallas.estado,
			detuvo: fallas.detuvoMaquina,
			paradaDesde: fallas.paradaDesde,
			nota: fallas.notaSeguimiento,
			maquinaId: fallas.maquinaId,
			maquina: maquinas.nombre,
			maquinaFolio: maquinas.folio,
		})
		.from(fallas)
		.innerJoin(maquinas, eq(maquinas.id, fallas.maquinaId))
		.where(eq(fallas.id, fallaId));
	if (falla === undefined) throw noExiste();
	await tomarVersion(contexto, fallas, falla.id, version, async () => ({ falla_id: falla.id, estado: falla.estado }));
	return falla;
}

export const accionReportarFalla = implementarAccion(reportarFalla, async (contexto, datos) => {
	const { transaccion, quien } = contexto;
	const desdeLaTablet = quien.tipo === "aparato";
	const [motivo] = await transaccion
		.select({ nombre: motivosFalla.nombre, detiene: motivosFalla.detieneMaquina, bajaEn: motivosFalla.bajaEn })
		.from(motivosFalla)
		.where(eq(motivosFalla.id, datos.motivo_falla_id));
	// Un motivo dado de baja después de bajar a la tablet se acepta; en la web, no.
	if (motivo === undefined || (!desdeLaTablet && motivo.bajaEn !== null)) {
		throw errorDeCampo("motivo_falla_id", "Escoge qué tiene");
	}
	const [existe] = await transaccion
		.select({ id: maquinas.id })
		.from(maquinas)
		.where(eq(maquinas.id, datos.maquina_id));
	if (existe === undefined) throw errorDeCampo("maquina_id", "Escoge la máquina");
	const maquina = await maquinaBloqueada(contexto, datos.maquina_id);
	const [abierta] = await transaccion
		.select({ folio: fallas.folio, estado: fallas.estado, hechoEn: fallas.hechoEn })
		.from(fallas)
		.where(and(eq(fallas.maquinaId, maquina.id), ne(fallas.estado, "resuelta")));
	// De la tablet, lo que no se puede aplicar se aplica sin crear la falla, y el resultado lo dice (regla 4).
	if (maquina.bajaEn !== null && !desdeLaTablet) {
		throw errorDeRegla("maquina_ya_de_baja", `${maquina.nombre} está dada de baja.`);
	}
	if (abierta !== undefined && !desdeLaTablet) {
		throw errorDeRegla("maquina_con_falla_abierta", `${maquina.nombre} ya tiene una falla abierta en Mantenimiento`);
	}
	const reporta = await quienReporta(contexto);
	// De la tablet, la falla la reporta la persona que entró con su PIN: sin ella, se aparta.
	if (desdeLaTablet && reporta.personaId === null) throw errorDeRegla("persona_no_valida", "¿Quién la reporta?");
	if (maquina.bajaEn !== null || abierta !== undefined) {
		const mensaje =
			abierta === undefined
				? `${maquina.nombre} está dada de baja`
				: `Ya está reportada: ${abierta.folio}, ${abierta.estado === "reportada" ? "reportada" : "en reparación"}`;
		contexto.bitacora({
			descripcion: `${reporta.nombre} reportó falla en ${maquina.nombre}: ${motivo.nombre}. ${mensaje}`,
			entidad: "maquinas",
			entidadId: maquina.id,
			entidadFolio: maquina.folio,
			despues: { motivo: motivo.nombre, sin_falla_nueva: true },
		});
		return { resultado: { mensaje, falla_id: null, folio: abierta?.folio ?? null, detuvo_maquina: false } };
	}
	const folio = await folioDe(contexto, "falla");
	// El id lo hace la tablet; en la web, el servidor.
	const fallaId = desdeLaTablet ? (datos.id ?? uuidv7()) : uuidv7();
	const hechoEn = contexto.ahora.toString();
	await transaccion.insert(fallas).values({
		id: fallaId,
		folio,
		maquinaId: maquina.id,
		motivoFallaId: datos.motivo_falla_id,
		nota: desdeLaTablet || datos.nota === undefined || datos.nota === "" ? null : datos.nota,
		origen: desdeLaTablet ? "tablet" : "mantenimiento",
		reportoPersonaId: reporta.personaId,
		// La falla guarda quién traía la máquina al fallar (regla 12).
		personaAsignadaId: maquina.personaId,
		dispositivoId: quien.tipo === "aparato" ? quien.dispositivoId : null,
		claveIdempotencia: desdeLaTablet ? (contexto.claveIdempotencia ?? null) : null,
		hechoEn,
		fecha: contexto.diaDeNegocio.toString(),
		sinInternet: desdeLaTablet && datos.sin_internet === true,
		detuvoMaquina: motivo.detiene,
		paradaDesde: motivo.detiene ? hechoEn : null,
		creadoPor: quienCambia(contexto),
	});
	contexto.guardarEvento({
		tipo: "falla.reportada",
		datos: { falla_id: fallaId, maquina_id: maquina.id },
		tablas: ["fallas"],
		entidad: "fallas",
		entidadId: fallaId,
		entidadFolio: folio,
	});
	contexto.bitacora({
		descripcion: `${reporta.nombre} reportó falla en ${maquina.nombre}: ${motivo.nombre}`,
		entidad: "fallas",
		entidadId: fallaId,
		entidadFolio: folio,
		despues: { maquina_id: maquina.id, motivo: motivo.nombre, detuvo_maquina: motivo.detiene },
	});
	return {
		resultado: {
			mensaje: `${folio}: ${maquina.nombre} ${motivo.detiene ? "parada" : "trabaja con falla"}`,
			falla_id: fallaId,
			folio,
			detuvo_maquina: motivo.detiene,
		},
		entidad: { nombre: "fallas", id: fallaId },
	};
});

export const accionMandarAReparacion = implementarAccion(mandarAReparacion, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const falla = await fallaConSuMaquina(contexto, datos.falla_id, version);
	if (falla.estado !== "reportada") {
		throw errorDeRegla(
			"falla_no_reportada",
			`${falla.folio} ya está ${falla.estado === "en_reparacion" ? "en reparación" : "resuelta"}.`,
		);
	}
	// Una que ya estaba parada sigue así hasta registrar la reparación (regla 5).
	if (falla.detuvo && !datos.se_queda_parada) {
		throw errorDeRegla("ya_estaba_parada", `${falla.maquina} ya está parada: sigue así hasta registrar la reparación.`);
	}
	const tecnico = await tecnicoDe(contexto, datos);
	const ahora = contexto.ahora.toString();
	const seParaAhora = !falla.detuvo && datos.se_queda_parada;
	await transaccion
		.update(fallas)
		.set({
			estado: "en_reparacion",
			tecnicoId: tecnico.id,
			mandadaAReparacionEn: ahora,
			mandadaPor: quienCambia(contexto),
			...(seParaAhora ? { detuvoMaquina: true, paradaDesde: ahora } : {}),
		})
		.where(eq(fallas.id, falla.id));
	contexto.guardarEvento({
		tipo: "falla.en_reparacion",
		datos: { falla_id: falla.id, maquina_id: falla.maquinaId },
		tablas: ["fallas"],
		entidad: "fallas",
		entidadId: falla.id,
		entidadFolio: falla.folio,
	});
	contexto.bitacora({
		descripcion: `Mandó ${falla.folio} a reparación con ${tecnico.nombre}${seParaAhora ? ", la máquina queda parada" : ""}`,
		entidad: "fallas",
		entidadId: falla.id,
		entidadFolio: falla.folio,
		antes: { estado: "reportada" },
		despues: { estado: "en_reparacion", tecnico_id: tecnico.id, se_queda_parada: datos.se_queda_parada },
	});
	return {
		resultado: { mensaje: `${falla.folio} en reparación con ${tecnico.nombre}`, tecnico_id: tecnico.id },
		entidad: { nombre: "fallas", id: falla.id },
	};
});

export const accionGuardarNotaSeguimiento = implementarAccion(
	guardarNotaSeguimiento,
	async (contexto, datos, version) => {
		const falla = await fallaConSuMaquina(contexto, datos.falla_id, version);
		if (falla.estado === "resuelta") throw errorDeRegla("falla_resuelta", "Esa falla ya está resuelta.");
		const nota = datos.nota === "" ? null : datos.nota;
		await contexto.transaccion.update(fallas).set({ notaSeguimiento: nota }).where(eq(fallas.id, falla.id));
		contexto.guardarEvento({
			tipo: "falla.nota_cambiada",
			datos: { falla_id: falla.id },
			tablas: ["fallas"],
			entidad: "fallas",
			entidadId: falla.id,
			entidadFolio: falla.folio,
		});
		contexto.bitacora({
			descripcion: `Cambió la nota de seguimiento de ${falla.folio}`,
			entidad: "fallas",
			entidadId: falla.id,
			entidadFolio: falla.folio,
			antes: { nota: falla.nota },
			despues: { nota },
		});
		return { resultado: { mensaje: `Nota guardada en ${falla.folio}` }, entidad: { nombre: "fallas", id: falla.id } };
	},
);

/** Lo que regresa `contaduria.registrar_gasto_mantenimiento`. */
const gastoRegistrado = z.object({ gasto_id: z.uuid(), folio: z.string(), categoria: z.string() });

export const accionRegistrarServicio = implementarAccion(registrarServicio, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	// Una reparación resuelve su falla (con su versión); uno suelto va a una máquina activa (regla 10).
	const falla = datos.falla_id === undefined ? undefined : await fallaConSuMaquina(contexto, datos.falla_id, version);
	if (falla?.estado === "resuelta") throw errorDeRegla("falla_resuelta", "Esa falla ya está resuelta.");
	const maquinaId = falla?.maquinaId ?? datos.maquina_id;
	if (maquinaId === undefined) throw errorDeCampo("maquina_id", "Escoge la máquina.");
	const maquina = await maquinaBloqueada(contexto, maquinaId);
	// Un servicio suelto toma la versión de su máquina (decisión 628).
	if (falla === undefined) {
		await revisarVersion(contexto, maquinas, maquina.id, version, async () => ({
			maquina_id: maquina.id,
			baja_en: maquina.bajaEn,
		}));
	}
	if (falla === undefined && maquina.bajaEn !== null) {
		throw errorDeRegla("maquina_ya_de_baja", `${maquina.nombre} ya está dada de baja.`);
	}
	const tecnico = await tecnicoDe(contexto, { tecnico_id: datos.tecnico_id });
	const folio = await folioDe(contexto, "servicio");
	const servicioId = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(servicios).values({
		id: servicioId,
		folio,
		maquinaId: maquina.id,
		fallaId: falla?.id ?? null,
		tecnicoId: tecnico.id,
		fecha: contexto.diaDeNegocio.toString(),
		queSeHizo: datos.que_se_hizo,
		costoCentavos: datos.costo_centavos,
		horasParo: datos.horas_paro,
		creadoPor: quien,
	});
	if (falla !== undefined) {
		await transaccion
			.update(fallas)
			.set({ estado: "resuelta", resueltaEn: contexto.ahora.toString(), resueltaPor: quien, notaSeguimiento: null })
			.where(eq(fallas.id, falla.id));
		contexto.guardarEvento({
			tipo: "falla.resuelta",
			datos: { falla_id: falla.id, maquina_id: maquina.id },
			tablas: ["fallas"],
			entidad: "fallas",
			entidadId: falla.id,
			entidadFolio: falla.folio,
		});
	}
	// Con costo, Contaduría registra su gasto y el servicio guarda cuál es (decisión 709).
	const gasto =
		datos.costo_centavos > 0
			? gastoRegistrado.parse(
					await contexto.interna("contaduria.registrar_gasto_mantenimiento", {
						servicio_id: servicioId,
						maquina_id: maquina.id,
						fecha: contexto.diaDeNegocio.toString(),
						costo_centavos: datos.costo_centavos,
					}),
				)
			: undefined;
	if (gasto !== undefined) {
		await transaccion.update(servicios).set({ gastoId: gasto.gasto_id }).where(eq(servicios.id, servicioId));
	}
	contexto.guardarEvento({
		tipo: "servicio.registrado",
		datos: { servicio_id: servicioId, maquina_id: maquina.id },
		tablas: ["servicios"],
		entidad: "servicios",
		entidadId: servicioId,
		entidadFolio: folio,
	});
	contexto.bitacora({
		descripcion:
			falla === undefined
				? `Registró el servicio ${folio} a ${maquina.nombre}`
				: `Registró la reparación de ${maquina.nombre} (${falla.folio}): ${datos.que_se_hizo}, ${centavosATexto(centavos(datos.costo_centavos), { conCentavos: datos.costo_centavos % 100 !== 0 })}, ${datos.horas_paro} h de paro`,
		entidad: "servicios",
		entidadId: servicioId,
		entidadFolio: folio,
		despues: { ...datos, folio },
	});
	if (gasto !== undefined) {
		contexto.bitacora({
			descripcion: `Registró el gasto ${gasto.folio}: ${gasto.categoria}, ${centavosATexto(centavos(datos.costo_centavos), { conCentavos: datos.costo_centavos % 100 !== 0 })} (${maquina.nombre}, ${folio})`,
			entidad: "gastos",
			entidadId: gasto.gasto_id,
			entidadFolio: gasto.folio,
		});
	}
	const horas = datos.horas_paro === 1 ? "1 hora" : `${datos.horas_paro} horas`;
	return {
		resultado: {
			mensaje:
				falla === undefined
					? `${folio} registrado`
					: `${maquina.nombre} vuelve a trabajar. ${horas} de paro quedan registradas`,
			servicio_id: servicioId,
			folio,
		},
		entidad: { nombre: "servicios", id: servicioId },
	};
});
