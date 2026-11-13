/**
 * `mantenimiento.falla`: el cajón de una falla. Su estado, su paro, si detuvo la máquina y el costo de su reparación;
 * quién la reportó, quién traía la máquina al fallar, la máquina y su técnico; su nota de seguimiento; los lotes que
 * detiene, si está abierta; y su servicio, si está resuelta. Con las horas que propone la ventana Reparación.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Cajones»: Falla) y
 * docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (reglas 6, 7, 10 y 11)
 *
 * Los lotes que detiene son los que Producción tiene atorados por esa falla (`produccion.lotes_atorados`); su prenda y
 * para quién son se escriben como en Producción.
 */

import { fallaDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	columnasDeParaQuien,
	deParaQuien,
	escribirParaQuien,
	unionesDeParaQuien,
} from "../../produccion/dominio/para-quien.ts";
import { estadosDeFalla, origenesDeFalla } from "../tablas.ts";
import {
	columnasDeQuienReporto,
	costoDeLaHoraDeParo,
	estadoDeFalla,
	horasDeLasFallasQueDetienen,
	type LoteDetenido,
	lotesDetenidosPorFalla,
	unionesDeQuienReporto,
} from "./comun.ts";

/** La falla como sale de la base, con su máquina, su técnico y su servicio. */
const deLaFalla = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	fecha: z.string(),
	estado: z.enum(estadosDeFalla),
	maquina_id: z.uuid(),
	maquina: z.string(),
	tipo: z.string(),
	marca: z.string().nullable(),
	modelo: z.string().nullable(),
	serie: z.string().nullable(),
	motivo: z.string(),
	detuvo: z.boolean(),
	reporto: z.string(),
	origen: z.enum(origenesDeFalla),
	la_trae: z.string().nullable(),
	tecnico_id: z.uuid().nullable(),
	tecnico: z.string().nullable(),
	nota_seguimiento: z.string().nullable(),
	servicio_folio: z.string().nullable(),
	servicio_fecha: z.string().nullable(),
	que_se_hizo: z.string().nullable(),
	costo_centavos: z.coerce.number().nullable(),
	horas_servicio: z.number().nullable(),
});

/**
 * Lee la falla.
 * @param contexto El contexto de la lectura.
 * @param fallaId La falla.
 * @throws `404` si no existe.
 */
async function leerFalla(contexto: ContextoDeAccion, fallaId: string) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT f.id, f.version, f.folio, f.fecha::text AS fecha, f.estado, m.id AS maquina_id, m.nombre AS maquina,
			t.nombre AS tipo, m.marca, m.modelo, m.serie, mf.nombre AS motivo, f.detuvo_maquina AS detuvo,
			${columnasDeQuienReporto}, pa.nombre AS la_trae, te.id AS tecnico_id, te.nombre AS tecnico,
			f.nota_seguimiento, s.folio AS servicio_folio, s.fecha::text AS servicio_fecha, s.que_se_hizo,
			s.costo_centavos, s.horas_paro AS horas_servicio
		FROM fallas f JOIN maquinas m ON m.id = f.maquina_id JOIN tipos_maquina t ON t.id = m.tipo_maquina_id
		JOIN motivos_falla mf ON mf.id = f.motivo_falla_id
		LEFT JOIN personas pa ON pa.id = f.persona_asignada_id
		LEFT JOIN servicios s ON s.falla_id = f.id
		LEFT JOIN tecnicos te ON te.id = coalesce(s.tecnico_id, f.tecnico_id)
		${unionesDeQuienReporto}
		WHERE f.id = ${fallaId}::uuid`);
	const [falla] = z.array(deLaFalla).parse(rows);
	if (falla === undefined) throw noExiste();
	return falla;
}

/**
 * Los lotes que detiene una falla, con su prenda y para quién son: «{prenda} para {destino}».
 * @param contexto El contexto de la lectura.
 * @param lotes Los lotes atorados por esa falla.
 */
async function loQueDetiene(contexto: ContextoDeAccion, lotes: readonly LoteDetenido[]) {
	if (lotes.length === 0) return [];
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT l.id, p.nombre AS prenda, ${columnasDeParaQuien}
		FROM lotes l JOIN productos p ON p.id = l.producto_id ${unionesDeParaQuien}
		WHERE l.id IN (${sql.join(
			lotes.map((lote) => sql`${lote.lote_id}::uuid`),
			sql`, `,
		)})`);
	const prendas = new Map(
		z
			.array(z.object({ id: z.uuid(), prenda: z.string(), ...deParaQuien }))
			.parse(rows)
			.map((fila) => [fila.id, `${fila.prenda} para ${escribirParaQuien(fila).nombre}`]),
	);
	return lotes.map((lote) => ({
		lote_id: lote.lote_id,
		folio: lote.folio,
		texto: prendas.get(lote.lote_id) ?? "",
		entrega: lote.fecha_entrega,
	}));
}

export const consultaFallaDeMantenimiento = implementarConsulta(fallaDeMantenimiento, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const falla = await leerFalla(accion, parametros.falla_id);
		const abierta = falla.estado !== "resuelta";
		// El paro: de una resuelta, las horas de su servicio; de una abierta que la detuvo, las que lleva (regla 6).
		const horasAbierta = abierta && falla.detuvo ? ((await horasDeLasFallasQueDetienen(accion)).get(falla.id) ?? 0) : 0;
		const horas = abierta ? horasAbierta : (falla.horas_servicio ?? 0);
		const costoHora = await costoDeLaHoraDeParo(accion);
		const lotes = abierta ? ((await lotesDetenidosPorFalla(accion)).get(falla.folio) ?? []) : [];
		const maquinaDetalle = [falla.tipo, falla.marca, falla.modelo].filter((parte) => parte !== null).join(" ");
		return {
			falla_id: falla.id,
			version: falla.version,
			folio: falla.folio,
			fecha: falla.fecha,
			estado_clave: falla.estado,
			estado: estadoDeFalla(falla.estado),
			maquina_id: falla.maquina_id,
			maquina: falla.maquina,
			titulo: `${falla.maquina}: ${falla.motivo.toLocaleLowerCase("es-MX")}`,
			motivo: falla.motivo,
			detuvo: falla.detuvo,
			horas_paro: horas,
			horas_propuestas: horasAbierta,
			...(falla.costo_centavos === null ? {} : { reparacion_centavos: falla.costo_centavos }),
			reporto: falla.origen === "tablet" ? `${falla.reporto}, desde la tablet` : falla.reporto,
			la_trae: falla.la_trae,
			maquina_detalle: falla.serie === null ? maquinaDetalle : `${maquinaDetalle} · ${falla.serie}`,
			tecnico_id: falla.tecnico_id,
			tecnico: falla.tecnico,
			nota_seguimiento: falla.nota_seguimiento,
			deteniendo: await loQueDetiene(accion, lotes),
			servicio:
				falla.servicio_folio === null
					? null
					: {
							folio: falla.servicio_folio,
							fecha: falla.servicio_fecha ?? falla.fecha,
							que_se_hizo: falla.que_se_hizo ?? "",
							costo_centavos: falla.costo_centavos ?? 0,
							horas_paro: falla.horas_servicio ?? 0,
							paro_centavos: (falla.horas_servicio ?? 0) * costoHora,
						},
		};
	}),
}));
