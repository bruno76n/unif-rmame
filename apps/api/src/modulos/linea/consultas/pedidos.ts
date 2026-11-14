/**
 * `linea.pedidos`: el tablero de Pedidos de Tienda en línea y los cerrados de abajo. También la usa Aduana para lo que
 * espera y lo listo para empacar.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Pedidos»)
 *
 * - Las columnas: esperando pago (solo si hay alguno), por surtir, esperando prendas y listo para empacar, del pagado
 *   hace más tiempo al más nuevo, cada W- con sus prendas y dónde está cada una, y su promesa mientras no se reúne.
 * - Los cerrados (cancelados y vencidos), del más reciente al más viejo, por páginas: el cursor pagina solo los
 *   cerrados, y las páginas que siguen ya no traen columnas.
 * - El buscador pide cada palabra en el folio o en el cliente, sin acentos ni mayúsculas.
 * - Con Bodega o Aduana, y sin Tienda en línea, no viaja el total (regla 8 de pedidos en línea): el resto de la
 *   tarjeta no lleva precios, pago ni contacto del cliente.
 */

import { textoDeMomentoCorto } from "@uniformame/compartido/calculos/fechas";
import { estadosAbiertosDeW, estadosDeW, pedidosLinea } from "@uniformame/compartido/contratos/linea/consultas";
import { type SQL, sql } from "drizzle-orm";
import type { z } from "zod";
import { tieneDepartamento } from "../../../nucleo/acceso/quien.ts";
import { leerCursor, paginar } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	dondeEsta,
	type EstadoDeW,
	enAduana,
	etapas,
	fechaDelPedido,
	leerPedidos,
	leerRenglones,
	loQueFalta,
	type PedidoLeido,
	promesas,
	type RenglonLeido,
} from "./comun.ts";

/** Lo que da la consulta. */
type Pedidos = z.infer<typeof pedidosLinea.resultado>;

/** Cuántos cerrados por página, si no se pide otro tope. */
const cerradosPorPagina = 20;

/** Los estados de un W- cerrado. */
const estadosCerrados = ["cancelado", "vencido"] as const;

/** Una lista de estados para `IN (…)`. */
const enEstados = (estados: readonly string[]) =>
	sql.join(
		estados.map((estado) => sql`${estado}`),
		sql`, `,
	);

/** Un texto sin mayúsculas ni acentos, en SQL. */
const paraBuscar = (columna: SQL) => sql`translate(lower(${columna}), 'áéíóúüñ', 'aeiouun')`;

/**
 * El filtro del buscador: cada palabra, en el folio o en el cliente.
 * @param buscar Lo que se escribió.
 */
function filtroDelBuscador(buscar: string | undefined): SQL {
	const palabras = (buscar ?? "")
		.toLocaleLowerCase("es-MX")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.split(/\s+/)
		.filter((palabra) => palabra.length > 0);
	if (palabras.length === 0) return sql`TRUE`;
	return sql.join(
		palabras.map((palabra) => {
			const patron = `%${palabra.replace(/[\\%_]/g, (letra) => `\\${letra}`)}%`;
			return sql`(${paraBuscar(sql`p.folio`)} LIKE ${patron} OR ${paraBuscar(sql`p.cliente_nombre`)} LIKE ${patron})`;
		}),
		sql` AND `,
	);
}

/**
 * La tarjeta de un W- abierto.
 * @param pedido El W-.
 * @param estado Su etapa, la de su columna.
 * @param suyos Sus renglones.
 * @param conTotal Si viaja el total.
 */
function tarjetaDe(
	pedido: PedidoLeido,
	estado: (typeof estadosAbiertosDeW)[number],
	suyos: readonly RenglonLeido[],
	conTotal: boolean,
) {
	const prometida = pedido.estado === "por_surtir" || pedido.estado === "esperando_prendas";
	// Esperando prendas, cuántas piezas faltan en aduana de todas las del W-.
	const piezas = suyos.reduce((suma, renglon) => suma + renglon.cantidad, 0);
	const faltan = suyos.filter((renglon) => !enAduana(renglon)).reduce((suma, renglon) => suma + renglon.cantidad, 0);
	return {
		pedido_linea_id: pedido.id,
		folio: pedido.folio,
		fecha: fechaDelPedido(pedido),
		cliente: pedido.cliente_nombre,
		municipio: pedido.envio_municipio,
		estado,
		estado_desde: pedido.estado_en,
		promesa: prometida && pedido.promesa !== null ? (promesas[pedido.promesa] ?? null) : null,
		prendas: suyos.map((renglon) => {
			const falta = loQueFalta(renglon)[0];
			return {
				prenda: renglon.producto_nombre,
				talla: renglon.talla,
				piezas: renglon.cantidad,
				en_aduana: enAduana(renglon),
				donde: enAduana(renglon) ? "En aduana" : falta === undefined ? null : dondeEsta(falta).texto,
			};
		}),
		falta: estado === "esperando_prendas" ? `Falta ${faltan} de ${piezas}` : null,
		...(conTotal ? { total_centavos: pedido.total_centavos } : {}),
		version: pedido.version,
	};
}

/**
 * Las columnas del tablero: «Esperando pago» solo si trae alguno.
 * @param base La base.
 * @param filtro El buscador y la etapa.
 * @param conTotal Si viaja el total.
 */
async function leerColumnas(
	base: Parameters<typeof leerPedidos>[0],
	filtro: { buscar: SQL; estados: readonly EstadoDeW[] },
	conTotal: boolean,
): Promise<Pedidos["columnas"]> {
	const estados = estadosAbiertosDeW.filter((estado) => filtro.estados.includes(estado));
	if (estados.length === 0) return [];
	const abiertos = await leerPedidos(
		base,
		sql`p.estado IN (${enEstados(estados)}) AND ${filtro.buscar}`,
		sql`ORDER BY coalesce(p.pagado_en, p.creado_en), p.folio`,
	);
	const renglones = await leerRenglones(
		base,
		abiertos.map((pedido) => pedido.id),
	);
	return estados.flatMap((estado) => {
		const suyos = abiertos.filter((pedido) => pedido.estado === estado);
		if (estado === "esperando_pago" && suyos.length === 0) return [];
		return [
			{
				estado,
				texto: etapas[estado].texto,
				color: etapas[estado].color,
				pedidos: suyos.map((pedido) =>
					tarjetaDe(
						pedido,
						estado,
						renglones.filter((renglon) => renglon.pedido_linea_id === pedido.id),
						conTotal,
					),
				),
			},
		];
	});
}

/**
 * Una página de los cerrados, del más reciente al más viejo.
 * @param base La base.
 * @param filtro El buscador, las etapas, el cursor y el tope.
 * @param conTotal Si viaja el total.
 */
async function leerCerrados(
	base: Parameters<typeof leerPedidos>[0],
	filtro: { buscar: SQL; estados: readonly EstadoDeW[]; cursor: string | undefined; limite: number },
	conTotal: boolean,
) {
	const estados = estadosCerrados.filter((estado) => filtro.estados.includes(estado));
	if (estados.length === 0) return { renglones: [], cursor: null, hay_mas: false };
	const despues = leerCursor(filtro.cursor);
	const desde =
		despues === undefined
			? sql`TRUE`
			: sql`(p.estado_en, p.id) < (${String(despues.en)}::timestamptz, ${String(despues.id)}::uuid)`;
	const cerrados = await leerPedidos(
		base,
		sql`p.estado IN (${enEstados(estados)}) AND ${filtro.buscar} AND ${desde}`,
		sql`ORDER BY p.estado_en DESC, p.id DESC LIMIT ${filtro.limite + 1}`,
	);
	return paginar(
		cerrados.map((pedido) => ({
			pedido_linea_id: pedido.id,
			folio: pedido.folio,
			estado: pedido.estado === "vencido" ? ("vencido" as const) : ("cancelado" as const),
			estado_texto: etapas[pedido.estado],
			fecha: textoDeMomentoCorto(pedido.cancelado_en ?? pedido.estado_en),
			detalle: `${pedido.cliente_nombre} · ${pedido.envio_municipio} · ${
				pedido.estado === "vencido" ? "Venció sin pago" : (pedido.motivo_cancelacion ?? "")
			}`,
			...(conTotal ? { total_centavos: pedido.total_centavos } : {}),
			en: pedido.estado_en,
		})),
		filtro.limite,
		(cerrado) => ({ en: cerrado.en, id: cerrado.pedido_linea_id }),
	);
}

export const consultaPedidosLinea = implementarConsulta(pedidosLinea, async ({ base, quien }, parametros) => {
	const conTotal = tieneDepartamento(quien, "linea");
	const estados = parametros.estados ?? estadosDeW;
	const buscar = filtroDelBuscador(parametros.buscar);
	// Los abiertos llegan completos en la primera página; las que siguen solo traen cerrados.
	const columnas = parametros.cursor === undefined ? await leerColumnas(base, { buscar, estados }, conTotal) : [];
	const pagina = await leerCerrados(
		base,
		{ buscar, estados, cursor: parametros.cursor, limite: parametros.limite ?? cerradosPorPagina },
		conTotal,
	);
	return {
		resultado: {
			columnas,
			cerrados: pagina.renglones.map(({ en: _en, ...cerrado }) => cerrado),
			cursor: pagina.cursor,
			hay_mas: pagina.hay_mas,
		},
		...(conTotal ? {} : { recortado: ["total_centavos"] }),
	};
});
