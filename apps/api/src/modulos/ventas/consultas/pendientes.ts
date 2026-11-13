/**
 * `ventas.pendientes` y la pastilla de Ventas a externos: la barra de indicadores y la cola de trabajo de Ventas.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Quién entra», «Pendientes»)
 *
 * Los renglones salen del avance de cada pedido (`ventas.avance_pedido`): un borrador por revisar, lo listo en aduana
 * por armar en nota, lo que falta mandar a producción, un pedido atrasado, en riesgo o con un cambio por aplicar, una
 * nota en camino por confirmar y un cliente detenido por crédito. La pastilla cuenta los mismos renglones y va roja si
 * alguno es rojo.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { pendientesVentas } from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { parametroEntero } from "../../../nucleo/acceso/sesion.ts";
import type { ContextoDeConsulta, Pastilla } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	type Avance,
	avanceDe,
	type ClaveDeEtapa,
	type Color,
	creditosDe,
	diasHasta,
	etapas,
	fechaDeEntrega,
	leerClientes,
	leerPedidos,
	leerRenglones,
	type PedidoLeido,
	type RenglonLeido,
	sumar,
	textoDeAlerta,
	tiposDeCliente,
} from "./comun.ts";

/** Un renglón de Pendientes, como lo da el contrato. */
type Renglon = z.infer<typeof pendientesVentas.resultado>["renglones"][number];

/** Lo que cuenta de las notas de entrega. */
const notaEnCamino = z.object({
	id: z.uuid(),
	folio: z.string(),
	pedido_id: z.uuid(),
	pedido: z.string(),
	cliente: z.string(),
	despacho: z.string().nullable(),
	salida: z.string().nullable(),
	piezas: z.coerce.number(),
});

/** Un estado armado. */
const estado = (texto: string, color: Color, abajo: string | null = null) => ({ texto, color, abajo });

/** La acción de un renglón. */
const accion = (
	tipo: Renglon["accion"]["tipo"],
	texto: string,
	ids: { pedido?: string; nota?: string; cliente?: string },
) => ({ tipo, texto, pedido_id: ids.pedido ?? null, nota_id: ids.nota ?? null, cliente_id: ids.cliente ?? null });

/**
 * Los renglones de un pedido: un borrador, o lo listo por armar, lo que falta mandar y su alerta.
 * @param pedido El pedido.
 * @param suyos Sus renglones vigentes.
 * @param avance Su avance, si está confirmado.
 * @param datos Hoy, los días en riesgo y la fecha del cambio por aplicar, si hay.
 */
function renglonesDelPedido(
	pedido: PedidoLeido,
	suyos: readonly RenglonLeido[],
	avance: Avance | undefined,
	datos: { hoy: ContextoDeConsulta["diaDeNegocio"]; diasEnRiesgo: number; cambio: string | undefined },
): Renglon[] {
	const titulo = `${pedido.folio} · ${pedido.cliente}`;
	const entrega = fechaDeEntrega(pedido.fecha_entrega, datos.hoy, datos.diasEnRiesgo);
	const total = suyos.reduce((suma, renglon) => suma + renglon.cantidad * renglon.precio_unitario_centavos, 0);
	const piezas = suyos.reduce((suma, renglon) => suma + renglon.cantidad, 0);
	const comun = { fecha: entrega, piezas: null, importe_centavos: total };
	if (avance === undefined) {
		const productos = new Set(suyos.filter((renglon) => renglon.cantidad > 0).map((renglon) => renglon.producto_id));
		return [
			{
				clave: `borrador-${pedido.id}`,
				grupo: "pedidos",
				tipo: "borrador",
				titulo,
				detalle: `${plural(piezas, "pieza", "piezas")} · ${plural(productos.size, "producto", "productos")} · sin confirmar`,
				...comun,
				estado: estado("Borrador", "gris"),
				accion: accion("revisar", "Revisar", { pedido: pedido.id }),
			},
		];
	}
	const atrasado = diasHasta(datos.hoy, pedido.fecha_entrega) < 0;
	const alerta = textoDeAlerta(avance, pedido.fecha_entrega, datos.hoy);
	const renglones: Renglon[] = [];
	const listas = sumar(avance.tallas, (talla) => talla.listo);
	if (listas > 0) {
		const faltan = sumar(avance.tallas, (talla) =>
			Math.max(0, talla.pedido - talla.entregado - talla.en_nota - talla.listo),
		);
		const precioDe = (varianteId: string) =>
			suyos.find((renglon) => renglon.variante_id === varianteId)?.precio_unitario_centavos ?? 0;
		renglones.push({
			clave: `entrega-${pedido.id}`,
			grupo: "entregas",
			tipo: "entrega",
			titulo,
			detalle: `${plural(listas, "pieza lista", "piezas listas")} en aduana · faltan ${faltan} del pedido`,
			...comun,
			importe_centavos: sumar(avance.tallas, (talla) => talla.listo * precioDe(talla.variante_id)),
			estado: atrasado && alerta !== null ? estado(alerta, "rojo") : estado("Por armar nota", "ambar"),
			accion: accion("armar_nota", "Armar nota", { pedido: pedido.id }),
		});
	}
	const porMandar = sumar(avance.tallas, (talla) => talla.por_mandar);
	if (porMandar > 0) {
		renglones.push({
			clave: `mandar-${pedido.id}`,
			grupo: "pedidos",
			tipo: "pedido",
			titulo,
			detalle: `${plural(porMandar, "pieza", "piezas")} por mandar${
				pedido.version_vigente >= 2 ? ` · versión ${pedido.version_vigente}` : ""
			}`,
			...comun,
			estado: estado("Por mandar a producción", "ambar"),
			accion: accion("mandar", "Mandar a producción", { pedido: pedido.id }),
		});
	}
	if (renglones.length > 0) return renglones;
	// Sin lo anterior: el atrasado, el que va en riesgo o el que tiene un cambio por aplicar.
	const etapa = etapas[avance.etapa].texto;
	const avanceTexto = `${etapa} · ${sumar(avance.tallas, (talla) => talla.entregado)} de ${sumar(
		avance.tallas,
		(talla) => talla.pedido,
	)} entregadas`;
	const tipo = avance.alerta?.tipo;
	const otro =
		tipo === "atrasado" && alerta !== null
			? { detalle: avanceTexto, estado: estado(alerta, "rojo" as const) }
			: tipo === "en_riesgo"
				? { detalle: avanceTexto, estado: estado("En riesgo de atraso", "ambar" as const) }
				: datos.cambio !== undefined
					? {
							detalle: `Versión ${pedido.version_vigente} · Producción la tiene desde el ${textoDeDiaCorto(datos.cambio)}`,
							estado: estado("Cambio por aplicar", "azul" as const),
						}
					: undefined;
	if (otro === undefined) return [];
	return [
		{
			clave: `pedido-${pedido.id}`,
			grupo: "pedidos",
			tipo: "pedido",
			titulo,
			...comun,
			...otro,
			accion: accion("ver_pedido", "Ver pedido", { pedido: pedido.id }),
		},
	];
}

/**
 * Lee todo lo de Pendientes: los indicadores, los renglones de todos los grupos y si alguno es rojo.
 * @param contexto El contexto de la consulta (o de la pastilla).
 */
export async function leerPendientes(contexto: ContextoDeConsulta) {
	const { base, diaDeNegocio: hoy } = contexto;
	const diasEnRiesgo = await parametroEntero(base, "ventas.dias_en_riesgo");
	const diasProximas = await parametroEntero(base, "ventas.dias_entregas_proximas");
	const pedidos = await leerPedidos(base);
	const renglonesDePedidos = await leerRenglones(
		base,
		pedidos.map((pedido) => pedido.id),
	);
	const confirmados = pedidos.filter((pedido) => pedido.estado === "confirmado");
	const avances = new Map(
		await Promise.all(confirmados.map(async (pedido) => [pedido.id, await avanceDe(contexto, pedido.id)] as const)),
	);
	const { rows: cambios } = await base.execute(sql`SELECT pedido_id,
			(min(creado_en) AT TIME ZONE 'America/Mexico_City')::date::text AS desde
		FROM cambios_pedido WHERE estado = 'por_aplicar' GROUP BY pedido_id`);
	const cambioDe = new Map(
		z
			.array(z.object({ pedido_id: z.uuid(), desde: z.string() }))
			.parse(cambios)
			.map((cambio) => [cambio.pedido_id, cambio.desde]),
	);
	const renglones: Renglon[] = pedidos.flatMap((pedido) =>
		renglonesDelPedido(
			pedido,
			renglonesDePedidos.filter((renglon) => renglon.pedido_id === pedido.id),
			avances.get(pedido.id),
			{ hoy, diasEnRiesgo, cambio: cambioDe.get(pedido.id) },
		),
	);
	// Las notas en camino, por confirmar su entrega.
	const { rows: enCamino } = await base.execute(sql`SELECT n.id, n.folio, n.pedido_id, p.folio AS pedido,
			t.nombre AS cliente, d.folio AS despacho, (n.despachado_en AT TIME ZONE 'America/Mexico_City')::date::text AS salida,
			coalesce((SELECT sum(l.cantidad) FROM nota_entrega_lineas l WHERE l.nota_entrega_id = n.id), 0) AS piezas
		FROM notas_entrega n JOIN pedidos p ON p.id = n.pedido_id JOIN clientes c ON c.id = n.cliente_id
		JOIN terceros t ON t.id = c.tercero_id LEFT JOIN despachos d ON d.id = n.despacho_id
		WHERE n.estado = 'en_camino' ORDER BY n.despachado_en`);
	for (const nota of z.array(notaEnCamino).parse(enCamino)) {
		renglones.push({
			clave: `nota-${nota.id}`,
			grupo: "entregas",
			tipo: "nota",
			titulo: `${nota.folio} · ${nota.cliente}`,
			detalle: `Pedido ${nota.pedido} · salió con ${nota.despacho ?? "su despacho"}`,
			fecha:
				nota.salida === null
					? null
					: { fecha: nota.salida, texto: textoDeDiaCorto(nota.salida), cuando: "", tono: "normal" },
			importe_centavos: null,
			piezas: nota.piezas,
			estado: estado("Por confirmar entrega", "ambar"),
			accion: accion("confirmar_entrega", "Confirmar entrega", { nota: nota.id, pedido: nota.pedido_id }),
		});
	}
	// Los clientes activos detenidos por crédito.
	const clientes = (await leerClientes(base)).filter((cliente) => cliente.baja_en === null);
	const creditos = await creditosDe(
		contexto,
		clientes.map((cliente) => cliente.id),
	);
	for (const cliente of clientes) {
		if (creditos.get(cliente.id)?.detenido !== true) continue;
		renglones.push({
			clave: `credito-${cliente.id}`,
			grupo: "clientes",
			tipo: "credito",
			titulo: cliente.nombre,
			detalle: `${tiposDeCliente[cliente.tipo] ?? cliente.tipo} en ${cliente.municipio} · no se le pueden levantar pedidos nuevos`,
			fecha: null,
			importe_centavos: null,
			piezas: null,
			estado: estado("Detenido por crédito", "rojo"),
			accion: accion("ver_cliente", "Ver cliente", { cliente: cliente.id }),
		});
	}
	// Los indicadores.
	const etapaDe = (pedido: PedidoLeido): ClaveDeEtapa =>
		pedido.estado === "borrador" ? "borrador" : (avances.get(pedido.id)?.etapa ?? "confirmado");
	const porEtapa = (clave: ClaveDeEtapa) => pedidos.filter((pedido) => etapaDe(pedido) === clave).length;
	const tallas = [...avances.values()].flatMap((avance) => avance.tallas);
	const listas = sumar(tallas, (talla) => talla.listo);
	const dias = confirmados.map((pedido) => diasHasta(hoy, pedido.fecha_entrega));
	const atrasados = dias.filter((dia) => dia < 0).length;
	const { rows: notas } = await base.execute(sql`SELECT
			count(*) FILTER (WHERE estado = 'por_despachar')::int AS por_despachar,
			count(*) FILTER (WHERE estado = 'en_camino')::int AS en_camino,
			count(*) FILTER (WHERE estado = 'entregada' AND date_trunc('month', fecha_entrega) = date_trunc('month', ${hoy.toString()}::date))::int AS del_mes
		FROM notas_entrega`);
	const deNotas = z.object({ por_despachar: z.number(), en_camino: z.number(), del_mes: z.number() }).parse(notas[0]);
	const detenidos = clientes.filter((cliente) => creditos.get(cliente.id)?.detenido === true).length;
	const cerca = clientes.filter(
		(cliente) => creditos.get(cliente.id)?.detenido !== true && creditos.get(cliente.id)?.cercaDelLimite === true,
	).length;
	const cifras = [
		{
			clave: "pedidos_abiertos" as const,
			nombre: "Pedidos abiertos",
			numero: pedidos.length,
			contexto: [{ texto: `${porEtapa("borrador")} en borrador`, tono: "normal" as const }],
			reparto: (["borrador", "confirmado", "en_produccion", "listo_en_aduana", "entrega_parcial"] as const).map(
				(clave) => ({ etiqueta: etapas[clave].texto, valor: porEtapa(clave), color: etapas[clave].color }),
			),
			pestana: "pedidos" as const,
		},
		{
			clave: "piezas_por_entregar" as const,
			nombre: "Piezas por entregar",
			numero: sumar(tallas, (talla) => talla.pedido - talla.entregado),
			contexto: [
				listas > 0
					? { texto: `${plural(listas, "lista", "listas")} en aduana`, tono: "ambar" as const }
					: { texto: "Ninguna lista en aduana", tono: "normal" as const },
			],
			reparto: null,
			pestana: "pedidos" as const,
		},
		{
			clave: "entregas_proximas" as const,
			nombre: `Entregas en ${plural(diasProximas, "día", "días")}`,
			numero: dias.filter((dia) => dia >= 0 && dia <= diasProximas).length,
			contexto: [
				atrasados > 0
					? { texto: plural(atrasados, "pedido atrasado", "pedidos atrasados"), tono: "rojo" as const }
					: { texto: "Ninguno atrasado", tono: "normal" as const },
			],
			reparto: null,
			pestana: "pedidos" as const,
		},
		{
			clave: "notas_entrega" as const,
			nombre: "Notas de entrega",
			numero: deNotas.por_despachar + deNotas.en_camino,
			contexto: [
				{ texto: `${deNotas.por_despachar} por despachar · ${deNotas.en_camino} en camino`, tono: "normal" as const },
			],
			reparto: [
				{ etiqueta: "Entregadas en el mes", valor: deNotas.del_mes, color: "verde" as const },
				{ etiqueta: "Por despachar", valor: deNotas.por_despachar, color: "morado" as const },
				{ etiqueta: "En camino", valor: deNotas.en_camino, color: "ambar" as const },
			],
			pestana: "notas" as const,
		},
		{
			clave: "clientes" as const,
			nombre: "Clientes",
			numero: clientes.length,
			contexto: [
				detenidos > 0
					? { texto: plural(detenidos, "detenido por crédito", "detenidos por crédito"), tono: "rojo" as const }
					: cerca > 0
						? { texto: `${cerca} cerca de su límite`, tono: "ambar" as const }
						: { texto: "Todos al corriente", tono: "normal" as const },
			],
			reparto: [
				{ etiqueta: "Al corriente", valor: clientes.length - detenidos - cerca, color: "verde" as const },
				{ etiqueta: "Cerca del límite", valor: cerca, color: "ambar" as const },
				{ etiqueta: "Detenido", valor: detenidos, color: "rojo" as const },
			],
			pestana: "clientes" as const,
		},
	];
	const cuantos = (grupo: Renglon["grupo"]) => renglones.filter((renglon) => renglon.grupo === grupo).length;
	return {
		cifras,
		conteos: {
			todos: renglones.length,
			pedidos: cuantos("pedidos"),
			entregas: cuantos("entregas"),
			clientes: cuantos("clientes"),
		},
		renglones,
		rojo: renglones.some((renglon) => renglon.estado.color === "rojo"),
	};
}

export const consultaPendientesVentas = implementarConsulta(pendientesVentas, async (contexto, parametros) => {
	const pendientes = await leerPendientes(contexto);
	const grupo = parametros.grupo ?? "todos";
	return {
		resultado: {
			...pendientes,
			renglones:
				grupo === "todos" ? pendientes.renglones : pendientes.renglones.filter((renglon) => renglon.grupo === grupo),
		},
	};
});

/** La pastilla de Ventas a externos: los renglones de Pendientes; roja si alguno es rojo. */
export const pastillaVentas: Pastilla = async (contexto) => {
	const { conteos, rojo } = await leerPendientes(contexto);
	return { conteo: conteos.todos, rojo };
};
