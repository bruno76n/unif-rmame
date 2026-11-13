/**
 * Las acciones de la revisión de lotes: `calidad.revisar_lote`, `calidad.aprobar_reproceso` y
 * `calidad.agregar_defecto`.
 * Fase 13 · docs/modulos/calidad/revision-de-lotes.md (reglas 2 a 8 y 10, «Acciones»)
 *
 * Calidad lee el lote y sus tallas sin escribirlos: los bloquea con su versión, y el cambio de etapa lo hace
 * Producción (`produccion.marcar_lote_revisado`). Un registro de la tablet que llega mientras se revisa sube la versión
 * del lote, y la revisión recibe `409` (regla 10).
 */

import { agregarDefecto, aprobarReproceso, revisarLote } from "@uniformame/compartido/contratos/calidad/revision";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { revisarVersion, tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { ErrorDeApi, errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { usuarios } from "../../admin/tablas.ts";
import { personas } from "../../personal/tablas.ts";
import { lotes, operaciones } from "../../produccion/tablas.ts";
import { cosioEnElLote } from "../dominio/quien-revisa.ts";
import { defectoOperaciones, defectos, rechazos, reprocesos, revisiones, revisionTallas } from "../tablas.ts";

/** Lo que se lee del lote para revisarlo. */
const delLote = z.object({
	id: z.uuid(),
	folio: z.string(),
	estado: z.string(),
	flujo_id: z.uuid().nullable(),
	prenda: z.string(),
});

/** Las tallas del lote: su talla, su nombre y sus listas (terminadas). */
const tallasDelLote = z.array(z.object({ variante_id: z.uuid(), talla: z.string(), listas: z.number() }));

/** Un 400 con su código, sobre la lista de rechazos. */
function errorDeLosRechazos(codigo: string, mensaje: string): ErrorDeApi {
	return new ErrorDeApi("validacion", codigo, mensaje, { campos: { rechazos: mensaje } });
}

/**
 * Si la persona de la cuenta que revisa tiene registros vigentes en el lote (regla 6).
 * @returns La persona de la cuenta (o vacío) y si cosió en el lote.
 */
async function quienRevisa(contexto: ContextoDeAccion, loteId: string) {
	const usuarioId = quienCambia(contexto);
	if (usuarioId === null) throw new Error("la revisión la hace una cuenta");
	const [cuenta] = await contexto.transaccion
		.select({ personaId: usuarios.personaId })
		.from(usuarios)
		.where(eq(usuarios.id, usuarioId));
	const personaId = cuenta?.personaId ?? null;
	return { usuarioId, personaId, coso: await cosioEnElLote(contexto.transaccion, personaId, loteId) };
}

/**
 * Revisa los rechazos contra el lote: sin renglones repetidos, de sus tallas, de operaciones de su flujo, con defectos
 * vigentes, personas que existen y sin pasar de las listas de cada talla.
 * @throws `400 renglon_repetido` o `talla_ajena`; `422 operacion_fuera_del_flujo`, `defecto_de_baja` o
 * `rechazos_mas_que_listas`.
 */
async function revisarRechazos(
	contexto: ContextoDeAccion,
	lote: z.infer<typeof delLote>,
	tallas: z.infer<typeof tallasDelLote>,
	pedidos: NonNullable<z.infer<typeof revisarLote.entrada>["rechazos"]>,
) {
	const { transaccion } = contexto;
	const claves = pedidos.map((rechazo) => `${rechazo.defecto_id}|${rechazo.flujo_operacion_id}|${rechazo.variante_id}`);
	if (new Set(claves).size !== claves.length) {
		throw errorDeLosRechazos("renglon_repetido", "Ese defecto ya está en esa operación y esa talla.");
	}
	if (pedidos.some((rechazo) => !tallas.some((talla) => talla.variante_id === rechazo.variante_id))) {
		throw errorDeLosRechazos("talla_ajena", "Esa talla no es del lote.");
	}
	if (pedidos.length === 0) return;
	const { rows } = await transaccion.execute(sql`
		SELECT id FROM flujo_operaciones WHERE flujo_id = ${lote.flujo_id} AND baja_en IS NULL`);
	const delFlujo = new Set(
		z
			.array(z.object({ id: z.uuid() }))
			.parse(rows)
			.map((fila) => fila.id),
	);
	if (pedidos.some((rechazo) => !delFlujo.has(rechazo.flujo_operacion_id))) {
		throw errorDeRegla("operacion_fuera_del_flujo", `Esa operación no es del flujo de ${lote.prenda}.`);
	}
	const defectoIds = [...new Set(pedidos.map((rechazo) => rechazo.defecto_id))];
	const vigentes = await transaccion
		.select({ id: defectos.id })
		.from(defectos)
		.where(and(inArray(defectos.id, defectoIds), isNull(defectos.bajaEn)));
	if (vigentes.length !== defectoIds.length) {
		throw errorDeRegla("defecto_de_baja", "Ese defecto ya no está en el catálogo.");
	}
	const personaIds = [...new Set(pedidos.map((rechazo) => rechazo.persona_id))];
	const existen = await transaccion.select({ id: personas.id }).from(personas).where(inArray(personas.id, personaIds));
	if (existen.length !== personaIds.length) {
		throw errorDeCampo("rechazos", "Escoge quién lo hizo.");
	}
	for (const talla of tallas) {
		const rechazadas = pedidos
			.filter((rechazo) => rechazo.variante_id === talla.variante_id)
			.reduce((suma, rechazo) => suma + rechazo.piezas, 0);
		if (rechazadas > talla.listas) {
			throw errorDeRegla(
				"rechazos_mas_que_listas",
				`En la talla ${talla.talla} hay ${talla.listas} piezas listas: no se pueden rechazar más.`,
			);
		}
	}
}

export const accionRevisarLote = implementarAccion(revisarLote, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const { rows } = await transaccion.execute(sql`
		SELECT l.id, l.folio, l.estado, l.flujo_id, p.nombre AS prenda
		FROM lotes l JOIN productos p ON p.id = l.producto_id WHERE l.id = ${datos.lote_id}`);
	const [leido] = rows;
	if (leido === undefined) throw noExiste();
	const lote = delLote.parse(leido);
	// El lote no cambia mientras se revisa: su versión, con el lote bloqueado (regla 10).
	await revisarVersion(contexto, lotes, lote.id, version, async () => ({ lote_id: lote.id, estado: lote.estado }));
	if (lote.estado !== "terminado") {
		throw errorDeRegla("lote_no_terminado", `${lote.folio} no está terminado: todavía no se revisa.`);
	}
	const { rows: suyas } = await transaccion.execute(sql`
		SELECT lt.variante_id, t.nombre AS talla, lt.piezas_terminadas AS listas
		FROM lote_tallas lt JOIN variantes v ON v.id = lt.variante_id JOIN tallas t ON t.id = v.talla_id
		WHERE lt.lote_id = ${lote.id} AND coalesce(lt.piezas_cortadas, 0) > 0 ORDER BY t.orden`);
	const tallas = tallasDelLote.parse(suyas);
	const pedidos = datos.rechazos ?? [];
	await revisarRechazos(contexto, lote, tallas, pedidos);
	const revisor = await quienRevisa(contexto, lote.id);
	// Revisadas = las listas de cada talla; aprobadas = revisadas − sus rechazos (regla 2).
	const porTalla = tallas.map((talla) => {
		const rechazadas = pedidos
			.filter((rechazo) => rechazo.variante_id === talla.variante_id)
			.reduce((suma, rechazo) => suma + rechazo.piezas, 0);
		return { ...talla, aprobadas: talla.listas - rechazadas };
	});
	const revisadas = porTalla.reduce((suma, talla) => suma + talla.listas, 0);
	const aprobadas = porTalla.reduce((suma, talla) => suma + talla.aprobadas, 0);
	const regresan = revisadas - aprobadas;
	const revisionId = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(revisiones).values({
		id: revisionId,
		loteId: lote.id,
		revisadoPor: revisor.usuarioId,
		personaId: revisor.personaId,
		revisadoEn: contexto.ahora.toString(),
		fecha: contexto.diaDeNegocio.toString(),
		piezasRevisadas: revisadas,
		piezasAprobadas: aprobadas,
		revisoQuienCoso: revisor.coso,
		creadoPor: quien,
	});
	await transaccion.insert(revisionTallas).values(
		porTalla.map((talla) => ({
			id: uuidv7(),
			revisionId,
			varianteId: talla.variante_id,
			piezasRevisadas: talla.listas,
			piezasAprobadas: talla.aprobadas,
			creadoPor: quien,
		})),
	);
	// Cada rechazo nace como un reproceso, con el folio del lote y su número (regla 4).
	const nacidos: { reproceso_id: string; folio: string; piezas: number }[] = [];
	for (const [i, rechazo] of pedidos.entries()) {
		const rechazoId = uuidv7();
		await transaccion.insert(rechazos).values({
			id: rechazoId,
			revisionId,
			defectoId: rechazo.defecto_id,
			flujoOperacionId: rechazo.flujo_operacion_id,
			personaId: rechazo.persona_id,
			varianteId: rechazo.variante_id,
			piezas: rechazo.piezas,
			creadoPor: quien,
		});
		const reproceso = { reproceso_id: uuidv7(), folio: `${lote.folio}-R${i + 1}`, piezas: rechazo.piezas };
		await transaccion.insert(reprocesos).values({
			id: reproceso.reproceso_id,
			folio: reproceso.folio,
			rechazoId,
			loteId: lote.id,
			creadoPor: quien,
		});
		nacidos.push(reproceso);
	}
	await contexto.interna("produccion.marcar_lote_revisado", { lote_id: lote.id, revision_id: revisionId });
	if (nacidos.length > 0) {
		contexto.guardarEvento({
			tipo: "reproceso.creado",
			datos: { lote_id: lote.id, reproceso_ids: nacidos.map((reproceso) => reproceso.reproceso_id).join(",") },
			tablas: ["reprocesos"],
			entidad: "lotes",
			entidadId: lote.id,
			entidadFolio: lote.folio,
		});
	}
	contexto.bitacora({
		descripcion: `Revisó ${lote.folio}: ${aprobadas} aprobadas, ${regresan} a reproceso${revisor.coso ? " · revisó quien cosió en el lote" : ""}`,
		entidad: "revisiones",
		entidadId: revisionId,
		entidadFolio: lote.folio,
		despues: {
			aprobadas: porTalla.map((talla) => ({ variante_id: talla.variante_id, piezas: talla.aprobadas })),
			rechazos: pedidos,
		},
	});
	return {
		resultado: {
			mensaje: `${lote.folio}: ${aprobadas} aprobadas pasan a aduana${regresan > 0 ? `, ${regresan} regresan al taller` : ""}`,
			revision_id: revisionId,
			piezas_aprobadas: aprobadas,
			reprocesos: nacidos,
		},
		avisos: revisor.coso ? ["Cosiste en este lote: la revisión queda marcada"] : [],
		entidad: { nombre: "revisiones", id: revisionId },
	};
});

export const accionAprobarReproceso = implementarAccion(aprobarReproceso, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const [reproceso] = await transaccion
		.select({
			id: reprocesos.id,
			folio: reprocesos.folio,
			estado: reprocesos.estado,
			loteId: reprocesos.loteId,
			piezas: rechazos.piezas,
		})
		.from(reprocesos)
		.innerJoin(rechazos, eq(rechazos.id, reprocesos.rechazoId))
		.where(eq(reprocesos.id, datos.reproceso_id));
	if (reproceso === undefined) throw noExiste();
	await tomarVersion(contexto, reprocesos, reproceso.id, version, async () => ({
		reproceso_id: reproceso.id,
		estado: reproceso.estado,
	}));
	if (reproceso.estado === "listo") throw errorDeRegla("reproceso_ya_listo", "Ese reproceso ya está aprobado.");
	const [lote] = await transaccion
		.select({ folio: lotes.folio, estado: lotes.estado })
		.from(lotes)
		.where(eq(lotes.id, reproceso.loteId));
	if (lote === undefined) throw noExiste();
	// Se aprueba solo con el lote ya en aduana, y completo: sin paso en la tablet y sin merma (regla 7).
	if (lote.estado !== "en_aduana") {
		throw errorDeRegla("lote_no_recibido", `Aduana todavía no recibe ${lote.folio}: el reproceso se aprueba después.`);
	}
	await transaccion
		.update(reprocesos)
		.set({
			estado: "listo",
			aprobadoEn: contexto.ahora.toString(),
			aprobadoPor: quienCambia(contexto),
			piezasAprobadas: reproceso.piezas,
			piezasMerma: 0,
		})
		.where(eq(reprocesos.id, reproceso.id));
	contexto.guardarEvento({
		tipo: "reproceso.aprobado",
		datos: { reproceso_id: reproceso.id, lote_id: reproceso.loteId },
		tablas: ["reprocesos"],
		entidad: "reprocesos",
		entidadId: reproceso.id,
		entidadFolio: reproceso.folio,
	});
	contexto.bitacora({
		descripcion: `Aprobó el reproceso ${reproceso.folio}: ${reproceso.piezas} piezas`,
		entidad: "reprocesos",
		entidadId: reproceso.id,
		entidadFolio: reproceso.folio,
		antes: { estado: "en_reproceso" },
		despues: { estado: "listo", piezas_aprobadas: reproceso.piezas, piezas_merma: 0 },
	});
	const piezas = reproceso.piezas === 1 ? "1 pieza" : `${reproceso.piezas} piezas`;
	return {
		resultado: {
			// «para {pedido}» llega con los pedidos (fase 16).
			mensaje: `${piezas} de ${lote.folio} aprobadas: pasan a aduana`,
			piezas: reproceso.piezas,
		},
		entidad: { nombre: "reprocesos", id: reproceso.id },
	};
});

export const accionAgregarDefecto = implementarAccion(agregarDefecto, async (contexto, datos) => {
	const { transaccion } = contexto;
	const [repetido] = await transaccion
		.select({ id: defectos.id })
		.from(defectos)
		.where(sql`lower(${defectos.nombre}) = lower(${datos.nombre})`);
	if (repetido !== undefined) throw errorDeRegla("defecto_repetido", "Ese defecto ya está en el catálogo.");
	const operacionIds = [...new Set(datos.operacion_ids)];
	const vigentes = await transaccion
		.select({ id: operaciones.id, nombre: operaciones.nombre })
		.from(operaciones)
		.where(and(inArray(operaciones.id, operacionIds), isNull(operaciones.bajaEn)));
	if (vigentes.length !== operacionIds.length) {
		throw errorDeRegla("operacion_de_baja", "Esa operación ya no está en el catálogo.");
	}
	const defectoId = uuidv7();
	const quien = quienCambia(contexto);
	// Dos que agregan el mismo nombre a la vez: el único sin mayúsculas deja pasar a uno.
	await transaccion
		.insert(defectos)
		.values({ id: defectoId, nombre: datos.nombre, creadoPor: quien })
		.onConflictDoNothing();
	const [nacido] = await transaccion.select({ id: defectos.id }).from(defectos).where(eq(defectos.id, defectoId));
	if (nacido === undefined) throw errorDeRegla("defecto_repetido", "Ese defecto ya está en el catálogo.");
	await transaccion
		.insert(defectoOperaciones)
		.values(operacionIds.map((operacionId) => ({ id: uuidv7(), defectoId, operacionId, creadoPor: quien })));
	contexto.guardarEvento({
		tipo: "defecto.creado",
		datos: { defecto_id: defectoId },
		tablas: ["defectos", "defecto_operaciones"],
		entidad: "defectos",
		entidadId: defectoId,
	});
	contexto.bitacora({
		descripcion: `Agregó el defecto ${datos.nombre}: ${vigentes.map((operacion) => operacion.nombre).join(", ")}`,
		entidad: "defectos",
		entidadId: defectoId,
		despues: { nombre: datos.nombre, operacion_ids: operacionIds },
	});
	return {
		resultado: { mensaje: `${datos.nombre} agregado: ya se puede escoger al revisar`, defecto_id: defectoId },
		entidad: { nombre: "defectos", id: defectoId },
	};
});
