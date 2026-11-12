/**
 * Los contratos de los pedidos en línea: el sitio manda el W- y confirma su pago con la credencial de uniformame.mx;
 * Tienda en línea lo cancela.
 * Fase 18 · docs/modulos/linea/pedidos-en-linea.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Centavos: un entero que no es negativo. */
const centavos = z.number("Número entero").int("Número entero").nonnegative("No puede ser negativo");

/** Un texto obligatorio, como lo manda el sitio. */
const texto = (maximo: number) => z.string().trim().min(1).max(maximo);

/** Un texto opcional: vacío es como no mandarlo. */
const textoOpcional = (maximo: number) => z.string().trim().max(maximo).optional();

/** Un momento con su zona. */
const momento = z.iso.datetime({ offset: true });

/** El pago repetido: la misma referencia ya está en otro W-. */
const pagoRepetido = { codigo: "pago_repetido", mensaje: "Ese pago ya está en {W}." } as const;

/** Lo que regresa el sitio al mandar o pagar un W-. */
const estadoDelPedido = z.object({
	pedido_linea_id: z.uuid(),
	folio: z.string(),
	estado: z.string(),
	promesa: z.enum(["sale_hoy", "sale_manana"]).nullable(),
});

/** El sitio manda un W- pagado o con pago pendiente: se guarda como llegó y sus prendas se apartan. */
export const recibirPedido = definirAccion({
	nombre: "linea.recibir_pedido",
	descripcion: "Recibe un pedido W- de uniformame.mx, pagado o con pago pendiente, y aparta sus prendas",
	entrada: z.object({
		id: z.uuid().describe("La llave del W-, la hace el sitio"),
		cliente: z.object({
			nombre: texto(120),
			correo: z.email().max(200),
			telefono: textoOpcional(30),
		}),
		envio: z.object({
			destinatario: texto(120),
			telefono: textoOpcional(30),
			calle: texto(120),
			numero_exterior: texto(20),
			numero_interior: textoOpcional(20),
			colonia: texto(120),
			municipio: texto(120),
			entidad_federativa: texto(60),
			codigo_postal: z
				.string()
				.trim()
				.regex(/^\d{5}$/),
			referencias: textoOpcional(300),
			metodo: texto(60),
			paqueteria: texto(60),
			costo_centavos: centavos,
		}),
		renglones: z
			.array(
				z.object({
					renglon: z.number().int().positive(),
					variante_id: z.uuid(),
					cantidad: z.number().int().positive(),
					precio_unitario_centavos: centavos,
					paquete_numero: z.number().int().positive().optional(),
					descuento_paquete_centavos: centavos.optional(),
					descuento_centavos: centavos.optional(),
				}),
			)
			.min(1),
		cupon_codigo: textoOpcional(60),
		subtotal_centavos: centavos,
		descuento_centavos: centavos,
		descuento_envio_centavos: centavos,
		total_centavos: centavos,
		pago: z.object({
			estado: z.enum(["pagado", "pendiente"]),
			pasarela: texto(60),
			referencia: texto(120),
			metodo: texto(60),
			monto_centavos: centavos,
			comision_centavos: centavos.optional(),
			pagado_en: momento.optional(),
			vence_en: momento.optional(),
			respuesta: z.record(z.string(), z.unknown()).optional(),
		}),
	}),
	salida: estadoDelPedido,
	permiso: { aparatos: ["sitio"] },
	errores: [
		pagoRepetido,
		{ codigo: "pago_pendiente_apagado", mensaje: "La tienda en línea no acepta pago pendiente." },
		{ codigo: "pedido_repetido", mensaje: "Ese pedido ya está en {W}." },
	],
});

/** El sitio confirma el pago de un W-: queda pagado y, si esperaba el pago o venció, por surtir. */
export const confirmarPago = definirAccion({
	nombre: "linea.confirmar_pago",
	descripcion: "Confirma el pago de un W- que esperaba su pago: queda por surtir, con sus prendas apartadas",
	entrada: z.object({
		pedido_linea_id: z.uuid(),
		pasarela: texto(60),
		referencia: texto(120),
		monto_centavos: centavos,
		comision_centavos: centavos.optional(),
		pagado_en: momento,
		respuesta: z.record(z.string(), z.unknown()).optional(),
	}),
	salida: estadoDelPedido,
	permiso: { aparatos: ["sitio"] },
	errores: [pagoRepetido],
});

/** Tienda en línea cancela un W- que no se ha empacado: sus prendas se liberan y lo de aduana regresa. */
export const cancelarPedidoLinea = definirAccion({
	nombre: "linea.cancelar_pedido",
	descripcion: "Cancela un W- que no se ha empacado: libera sus prendas y lo que estaba en aduana regresa a su origen",
	entrada: z.object({
		pedido_linea_id: z.uuid().describe("El W-"),
		motivo: z.string("Escribe el motivo").trim().min(1, "Escribe el motivo").max(200).describe("Por qué"),
	}),
	salida: z.object({ pedido_linea_id: z.uuid() }),
	permiso: { departamento: "linea" },
	errores: [{ codigo: "no_cancelable", mensaje: "{W} está {estado}: ya no se puede cancelar." }],
	edita: true,
});
