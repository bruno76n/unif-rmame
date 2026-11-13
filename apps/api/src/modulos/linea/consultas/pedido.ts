/**
 * `linea.pedido`: el cajón del pedido en línea. El W- con su cliente, su envío, su pago, cada prenda con dónde está
 * (de sus reservas y sus traspasos), sus excepciones abiertas con quién las resuelve, su camino y lo que se puede
 * hacer con él. Su historial lo da `admin.historial_entidad`.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Pedido en línea (ancho)»)
 *
 * Solo Tienda en línea lo abre: lleva precios, el pago y el contacto del cliente.
 */

import { textoDeMomentoCorto } from "@uniformame/compartido/calculos/fechas";
import { pedidoLinea } from "@uniformame/compartido/contratos/linea/consultas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Base } from "../../../nucleo/base/conexion.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	type Color,
	diaYHora,
	dondeEsta,
	etapas,
	leerPedidos,
	leerRenglones,
	type PedidoLeido,
	promesas,
	type RenglonLeido,
} from "./comun.ts";

/** Lo que da la consulta. */
type Pedido = z.infer<typeof pedidoLinea.resultado>;

/** Los estados desde los que se cancela un W-: mientras no se empaque (regla 7 de pedidos en línea). */
const cancelables = new Set(["esperando_pago", "por_surtir", "esperando_prendas", "listo_para_empacar"]);

/** El aviso de cada excepción de un W-, con quién la resuelve (ver docs/modulos/inventario/excepciones.md). */
const avisoDeExcepcion: Readonly<Record<string, string>> = {
	pedido_linea_sin_pieza: "Sin pieza: Bodega la busca",
	pago_despues_de_vencer: "El pago llegó cuando ya no había pieza: Bodega la busca",
	variante_sin_canal_linea: "Una prenda no se vende en línea: lo revisa Bodega",
	totales_no_cuadran: "Los totales no cuadran: lo revisa Contaduría",
	pago_de_pedido_cancelado: "Llegó el pago de un pedido cancelado: lo revisa Contaduría",
};

/** Quién resuelve cada bandeja de excepciones. */
const bandejas: Readonly<Record<string, string>> = { bodega: "Bodega", contaduria: "Contaduría" };

/**
 * Los avisos de las excepciones abiertas de un W-, una por excepción.
 * @param base La base.
 * @param pedidoId El W-.
 */
async function avisosDe(base: Base, pedidoId: string): Promise<string[]> {
	const { rows } = await base.execute(sql`SELECT tipo, area, descripcion FROM excepciones
		WHERE documento_id = ${pedidoId}::uuid AND estado = 'por_revisar' ORDER BY detectada_en, id`);
	return z
		.array(z.object({ tipo: z.string(), area: z.string(), descripcion: z.string() }))
		.parse(rows)
		.map(
			(excepcion) =>
				avisoDeExcepcion[excepcion.tipo] ??
				`${excepcion.descripcion}: lo revisa ${bandejas[excepcion.area] ?? excepcion.area}`,
		);
}

/**
 * Dónde está cada parte de una prenda, sin repetir el mismo lugar.
 * @param renglon El renglón.
 */
function dondeDe(renglon: RenglonLeido): { texto: string; color: Color }[] {
	const lugares = new Map<string, { texto: string; color: Color }>();
	for (const parte of renglon.partes) {
		const donde = dondeEsta(parte);
		lugares.set(donde.texto, donde);
	}
	return [...lugares.values()];
}

/**
 * El camino del pedido: pagó, surtido a aduana y prendas reunidas en aduana, marcados conforme se cumplen.
 * @param pedido El W-.
 * @param renglones Sus renglones.
 */
function caminoDe(pedido: PedidoLeido, renglones: readonly RenglonLeido[]): Pedido["camino"] {
	const listo = pedido.estado === "listo_para_empacar";
	const surtido =
		listo ||
		pedido.estado === "esperando_prendas" ||
		renglones.some((renglon) => renglon.partes.some((parte) => parte.tipo !== "bodega" && parte.tipo !== "tienda"));
	return [
		{
			texto: "Pagó",
			detalle: pedido.pagado_en === null ? null : diaYHora(pedido.pagado_en),
			hecho: pedido.pago_estado === "pagado",
		},
		{ texto: "Surtido a aduana", detalle: null, hecho: surtido },
		{ texto: "Prendas reunidas en aduana", detalle: listo ? diaYHora(pedido.estado_en) : null, hecho: listo },
	];
}

/**
 * Cómo se cerró un W-: «Cancelado el {fecha} por {persona}: {motivo}» o «Venció sin pago el {fecha}».
 * @param pedido El W-.
 */
function cierreDe(pedido: PedidoLeido): string | null {
	if (pedido.estado === "cancelado") {
		return `Cancelado el ${textoDeMomentoCorto(pedido.cancelado_en ?? pedido.estado_en)} por ${
			pedido.cancelado_por ?? "el sistema"
		}: ${pedido.motivo_cancelacion ?? ""}`;
	}
	return pedido.estado === "vencido" ? `Venció sin pago el ${textoDeMomentoCorto(pedido.estado_en)}` : null;
}

/**
 * La línea del total: lo que pagó, o lo que falta y cuándo vence.
 * @param pedido El W-.
 */
function lineaDelTotal(pedido: PedidoLeido): string {
	if (pedido.pago_estado === "pagado") return "pagó, con envío";
	if (pedido.pago_vence_en !== null) return `por pagar · vence ${diaYHora(pedido.pago_vence_en)}`;
	return "no se pagó";
}

/**
 * Arma el cajón de un W-.
 * @param pedido El W-.
 * @param renglones Sus renglones.
 * @param avisos Sus excepciones abiertas.
 */
function armar(pedido: PedidoLeido, renglones: readonly RenglonLeido[], avisos: string[]): Pedido {
	const piezasEn = (tipo: string) =>
		renglones.reduce(
			(suma, renglon) =>
				suma + renglon.partes.filter((parte) => parte.tipo === tipo).reduce((total, parte) => total + parte.piezas, 0),
			0,
		);
	const prometida = (pedido.estado === "por_surtir" || pedido.estado === "esperando_prendas") && pedido.promesa;
	const promesa = prometida ? promesas[prometida] : undefined;
	const interior = pedido.envio_numero_interior === null ? "" : ` int. ${pedido.envio_numero_interior}`;
	return {
		pedido_linea_id: pedido.id,
		folio: pedido.folio,
		version: pedido.version,
		estado: pedido.estado,
		etapa: etapas[pedido.estado],
		cliente: { nombre: pedido.cliente_nombre, correo: pedido.cliente_correo, telefono: pedido.cliente_telefono },
		relacionados: {
			en_aduana: piezasEn("aduana"),
			prendas: renglones.reduce((suma, renglon) => suma + renglon.cantidad, 0),
			por_surtir_bodega: piezasEn("bodega"),
		},
		cifras: {
			total_centavos: pedido.total_centavos,
			total_linea: lineaDelTotal(pedido),
			municipio: pedido.envio_municipio,
			promesa:
				promesa === undefined
					? { texto: etapas[pedido.estado].texto, linea: "estado" }
					: { texto: promesa.texto, linea: "lo que se le prometió" },
		},
		envio: {
			destinatario: pedido.envio_destinatario,
			telefono: pedido.envio_telefono,
			direccion: [
				`${pedido.envio_calle} ${pedido.envio_numero_exterior}${interior}, ${pedido.envio_colonia}`,
				`${pedido.envio_codigo_postal} ${pedido.envio_municipio}, ${pedido.envio_entidad_federativa}`,
			],
			referencias: pedido.envio_referencias,
			metodo: `${pedido.envio_metodo} · ${pedido.envio_paqueteria}`,
			costo_centavos: pedido.envio_costo_centavos,
		},
		pago: {
			metodo: `${pedido.pago_pasarela} · ${pedido.pago_metodo}`,
			referencia: pedido.pago_referencia,
			pagado: pedido.pagado_en === null ? null : `Pagado el ${diaYHora(pedido.pagado_en)}`,
			comision_centavos: pedido.pago_comision_centavos,
		},
		cupon: pedido.cupon_codigo,
		avisos,
		prendas: renglones.map((renglon) => ({
			renglon: renglon.renglon,
			prenda: renglon.producto_nombre,
			talla: renglon.talla,
			piezas: renglon.cantidad,
			donde: dondeDe(renglon),
			precio_unitario_centavos: renglon.precio_unitario_centavos,
			importe_centavos: renglon.importe_centavos,
			paquete: renglon.paquete_numero === null ? null : `Paquete ${renglon.paquete_numero}`,
			descuento_paquete_centavos: renglon.descuento_paquete_centavos,
		})),
		totales: {
			subtotal_centavos: pedido.subtotal_centavos,
			descuento_centavos: pedido.descuento_centavos,
			envio_centavos: pedido.envio_costo_centavos,
			descuento_envio_centavos: pedido.descuento_envio_centavos,
			total_centavos: pedido.total_centavos,
		},
		camino: caminoDe(pedido, renglones),
		cierre: cierreDe(pedido),
		puede: { cancelar: cancelables.has(pedido.estado), ver_en_aduana: pedido.estado === "listo_para_empacar" },
	};
}

export const consultaPedidoLinea = implementarConsulta(pedidoLinea, async ({ base }, parametros) => {
	if (parametros.pedido_linea_id === undefined && parametros.folio === undefined) throw noExiste();
	const [pedido] = await leerPedidos(
		base,
		parametros.pedido_linea_id === undefined
			? sql`p.folio = ${parametros.folio}`
			: sql`p.id = ${parametros.pedido_linea_id}::uuid`,
	);
	if (pedido === undefined) throw noExiste();
	return { resultado: armar(pedido, await leerRenglones(base, [pedido.id]), await avisosDe(base, pedido.id)) };
});
