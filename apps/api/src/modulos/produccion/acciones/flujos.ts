/**
 * Las acciones de los flujos: `produccion.crear_flujo`, `produccion.agregar_operacion_flujo` y
 * `produccion.quitar_operacion_flujo`.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md (reglas 2, 3, 6, 7, 8 y 9, «Acciones»)
 *
 * El flujo es un agregado: agregar o quitar una operación toma su versión, y las siguientes recorren su orden (el
 * único del orden se revisa al final de la transacción). El candado de los lotes en proceso llega con los lotes, en la
 * parte 2 de la fase (decisión 591).
 */

import {
	agregarOperacionFlujo,
	crearFlujo,
	quitarOperacionFlujo,
} from "@uniformame/compartido/contratos/produccion/flujos";
import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import {
	listaParaBitacora,
	type OperacionDelFlujo,
	operacionDeCorte,
	operacionesDelFlujo,
	operacionPorNombre,
	revisarPersonaDelTaller,
} from "../dominio/flujos.ts";
import { flujoOperaciones, flujos } from "../tablas.ts";

/** Lo que pide crear un flujo. */
type PedidoDeFlujo = z.infer<typeof crearFlujo.entrada>;

/** Una operación que entra a un flujo nuevo: su operación del catálogo, quién la hace y, si se copió, de cuál. */
interface QueEntra {
	operacionId: string;
	personaBaseId: string;
	origenId?: string;
}

/**
 * Las operaciones del flujo nuevo, con su orden y su persona: las vigentes del origen, o el corte y las de
 * `produccion.flujo_una_sola_operacion` (regla 6).
 * @returns Las operaciones y cómo se llama de dónde parte, para la bitácora.
 * @throws `400` si falta de cuál parte o quién la hace; `422 flujo_origen_de_baja`; `422 persona_no_valida`.
 */
async function lasQueEntran(
	contexto: ContextoDeAccion,
	datos: PedidoDeFlujo,
): Promise<{ entran: QueEntra[]; origen: { id: string; nombre: string } | undefined }> {
	if (datos.parte_de === "flujo") {
		if (datos.flujo_origen_id === undefined) throw errorDeCampo("flujo_origen_id", "Escoge de cuál parte.");
		// Con `FOR SHARE`: mientras se copia, nadie cambia sus operaciones.
		const [origen] = await contexto.transaccion
			.select({ id: flujos.id, nombre: flujos.nombre, bajaEn: flujos.bajaEn })
			.from(flujos)
			.where(eq(flujos.id, datos.flujo_origen_id))
			.for("share");
		if (origen === undefined) throw errorDeCampo("flujo_origen_id", "Escoge de cuál parte.");
		if (origen.bajaEn !== null) throw errorDeRegla("flujo_origen_de_baja", "Ese flujo está dado de baja.");
		const suyas = await operacionesDelFlujo(contexto, origen.id);
		return {
			entran: suyas.map((suya) => ({
				operacionId: suya.operacionId,
				personaBaseId: suya.personaBaseId,
				origenId: suya.flujoOperacionId,
			})),
			origen,
		};
	}
	if (datos.persona_corte_id === undefined) throw errorDeCampo("persona_corte_id", "¿Quién corta?");
	if (datos.persona_base_id === undefined) throw errorDeCampo("persona_base_id", "¿Quién la hace?");
	await revisarPersonaDelTaller(contexto, datos.persona_corte_id);
	await revisarPersonaDelTaller(contexto, datos.persona_base_id);
	const corte = await operacionDeCorte(contexto);
	const parametro = String(await contexto.lectura("admin.parametro", { clave: "produccion.flujo_una_sola_operacion" }));
	const nombres = [...new Set(parametro.split(",").map((nombre) => nombre.trim()))].filter(
		(nombre) => nombre.length > 0,
	);
	const demas: QueEntra[] = [];
	for (const nombre of nombres) {
		const operacion = await operacionPorNombre(contexto, nombre);
		if (!operacion.esCorte) demas.push({ operacionId: operacion.id, personaBaseId: datos.persona_base_id });
	}
	return { entran: [{ operacionId: corte.id, personaBaseId: datos.persona_corte_id }, ...demas], origen: undefined };
}

export const accionCrearFlujo = implementarAccion(crearFlujo, async (contexto, datos) => {
	const { transaccion } = contexto;
	const { entran, origen } = await lasQueEntran(contexto, datos);
	const flujoId = uuidv7();
	const quien = quienCambia(contexto);
	const [creado] = await transaccion
		.insert(flujos)
		.values({ id: flujoId, nombre: datos.nombre, copiadoDeFlujoId: origen?.id ?? null, creadoPor: quien })
		.onConflictDoNothing()
		.returning({ id: flujos.id });
	if (creado === undefined) throw errorDeRegla("flujo_repetido", "Ya hay un flujo con ese nombre.");
	const nuevas = entran.map((entra, i) => ({ ...entra, id: uuidv7(), orden: i + 1 }));
	await transaccion.insert(flujoOperaciones).values(
		nuevas.map((nueva) => ({
			id: nueva.id,
			flujoId,
			operacionId: nueva.operacionId,
			orden: nueva.orden,
			personaBaseId: nueva.personaBaseId,
			creadoPor: quien,
		})),
	);
	// Personal copia las tarifas del origen en la misma transacción; quien crea el flujo no las ve.
	if (origen !== undefined) {
		await contexto.interna("personal.copiar_tarifas_flujo", {
			flujo_origen_id: origen.id,
			flujo_id: flujoId,
			origen: origen.nombre,
			flujo: datos.nombre,
			operaciones: nuevas.flatMap((nueva) =>
				nueva.origenId === undefined ? [] : [{ origen_id: nueva.origenId, nueva_id: nueva.id }],
			),
		});
	}
	const lista = await operacionesDelFlujo(contexto, flujoId);
	contexto.bitacora({
		descripcion: `Creó el flujo ${datos.nombre} a partir de ${origen?.nombre ?? "una sola operación"}`,
		entidad: "flujos",
		entidadId: flujoId,
		despues: { operaciones: listaParaBitacora(lista) },
	});
	contexto.guardarEvento({
		tipo: "flujo.creado",
		datos: { flujo_id: flujoId },
		tablas: ["flujos", "flujo_operaciones", "operaciones"],
		entidad: "flujos",
		entidadId: flujoId,
	});
	return {
		resultado: {
			flujo_id: flujoId,
			operaciones: lista.map((suya) => ({
				flujo_operacion_id: suya.flujoOperacionId,
				operacion_id: suya.operacionId,
				nombre: suya.nombre,
				orden: suya.orden,
				persona_base_id: suya.personaBaseId,
			})),
			mensaje: `Flujo «${datos.nombre}» creado con ${lista.length} operaciones. Se escoge al dar de alta un producto`,
			version: await versionActual(transaccion, flujos, flujoId),
		},
		entidad: { nombre: "flujos", id: flujoId },
	};
});

/**
 * Toma la versión de un flujo y lo lee.
 * @throws `404` si no existe; `409` si alguien lo cambió.
 */
async function tomarFlujo(contexto: ContextoDeAccion, flujoId: string, version: number | undefined) {
	const [flujo] = await contexto.transaccion.select().from(flujos).where(eq(flujos.id, flujoId));
	if (flujo === undefined) throw noExiste();
	await tomarVersion(contexto, flujos, flujo.id, version, async () => ({ flujo_id: flujo.id, nombre: flujo.nombre }));
	return flujo;
}

/** La bitácora y el evento de un flujo que cambió sus operaciones. */
function flujoCambiado(
	contexto: ContextoDeAccion,
	flujo: { id: string; nombre: string },
	descripcion: string,
	antes: readonly OperacionDelFlujo[],
	despues: readonly OperacionDelFlujo[],
) {
	contexto.bitacora({
		descripcion,
		entidad: "flujos",
		entidadId: flujo.id,
		antes: { operaciones: listaParaBitacora(antes) },
		despues: { operaciones: listaParaBitacora(despues) },
	});
	contexto.guardarEvento({
		tipo: "flujo.cambiado",
		datos: { flujo_id: flujo.id },
		tablas: ["flujos", "flujo_operaciones", "operaciones"],
		entidad: "flujos",
		entidadId: flujo.id,
	});
}

export const accionAgregarOperacionFlujo = implementarAccion(
	agregarOperacionFlujo,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		const flujo = await tomarFlujo(contexto, datos.flujo_id, version);
		await revisarPersonaDelTaller(contexto, datos.persona_base_id);
		const antes = await operacionesDelFlujo(contexto, flujo.id);
		const despuesDe = antes.find((suya) => suya.flujoOperacionId === datos.va_antes_de_id);
		if (despuesDe === undefined) throw errorDeCampo("va_antes_de_id", "Escoge antes de cuál va.");
		if (despuesDe.esCorte) throw errorDeRegla("corte_va_primero", "El corte siempre va primero");
		const operacion = await operacionPorNombre(contexto, datos.operacion);
		if (antes.some((suya) => suya.operacionId === operacion.id)) {
			throw errorDeRegla("operacion_ya_en_flujo", "Ya está en este flujo.");
		}
		// Entra con el orden de la que va después, y las siguientes recorren uno.
		await transaccion
			.update(flujoOperaciones)
			.set({ orden: sql`${flujoOperaciones.orden} + 1` })
			.where(
				and(
					eq(flujoOperaciones.flujoId, flujo.id),
					isNull(flujoOperaciones.bajaEn),
					gte(flujoOperaciones.orden, despuesDe.orden),
				),
			);
		const flujoOperacionId = uuidv7();
		await transaccion.insert(flujoOperaciones).values({
			id: flujoOperacionId,
			flujoId: flujo.id,
			operacionId: operacion.id,
			orden: despuesDe.orden,
			personaBaseId: datos.persona_base_id,
			creadoPor: quienCambia(contexto),
		});
		const despues = await operacionesDelFlujo(contexto, flujo.id);
		flujoCambiado(
			contexto,
			flujo,
			`Agregó ${operacion.nombre} a ${flujo.nombre}, antes de ${despuesDe.nombre}`,
			antes,
			despues,
		);
		return {
			resultado: {
				flujo_operacion_id: flujoOperacionId,
				mensaje: `${operacion.nombre} agregada a ${flujo.nombre}. La tarifa la pone Personal`,
				version: await versionActual(transaccion, flujos, flujo.id),
			},
			entidad: { nombre: "flujos", id: flujo.id },
		};
	},
);

export const accionQuitarOperacionFlujo = implementarAccion(quitarOperacionFlujo, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const [suya] = await transaccion
		.select({ flujoId: flujoOperaciones.flujoId, bajaEn: flujoOperaciones.bajaEn })
		.from(flujoOperaciones)
		.where(eq(flujoOperaciones.id, datos.flujo_operacion_id));
	if (suya === undefined || suya.bajaEn !== null) throw noExiste();
	const flujo = await tomarFlujo(contexto, suya.flujoId, version);
	const antes = await operacionesDelFlujo(contexto, flujo.id);
	const sale = antes.find((operacion) => operacion.flujoOperacionId === datos.flujo_operacion_id);
	if (sale === undefined) throw noExiste();
	if (sale.esCorte) throw errorDeRegla("corte_va_primero", "El corte siempre va primero");
	if (antes.length <= 2) throw errorDeRegla("flujo_minimo", "Un flujo lleva al menos el corte y una operación");
	// Quitar no borra: queda dada de baja, y las siguientes bajan uno su orden.
	await transaccion
		.update(flujoOperaciones)
		.set({ bajaEn: contexto.ahora.toString(), bajaPor: quienCambia(contexto), motivoBaja: "Quitada del flujo" })
		.where(eq(flujoOperaciones.id, sale.flujoOperacionId));
	await transaccion
		.update(flujoOperaciones)
		.set({ orden: sql`${flujoOperaciones.orden} - 1` })
		.where(
			and(
				eq(flujoOperaciones.flujoId, flujo.id),
				isNull(flujoOperaciones.bajaEn),
				gt(flujoOperaciones.orden, sale.orden),
			),
		);
	const despues = await operacionesDelFlujo(contexto, flujo.id);
	flujoCambiado(contexto, flujo, `Quitó ${sale.nombre} de ${flujo.nombre}`, antes, despues);
	return {
		resultado: {
			mensaje: `${sale.nombre} quitada de ${flujo.nombre}`,
			version: await versionActual(transaccion, flujos, flujo.id),
		},
		entidad: { nombre: "flujos", id: flujo.id },
	};
});
