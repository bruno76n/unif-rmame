/**
 * `calidad.reclamos` y `calidad.buscar`: la pestaña Reclamos. La lista (primero los por resolver, luego los más
 * nuevos, con «Ver más») con el rastreo del escogido en sus cinco pasos, y el buscador por folio del reclamo, folio del
 * lote o código de la prenda. Sin costos ni tarifas.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Reclamos»)
 *
 * El rastreo se calcula, no se guarda (regla 5 de docs/modulos/calidad/reclamos-y-devoluciones.md): lo arma
 * `rastreoDeReclamo`, el mismo que regresa `calidad.registrar_reclamo`, con `contexto.comoAccion`.
 */

import { diaDeNegocio, textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { buscarDeCalidad, reclamosDeCalidad } from "@uniformame/compartido/contratos/calidad/consultas-reclamos";
import { type SQL, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { leerCursor, paginar } from "../../../nucleo/http/consultas.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { rastreoDeReclamo } from "../dominio/rastreo.ts";
import { textoDePiezas } from "./comun.ts";

/** La zona del negocio, para pasar un momento a su día. */
const enMexico = sql`'America/Mexico_City'`;

/** Cuántos reclamos lleva una página si no se dice. */
const porPagina = 30;

/** El orden de los reclamos: primero los por resolver, luego los más nuevos. */
const ordenDeReclamos = sql`(rc.estado = 'por_resolver') DESC, rc.fecha DESC, rc.folio DESC`;

/** Un reclamo, como sale de la base. */
const deReclamo = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	estado: z.enum(["por_resolver", "resuelto"]),
	fecha: z.string(),
	cliente: z.string(),
	que_dice: z.string(),
	piezas: z.number(),
	defecto: z.string(),
	resolucion: z.string().nullable(),
	resuelto: z.string().nullable(),
	lote_id: z.uuid(),
	flujo_operacion_id: z.uuid(),
	persona_id: z.uuid().nullable(),
	prenda: z.string(),
	talla: z.string(),
	codigo: z.string(),
	cortado: z.string().nullable(),
	nota: z.string().nullable(),
});

/**
 * Los reclamos que cumplen una condición sobre `rc`, en el orden de la lista.
 * @param contexto El contexto de la consulta.
 * @param condicion La condición.
 */
async function leerReclamos(contexto: ContextoDeConsulta, condicion: SQL) {
	const { rows } = await contexto.base.execute(sql`
		SELECT rc.id, rc.version, rc.folio, rc.estado, rc.fecha::text AS fecha, coalesce(ter.nombre, u.nombre, '') AS cliente,
			rc.que_dice_cliente AS que_dice, rc.piezas, d.nombre AS defecto, rc.resolucion,
			(rc.resuelto_en AT TIME ZONE ${enMexico})::date::text AS resuelto, rc.lote_id, rc.flujo_operacion_id,
			rc.persona_id, p.nombre AS prenda, ta.nombre AS talla, v.codigo::text AS codigo,
			(l.cortado_en AT TIME ZONE ${enMexico})::date::text AS cortado, ne.folio AS nota
		FROM reclamos rc JOIN defectos d ON d.id = rc.defecto_id JOIN lotes l ON l.id = rc.lote_id
		JOIN variantes v ON v.id = rc.variante_id JOIN productos p ON p.id = v.producto_id
		JOIN tallas ta ON ta.id = v.talla_id
		LEFT JOIN clientes cli ON cli.id = rc.cliente_id LEFT JOIN terceros ter ON ter.id = cli.tercero_id
		LEFT JOIN ubicaciones u ON u.id = rc.ubicacion_id LEFT JOIN notas_entrega ne ON ne.id = rc.nota_entrega_id
		WHERE ${condicion} ORDER BY ${ordenDeReclamos}`);
	return z.array(deReclamo).parse(rows);
}

/** Lo que regresa el rastreo. */
const deRastreo = z.object({
	revisado_por: z.string().nullable(),
	revisado_en: z.string().nullable(),
	operacion: z.string(),
	persona: z.string().nullable(),
	rollos: z.array(
		z.object({ rollo: z.string(), partida: z.string().nullable(), tela: z.string(), proveedor: z.string().nullable() }),
	),
});

/**
 * El rastreo del reclamo escogido, en sus cinco pasos.
 * @param contexto El contexto de la consulta.
 * @param reclamo El reclamo.
 */
async function escogido(contexto: ContextoDeConsulta, reclamo: z.infer<typeof deReclamo>) {
	const rastreo = deRastreo.parse(
		await contexto.comoAccion((accion) =>
			rastreoDeReclamo(accion, {
				loteId: reclamo.lote_id,
				flujoOperacionId: reclamo.flujo_operacion_id,
				personaId: reclamo.persona_id,
			}),
		),
	);
	const revisado =
		rastreo.revisado_en === null
			? null
			: `revisado el ${textoDeDiaCorto(diaDeNegocio(Temporal.Instant.from(rastreo.revisado_en)))}${rastreo.revisado_por === null ? "" : ` por ${rastreo.revisado_por}`}`;
	const cortado = reclamo.cortado === null ? null : `Cortado el ${textoDeDiaCorto(reclamo.cortado)}`;
	// Una partida por renglón: si el lote mezcló partidas, salen todas; un rollo sin partida sale con su folio.
	const partidas = new Map<string, string>();
	for (const rollo of rastreo.rollos) {
		partidas.set(
			rollo.partida ?? rollo.rollo,
			[rollo.tela, rollo.proveedor].filter((parte) => parte !== null).join(" · "),
		);
	}
	return {
		reclamo_id: reclamo.id,
		version: reclamo.version,
		folio: reclamo.folio,
		cliente: reclamo.cliente,
		que_dice: reclamo.que_dice,
		por_resolver: reclamo.estado === "por_resolver",
		resolucion:
			reclamo.estado === "resuelto"
				? `Resuelto el ${reclamo.resuelto === null ? "" : textoDeDiaCorto(reclamo.resuelto)}${reclamo.resolucion === null ? "" : `: ${reclamo.resolucion}`}`
				: null,
		prenda: { titulo: `${reclamo.prenda} · talla ${reclamo.talla}`, linea: `Código ${reclamo.codigo}` },
		lote: {
			titulo: (await loteDelReclamo(contexto, reclamo.lote_id)) ?? "",
			linea: [cortado, revisado, reclamo.nota].filter((parte) => parte !== null).join(" · "),
		},
		operacion: { titulo: rastreo.operacion, linea: reclamo.defecto },
		persona: {
			titulo: rastreo.persona ?? "",
			linea: `Hizo ${rastreo.operacion.toLocaleLowerCase("es-MX")} en ese lote`,
		},
		partidas: [...partidas].map(([titulo, linea]) => ({ titulo, linea })),
	};
}

/**
 * El folio de un lote.
 * @param contexto El contexto de la consulta.
 * @param loteId El lote.
 */
async function loteDelReclamo(contexto: ContextoDeConsulta, loteId: string): Promise<string | undefined> {
	const { rows } = await contexto.base.execute(sql`SELECT folio FROM lotes WHERE id = ${loteId}`);
	return z.array(z.object({ folio: z.string() })).parse(rows)[0]?.folio;
}

export const consultaReclamos = implementarConsulta(reclamosDeCalidad, async (contexto, parametros) => {
	const todos = (await leerReclamos(contexto, sql`true`)).map((reclamo, i) => ({ reclamo, i }));
	// El cursor dice cuántos ya se vieron.
	const desde = Number(leerCursor(parametros.cursor)?.vistos ?? 0);
	const pagina = paginar(todos.slice(desde), parametros.limite ?? porPagina, ({ i }) => ({ vistos: i + 1 }));
	const elEscogido =
		parametros.reclamo_id === undefined
			? todos[0]?.reclamo
			: todos.find(({ reclamo }) => reclamo.id === parametros.reclamo_id)?.reclamo;
	return {
		resultado: {
			renglones: pagina.renglones.map(({ reclamo }) => ({
				reclamo_id: reclamo.id,
				folio: reclamo.folio,
				estado: reclamo.estado === "por_resolver" ? "Por resolver" : "Resuelto",
				color: reclamo.estado === "por_resolver" ? ("rojo" as const) : ("verde" as const),
				cliente: reclamo.cliente,
				linea: `${reclamo.defecto} · ${textoDePiezas(reclamo.piezas)} · ${textoDeDiaCorto(reclamo.fecha)}`,
			})),
			cursor: pagina.cursor,
			hay_mas: pagina.hay_mas,
			escogido: elEscogido === undefined ? null : await escogido(contexto, elEscogido),
		},
	};
});

/** Lo que regresa `catalogo.variante_por_codigo`. */
const deLaVariante = z.object({ variante_id: z.uuid(), producto: z.string(), talla: z.string() }).nullable();

/**
 * La prenda de un código sin reclamo: su prenda y su talla, y en qué lotes se hizo.
 * @param contexto El contexto de la consulta.
 * @param codigo El código de 6 dígitos.
 * @returns La prenda, o vacío si el código no es de ninguna.
 */
async function prendaDelCodigo(contexto: ContextoDeConsulta, codigo: string) {
	const variante = deLaVariante.parse(await contexto.lectura("catalogo.variante_por_codigo", { codigo }));
	if (variante === null) return null;
	const { rows } = await contexto.base.execute(sql`
		SELECT l.folio FROM lotes l JOIN lote_tallas lt ON lt.lote_id = l.id
		WHERE lt.variante_id = ${variante.variante_id} AND coalesce(lt.piezas_cortadas, 0) > 0 AND l.estado <> 'cancelado'
		ORDER BY l.folio`);
	const lotes = z
		.array(z.object({ folio: z.string() }))
		.parse(rows)
		.map((lote) => lote.folio);
	const hechos =
		lotes.length === 0
			? "Todavía no hay lotes de esta prenda."
			: `Se hizo en ${lotes.length} ${lotes.length === 1 ? "lote" : "lotes"}: ${lotes.join(", ")}.`;
	return {
		tipo: "prenda" as const,
		titulo: `${variante.producto} · talla ${variante.talla}`,
		linea: `Código ${codigo}. ${hechos}`,
	};
}

export const consultaBuscar = implementarConsulta(buscarDeCalidad, async (contexto, parametros) => {
	const texto = parametros.texto;
	// Un reclamo por su folio, por su lote o por el código de su prenda; el primero de la lista.
	const [reclamo] = await leerReclamos(
		contexto,
		sql`(lower(rc.folio) = lower(${texto}) OR lower(l.folio) = lower(${texto}) OR v.codigo::text = ${texto})`,
	);
	if (reclamo !== undefined) return { resultado: { encontrado: { tipo: "reclamo" as const, reclamo_id: reclamo.id } } };
	const prenda = /^\d{6}$/.test(texto) ? await prendaDelCodigo(contexto, texto) : null;
	return {
		resultado: {
			encontrado: prenda ?? { tipo: "nada" as const, texto: `No hay ninguna prenda, lote ni reclamo con «${texto}»` },
		},
	};
});
