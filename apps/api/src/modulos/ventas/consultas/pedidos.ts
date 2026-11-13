/**
 * `ventas.pedidos`: la pestaña Pedidos, por cliente o por estado.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pedidos»)
 *
 * Los abiertos (borradores y confirmados) y, si se piden, los entregados al final; los cancelados nunca. Cada pedido
 * lleva sus prendas, su entrega con su texto, su avance, su etapa con su alerta, sus notas y su total. El buscador pide
 * todas sus palabras en el folio, las prendas, las notas o el cliente; los conteos por etapa no cambian con el filtro
 * de etapa. Por cliente, los grupos van con su crédito; sin filtros salen todos los clientes activos.
 */

import { pedidosVentas } from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import type { z } from "zod";
import { parametroEntero } from "../../../nucleo/acceso/sesion.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	avanceDe,
	type ClaveDeEtapa,
	creditosDe,
	etapaDelPedido,
	etapas,
	fechaDeEntrega,
	leerClientes,
	leerNotasDePedidos,
	leerPedidos,
	leerRenglones,
	llevaTodas,
	paraBuscar,
	plural,
	prendasDelPedido,
	sumar,
	tiposDeCliente,
	tramosDeAvance,
} from "./comun.ts";

/** Un pedido de la lista, como lo da el contrato. */
type PedidoEnLista = z.infer<typeof pedidosVentas.resultado>["pedidos"][number];

/** Las etapas en el orden de los filtros. */
const ordenDeEtapas: readonly ClaveDeEtapa[] = [
	"borrador",
	"confirmado",
	"en_produccion",
	"listo_en_aduana",
	"entrega_parcial",
	"entregado",
];

export const consultaPedidosVentas = implementarConsulta(pedidosVentas, async (contexto, parametros) => {
	const { base, diaDeNegocio: hoy } = contexto;
	const conEntregados = parametros.mostrar_entregados === "si";
	const diasEnRiesgo = await parametroEntero(base, "ventas.dias_en_riesgo");
	const pedidos = await leerPedidos(base, { entregados: conEntregados });
	const ids = pedidos.map((pedido) => pedido.id);
	const renglones = await leerRenglones(base, ids);
	const notas = await leerNotasDePedidos(base, ids);
	const avances = new Map(
		await Promise.all(
			pedidos
				.filter((pedido) => pedido.estado !== "borrador")
				.map(async (pedido) => [pedido.id, await avanceDe(contexto, pedido.id)] as const),
		),
	);
	const armados = pedidos.map((pedido): PedidoEnLista & { buscable: string } => {
		const suyos = renglones.filter((renglon) => renglon.pedido_id === pedido.id);
		const susNotas = notas.filter((nota) => nota.pedido_id === pedido.id);
		const avance = avances.get(pedido.id);
		const etapa = etapaDelPedido(pedido, avance, hoy);
		const prendas = prendasDelPedido(suyos);
		const piezas = suyos.reduce((total, renglon) => total + renglon.cantidad, 0);
		return {
			pedido_id: pedido.id,
			folio: pedido.folio,
			version_vigente: pedido.version_vigente,
			cliente_id: pedido.cliente_id,
			cliente: pedido.cliente,
			prendas: prendas.nombres,
			prendas_detalle: prendas.detalle,
			piezas,
			entrega: fechaDeEntrega(pedido.fecha_entrega, hoy, diasEnRiesgo, pedido.estado === "entregado"),
			avance:
				avance === undefined
					? null
					: {
							texto: `${sumar(avance.tallas, (talla) => talla.entregado)} de ${sumar(
								avance.tallas,
								(talla) => talla.pedido,
							)} entregadas`,
							tramos: tramosDeAvance(avance.tallas),
						},
			etapa: { clave: etapa.clave, texto: etapa.texto },
			estado: etapa.estado,
			notas: { cuantas: susNotas.length, ultimas: susNotas.slice(-2).map((nota) => nota.folio) },
			total_centavos: suyos.reduce((total, renglon) => total + renglon.cantidad * renglon.precio_unitario_centavos, 0),
			buscable: paraBuscar(
				[
					pedido.folio,
					pedido.cliente,
					...suyos.map((renglon) => renglon.prenda),
					...susNotas.map((nota) => nota.folio),
				].join(" "),
			),
		};
	});
	const buscados = armados.filter((pedido) => llevaTodas(pedido.buscable, parametros.buscar));
	const etapasConConteo = ordenDeEtapas
		.filter((clave) => clave !== "entregado" || conEntregados)
		.map((clave) => ({
			clave,
			texto: etapas[clave].texto,
			color: etapas[clave].color,
			conteo: buscados.filter((pedido) => pedido.etapa.clave === clave).length,
		}));
	const filtrados = buscados
		.filter((pedido) => parametros.etapa === undefined || pedido.etapa.clave === parametros.etapa)
		// Los entregados al final; los demás por entrega.
		.sort(
			(uno, otro) =>
				Number(uno.etapa.clave === "entregado") - Number(otro.etapa.clave === "entregado") ||
				uno.entrega.fecha.localeCompare(otro.entrega.fecha) ||
				uno.folio.localeCompare(otro.folio),
		)
		.map(({ buscable: _buscable, ...pedido }) => pedido);
	if (parametros.vista === "estado")
		return { resultado: { etapas: etapasConConteo, clientes: [], pedidos: filtrados } };
	// Por cliente: sin filtros, todos los activos; con filtros, solo los que tienen pedidos en la lista.
	const conFiltros = (parametros.buscar ?? "").trim() !== "" || parametros.etapa !== undefined;
	const clientes = (await leerClientes(base)).filter(
		(cliente) =>
			filtrados.some((pedido) => pedido.cliente_id === cliente.id) || (!conFiltros && cliente.baja_en === null),
	);
	const creditos = await creditosDe(
		contexto,
		clientes.map((cliente) => cliente.id),
	);
	return {
		resultado: {
			etapas: etapasConConteo,
			clientes: clientes.map((cliente) => {
				const credito = creditos.get(cliente.id);
				const suyos = filtrados.filter((pedido) => pedido.cliente_id === cliente.id).length;
				return {
					cliente_id: cliente.id,
					nombre: cliente.nombre,
					color: cliente.color,
					descripcion: `${tiposDeCliente[cliente.tipo] ?? cliente.tipo} en ${cliente.municipio} · ${plural(suyos, "pedido", "pedidos")}`,
					credito: { texto: credito?.texto ?? "Sin crédito", color: credito?.color ?? "gris" },
					detenido: credito?.detenido ?? false,
				};
			}),
			pedidos: filtrados,
		},
	};
});
