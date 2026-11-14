/**
 * `ventas.notas_entrega`: la pestaña Notas de entrega.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Notas de entrega»)
 *
 * Las notas que no se cancelaron: por despachar, en camino y entregadas; dentro de cada estado, la más nueva primero.
 * El buscador pide todas sus palabras en la nota, el pedido, las prendas o el cliente; los conteos por estado no
 * cambian con el buscador ni con el pedido. El pago de cada nota lo da `contaduria.estado_pago_notas`.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { rangoDeTallas } from "@uniformame/compartido/calculos/textos";
import { notasEntregaVentas } from "@uniformame/compartido/contratos/ventas/consultas-notas";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { estadosDeNota, leerPedidos, llevaTodas, paraBuscar, porPrenda, textoDeFormaDePago } from "./comun.ts";
import { leerLineas, leerNotas } from "./notas.ts";

/** El orden de los estados en la lista. */
const ordenDeEstados = ["por_despachar", "en_camino", "entregada"] as const;

export const consultaNotasEntrega = implementarConsulta(notasEntregaVentas, async ({ base }, parametros) => {
	const notas = (await leerNotas(base)).flatMap((nota) =>
		nota.estado === "cancelada" ? [] : [{ ...nota, estado: nota.estado }],
	);
	const lineas = await leerLineas(
		base,
		notas.map((nota) => nota.id),
	);
	const cuantas = (estado: (typeof ordenDeEstados)[number]) => notas.filter((nota) => nota.estado === estado).length;
	// El filtro del pedido lleva su folio, aunque todavía no tenga notas.
	const [pedido] =
		parametros.pedido_id === undefined ? [undefined] : await leerPedidos(base, { pedidoId: parametros.pedido_id });
	if (parametros.pedido_id !== undefined && pedido === undefined) throw noExiste();
	const armadas = notas.map((nota) => {
		const prendas = [...porPrenda(lineas.filter((linea) => linea.nota_id === nota.id)).values()];
		return {
			nota_id: nota.id,
			folio: nota.folio,
			fecha: textoDeDiaCorto(nota.armada),
			pedido_id: nota.pedido_id,
			pedido_folio: nota.pedido_folio,
			nota_de: `nota ${nota.numero_en_pedido} de ${nota.de}`,
			cliente: nota.cliente,
			prendas: prendas.map((suyas) => suyas[0]?.prenda ?? "").join(", "),
			tallas: prendas.map((suyas) => rangoDeTallas(suyas)).join(" · "),
			piezas: prendas.flat().reduce((total, linea) => total + linea.cantidad, 0),
			estado: nota.estado,
			estado_armado: { ...(estadosDeNota[nota.estado] ?? { texto: nota.estado, color: "gris" as const }), abajo: null },
			forma_pago: textoDeFormaDePago(nota.forma_pago, nota.dias_credito),
			total_centavos: nota.subtotal_centavos,
			buscable: paraBuscar(
				[nota.folio, nota.pedido_folio, nota.cliente, ...prendas.map((suyas) => suyas[0]?.prenda ?? "")].join(" "),
			),
		};
	});
	return {
		resultado: {
			conteos: {
				todas: notas.length,
				por_despachar: cuantas("por_despachar"),
				en_camino: cuantas("en_camino"),
				entregada: cuantas("entregada"),
			},
			pedido: pedido === undefined ? null : { pedido_id: pedido.id, folio: pedido.folio },
			notas: armadas
				.filter(
					(nota) =>
						(parametros.estado === undefined || nota.estado === parametros.estado) &&
						(parametros.pedido_id === undefined || nota.pedido_id === parametros.pedido_id) &&
						llevaTodas(nota.buscable, parametros.buscar),
				)
				.sort((una, otra) => ordenDeEstados.indexOf(una.estado) - ordenDeEstados.indexOf(otra.estado))
				.map(({ buscable: _buscable, ...nota }) => nota),
		},
	};
});
