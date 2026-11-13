/**
 * `linea.pendientes` y la pastilla de Tienda en línea: los tres indicadores (Pedidos, Ventas en línea y
 * Disponibilidad), los W- por surtir, esperando prendas y listos para empacar, y la pastilla del menú.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Quién entra», «Pendientes»)
 *
 * Un W- abierto se pone en rojo desde `linea.dias_pedido_rojo` días de pagado, en ámbar antes. La pastilla cuenta los
 * por surtir y va roja con uno abierto en rojo. La disponibilidad sale de `inventario.disponibilidad_linea`, la misma
 * cuenta de la pestaña.
 */

import { plural, variacion } from "@uniformame/compartido/calculos/textos";
import { pendientesLinea } from "@uniformame/compartido/contratos/linea/consultas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { parametroEntero } from "../../../nucleo/acceso/sesion.ts";
import type { ContextoDeConsulta, Pastilla } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	diasDePagado,
	dondeEsta,
	enAduana,
	etapas,
	fechaDelPedido,
	leerPedidos,
	leerRenglones,
	loQueFalta,
	type PedidoLeido,
	pagadosAbiertos,
	type RenglonLeido,
} from "./comun.ts";

/** Lo que da la consulta. */
type Pendientes = z.infer<typeof pendientesLinea.resultado>;

/** Los días de la gráfica chica de las ventas: dos semanas. */
const diasDeLaSerie = 14;

/** Lo que cuenta `inventario.disponibilidad_linea`. */
const disponibilidad = z.object({
	conteos: z.object({ sale_hoy: z.number(), sale_manana: z.number(), agotado: z.number() }),
});

/**
 * Lo que falta de un W- y dónde está lo primero, o «Completo en aduana · listo para empacar».
 * @param suyos Sus renglones.
 */
function detalleDe(suyos: readonly RenglonLeido[]): string {
	const faltan = suyos.filter((renglon) => !enAduana(renglon));
	const primero = faltan[0] === undefined ? undefined : loQueFalta(faltan[0])[0];
	if (primero === undefined) return "Completo en aduana · listo para empacar";
	const prendas = faltan.map((renglon) => `${renglon.producto_nombre} ${renglon.talla}`).join(", ");
	return `${prendas} · ${dondeEsta(primero, false).texto}`;
}

/**
 * Los W- pagados y abiertos, del pagado hace más tiempo al más nuevo.
 * @param contexto El contexto de la consulta (o de la pastilla).
 */
function leerAbiertos({ base }: ContextoDeConsulta): Promise<PedidoLeido[]> {
	return leerPedidos(
		base,
		sql`p.estado IN (${sql.join(
			pagadosAbiertos.map((estado) => sql`${estado}`),
			sql`, `,
		)})`,
		sql`ORDER BY p.pagado_en, p.folio`,
	);
}

/**
 * Si un W- abierto ya va en rojo: se pagó hace `linea.dias_pedido_rojo` días o más.
 * @param contexto El contexto de la consulta.
 */
async function reglaDeRojo(contexto: ContextoDeConsulta): Promise<(pedido: PedidoLeido) => boolean> {
	const dias = await parametroEntero(contexto.base, "linea.dias_pedido_rojo");
	return (pedido) => diasDePagado(pedido, contexto.diaDeNegocio) >= dias;
}

/**
 * Las ventas en línea de cada uno de los últimos 14 días: el total con envío de los W- pagados ese día, sin los
 * cancelados.
 * @param contexto El contexto de la consulta.
 * @returns Del día más viejo a hoy.
 */
async function ventasPorDia(contexto: ContextoDeConsulta): Promise<number[]> {
	const desde = contexto.diaDeNegocio.subtract({ days: diasDeLaSerie - 1 });
	const { rows } =
		await contexto.base.execute(sql`SELECT (pagado_en AT TIME ZONE 'America/Mexico_City')::date::text AS dia,
			sum(total_centavos) AS total
		FROM pedidos_linea
		WHERE pagado_en IS NOT NULL AND estado <> 'cancelado'
			AND (pagado_en AT TIME ZONE 'America/Mexico_City')::date >= ${desde.toString()}::date
		GROUP BY 1`);
	const porDia = new Map(
		z
			.array(z.object({ dia: z.string(), total: z.coerce.number() }))
			.parse(rows)
			.map((fila) => [fila.dia, fila.total]),
	);
	return Array.from({ length: diasDeLaSerie }, (_, i) => porDia.get(desde.add({ days: i }).toString()) ?? 0);
}

/**
 * Cómo cambió la semana contra la anterior: «▲ 12% contra la anterior», o nada si la anterior no vendió.
 * @param semana Lo de esta semana.
 * @param anterior Lo de la anterior.
 */
function contraLaAnterior(semana: number, anterior: number): Pendientes["cifras"]["ventas"]["contexto"] {
	const cambio = variacion(semana, anterior);
	return cambio === null ? [] : [{ texto: `${cambio} contra la anterior`, tono: "normal" }];
}

/**
 * Lee todo lo de Pendientes.
 * @param contexto El contexto de la consulta.
 */
async function leerPendientes(contexto: ContextoDeConsulta): Promise<Pendientes> {
	const abiertos = await leerAbiertos(contexto);
	const enRojo = await reglaDeRojo(contexto);
	const renglones = await leerRenglones(
		contexto.base,
		abiertos.map((pedido) => pedido.id),
	);
	const cuantos = (estado: string) => abiertos.filter((pedido) => pedido.estado === estado).length;
	const { rows } = await contexto.base.execute(
		sql`SELECT count(*)::int AS n FROM pedidos_linea WHERE estado = 'esperando_pago'`,
	);
	const esperandoPago = Number(rows[0]?.n ?? 0);
	const serie = await ventasPorDia(contexto);
	const semana = serie.slice(-7).reduce((suma, dia) => suma + dia, 0);
	const anterior = serie.slice(0, 7).reduce((suma, dia) => suma + dia, 0);
	const { conteos } = disponibilidad.parse(await contexto.lectura("inventario.disponibilidad_linea", {}));
	return {
		cifras: {
			pedidos: {
				abiertos: abiertos.length,
				tono: cuantos("por_surtir") > 0 ? "rojo" : abiertos.length > 0 ? "ambar" : null,
				contexto: [
					esperandoPago > 0
						? { texto: `${esperandoPago} esperando pago`, tono: "normal" }
						: {
								texto: `${plural(cuantos("listo_para_empacar"), "listo", "listos")} para empacar`,
								tono: "normal",
							},
				],
				reparto: pagadosAbiertos.map((estado) => ({
					etiqueta: etapas[estado].texto,
					valor: cuantos(estado),
					color: etapas[estado].color,
				})),
			},
			ventas: { semana_centavos: semana, serie_centavos: serie, contexto: contraLaAnterior(semana, anterior) },
			disponibilidad: {
				salen_hoy: conteos.sale_hoy,
				contexto: [
					conteos.agotado > 0
						? { texto: plural(conteos.agotado, "agotada", "agotadas"), tono: "ambar" }
						: { texto: "Ninguna agotada", tono: "normal" },
				],
			},
		},
		renglones: abiertos.map((pedido) => ({
			pedido_linea_id: pedido.id,
			folio: pedido.folio,
			titulo: `${pedido.folio} · ${pedido.cliente_nombre}`,
			detalle: detalleDe(renglones.filter((renglon) => renglon.pedido_linea_id === pedido.id)),
			fecha: { fecha: pedido.pagado_en ?? pedido.estado_en, texto: fechaDelPedido(pedido) },
			total_centavos: pedido.total_centavos,
			estado: { texto: etapas[pedido.estado].texto, color: enRojo(pedido) ? "rojo" : "ambar" },
		})),
		pastilla: { conteo: cuantos("por_surtir"), rojo: abiertos.some(enRojo) },
	};
}

export const consultaPendientesLinea = implementarConsulta(pendientesLinea, async (contexto) => ({
	resultado: await leerPendientes(contexto),
}));

/** La pastilla de Tienda en línea: los W- por surtir; roja si alguno abierto va en rojo. */
export const pastillaLinea: Pastilla = async (contexto) => {
	const abiertos = await leerAbiertos(contexto);
	const enRojo = await reglaDeRojo(contexto);
	return { conteo: abiertos.filter((pedido) => pedido.estado === "por_surtir").length, rojo: abiertos.some(enRojo) };
};
