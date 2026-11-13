/**
 * `ventas.editor_pedido` y `ventas.precio_sugerido`: lo que necesitan el pedido nuevo y Modificar pedido.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pedido nuevo y Modificar pedido (ancho)»)
 *
 * El folio que sigue (o el suyo), los clientes activos con su crédito (sin montos), la forma de pago con que abre, el
 * tope de piezas por talla y, al modificar, el pedido como está con sus prendas, sus tallas y el mínimo de cada una.
 * `ventas.precio_sugerido` da una prenda más, con su precio sugerido para el cliente.
 */

import { editorPedido, precioSugeridoVentas } from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import { formasDePago } from "@uniformame/compartido/contratos/ventas/pedidos";
import { z } from "zod";
import { parametroEntero } from "../../../nucleo/acceso/sesion.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { avanceDe, creditosDe, leerClientes, leerPedidos, leerRenglones, porPrenda } from "./comun.ts";
import { prendaParaElEditor } from "./prendas.ts";

export const consultaEditorPedido = implementarConsulta(editorPedido, async (contexto, parametros) => {
	const { base, diaDeNegocio: hoy } = contexto;
	const [pedido] =
		parametros.pedido_id === undefined ? [undefined] : await leerPedidos(base, { pedidoId: parametros.pedido_id });
	if (
		parametros.pedido_id !== undefined &&
		(pedido === undefined || !["borrador", "confirmado"].includes(pedido.estado))
	)
		throw noExiste();
	const clientes = (await leerClientes(base)).filter((cliente) => cliente.baja_en === null);
	// El cliente con que abre un pedido nuevo tiene que estar activo.
	if (parametros.cliente_id !== undefined && !clientes.some((cliente) => cliente.id === parametros.cliente_id))
		throw noExiste();
	const creditos = await creditosDe(
		contexto,
		clientes.map((cliente) => cliente.id),
	);
	const folio =
		pedido?.folio ??
		z.object({ folio: z.string() }).parse(await contexto.lectura("admin.siguiente_folio", { tipo: "pedido" })).folio;
	let prendas: Awaited<ReturnType<typeof prendaParaElEditor>>[] = [];
	if (pedido !== undefined) {
		const renglones = await leerRenglones(base, [pedido.id]);
		const avance = pedido.estado === "confirmado" ? (await avanceDe(contexto, pedido.id)).tallas : [];
		prendas = await Promise.all(
			[...porPrenda(renglones).keys()].map((productoId) =>
				prendaParaElEditor(contexto, pedido.cliente_id, productoId, { renglones, avance }),
			),
		);
	}
	return {
		resultado: {
			folio,
			modo:
				pedido === undefined
					? ("nuevo" as const)
					: pedido.estado === "borrador"
						? ("borrador" as const)
						: ("confirmado" as const),
			version: pedido?.version ?? null,
			version_siguiente: pedido?.estado === "confirmado" ? pedido.version_vigente + 1 : null,
			hoy: hoy.toString(),
			forma_pago_inicial: z.enum(formasDePago).parse(await leerParametro(base, { clave: "ventas.forma_pago_inicial" })),
			piezas_max_talla: await parametroEntero(base, "ventas.piezas_max_talla"),
			clientes: clientes.map((cliente) => {
				const credito = creditos.get(cliente.id);
				return {
					cliente_id: cliente.id,
					nombre: cliente.nombre,
					color: cliente.color,
					detenido: credito?.detenido ?? false,
					tiene_credito: credito?.tieneCredito ?? false,
					cerca_del_limite: credito?.cercaDelLimite ?? false,
					dias_credito: credito?.diasCredito ?? 0,
				};
			}),
			pedido:
				pedido === undefined
					? null
					: {
							cliente_id: pedido.cliente_id,
							fecha_entrega: pedido.fecha_entrega,
							forma_pago: z.enum(formasDePago).parse(pedido.forma_pago),
						},
			prendas,
		},
	};
});

export const consultaPrecioSugerido = implementarConsulta(precioSugeridoVentas, async (contexto, parametros) => ({
	resultado: { prenda: await prendaParaElEditor(contexto, parametros.cliente_id, parametros.producto_id) },
}));
