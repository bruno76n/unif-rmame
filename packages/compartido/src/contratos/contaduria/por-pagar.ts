/**
 * Los contratos de lo que la fábrica debe a sus proveedores: capturar la factura o nota FP- con sus tres puntas,
 * cancelarla, registrar la nota de crédito que aclara su diferencia, pagar su cuenta y pedir a Dirección pagar lo
 * recibido.
 * Fase 17 · docs/modulos/contaduria/facturas-de-proveedor.md y cuentas-por-pagar.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";
import { medioDePago, montoDePago } from "./pagos.ts";

/** Un importe en centavos que se escribe en pesos. */
const importe = (mensaje: string) => z.number(mensaje).int(mensaje).nonnegative(mensaje);

/** El motivo de una cancelación. */
const motivo = z.string("Escribe el motivo").trim().min(1, "Escribe el motivo").max(200).describe("Por qué");

/** Contaduría captura la factura o nota de un proveedor, de una o varias de sus órdenes. */
export const capturarFacturaProveedor = definirAccion({
	nombre: "contaduria.capturar_factura_proveedor",
	descripcion: "Captura la factura o nota de un proveedor y la compara con lo pedido y lo recibido",
	entrada: z.object({
		ordenes: z
			.array(
				z.object({
					orden_compra_id: z.uuid("Escoge la orden.").describe("La orden"),
					importe_sin_iva_centavos: importe("Escribe lo de la orden en pesos")
						.positive("Escribe lo de la orden en pesos")
						.optional()
						.describe("Lo que toca a esta orden, sin IVA; con una sola orden, es el subtotal"),
				}),
			)
			.min(1, "Escoge la orden.")
			.describe("Las órdenes que cubre, del mismo proveedor"),
		folio_proveedor: z
			.string("Escribe el folio")
			.trim()
			.min(3, "Escribe el folio")
			.max(12, "Va en 12 letras.")
			.transform((folio) => folio.toUpperCase())
			.describe("El folio de su factura o nota"),
		fecha_factura: z.iso.date("Escribe la fecha.").optional().describe("La fecha que dice el documento"),
		subtotal_centavos: importe("Escribe el subtotal en pesos")
			.positive("Escribe el subtotal en pesos")
			.describe("El subtotal, sin IVA"),
		iva_centavos: importe("Escribe el IVA en pesos").describe("El IVA"),
		total_centavos: importe("Escribe el total en pesos").positive("Escribe el total en pesos").describe("El total"),
		uuid_cfdi: z.uuid("Ese UUID no es válido.").optional().describe("El UUID del CFDI, si se tiene"),
		archivo_xml_id: z.uuid().optional().describe("El XML ya subido"),
		archivo_pdf_id: z.uuid().optional().describe("El PDF o la foto ya subidos"),
		precios_nota: z
			.array(
				z.object({
					orden_compra_linea_id: z.uuid().describe("La línea de una de las órdenes"),
					precio_centavos: z
						.number("Escribe el precio.")
						.int("Escribe el precio.")
						.positive("Escribe el precio.")
						.describe("El precio de la nota, por unidad"),
				}),
			)
			.optional()
			.describe("Solo las líneas que cobran otro precio"),
	}),
	salida: z.object({
		factura_proveedor_id: z.uuid(),
		folio: z.string().describe("El FP-"),
		estado: z.enum(["conciliada", "detenida"]).describe("Según sus tres puntas"),
	}),
	permiso: { departamento: "contaduria" },
	errores: [
		{ codigo: "orden_no_facturable", mensaje: "{OC} está en borrador o cancelada: no se le captura factura." },
		{ codigo: "ordenes_de_otro_proveedor", mensaje: "Todas las órdenes deben ser del mismo proveedor." },
		{ codigo: "folio_repetido", mensaje: "{proveedor} ya tiene la factura {folio}: es {FP}." },
		{ codigo: "total_no_suma", mensaje: "Subtotal más IVA no da el total: revisa los tres." },
		{ codigo: "importes_no_suman", mensaje: "Lo de cada orden suma {suma} y el subtotal es {subtotal}." },
		{ codigo: "linea_de_otra_orden", mensaje: "Ese material no es de las órdenes escogidas." },
		{ codigo: "uuid_repetido", mensaje: "Ese UUID ya está en {FP}." },
	],
});

/** Contaduría cancela una factura detenida o conciliada, sin pagos, con su cuenta por pagar. */
export const cancelarFacturaProveedor = definirAccion({
	nombre: "contaduria.cancelar_factura_proveedor",
	descripcion: "Cancela una factura de proveedor sin pagos, con su cuenta por pagar",
	entrada: z.object({ factura_proveedor_id: z.uuid().describe("La factura"), motivo }),
	salida: z.object({ factura_proveedor_id: z.uuid() }),
	permiso: { departamento: "contaduria" },
	errores: [
		{ codigo: "factura_con_pagos", mensaje: "{FP} ya tiene pagos: no se puede cancelar." },
		{ codigo: "factura_no_cancelable", mensaje: "Solo se cancela una factura detenida o lista para pagar." },
	],
	edita: true,
});

/** Contaduría registra la nota de crédito del proveedor que aclara la diferencia de una factura autorizada. */
export const registrarNotaCreditoProveedor = definirAccion({
	nombre: "contaduria.registrar_nota_credito_proveedor",
	descripcion: "Registra la nota de crédito del proveedor que aclara la diferencia de una factura autorizada",
	entrada: z.object({
		factura_proveedor_id: z.uuid().describe("La factura autorizada por Dirección"),
		folio_nota: z
			.string("Escribe el folio de la nota de crédito")
			.trim()
			.min(3, "Escribe el folio de la nota de crédito")
			.max(20, "Va en 20 letras.")
			.describe("El folio de la nota de crédito del proveedor"),
		archivo_id: z.uuid().optional().describe("La nota ya subida"),
	}),
	salida: z.object({ factura_proveedor_id: z.uuid() }),
	permiso: { departamento: "contaduria" },
	errores: [
		{
			codigo: "factura_no_autorizada",
			mensaje: "Solo una factura autorizada por Dirección tiene diferencia por aclarar.",
		},
		{ codigo: "diferencia_ya_aclarada", mensaje: "La diferencia de {FP} ya se aclaró con {folio}." },
	],
	edita: true,
});

/** Contaduría paga, todo o una parte, una cuenta por pagar: un pago emitido con «Confirmar con Google». */
export const pagarCuentaPorPagar = definirAccion({
	nombre: "contaduria.pagar_cuenta_por_pagar",
	descripcion: "Paga una cuenta por pagar, toda o una parte, con un pago emitido",
	entrada: z.object({
		cuenta_por_pagar_id: z.uuid().describe("La cuenta por pagar"),
		monto_centavos: montoDePago("Escribe el monto en pesos").describe(
			"Lo que se paga: en pesos enteros, o con centavos si liquida exacto el saldo",
		),
		...medioDePago,
		referencia: z
			.string("Escribe la referencia")
			.trim()
			.min(3, "Escribe la referencia")
			.max(30, "Va en 30 letras.")
			.describe("SPEI o recibo"),
	}),
	salida: z.object({
		pago_id: z.uuid(),
		folio: z.string().describe("El PG-"),
		saldo_centavos: z.number().int().optional().describe("Lo que queda de la cuenta"),
	}),
	permiso: { departamento: "contaduria", confirmarConGoogle: "pagar_cuenta_por_pagar" },
	errores: [
		{ codigo: "cuenta_detenida", mensaje: "Este pago está detenido: orden, recepción y factura no coinciden." },
		{ codigo: "cuenta_pagada", mensaje: "{documento} ya está pagada." },
		{ codigo: "cuenta_cancelada", mensaje: "{documento} está cancelada." },
	],
	edita: true,
});

/** Contaduría pide a Dirección pagar lo recibido de una factura detenida que cobra de más. */
export const pedirPagoLoRecibido = definirAccion({
	nombre: "contaduria.pedir_pago_lo_recibido",
	descripcion: "Pide a Dirección pagar lo recibido, con su IVA, de una factura detenida que cobra de más",
	entrada: z.object({ factura_proveedor_id: z.uuid().describe("La factura detenida") }),
	salida: z.object({ autorizacion_id: z.uuid(), folio: z.string().describe("El AU-") }),
	permiso: { departamento: "contaduria" },
	errores: [
		{ codigo: "factura_no_detenida", mensaje: "{FP} no está detenida." },
		{
			codigo: "responsable_aduana",
			mensaje: "{FP} espera a que Aduana reciba la mercancía: no se puede pagar lo recibido.",
		},
		{ codigo: "ya_pedida", mensaje: "{FP} ya espera la decisión de Dirección." },
		{ codigo: "nada_recibido", mensaje: "De {FP} no queda nada recibido por pagar." },
	],
	edita: true,
});

/** Una mensualidad escrita a mano al registrar una deuda. */
const mensualidad = z.object({
	numero: z.number().int().positive().describe("Su número: 1, 2, 3…"),
	vence: z.iso.date("¿Cuándo se paga?").describe("El día en que vence"),
	importe_centavos: importe("Escribe el monto en pesos.").positive("Escribe el monto en pesos.").describe("Su importe"),
});

/** Contaduría registra una deuda con un acreedor: una cuenta por pagar por mensualidad. */
export const registrarDeuda = definirAccion({
	nombre: "contaduria.registrar_deuda",
	descripcion: "Registra una deuda con un acreedor, en mensualidades, con una cuenta por pagar por mensualidad",
	entrada: z.object({
		tercero_id: z.uuid("¿A quién le debemos?").optional().describe("El acreedor que ya es tercero"),
		tercero_nuevo: z
			.object({
				nombre: z.string("Escribe el nombre.").trim().min(3, "Escribe el nombre.").max(120).describe("Su nombre"),
				clase: z.enum(["persona", "banco", "empresa"], "¿Qué es?").describe("Persona, banco o empresa"),
			})
			.optional()
			.describe("O un acreedor nuevo"),
		ligar_a_tercero_id: z.uuid().optional().describe("Si se respondió «Es el mismo»: el tercero que ya existe"),
		descripcion: z
			.string("Escribe de qué es la deuda.")
			.trim()
			.min(5, "Escribe de qué es la deuda.")
			.max(200)
			.describe("De qué es"),
		monto_total_centavos: importe("Escribe el monto en pesos.")
			.positive("Escribe el monto en pesos.")
			.describe("Lo que se va a pagar en total"),
		numero_mensualidades: z.number().int().min(1).max(600).describe("En cuántas mensualidades; un solo pago es 1"),
		primer_vencimiento: z.iso.date("¿Cuándo se paga?").describe("Cuándo vence la primera"),
		mensualidades: z
			.array(mensualidad)
			.optional()
			.describe("Si se cambiaron: cada una con su número, su día y su importe"),
	}),
	salida: z.object({ deuda_id: z.uuid(), folio: z.string().describe("El PR-") }),
	permiso: { departamento: "contaduria" },
	errores: [
		{ codigo: "tercero_ya_existe", mensaje: "Ya hay un tercero con ese nombre: {nombre} ({roles}). ¿Es el mismo?" },
		{ codigo: "mensualidades_no_suman", mensaje: "Las mensualidades suman {suma} y la deuda es {monto}." },
		{ codigo: "vencimientos_desordenados", mensaje: "Cada mensualidad vence después de la anterior." },
	],
});

/** Contaduría cancela una deuda sin pagos, con sus cuentas por pagar. */
export const cancelarDeuda = definirAccion({
	nombre: "contaduria.cancelar_deuda",
	descripcion: "Cancela una deuda sin pagos, con sus cuentas por pagar",
	entrada: z.object({ deuda_id: z.uuid().describe("La deuda"), motivo }),
	salida: z.object({ deuda_id: z.uuid() }),
	permiso: { departamento: "contaduria" },
	errores: [
		{ codigo: "deuda_con_pagos", mensaje: "{PR} ya tiene pagos: no se puede cancelar." },
		{ codigo: "deuda_no_abierta", mensaje: "{PR} ya está saldada o cancelada." },
	],
	edita: true,
});

/** Contaduría descuenta lo que un tercero nos compró de lo que le debemos, sin mover dinero. */
export const compensar = definirAccion({
	nombre: "contaduria.compensar",
	descripcion: "Compensa lo que un tercero nos debe con lo que le debemos, sin mover dinero",
	entrada: z.object({
		tercero_id: z.uuid().describe("El tercero que es cliente y a quien le debemos"),
		monto_centavos: z
			.number("Escribe el monto en pesos")
			.int("Escribe el monto en pesos")
			.positive("Escribe el monto en pesos")
			.multipleOf(100, "Escribe el monto en pesos")
			.describe("Lo que se compensa, en pesos enteros"),
	}),
	salida: z.object({ compensacion_id: z.uuid() }),
	permiso: { departamento: "contaduria" },
	errores: [
		{
			codigo: "sin_saldo_para_compensar",
			mensaje: "{tercero} no nos debe y le debemos a la vez: no hay qué compensar.",
		},
		{ codigo: "monto_mayor_que_maximo", mensaje: "Hasta {máximo}." },
	],
});

/** Contaduría cancela una compensación: sus aplicaciones se cancelan y los saldos regresan. */
export const cancelarCompensacion = definirAccion({
	nombre: "contaduria.cancelar_compensacion",
	descripcion: "Cancela una compensación: regresa los saldos de lo que bajó de cada lado",
	entrada: z.object({ compensacion_id: z.uuid().describe("La compensación"), motivo }),
	salida: z.object({ compensacion_id: z.uuid() }),
	permiso: { departamento: "contaduria", confirmarConGoogle: "cancelar_compensacion" },
	errores: [{ codigo: "compensacion_cancelada", mensaje: "Esa compensación ya está cancelada." }],
	edita: true,
});

/** Contaduría aplica un depósito que un cliente hizo a la cuenta de un tercero a lo que la fábrica le debe. */
export const aplicarDepositoATercero = definirAccion({
	nombre: "contaduria.aplicar_deposito_a_tercero",
	descripcion: "Aplica a una deuda con un tercero lo que un cliente depositó en la cuenta de ese tercero",
	entrada: z.object({
		pago_id: z.uuid().describe("El pago que fue a la cuenta del tercero"),
		cuenta_por_pagar_id: z.uuid("Escoge la deuda.").describe("La deuda con ese tercero"),
	}),
	salida: z.object({
		pago_id: z.uuid(),
		queda_centavos: z.number().int().optional().describe("Lo que queda del depósito, a favor con el tercero"),
	}),
	permiso: { departamento: "contaduria" },
	errores: [
		{ codigo: "pago_no_es_deposito_a_tercero", mensaje: "{PG} no fue a la cuenta de un tercero." },
		{ codigo: "pago_cancelado", mensaje: "{PG} está cancelado." },
		{ codigo: "deposito_ya_aplicado", mensaje: "{PG} ya está aplicado completo." },
		{ codigo: "deuda_de_otro_tercero", mensaje: "{documento} no es de {tercero}." },
		{ codigo: "deuda_detenida", mensaje: "{documento} está detenida: no se le puede aplicar un depósito." },
		{ codigo: "deuda_pagada", mensaje: "{documento} ya está pagada." },
		{ codigo: "deuda_cancelada", mensaje: "{documento} está cancelada." },
	],
	edita: true,
});
