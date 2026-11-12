/**
 * `linea.recibir_pedido`: el sitio manda un W- pagado o con pago pendiente. Se guarda con todo congelado, sus prendas
 * se apartan y lo que no cuadra abre su excepción: un pedido ya cobrado nunca se rechaza.
 * Fase 18 · docs/modulos/linea/pedidos-en-linea.md (reglas 1 a 6, «`linea.recibir_pedido`»)
 */

import { recibirPedido } from "@uniformame/compartido/contratos/linea/pedidos";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import {
	candadoDelPago,
	candadoDelPedido,
	enPalabras,
	eventoDePedido,
	folioConElPago,
	promesaDePedido,
	totalesQueNoCuadran,
} from "../dominio/pedidos.ts";
import { pedidoLineaRenglones, pedidosLinea } from "../tablas.ts";

/** Lo que regresa `catalogo.datos_variantes`. */
const datosDeVariantes = z.object({
	variantes: z.array(
		z.object({
			variante_id: z.uuid(),
			producto: z.string(),
			talla: z.string(),
			se_vende_en_linea: z.boolean(),
		}),
	),
});

/** Lo que regresa `inventario.reservar` de un W-: la promesa de cada renglón. */
const apartado = z.object({
	renglones: z.array(z.object({ promesa: z.enum(["sale_hoy", "sale_manana"]).optional() })),
	todo_en_aduana: z.boolean(),
});

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

/** Lo que llega del sitio. */
type PedidoQueLlega = z.infer<typeof recibirPedido.entrada>;

/**
 * Revisa el pago que llega: con pago pendiente, que la tienda lo acepte; pagado, con su hora.
 * @returns El vencimiento del pago pendiente: el que manda el sitio o ahora más `inventario.horas_reserva_pago_pendiente`.
 * @throws `422 pago_pendiente_apagado`; `400` en `pago.pagado_en`.
 */
async function revisarPago(contexto: ContextoDeAccion, pago: PedidoQueLlega["pago"]): Promise<string | null> {
	if (pago.estado === "pagado") {
		if (pago.pagado_en === undefined) throw errorDeCampo("pago.pagado_en", "Falta la hora del pago");
		return null;
	}
	const acepta = await contexto.lectura("admin.parametro", { clave: "linea.acepta_pago_pendiente" });
	if (acepta !== true) {
		throw errorDeRegla("pago_pendiente_apagado", "La tienda en línea no acepta pago pendiente.");
	}
	if (pago.vence_en !== undefined) return pago.vence_en;
	const horas = Number(await contexto.lectura("admin.parametro", { clave: "inventario.horas_reserva_pago_pendiente" }));
	return contexto.ahora.add({ hours: horas }).toString();
}

/**
 * Abre las excepciones de lo que no cuadra (regla 2): los totales, a Contaduría; cada prenda que no se vende en
 * línea, a Bodega.
 */
async function abrirExcepciones(
	contexto: ContextoDeAccion,
	pedido: { id: string; folio: string },
	datos: PedidoQueLlega,
	variantes: z.infer<typeof datosDeVariantes>["variantes"],
): Promise<void> {
	const noCuadran = totalesQueNoCuadran(
		{ ...datos, envio_costo_centavos: datos.envio.costo_centavos },
		datos.renglones,
	);
	// Pagado, lo cobrado también tiene que ser el total.
	if (datos.pago.estado === "pagado" && datos.pago.monto_centavos !== datos.total_centavos) {
		noCuadran.push(`lo cobrado no es el total`);
	}
	const documento = { documento_tipo: "pedido_linea", documento_id: pedido.id, documento_folio: pedido.folio } as const;
	if (noCuadran.length > 0) {
		await contexto.interna("inventario.registrar_excepcion", {
			tipo: "totales_no_cuadran",
			descripcion: `${pedido.folio}: ${noCuadran.join("; ")}`,
			area: "contaduria",
			...documento,
		});
	}
	for (const variante of variantes.filter((una) => !una.se_vende_en_linea)) {
		await contexto.interna("inventario.registrar_excepcion", {
			tipo: "variante_sin_canal_linea",
			descripcion: `${pedido.folio} trae ${variante.producto} talla ${variante.talla}, que no se vende en línea`,
			area: "bodega",
			variante_id: variante.variante_id,
			...documento,
		});
	}
}

/**
 * La credencial de uniformame.mx que manda el W-: el contrato solo deja llamar al sitio.
 * @throws Error del programa si no llama un aparato.
 */
function credencialQueLoManda(contexto: ContextoDeAccion): string {
	if (contexto.quien.tipo !== "aparato") throw new Error("linea.recibir_pedido solo la llama la credencial del sitio");
	return contexto.quien.dispositivoId;
}

export const accionRecibirPedido = implementarAccion(recibirPedido, async (contexto, datos) => {
	const { transaccion } = contexto;
	const venceEn = await revisarPago(contexto, datos.pago);
	// El mismo W- o el mismo pago, uno a la vez (regla 6).
	await candadoDelPedido(transaccion, datos.id);
	await candadoDelPago(transaccion, datos.pago.pasarela, datos.pago.referencia);
	// Primero el id: el mismo W- con otra clave trae también el mismo pago, y lo que pasó es que el pedido ya está.
	const [existente] = await transaccion
		.select({ folio: pedidosLinea.folio })
		.from(pedidosLinea)
		.where(eq(pedidosLinea.id, datos.id));
	if (existente !== undefined) throw errorDeRegla("pedido_repetido", `Ese pedido ya está en ${existente.folio}.`);
	const conElPago = await folioConElPago(transaccion, datos.pago);
	if (conElPago !== undefined) throw errorDeRegla("pago_repetido", `Ese pago ya está en ${conElPago}.`);
	const { variantes } = datosDeVariantes.parse(
		await contexto.lectura("catalogo.datos_variantes", {
			variante_ids: datos.renglones.map((renglon) => renglon.variante_id),
		}),
	);
	const deVariante = new Map(variantes.map((variante) => [variante.variante_id, variante]));
	const faltante = datos.renglones.find((renglon) => !deVariante.has(renglon.variante_id));
	if (faltante !== undefined) throw errorDeCampo("renglones", `No existe la variante del renglón ${faltante.renglon}`);
	if (new Set(datos.renglones.map((renglon) => renglon.renglon)).size !== datos.renglones.length) {
		throw errorDeCampo("renglones", "Cada renglón va una sola vez");
	}
	const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "pedido_linea" }));
	const pagado = datos.pago.estado === "pagado";
	let estado: "por_surtir" | "esperando_pago" | "listo_para_empacar" = pagado ? "por_surtir" : "esperando_pago";
	await transaccion.insert(pedidosLinea).values({
		id: datos.id,
		folio,
		clienteNombre: datos.cliente.nombre,
		clienteCorreo: datos.cliente.correo,
		clienteTelefono: datos.cliente.telefono || null,
		envioDestinatario: datos.envio.destinatario,
		envioTelefono: datos.envio.telefono || null,
		envioCalle: datos.envio.calle,
		envioNumeroExterior: datos.envio.numero_exterior,
		envioNumeroInterior: datos.envio.numero_interior || null,
		envioColonia: datos.envio.colonia,
		envioMunicipio: datos.envio.municipio,
		envioEntidadFederativa: datos.envio.entidad_federativa,
		envioCodigoPostal: datos.envio.codigo_postal,
		envioReferencias: datos.envio.referencias || null,
		envioMetodo: datos.envio.metodo,
		envioPaqueteria: datos.envio.paqueteria,
		envioCostoCentavos: datos.envio.costo_centavos,
		cuponCodigo: datos.cupon_codigo || null,
		subtotalCentavos: datos.subtotal_centavos,
		descuentoCentavos: datos.descuento_centavos,
		descuentoEnvioCentavos: datos.descuento_envio_centavos,
		totalCentavos: datos.total_centavos,
		estado,
		estadoEn: contexto.ahora.toString(),
		pagoEstado: datos.pago.estado,
		pagoPasarela: datos.pago.pasarela,
		pagoReferencia: datos.pago.referencia,
		pagoMetodo: datos.pago.metodo,
		pagoMontoCentavos: datos.pago.monto_centavos,
		pagoComisionCentavos: datos.pago.comision_centavos ?? null,
		pagadoEn: datos.pago.pagado_en ?? null,
		pagoVenceEn: venceEn,
		pagoRespuesta: datos.pago.respuesta ?? null,
		dispositivoId: credencialQueLoManda(contexto),
	});
	// Cada prenda con su nombre, su talla y su precio, congelados (regla 3).
	const renglones = datos.renglones.map((renglon) => {
		const variante = deVariante.get(renglon.variante_id);
		const descuentoPaquete = renglon.descuento_paquete_centavos ?? 0;
		const descuento = renglon.descuento_centavos ?? 0;
		return {
			id: uuidv7(),
			pedidoLineaId: datos.id,
			renglon: renglon.renglon,
			varianteId: renglon.variante_id,
			productoNombre: variante?.producto ?? "",
			talla: variante?.talla ?? "",
			cantidad: renglon.cantidad,
			precioUnitarioCentavos: renglon.precio_unitario_centavos,
			paqueteNumero: renglon.paquete_numero ?? null,
			descuentoPaqueteCentavos: descuentoPaquete,
			descuentoCentavos: descuento,
			importeCentavos: renglon.cantidad * renglon.precio_unitario_centavos - descuentoPaquete - descuento,
		};
	});
	await transaccion.insert(pedidoLineaRenglones).values(renglones);
	// Sus prendas se apartan; sin pieza en ningún lado, en Bodega con su excepción (regla 4).
	const reservado = apartado.parse(
		await contexto.interna("inventario.reservar", {
			motivo: "pedido_linea",
			pedido_linea_id: datos.id,
			renglones: renglones.map((renglon) => ({
				variante_id: renglon.varianteId,
				piezas: renglon.cantidad,
				pedido_linea_renglon_id: renglon.id,
			})),
			...(pagado ? {} : { pago_pendiente: true, ...(venceEn === null ? {} : { vence_en: venceEn }) }),
		}),
	);
	// La promesa se congela al quedar pagado; con todas sus prendas ya en Aduana, queda listo para empacar.
	const promesa = pagado ? promesaDePedido(reservado.renglones.map((renglon) => renglon.promesa)) : null;
	if (pagado && reservado.todo_en_aduana) estado = "listo_para_empacar";
	if (promesa !== null) {
		await transaccion.update(pedidosLinea).set({ promesa, estado }).where(eq(pedidosLinea.id, datos.id));
	}
	await abrirExcepciones(contexto, { id: datos.id, folio }, datos, [...deVariante.values()]);
	eventoDePedido(contexto, "pedido_linea.recibido", { id: datos.id, folio });
	if (estado === "listo_para_empacar")
		eventoDePedido(contexto, "pedido_linea.listo_para_empacar", { id: datos.id, folio });
	const prendas = renglones.reduce((suma, renglon) => suma + renglon.cantidad, 0);
	contexto.bitacora({
		descripcion: `Llegó ${folio} de ${datos.cliente.nombre}: ${prendas} ${prendas === 1 ? "prenda" : "prendas"}, ${enPalabras(estado)}`,
		entidad: "pedidos_linea",
		entidadId: datos.id,
		entidadFolio: folio,
		despues: {
			estado,
			promesa,
			renglones: renglones.map((renglon) => ({
				renglon: renglon.renglon,
				prenda: `${renglon.productoNombre} talla ${renglon.talla}`,
				cantidad: renglon.cantidad,
				importe_centavos: renglon.importeCentavos,
			})),
		},
	});
	return {
		resultado: {
			mensaje: `${folio} recibido: ${enPalabras(estado)}`,
			pedido_linea_id: datos.id,
			folio,
			estado,
			promesa,
		},
		entidad: { nombre: "pedidos_linea", id: datos.id },
	};
});
