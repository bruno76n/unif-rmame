/**
 * `inventario.excepciones`: la pestaña Excepciones de Bodega. Las de Bodega por resolver (de la más vieja) o las
 * resueltas (de la más reciente), por páginas, con cuántas hay de cada una: cuándo se detectó, qué pasó, de dónde llegó
 * (el aparato y la persona), su documento y, en una de un aparato revocado, el comando que la dueña puede aplicar.
 * «Lo que llegó», con los datos tal cual, solo viaja a la dueña.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Excepciones») y docs/modulos/inventario/excepciones.md
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { excepcionesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { leerCursor, paginar } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";

/** Cuántas van en una página, si no se dice. */
const limitePorOmision = 25;

/** Una excepción como sale de la base. */
const deLaExcepcion = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	tipo: z.string(),
	detectada_en: z.string(),
	descripcion: z.string(),
	aparato: z.string().nullable(),
	persona: z.string().nullable(),
	documento_folio: z.string().nullable(),
	comando_id: z.uuid().nullable(),
	datos: z.unknown(),
	resolucion: z.string().nullable(),
	resuelta_por: z.string().nullable(),
	resuelta_en: z.string().nullable(),
});

/**
 * Un momento como lo escribe la pantalla: «09:14 · 8 nov».
 * @param momento El momento en ISO.
 */
function horaYFecha(momento: string): string {
	const enMexico = Temporal.Instant.from(momento).toZonedDateTimeISO("America/Mexico_City");
	return `${enMexico.toPlainTime().toString().slice(0, 5)} · ${textoDeDiaCorto(enMexico.toPlainDate())}`;
}

export const consultaExcepciones = implementarConsulta(excepcionesDeBodega, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const resueltas = parametros.estado === "resuelta";
		const limite = parametros.limite ?? limitePorOmision;
		const posicion = leerCursor(parametros.cursor);
		const columna = resueltas ? sql`x.resuelta_en` : sql`x.detectada_en`;
		// Las por resolver, de la más vieja; las resueltas, de la más reciente.
		const despues =
			posicion === undefined
				? sql``
				: resueltas
					? sql`AND (${columna}, x.id) < (${String(posicion.en)}::timestamptz, ${String(posicion.id)}::uuid)`
					: sql`AND (${columna}, x.id) > (${String(posicion.en)}::timestamptz, ${String(posicion.id)}::uuid)`;
		const { rows } = await accion.transaccion.execute(sql`
			SELECT x.id, x.version, x.tipo, x.detectada_en::text AS detectada_en, x.descripcion, d.nombre AS aparato,
				pe.nombre AS persona, x.documento_folio, CASE WHEN x.tipo = 'dispositivo_revocado' THEN x.comando_id END AS comando_id,
				x.datos, x.resolucion, coalesce(us.nombre, us.correo) AS resuelta_por, x.resuelta_en::text AS resuelta_en
			FROM excepciones x LEFT JOIN dispositivos d ON d.id = x.dispositivo_id LEFT JOIN personas pe ON pe.id = x.persona_id
			LEFT JOIN usuarios us ON us.id = x.resuelta_por
			WHERE x.area = 'bodega' AND x.estado = ${resueltas ? "resuelta" : "por_revisar"} ${despues}
			ORDER BY ${columna} ${resueltas ? sql`DESC` : sql`ASC`}, x.id ${resueltas ? sql`DESC` : sql`ASC`}
			LIMIT ${limite + 1}`);
		const { rows: filasDeConteos } = await accion.transaccion.execute(sql`
			SELECT count(*) FILTER (WHERE estado = 'por_revisar') AS por_revisar,
				count(*) FILTER (WHERE estado = 'resuelta') AS resueltas
			FROM excepciones WHERE area = 'bodega'`);
		const { quien } = contexto;
		const esDuena = quien.tipo === "cuenta" && quien.esDuena;
		const pagina = paginar(z.array(deLaExcepcion).parse(rows), limite, (excepcion) => ({
			en: (resueltas ? excepcion.resuelta_en : excepcion.detectada_en) ?? "",
			id: excepcion.id,
		}));
		return {
			conteos: z.object({ por_revisar: z.coerce.number(), resueltas: z.coerce.number() }).parse(filasDeConteos[0]),
			puede_aplicar: esDuena,
			...pagina,
			renglones: pagina.renglones.map((excepcion) => ({
				excepcion_id: excepcion.id,
				version: excepcion.version,
				tipo: excepcion.tipo,
				detectada_en: horaYFecha(excepcion.detectada_en),
				descripcion: excepcion.descripcion,
				de_donde: [excepcion.aparato, excepcion.persona].filter((parte) => parte !== null).join(" · ") || null,
				documento: excepcion.documento_folio,
				comando_id: excepcion.comando_id,
				lo_que_llego: esDuena && excepcion.datos !== null ? JSON.stringify(excepcion.datos) : null,
				resolucion: excepcion.resolucion,
				resuelta_por: excepcion.resuelta_por,
				resuelta_en: excepcion.resuelta_en === null ? null : horaYFecha(excepcion.resuelta_en),
			})),
		};
	}),
}));
