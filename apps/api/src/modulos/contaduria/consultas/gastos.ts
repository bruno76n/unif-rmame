/**
 * `contaduria.gastos`: los gastos de un mes por categoría contra el mes anterior completo, el registro de gastos y lo
 * que necesita la ventana «Registrar gasto».
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Gastos») y docs/modulos/contaduria/gastos.md
 *
 * El de un servicio de Mantenimiento sale con su SM- y su máquina, y no se cancela aquí: se corrige desde Mantenimiento.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { gastosDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-gastos-contador";
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { listaDeCategoriasGasto, listaDeTiposComprobante } from "../siembra.ts";
import { cuentasDeLaFabrica, paginar, valoresDeLista } from "./comun.ts";

/** Un gasto, como lo lee la consulta. */
const gastoLeido = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	fecha: z.string(),
	categoria: z.string(),
	area: z.string(),
	ubicacion: z.string().nullable(),
	medio: z.string().nullable(),
	cuenta: z.string().nullable(),
	monto: z.coerce.number(),
	comprobante: z.uuid().nullable(),
	origen: z.string(),
	servicio: z.string().nullable(),
	maquina: z.string().nullable(),
	estado: z.string(),
});

/**
 * Dónde se gastó: «Fábrica», la ubicación o «En línea».
 * @param gasto El gasto.
 */
function dondeSeGasto(gasto: z.infer<typeof gastoLeido>): string {
	if (gasto.area === "en_linea") return "En línea";
	if (gasto.area === "fabrica") return "Fábrica";
	return gasto.ubicacion ?? "—";
}

/**
 * De dónde salió el dinero: «Efectivo», la cuenta de la fábrica o «—» en el de un servicio.
 * @param gasto El gasto.
 */
function salioDe(gasto: z.infer<typeof gastoLeido>): string {
	if (gasto.medio === "efectivo") return "Efectivo";
	if (gasto.medio === "cuenta_fabrica") return gasto.cuenta ?? "Cuenta de la fábrica";
	return "—";
}

/**
 * Los gastos de un mes, el más reciente arriba.
 * @param contexto El contexto de la consulta.
 * @param mes El primer día del mes.
 */
async function gastosDelMes(contexto: ContextoDeConsulta, mes: Temporal.PlainDate) {
	const { rows } = await contexto.base.execute(sql`SELECT g.id, g.version, g.folio, g.fecha::text,
			c.nombre AS categoria, g.area, u.nombre AS ubicacion, g.medio, cf.nombre AS cuenta, g.monto_centavos AS monto,
			g.comprobante_archivo_id AS comprobante, g.origen, s.folio AS servicio, m.folio AS maquina, g.estado
		FROM gastos g
		JOIN lista_valores c ON c.id = g.categoria_id
		LEFT JOIN ubicaciones u ON u.id = g.ubicacion_id
		LEFT JOIN lista_valores cf ON cf.id = g.cuenta_fabrica_id
		LEFT JOIN servicios s ON s.id = g.servicio_id
		LEFT JOIN maquinas m ON m.id = g.maquina_id
		WHERE g.fecha >= ${mes.toString()}::date AND g.fecha < ${mes.add({ months: 1 }).toString()}::date
		ORDER BY g.fecha DESC, g.folio DESC`);
	return z.array(gastoLeido).parse(rows);
}

/**
 * Lo gastado por categoría en un mes y en el anterior completo, sin lo cancelado; en el mes que corre, hasta hoy.
 * @param contexto El contexto de la consulta.
 * @param mes El primer día del mes.
 */
async function porCategoria(contexto: ContextoDeConsulta, mes: Temporal.PlainDate) {
	const anterior = mes.subtract({ months: 1 });
	const { rows } = await contexto.base.execute(sql`SELECT c.nombre AS categoria,
			coalesce(sum(g.monto_centavos) FILTER (WHERE g.fecha >= ${mes.toString()}::date), 0) AS este,
			coalesce(sum(g.monto_centavos) FILTER (WHERE g.fecha < ${mes.toString()}::date), 0) AS anterior
		FROM gastos g JOIN lista_valores c ON c.id = g.categoria_id
		WHERE g.estado = 'registrado' AND g.fecha >= ${anterior.toString()}::date
			AND g.fecha < ${mes.add({ months: 1 }).toString()}::date
		GROUP BY c.nombre, c.orden ORDER BY c.orden, c.nombre`);
	return z
		.array(z.object({ categoria: z.string(), este: z.coerce.number(), anterior: z.coerce.number() }))
		.parse(rows)
		.map((fila) => ({
			categoria: fila.categoria,
			este_mes_centavos: fila.este,
			mes_anterior_centavos: fila.anterior,
		}));
}

/**
 * Las ubicaciones donde se gasta: el Taller y las tiendas vigentes.
 * @param contexto El contexto de la consulta.
 */
async function ubicacionesDeGasto(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`SELECT id, nombre FROM ubicaciones
		WHERE tipo IN ('taller', 'tienda') AND baja_en IS NULL ORDER BY orden`);
	return z.array(z.object({ id: z.uuid(), nombre: z.string() })).parse(rows);
}

/**
 * El nombre de un mes, en minúsculas: «noviembre».
 * @param mes Su primer día.
 */
function nombreDelMes(mes: Temporal.PlainDate): string {
	return mes.toLocaleString("es-MX", { month: "long" });
}

export const consultaGastos = implementarConsulta(gastosDeContaduria, async (contexto, parametros) => {
	const hoy = contexto.diaDeNegocio;
	const mes = Temporal.PlainDate.from(parametros.mes ?? hoy.with({ day: 1 }).toString());
	const esteMes = mes.year === hoy.year && mes.month === hoy.month;
	const pagina = paginar(await gastosDelMes(contexto, mes), parametros.cursor);
	return {
		resultado: {
			mes: mes.toString(),
			mes_texto: nombreDelMes(mes),
			mes_anterior_texto: nombreDelMes(mes.subtract({ months: 1 })),
			hoy: hoy.toString(),
			al_dia: esteMes ? hoy.day : null,
			por_categoria: await porCategoria(contexto, mes),
			renglones: pagina.renglones.map((gasto) => {
				const deServicio = gasto.origen === "mantenimiento";
				return {
					gasto_id: gasto.id,
					version: gasto.version,
					folio: deServicio ? (gasto.servicio ?? gasto.folio) : gasto.folio,
					fecha: textoDeDiaCorto(gasto.fecha),
					categoria: deServicio
						? `${gasto.categoria} · máquina ${gasto.maquina ?? ""}, de mantenimiento`
						: gasto.categoria,
					donde: dondeSeGasto(gasto),
					salio_de: salioDe(gasto),
					monto_centavos: gasto.monto,
					comprobante_archivo_id: gasto.comprobante,
					de_mantenimiento: deServicio,
					cancelado: gasto.estado === "cancelado",
				};
			}),
			cursor: pagina.cursor,
			hay_mas: pagina.hay_mas,
			categorias: await valoresDeLista(contexto, listaDeCategoriasGasto, true),
			ubicaciones: await ubicacionesDeGasto(contexto),
			tipos_comprobante: await valoresDeLista(contexto, listaDeTiposComprobante),
			cuentas_fabrica: await cuentasDeLaFabrica(contexto),
		},
	};
});
