/**
 * `calidad.opciones_reclamo`: lo que ofrece la ventana «Reclamo nuevo» según lo que se va escribiendo: los clientes
 * externos, la prenda y la talla del código con sus lotes revisados, las notas entregadas a ese cliente con esa
 * prenda, el catálogo de defectos, las operaciones del flujo del lote que suelen causar el defecto con la persona que se
 * propone, la gente del Taller y lo menos que lleva «Qué dice el cliente». Sin saldos ni precios.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Ventanas»: «Reclamo nuevo»)
 *
 * Los lotes son los que Calidad ya revisó con esa talla (regla 2 de docs/modulos/calidad/reclamos-y-devoluciones.md) y
 * la persona, la que propone `produccion.persona_que_la_hizo` (regla 3): las mismas que revisa la acción.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { opcionesDeReclamo } from "@uniformame/compartido/contratos/calidad/consultas-reclamos";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { defectosVigentes, genteDelTaller, parametroNumero, personaPropuesta } from "./comun.ts";

/** La zona del negocio, para pasar un momento a su día. */
const enMexico = sql`'America/Mexico_City'`;

/** Cuántos clientes ofrece a lo más. */
const clientesALoMas = 20;

/** Una opción, como sale de la base. */
const deOpcion = z.object({ id: z.uuid(), nombre: z.string() });

/** Lo que regresa `catalogo.variante_por_codigo`. */
const deLaVariante = z.object({ variante_id: z.uuid(), producto: z.string(), talla: z.string() }).nullable();

/**
 * Los clientes externos vigentes cuyo nombre lleva lo escrito.
 * @param contexto El contexto de la consulta.
 * @param texto Lo que se escribió del cliente.
 */
async function clientes(contexto: ContextoDeConsulta, texto: string | undefined) {
	const filtro = texto === undefined || texto === "" ? sql`true` : sql`t.nombre ILIKE ${`%${texto}%`}`;
	const { rows } = await contexto.base.execute(sql`
		SELECT c.id, t.nombre FROM clientes c JOIN terceros t ON t.id = c.tercero_id
		WHERE c.baja_en IS NULL AND ${filtro} ORDER BY t.nombre LIMIT ${clientesALoMas}`);
	return z.array(deOpcion).parse(rows);
}

/**
 * Los lotes que Calidad ya revisó con esa talla, con su fecha de corte.
 * @param contexto El contexto de la consulta.
 * @param varianteId La talla del código.
 */
async function lotesRevisados(contexto: ContextoDeConsulta, varianteId: string) {
	const { rows } = await contexto.base.execute(sql`
		SELECT l.id, l.folio, (l.cortado_en AT TIME ZONE ${enMexico})::date::text AS cortado
		FROM revisiones rv JOIN revision_tallas rt ON rt.revision_id = rv.id JOIN lotes l ON l.id = rv.lote_id
		WHERE rt.variante_id = ${varianteId} ORDER BY l.cortado_en DESC NULLS LAST, l.folio DESC`);
	return z
		.array(z.object({ id: z.uuid(), folio: z.string(), cortado: z.string().nullable() }))
		.parse(rows)
		.map((lote) => ({
			id: lote.id,
			nombre: lote.cortado === null ? lote.folio : `${lote.folio} · cortado el ${textoDeDiaCorto(lote.cortado)}`,
		}));
}

/**
 * Las notas de entrega entregadas a un cliente con esa talla.
 * @param contexto El contexto de la consulta.
 * @param clienteId El cliente.
 * @param varianteId La talla.
 */
async function notasEntregadas(contexto: ContextoDeConsulta, clienteId: string, varianteId: string) {
	const { rows } = await contexto.base.execute(sql`
		SELECT n.id, n.folio, (n.entregada_en AT TIME ZONE ${enMexico})::date::text AS entregada
		FROM notas_entrega n
		WHERE n.cliente_id = ${clienteId} AND n.estado = 'entregada'
			AND EXISTS (SELECT 1 FROM nota_entrega_lineas x WHERE x.nota_entrega_id = n.id AND x.variante_id = ${varianteId})
		ORDER BY n.entregada_en DESC`);
	return z
		.array(z.object({ id: z.uuid(), folio: z.string(), entregada: z.string().nullable() }))
		.parse(rows)
		.map((nota) => ({
			id: nota.id,
			nombre: nota.entregada === null ? nota.folio : `${nota.folio} · entregada el ${textoDeDiaCorto(nota.entregada)}`,
		}));
}

/**
 * Las operaciones del flujo del lote que suelen causar el defecto, cada una con la persona que se propone en esa talla.
 * @param contexto El contexto de la consulta.
 * @param datos El lote, el defecto y la talla.
 */
async function operaciones(
	contexto: ContextoDeConsulta,
	datos: { loteId: string; defectoId: string; varianteId: string },
) {
	const { rows } = await contexto.base.execute(sql`
		SELECT f.id, o.nombre FROM lotes l
		JOIN flujo_operaciones f ON f.flujo_id = l.flujo_id AND f.baja_en IS NULL JOIN operaciones o ON o.id = f.operacion_id
		JOIN defecto_operaciones d ON d.operacion_id = f.operacion_id AND d.defecto_id = ${datos.defectoId}
			AND d.baja_en IS NULL
		WHERE l.id = ${datos.loteId} ORDER BY f.orden`);
	const suyas = z.array(deOpcion).parse(rows);
	const conPersona = [];
	for (const operacion of suyas) {
		const persona = await personaPropuesta(contexto, {
			lote_id: datos.loteId,
			flujo_operacion_id: operacion.id,
			variante_id: datos.varianteId,
		});
		conPersona.push({ ...operacion, persona_id: persona });
	}
	return conPersona;
}

export const consultaOpcionesReclamo = implementarConsulta(opcionesDeReclamo, async (contexto, parametros) => {
	const codigo = parametros.codigo ?? "";
	const variante = /^\d{6}$/.test(codigo)
		? deLaVariante.parse(await contexto.lectura("catalogo.variante_por_codigo", { codigo }))
		: null;
	const lotes = variante === null ? [] : await lotesRevisados(contexto, variante.variante_id);
	// El lote escogido solo cuenta si es de los revisados de esa talla.
	const lote = lotes.find((uno) => uno.id === parametros.lote_id);
	return {
		resultado: {
			clientes: await clientes(contexto, parametros.cliente_texto),
			prenda:
				variante === null
					? null
					: { variante_id: variante.variante_id, titulo: `${variante.producto} · talla ${variante.talla}` },
			lotes,
			notas:
				variante === null || parametros.cliente_id === undefined
					? []
					: await notasEntregadas(contexto, parametros.cliente_id, variante.variante_id),
			defectos: await defectosVigentes(contexto),
			operaciones:
				variante === null || lote === undefined || parametros.defecto_id === undefined
					? []
					: await operaciones(contexto, {
							loteId: lote.id,
							defectoId: parametros.defecto_id,
							varianteId: variante.variante_id,
						}),
			personas: await genteDelTaller(contexto),
			min_letras: await parametroNumero(contexto, "calidad.reclamo_min_letras"),
		},
	};
});
