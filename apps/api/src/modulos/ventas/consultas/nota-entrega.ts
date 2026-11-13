/**
 * `ventas.nota_entrega`: el cajón de una nota de entrega.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Nota de entrega (ancho)»)
 *
 * Su encabezado, los botones con cifra (el pedido, el despacho y el pago), sus datos, sus prendas por talla, sus
 * totales con el anticipo y sus notas de crédito, y lo que se puede hacer según su estado. Aduana la abre desde En
 * tránsito con su recorte: sin precios, importes ni anticipo. El saldo solo viaja a quien tiene Contaduría; a los
 * demás, el estado del pago.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { notaEntregaVentas } from "@uniformame/compartido/contratos/ventas/consultas-notas";
import { preciosRecortables } from "@uniformame/compartido/contratos/ventas/vistas";
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	avanceDe,
	diasHasta,
	estadosDeNota,
	etapas,
	porPrenda,
	textoDeFormaDePago,
	textosDePago,
	tieneDepartamento,
} from "./comun.ts";
import { leerLineas, leerNotas } from "./notas.ts";

/** Lo que regresa `contaduria.estado_pago_notas`. */
const pagoLeido = z.object({
	notas: z.array(z.object({ estado: z.string(), saldo_centavos: z.number().optional() })),
});

/** Las notas de crédito de la nota. */
const notasDeCredito = z.array(
	z.object({
		id: z.uuid(),
		folio: z.string().nullable(),
		estado: z.string(),
		monto_centavos: z.coerce.number(),
		au: z.string().nullable(),
	}),
);

/** Lo que ya regresa en notas de crédito no rechazadas, por renglón. */
const yaRegresan = z.array(z.object({ linea_id: z.uuid(), piezas: z.coerce.number() }));

export const consultaNotaEntrega = implementarConsulta(notaEntregaVentas, async (contexto, parametros) => {
	const { base, diaDeNegocio: hoy } = contexto;
	const [nota] = await leerNotas(base, parametros.nota_id);
	if (nota === undefined) throw noExiste();
	const vePrecios = ["ventas", "contaduria", "direccion"].some((departamento) =>
		tieneDepartamento(contexto, departamento),
	);
	const veSaldo = tieneDepartamento(contexto, "contaduria");
	const esVentas = tieneDepartamento(contexto, "ventas");
	const lineas = await leerLineas(base, [nota.id]);
	const entregada = nota.estado === "entregada";
	const pago = entregada
		? pagoLeido.parse(await contexto.lectura("contaduria.estado_pago_notas", { nota_entrega_ids: [nota.id] })).notas[0]
		: undefined;
	const creditos = notasDeCredito.parse(
		(
			await base.execute(sql`SELECT nc.id, nc.folio, nc.estado, nc.monto_centavos, a.folio AS au FROM notas_credito nc
			LEFT JOIN autorizaciones a ON a.id = nc.autorizacion_id WHERE nc.nota_entrega_id = ${nota.id} ORDER BY nc.creado_en`)
		).rows,
	);
	const regresan = yaRegresan.parse(
		(
			await base.execute(sql`SELECT l.nota_entrega_linea_id AS linea_id, sum(l.cantidad) AS piezas
			FROM nota_credito_lineas l JOIN notas_credito nc ON nc.id = l.nota_credito_id
			WHERE nc.nota_entrega_id = ${nota.id} AND nc.estado <> 'rechazada' GROUP BY l.nota_entrega_linea_id`)
		).rows,
	);
	const esperando = creditos.find((credito) => credito.estado === "por_autorizar");
	const autorizadas = creditos.filter((credito) => credito.estado === "autorizada");
	const etapaDelSuyo =
		nota.pedido_estado === "confirmado"
			? etapas[(await avanceDe(contexto, nota.pedido_id)).etapa].texto
			: nota.pedido_estado === "entregado"
				? "Entregado"
				: nota.pedido_estado === "cancelado"
					? "Cancelado"
					: "Borrador";
	// Entregada: vence a los días de crédito del pedido; en rojo si venció sin pagarse.
	const vence =
		entregada && nota.entregada !== null
			? (() => {
					const fecha = Temporal.PlainDate.from(nota.entregada).add({ days: nota.dias_credito }).toString();
					const dias = diasHasta(hoy, fecha);
					const vencida = dias < 0 && pago?.estado !== "pagada";
					return {
						fecha,
						texto: textoDeDiaCorto(fecha),
						cuando:
							dias < 0
								? `hace ${plural(-dias, "día", "días")}`
								: dias === 0
									? "hoy"
									: `en ${plural(dias, "día", "días")}`,
						tono: vencida ? ("rojo" as const) : ("normal" as const),
					};
				})()
			: null;
	const subtotal = nota.subtotal_centavos;
	const anticipo = nota.anticipo_aplicado_centavos;
	const precios = vePrecios
		? {
				subtotal_centavos: subtotal,
				anticipo_aplicado_centavos: anticipo,
				...(entregada ? {} : { por_cobrar_centavos: subtotal - anticipo }),
				total_centavos: subtotal,
			}
		: {};
	const saldo = veSaldo && pago?.saldo_centavos !== undefined ? { saldo_centavos: pago.saldo_centavos } : {};
	const recortado = [
		...(vePrecios ? [] : preciosRecortables.filter((campo) => campo !== "saldo_centavos")),
		...(veSaldo ? [] : ["saldo_centavos"]),
	];
	return {
		resultado: {
			nota_id: nota.id,
			folio: nota.folio,
			version: nota.version,
			numero: nota.numero_en_pedido,
			de: nota.de,
			estado: nota.estado,
			estado_armado: { ...(estadosDeNota[nota.estado] ?? { texto: nota.estado, color: "gris" as const }), abajo: null },
			cliente: { cliente_id: nota.cliente_id, nombre: nota.cliente, color: nota.color },
			pedido: { pedido_id: nota.pedido_id, folio: nota.pedido_folio, etapa: etapaDelSuyo.toLocaleLowerCase("es-MX") },
			despacho:
				nota.estado === "por_despachar"
					? "En aduana · por despachar"
					: `${nota.despacho ?? "Despacho"} · ${nota.estado === "en_camino" ? "en camino" : "despacho"}`,
			pago: pago === undefined ? "— · se cobra al entregar" : (textosDePago[pago.estado] ?? pago.estado),
			cabecera:
				nota.estado === "entregada" && nota.entregada !== null
					? `Entregada el ${textoDeDiaCorto(nota.entregada)}`
					: nota.estado === "en_camino" && nota.salio !== null
						? `Salió el ${textoDeDiaCorto(nota.salio)}`
						: `Armada el ${textoDeDiaCorto(nota.armada)}`,
			piezas: lineas.reduce((total, linea) => total + linea.cantidad, 0),
			forma_pago: textoDeFormaDePago(nota.forma_pago, nota.dias_credito),
			armo: nota.armo ?? "—",
			salio: nota.salio === null ? null : `${textoDeDiaCorto(nota.salio)} · ${nota.despacho ?? ""}`,
			recibio: nota.recibio,
			vence,
			prendas: [...porPrenda(lineas).values()].map((suyas) => {
				const piezas = suyas.reduce((total, linea) => total + linea.cantidad, 0);
				const precio = suyas[0]?.precio_unitario_centavos ?? 0;
				return {
					nombre: suyas[0]?.prenda ?? "",
					escuela: suyas[0]?.escuela ?? "Básico",
					tallas: suyas.map((linea) => ({ talla: linea.talla, piezas: linea.cantidad })),
					piezas,
					...(vePrecios
						? {
								precio_unitario_centavos: precio,
								importe_centavos: suyas.reduce(
									(total, linea) => total + linea.cantidad * linea.precio_unitario_centavos,
									0,
								),
							}
						: {}),
				};
			}),
			...precios,
			notas_credito: autorizadas.map((credito) => ({
				folio: credito.folio ?? "",
				...(vePrecios ? { monto_centavos: credito.monto_centavos } : {}),
			})),
			...saldo,
			esperando: esperando === undefined ? null : `${esperando.au ?? ""} · esperando autorización de Dirección`,
			lineas: lineas.map((linea) => ({
				nota_entrega_linea_id: linea.id,
				prenda: linea.prenda,
				talla: linea.talla,
				pueden_regresar: linea.cantidad - (regresan.find((suya) => suya.linea_id === linea.id)?.piezas ?? 0),
			})),
			puede: {
				cancelar: esVentas && nota.estado === "por_despachar",
				confirmar_entrega: (esVentas || tieneDepartamento(contexto, "aduana")) && nota.estado === "en_camino",
				nota_credito: esVentas && entregada && esperando === undefined,
				pdf: nota.estado !== "cancelada",
			},
		},
		recortado,
	};
});
