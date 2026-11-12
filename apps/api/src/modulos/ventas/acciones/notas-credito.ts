/**
 * Las notas de crédito: Ventas la pide para una nota entregada con qué pasó, de cuánto y qué piezas regresan; Dirección
 * la autoriza o la rechaza, y al autorizarla toma su folio, baja el saldo por cobrar y Aduana espera lo que regresa.
 * Fase 16 · docs/modulos/ventas/notas-de-credito.md (reglas 1 a 5, «Acciones», «Acciones internas»)
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { pedirNotaCredito } from "@uniformame/compartido/contratos/ventas/notas";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { nombreDeCuenta, quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { leerNota } from "../dominio/notas.ts";
import { leerPedido, variantesParaVender } from "../dominio/pedidos.ts";
import { notaCreditoLineas, notaEntregaLineas, notasCredito } from "../tablas.ts";

/** Un monto como se lee, con centavos si los trae: «$1,200» o «$994.50». */
function montoEnTexto(monto: number): string {
	return centavosATexto(centavos(monto), { conCentavos: monto % 100 !== 0 });
}

/** Lo que regresa `direccion.pedir_autorizacion`. */
const autorizacionPedida = z.object({ autorizacion_id: z.uuid() });

export const accionPedirNotaCredito = implementarAccion(pedirNotaCredito, async (contexto, datos) => {
	const { transaccion } = contexto;
	const minimo = z
		.number()
		.int()
		.parse(await contexto.lectura("admin.parametro", { clave: "ventas.largo_minimo_que_paso" }));
	const quePaso = datos.que_paso.trim();
	if (quePaso.length < minimo) throw errorDeCampo("que_paso", "Escribe qué pasó.");
	// La nota bloqueada: dos notas de crédito de la misma nota a la vez se ponen en fila.
	const nota = await leerNota(transaccion, datos.nota_id);
	if (nota.estado !== "entregada") {
		throw errorDeRegla("nota_no_entregada", "Solo una nota entregada lleva nota de crédito.");
	}
	// Una a la vez (regla 1).
	const suyas = await transaccion
		.select()
		.from(notasCredito)
		.where(and(eq(notasCredito.notaEntregaId, nota.id), ne(notasCredito.estado, "rechazada")));
	if (suyas.some((suya) => suya.estado === "por_autorizar")) {
		throw errorDeRegla("nota_credito_esperando", `${nota.folio} ya tiene una nota de crédito esperando autorización.`);
	}
	// Hasta lo que queda de la nota: su subtotal menos sus notas de crédito autorizadas (regla 3).
	const tope = nota.subtotalCentavos - suyas.reduce((total, suya) => total + suya.montoCentavos, 0);
	if (datos.monto_centavos > tope) {
		throw errorDeRegla(
			"monto_de_mas",
			`La nota de crédito no puede pasar de ${montoEnTexto(Math.max(0, tope))}: es lo que queda de ${nota.folio}.`,
		);
	}
	// Las piezas que regresan: por renglón, hasta lo entregado menos lo que ya regresa en otras no rechazadas (regla 4).
	const piezas = datos.piezas ?? [];
	const ids = piezas.map((pieza) => pieza.nota_entrega_linea_id);
	if (new Set(ids).size !== ids.length) throw errorDeCampo("piezas", "Cada renglón va una sola vez");
	const lineas =
		ids.length === 0
			? []
			: await transaccion
					.select({
						id: notaEntregaLineas.id,
						notaEntregaId: notaEntregaLineas.notaEntregaId,
						varianteId: notaEntregaLineas.varianteId,
						cantidad: notaEntregaLineas.cantidad,
						precio: notaEntregaLineas.precioUnitarioCentavos,
						yaRegresan: sql<number>`coalesce((SELECT sum(l.cantidad) FROM nota_credito_lineas l
							JOIN notas_credito c ON c.id = l.nota_credito_id
							WHERE l.nota_entrega_linea_id = nota_entrega_lineas.id AND c.estado <> 'rechazada'), 0)`.mapWith(Number),
					})
					.from(notaEntregaLineas)
					.where(inArray(notaEntregaLineas.id, ids));
	const nombres = await variantesParaVender(
		transaccion,
		lineas.map((linea) => linea.varianteId),
	);
	for (const pieza of piezas) {
		const linea = lineas.find((suya) => suya.id === pieza.nota_entrega_linea_id);
		if (linea === undefined || linea.notaEntregaId !== nota.id) {
			throw errorDeCampo("piezas", "Ese renglón no es de la nota");
		}
		const pueden = linea.cantidad - linea.yaRegresan;
		if (pieza.cantidad > pueden) {
			const variante = nombres.get(linea.varianteId);
			throw errorDeRegla(
				"piezas_de_mas",
				`${variante?.prenda ?? "La prenda"} talla ${variante?.talla ?? ""}: solo pueden regresar ${Math.max(0, pueden)}.`,
			);
		}
	}
	const pedido = await leerPedido(transaccion, nota.pedidoId);
	const id = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(notasCredito).values({
		id,
		notaEntregaId: nota.id,
		pedidoId: nota.pedidoId,
		clienteId: nota.clienteId,
		estado: "por_autorizar",
		quePaso,
		montoCentavos: datos.monto_centavos,
		creadoPor: quien,
	});
	if (piezas.length > 0) {
		await transaccion.insert(notaCreditoLineas).values(
			piezas.map((pieza) => {
				const linea = lineas.find((suya) => suya.id === pieza.nota_entrega_linea_id);
				if (linea === undefined) throw new Error("un renglón revisado desapareció");
				return {
					id: uuidv7(),
					notaCreditoId: id,
					notaEntregaLineaId: linea.id,
					varianteId: linea.varianteId,
					cantidad: pieza.cantidad,
					precioUnitarioCentavos: linea.precio,
					creadoPor: quien,
				};
			}),
		);
	}
	// Su AU- para Dirección, en la misma transacción.
	const { autorizacion_id } = autorizacionPedida.parse(
		await contexto.interna("direccion.pedir_autorizacion", {
			tipo: "nota_credito",
			departamento_origen: "ventas",
			resumen: `Nota de crédito para ${nota.folio} · ${pedido.cliente} · ${montoEnTexto(datos.monto_centavos)}`,
			detalle: quePaso,
			documento: nota.folio,
			importe_centavos: datos.monto_centavos,
			nota_entrega_id: nota.id,
			nota_credito_id: id,
		}),
	);
	await transaccion.update(notasCredito).set({ autorizacionId: autorizacion_id }).where(eq(notasCredito.id, id));
	contexto.guardarEvento({
		tipo: "nota_credito.pedida",
		datos: { nota_credito_id: id, nota_entrega_id: nota.id },
		tablas: ["notas_credito", "nota_credito_lineas"],
		entidad: "notas_credito",
		entidadId: id,
	});
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} pidió nota de crédito para ${nota.folio} por ${montoEnTexto(datos.monto_centavos)}: ${quePaso}`,
		entidad: "notas_credito",
		entidadId: id,
		despues: {
			nota_entrega_id: nota.id,
			monto_centavos: datos.monto_centavos,
			piezas: piezas.map((pieza) => ({ nota_entrega_linea_id: pieza.nota_entrega_linea_id, cantidad: pieza.cantidad })),
		},
	});
	return {
		resultado: { mensaje: `Nota de crédito para ${nota.folio} enviada a Dirección`, nota_credito_id: id },
		entidad: { nombre: "notas_credito", id },
	};
});

/** Lo que manda `direccion.decidir_autorizacion` al efecto. */
const decisionDeNotaCredito = z
	.object({
		autorizacion_id: z.uuid(),
		decision: z.enum(["autorizar", "rechazar"]),
		nota_credito_id: z.uuid(),
	})
	.passthrough();

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

/**
 * `ventas.aplicar_decision_nota_credito`: el efecto que Ventas registra para el tipo `nota_credito`. Autorizada, toma
 * su folio NC-, baja el saldo de su nota con `contaduria.aplicar_nota_credito` y, si regresan piezas, Aduana las
 * espera con `inventario.esperar_devolucion`. Rechazada, queda rechazada (el motivo vive en la autorización). Corre en
 * la transacción de la decisión, sin bitácora propia: el renglón es el de Dirección.
 * @param contexto El contexto de la decisión.
 * @param datos La autorización, la decisión y la nota de crédito.
 * @returns El folio NC-, para el mensaje de Dirección.
 */
export async function aplicarDecisionNotaCredito(contexto: ContextoDeAccion, datos: unknown) {
	const decision = decisionDeNotaCredito.parse(datos);
	const { transaccion } = contexto;
	const [nota] = await transaccion
		.select()
		.from(notasCredito)
		.where(eq(notasCredito.id, decision.nota_credito_id))
		.for("update");
	if (nota === undefined) throw noExiste();
	if (nota.estado !== "por_autorizar") throw new Error(`la nota de crédito ${nota.id} ya está ${nota.estado}`);
	const ahora = contexto.ahora.toString();
	if (decision.decision === "rechazar") {
		await transaccion
			.update(notasCredito)
			.set({ estado: "rechazada", rechazadaEn: ahora })
			.where(eq(notasCredito.id, nota.id));
		eventoDeDecision(contexto, nota.id, null);
		return { antes: { estado: nota.estado }, despues: { estado: "rechazada" } };
	}
	const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "nota_credito" }));
	await transaccion
		.update(notasCredito)
		.set({ estado: "autorizada", folio, autorizadaEn: ahora })
		.where(eq(notasCredito.id, nota.id));
	await contexto.interna("contaduria.aplicar_nota_credito", {
		nota_credito_id: nota.id,
		nota_entrega_id: nota.notaEntregaId,
		monto_centavos: nota.montoCentavos,
	});
	// Si regresan piezas, Aduana las espera con la nota de crédito y el pedido.
	const regresan = await transaccion
		.select({ varianteId: notaCreditoLineas.varianteId, piezas: notaCreditoLineas.cantidad })
		.from(notaCreditoLineas)
		.where(eq(notaCreditoLineas.notaCreditoId, nota.id))
		.orderBy(notaCreditoLineas.varianteId);
	if (regresan.length > 0) {
		await contexto.interna("inventario.esperar_devolucion", {
			tipo: "devolucion_cliente_externo",
			nota_credito_id: nota.id,
			pedido_id: nota.pedidoId,
			renglones: regresan.map((renglon) => ({ variante_id: renglon.varianteId, piezas: renglon.piezas })),
		});
	}
	eventoDeDecision(contexto, nota.id, folio);
	return { antes: { estado: nota.estado }, despues: { estado: "autorizada", folio }, datos: { folio } };
}

/** El evento de una nota de crédito decidida. */
function eventoDeDecision(contexto: ContextoDeAccion, notaCreditoId: string, folio: string | null): void {
	contexto.guardarEvento({
		tipo: "nota_credito.decidida",
		datos: { nota_credito_id: notaCreditoId },
		tablas: ["notas_credito"],
		entidad: "notas_credito",
		entidadId: notaCreditoId,
		...(folio === null ? {} : { entidadFolio: folio }),
	});
}
