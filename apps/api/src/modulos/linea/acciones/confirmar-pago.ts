/**
 * `linea.confirmar_pago`: la pasarela avisa al sitio y el sitio confirma el pago de un W-. Esperando el pago o
 * vencido, pasa a por surtir con la promesa que dan sus reservas (o listo para empacar, si todas están en Aduana);
 * cancelado, se guarda el pago y Contaduría lo ve.
 * Fase 18 · docs/modulos/linea/pedidos-en-linea.md (reglas 5 y 6, «`linea.confirmar_pago`»)
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { confirmarPago } from "@uniformame/compartido/contratos/linea/pedidos";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { bloquearPedidoLinea, candadoDelPago, enPalabras, eventoDePedido, folioConElPago } from "../dominio/pedidos.ts";
import { pedidosLinea } from "../tablas.ts";

/** Lo que regresa `inventario.confirmar_pago_reserva`. */
const pagoEnReservas = z.object({ promesa: z.enum(["sale_hoy", "sale_manana"]), todo_en_aduana: z.boolean() });

export const accionConfirmarPago = implementarAccion(confirmarPago, async (contexto, datos) => {
	const { transaccion } = contexto;
	const pedido = await bloquearPedidoLinea(transaccion, datos.pedido_linea_id);
	const respuesta = (estado: string, promesa: "sale_hoy" | "sale_manana" | null) => ({
		resultado: {
			mensaje: `${pedido.folio} pagado: ${enPalabras(estado)}`,
			pedido_linea_id: pedido.id,
			folio: pedido.folio,
			estado,
			promesa,
		},
		entidad: { nombre: "pedidos_linea", id: pedido.id },
	});
	const promesaGuardada = pedido.promesa === "sale_hoy" || pedido.promesa === "sale_manana" ? pedido.promesa : null;
	// Un W- ya pagado contesta lo mismo que la primera vez.
	if (pedido.pagoEstado === "pagado")
		return { ...respuesta(pedido.estado, promesaGuardada), sinBitacora: true as const };
	await candadoDelPago(transaccion, datos.pasarela, datos.referencia);
	const conElPago = await folioConElPago(transaccion, datos, pedido.id);
	if (conElPago !== undefined) throw errorDeRegla("pago_repetido", `Ese pago ya está en ${conElPago}.`);
	const pago = {
		pagoEstado: "pagado",
		pagoPasarela: datos.pasarela,
		pagoReferencia: datos.referencia,
		pagoMontoCentavos: datos.monto_centavos,
		pagoComisionCentavos: datos.comision_centavos ?? null,
		pagadoEn: datos.pagado_en,
		pagoVenceEn: null,
		...(datos.respuesta === undefined ? {} : { pagoRespuesta: datos.respuesta }),
	};
	const documento = { documento_tipo: "pedido_linea", documento_id: pedido.id, documento_folio: pedido.folio } as const;
	let estado = pedido.estado;
	let promesa: "sale_hoy" | "sale_manana" | null = promesaGuardada;
	if (pedido.estado === "cancelado") {
		// El pago de un W- ya cancelado se guarda: Contaduría decide qué hacer con él.
		await transaccion.update(pedidosLinea).set(pago).where(eq(pedidosLinea.id, pedido.id));
		await contexto.interna("inventario.registrar_excepcion", {
			tipo: "pago_de_pedido_cancelado",
			descripcion: `Llegó el pago de ${pedido.folio}, ya cancelado: ${enPesos(datos.monto_centavos)}`,
			area: "contaduria",
			...documento,
		});
	} else {
		// Sus reservas pierden el vencimiento o, si ya vencieron, se vuelven a apartar (regla 5).
		const enReservas = pagoEnReservas.parse(
			await contexto.interna("inventario.confirmar_pago_reserva", { pedido_linea_id: pedido.id }),
		);
		promesa = enReservas.promesa;
		// Con todas sus prendas ya en Aduana no hay nada que surtir: queda listo para empacar.
		if (pedido.estado === "esperando_pago" || pedido.estado === "vencido") {
			estado = enReservas.todo_en_aduana ? "listo_para_empacar" : "por_surtir";
		}
		await transaccion
			.update(pedidosLinea)
			.set({
				...pago,
				promesa,
				...(estado === pedido.estado ? {} : { estado, estadoEn: contexto.ahora.toString() }),
			})
			.where(eq(pedidosLinea.id, pedido.id));
	}
	// Un monto distinto del total se acepta y Contaduría lo revisa.
	if (datos.monto_centavos !== pedido.totalCentavos) {
		await contexto.interna("inventario.registrar_excepcion", {
			tipo: "totales_no_cuadran",
			descripcion: `${pedido.folio}: se cobró ${enPesos(datos.monto_centavos)} y el total es ${enPesos(pedido.totalCentavos)}`,
			area: "contaduria",
			...documento,
		});
	}
	eventoDePedido(contexto, "pedido_linea.pagado", pedido);
	contexto.bitacora({
		descripcion: `Se pagó ${pedido.folio}: ${enPesos(datos.monto_centavos)}`,
		entidad: "pedidos_linea",
		entidadId: pedido.id,
		entidadFolio: pedido.folio,
		antes: { estado: pedido.estado, pago_estado: pedido.pagoEstado },
		despues: { estado, pago_estado: "pagado", promesa },
	});
	return respuesta(estado, promesa);
});
