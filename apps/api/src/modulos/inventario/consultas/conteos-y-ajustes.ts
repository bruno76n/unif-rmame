/**
 * `inventario.conteos_y_ajustes`: la pestaña Conteos y ajustes de Bodega. Los ajustes que esperan a Dirección (con lo
 * que se vio al contar, su motivo y su autorización), si la cuenta los puede decidir (solo la dueña), los conteos con su
 * resultado y los ajustes resueltos, estos dos por páginas.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Conteos y ajustes») y docs/modulos/inventario/conteos.md
 *
 * Un renglón de conteo dice «Al contar: sistema {n}, contado {m}, diferencia {±d}»; uno de recepción o de material, su
 * DF-. El ajuste mueve solo la diferencia que se vio al contar (regla 6 de diferencias, ajustes y mermas).
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { conteosYAjustesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { esLaDuena } from "../../../nucleo/acceso/quien.ts";
import { leerCursor, paginar } from "../../../nucleo/http/consultas.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";

/** Cuántos renglones van en una página, si no se dice. */
const limitePorOmision = 25;

/** Un ajuste como sale de la base. */
const delAjuste = z.object({
	id: z.uuid(),
	folio: z.string(),
	autorizacion_id: z.uuid().nullable(),
	version: z.coerce.number().nullable(),
	fecha: z.string(),
	quien: z.string(),
	ubicacion: z.string(),
	motivo: z.string(),
	motivo_texto: z.string().nullable(),
	estado: z.string(),
	decidido: z.string().nullable(),
	motivo_rechazo: z.string().nullable(),
	orden: z.string(),
});

/** Un renglón de un ajuste como sale de la base. */
const delCambio = z.object({
	ajuste_id: z.uuid(),
	prenda: z.string(),
	sistema: z.coerce.number().nullable(),
	contadas: z.coerce.number().nullable(),
	diferencia: z.coerce.number().nullable(),
	folio_df: z.string().nullable(),
});

/**
 * Las iniciales de un nombre: las de sus dos primeras palabras.
 * @param nombre El nombre.
 */
function iniciales(nombre: string): string {
	return nombre
		.split(/\s+/)
		.filter((palabra) => palabra.length > 0)
		.slice(0, 2)
		.map((palabra) => palabra[0]?.toLocaleUpperCase("es-MX") ?? "")
		.join("");
}

/**
 * Una diferencia con su signo, como la escribe la pantalla: «+2», «−3», «0».
 * @param numero La diferencia.
 */
function conSigno(numero: number): string {
	if (numero > 0) return `+${numero}`;
	if (numero < 0) return `−${Math.abs(numero)}`;
	return "0";
}

/**
 * Lee ajustes con sus renglones, ya escritos.
 * @param contexto El contexto de la lectura.
 * @param donde Qué ajustes.
 * @param limite Cuántos, si se pagina.
 */
async function leerAjustes(contexto: ContextoDeAccion, donde: ReturnType<typeof sql>, limite?: number) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT a.id, a.folio, a.autorizacion_id, au.version, (a.creado_en AT TIME ZONE 'America/Mexico_City')::date::text AS fecha,
			coalesce(us.nombre, us.correo, '') AS quien, u.nombre AS ubicacion, lv.nombre AS motivo, a.motivo_texto, a.estado,
			(a.decidido_en AT TIME ZONE 'America/Mexico_City')::date::text AS decidido, a.motivo_rechazo,
			coalesce(a.decidido_en, a.creado_en)::text AS orden
		FROM ajustes a JOIN ubicaciones u ON u.id = a.ubicacion_id JOIN lista_valores lv ON lv.id = a.motivo_id
		LEFT JOIN autorizaciones au ON au.id = a.autorizacion_id LEFT JOIN usuarios us ON us.id = a.creado_por
		WHERE ${donde} ORDER BY coalesce(a.decidido_en, a.creado_en) DESC, a.folio DESC
		${limite === undefined ? sql`` : sql`LIMIT ${limite + 1}`}`);
	const ajustes = z.array(delAjuste).parse(rows);
	if (ajustes.length === 0) return [];
	const { rows: filasDeCambios } = await contexto.transaccion.execute(sql`
		SELECT l.ajuste_id, coalesce(p.nombre || ' · ' || t.nombre, m.nombre, '') AS prenda, l.piezas_sistema AS sistema,
			l.piezas_contadas AS contadas, l.piezas_diferencia AS diferencia, f.folio AS folio_df
		FROM ajuste_lineas l LEFT JOIN variantes v ON v.id = l.variante_id LEFT JOIN productos p ON p.id = v.producto_id
		LEFT JOIN tallas t ON t.id = v.talla_id LEFT JOIN materiales m ON m.id = l.material_id
		LEFT JOIN diferencias f ON f.id = l.diferencia_id
		WHERE l.ajuste_id IN (${sql.join(
			ajustes.map((ajuste) => sql`${ajuste.id}::uuid`),
			sql`, `,
		)}) ORDER BY l.renglon`);
	const cambios = z.array(delCambio).parse(filasDeCambios);
	return ajustes.map((ajuste) => ({
		...ajuste,
		cambios: cambios
			.filter((cambio) => cambio.ajuste_id === ajuste.id)
			.map((cambio) => ({
				prenda: cambio.prenda,
				texto:
					cambio.folio_df !== null
						? cambio.folio_df
						: `Al contar: sistema ${cambio.sistema ?? 0}, contado ${cambio.contadas ?? 0}, diferencia ${conSigno(cambio.diferencia ?? 0)}`,
			})),
	}));
}

/** Un ajuste leído, con sus renglones. */
type AjusteLeido = Awaited<ReturnType<typeof leerAjustes>>[number];

/**
 * Un ajuste como lo muestra la pantalla.
 * @param ajuste El ajuste leído.
 */
function ajusteEscrito(ajuste: AjusteLeido) {
	const resuelto = ajuste.estado === "autorizado" || ajuste.estado === "rechazado";
	return {
		ajuste_id: ajuste.id,
		autorizacion_id: ajuste.autorizacion_id,
		version: ajuste.version,
		folio: ajuste.folio,
		fecha: ajuste.fecha,
		iniciales: iniciales(ajuste.quien),
		ubicacion: ajuste.ubicacion,
		cambios: ajuste.cambios,
		motivo: ajuste.motivo_texto === null ? ajuste.motivo : `${ajuste.motivo} · ${ajuste.motivo_texto}`,
		resultado: !resuelto
			? null
			: ajuste.estado === "autorizado"
				? { texto: "Autorizado por Dirección", color: "verde" as const }
				: { texto: "Rechazado", color: "rojo" as const },
		detalle_resultado: !resuelto
			? null
			: ajuste.estado === "autorizado"
				? ajuste.decidido === null
					? null
					: textoDeDiaCorto(ajuste.decidido)
				: ajuste.motivo_rechazo,
	};
}

/** Un conteo como sale de la base. */
const delConteo = z.object({
	id: z.uuid(),
	folio: z.string(),
	tipo: z.string(),
	alcance: z.string().nullable(),
	en: z.string(),
	fecha: z.string(),
	ubicacion: z.string(),
	seccion: z.string().nullable(),
	responsable: z.string(),
	variantes: z.coerce.number(),
	diferencias: z.coerce.number(),
});

/** Cómo se dice el alcance de una carga inicial. */
const alcanceEscrito: Readonly<Record<string, string>> = { prenda: "una prenda", seccion: "una sección", toda: "todo" };

/**
 * Los conteos hechos, del más reciente, por páginas.
 * @param contexto El contexto de la lectura.
 * @param cursor Dónde sigue.
 * @param limite Cuántos.
 */
async function conteosHechos(contexto: ContextoDeAccion, cursor: string | undefined, limite: number) {
	const posicion = leerCursor(cursor);
	const despues =
		posicion === undefined
			? sql``
			: sql`AND (c.contado_en, c.folio) < (${String(posicion.en)}::timestamptz, ${String(posicion.folio)})`;
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT c.id, c.folio, c.tipo, c.alcance, c.contado_en::text AS en,
			(c.contado_en AT TIME ZONE 'America/Mexico_City')::date::text AS fecha, u.nombre AS ubicacion,
			coalesce(s.nombre, p.nombre) AS seccion, coalesce(us.nombre, us.correo, '') AS responsable,
			(SELECT count(*) FROM conteo_lineas l WHERE l.conteo_id = c.id) AS variantes,
			(SELECT count(*) FROM conteo_lineas l WHERE l.conteo_id = c.id AND l.diferencia <> 0) AS diferencias
		FROM conteos c JOIN ubicaciones u ON u.id = c.ubicacion_id LEFT JOIN secciones s ON s.id = c.seccion_id
		LEFT JOIN productos p ON p.id = c.producto_id LEFT JOIN usuarios us ON us.id = c.contado_por
		WHERE c.estado = 'contado' ${despues} ORDER BY c.contado_en DESC, c.folio DESC LIMIT ${limite + 1}`);
	const pagina = paginar(z.array(delConteo).parse(rows), limite, (conteo) => ({ en: conteo.en, folio: conteo.folio }));
	return {
		...pagina,
		renglones: pagina.renglones.map((conteo) => {
			const inicial = conteo.tipo === "inicial";
			return {
				conteo_id: conteo.id,
				folio: conteo.folio,
				fecha: conteo.fecha,
				ubicacion: conteo.ubicacion,
				seccion: inicial
					? `Carga inicial · ${conteo.seccion ?? alcanceEscrito[conteo.alcance ?? "toda"] ?? ""}`
					: (conteo.seccion ?? ""),
				responsable: conteo.responsable,
				variantes: conteo.variantes,
				resultado: inicial
					? { texto: "Carga inicial", color: "gris" as const }
					: conteo.diferencias > 0
						? {
								texto: `${conteo.diferencias} ${conteo.diferencias === 1 ? "diferencia" : "diferencias"}`,
								color: "ambar" as const,
							}
						: { texto: "Cuadró", color: "verde" as const },
			};
		}),
	};
}

export const consultaConteosYAjustes = implementarConsulta(conteosYAjustesDeBodega, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const limite = parametros.limite ?? limitePorOmision;
		// El cursor es de la lista que pide; la otra empieza de cero.
		const cursorDe = (lista: "conteos" | "resueltos") => (parametros.lista === lista ? parametros.cursor : undefined);
		const posicion = leerCursor(cursorDe("resueltos"));
		const despues =
			posicion === undefined
				? sql`true`
				: sql`(coalesce(a.decidido_en, a.creado_en), a.folio) < (${String(posicion.en)}::timestamptz, ${String(posicion.folio)})`;
		const resueltos = await leerAjustes(accion, sql`a.estado IN ('autorizado', 'rechazado') AND ${despues}`, limite);
		const pagina = paginar(resueltos, limite, (ajuste) => ({ en: ajuste.orden, folio: ajuste.folio }));
		const { quien } = contexto;
		return {
			en_autorizacion: (await leerAjustes(accion, sql`a.estado = 'esperando_autorizacion'`))
				.reverse()
				.map(ajusteEscrito),
			puede_decidir: esLaDuena(quien),
			conteos: await conteosHechos(accion, cursorDe("conteos"), limite),
			resueltos: { ...pagina, renglones: pagina.renglones.map(ajusteEscrito) },
		};
	}),
}));
