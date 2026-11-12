/**
 * `contaduria.registrar_pago_recibido` y `contaduria.cancelar_pago`: Contaduría registra el pago de un cliente a una
 * nota entregada, y lo cancela si se registró mal.
 * Fase 15 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md (reglas 1 a 5, 9 y 10, «Acciones»)
 *
 * Registrar toma primero la cuenta de la nota y después el folio PG-: dos pagos a la vez a la misma nota se ponen en
 * fila y el segundo ve el saldo que dejó el primero. Cancelar toma el pago con su versión, después el anticipo de su
 * pedido, el saldo a favor del cliente y sus cuentas en orden de id (el orden de `dominio/cuentas.ts`).
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { cancelarPago, registrarPagoRecibido } from "@uniformame/compartido/contratos/contaduria/pagos";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { confirmadoConGoogle } from "../../admin/dominio/cuentas.ts";
import { cancelarAnticipoDelPago } from "../dominio/anticipos.ts";
import { creditoDelCliente } from "../dominio/credito.ts";
import {
	aplicarACuenta,
	bloquearCuentaDeNota,
	foliosDeVentas,
	regresarAplicacionesDelPago,
} from "../dominio/cuentas.ts";
import { avisoDePagoRepetido, revisarMedio } from "../dominio/pagos.ts";
import { bloquearSaldoAFavor } from "../dominio/saldo-favor.ts";
import { pagos, saldoFavorMovimientos, terceros } from "../tablas.ts";

/** Un monto como se lee: «$8,000». */
const enPesos = (monto: number) => centavosATexto(centavos(monto));

export const accionRegistrarPagoRecibido = implementarAccion(registrarPagoRecibido, async (contexto, datos) => {
	const { transaccion } = contexto;
	const { cuentaFabricaId, referencia } = await revisarMedio(transaccion, datos, false);
	const credito = await creditoDelCliente(transaccion, datos.cliente_id);
	// La cuenta de la nota, bloqueada: desde aquí nadie más mueve su saldo (regla 9).
	const cuenta = await bloquearCuentaDeNota(transaccion, datos.nota_entrega_id);
	const folios = await foliosDeVentas(contexto, { nota_entrega_ids: [datos.nota_entrega_id] });
	const nota = folios.get(datos.nota_entrega_id) ?? "La nota";
	if (cuenta === undefined) {
		throw errorDeRegla("nota_sin_entregar", `${nota} todavía no se entrega: se cobra al confirmar la entrega.`);
	}
	if (cuenta.clienteId !== datos.cliente_id) {
		throw errorDeRegla("documento_de_otro_cliente", `${nota} no es de ${credito.cliente}.`);
	}
	if (datos.monto_centavos > cuenta.saldoCentavos) {
		throw errorDeRegla("monto_mayor_que_saldo", `El saldo de ${nota} es ${enPesos(cuenta.saldoCentavos)}.`);
	}
	const avisos = await avisoDePagoRepetido(transaccion, referencia, datos.monto_centavos);
	const { folio } = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "pago" }));
	const pagoId = uuidv7();
	await transaccion.insert(pagos).values({
		id: pagoId,
		folio,
		direccion: "recibido",
		concepto: "nota",
		fecha: contexto.diaDeNegocio.toString(),
		terceroId: cuenta.terceroId,
		clienteId: datos.cliente_id,
		notaEntregaId: datos.nota_entrega_id,
		montoCentavos: datos.monto_centavos,
		medio: datos.medio,
		cuentaFabricaId,
		referencia,
		creadoPor: quienCambia(contexto),
	});
	// El pago a una nota es una aplicación por el monto completo (regla 4).
	const saldo = await aplicarACuenta(contexto, cuenta, datos.monto_centavos, { pagoId });
	contexto.guardarEvento({
		tipo: "pago.recibido",
		datos: { pago_id: pagoId, cliente_id: datos.cliente_id, nota_entrega_id: datos.nota_entrega_id },
		tablas: ["pagos", "aplicaciones_pago", "cuentas_por_cobrar"],
		entidad: "pagos",
		entidadId: pagoId,
		entidadFolio: folio,
	});
	contexto.bitacora({
		descripcion: `Registró el pago ${folio} de ${credito.cliente} por ${enPesos(datos.monto_centavos)}`,
		entidad: "pagos",
		entidadId: pagoId,
		entidadFolio: folio,
		antes: { saldo_centavos: cuenta.saldoCentavos },
		despues: { saldo_centavos: saldo, monto_centavos: datos.monto_centavos },
	});
	return {
		resultado: {
			mensaje: `${folio}: ${enPesos(datos.monto_centavos)} de ${credito.cliente}`,
			pago_id: pagoId,
			folio,
			saldo_centavos: saldo,
		},
		avisos,
		entidad: { nombre: "pagos", id: pagoId },
	};
});

export const accionCancelarPago = implementarAccion(cancelarPago, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const leer = async () => {
		const [pago] = await transaccion
			.select({ fila: pagos, tercero: terceros.nombre })
			.from(pagos)
			.innerJoin(terceros, eq(terceros.id, pagos.terceroId))
			.where(eq(pagos.id, datos.pago_id));
		return pago;
	};
	const visible = async () => {
		const pago = await leer();
		return pago === undefined ? undefined : { pago_id: pago.fila.id, folio: pago.fila.folio, estado: pago.fila.estado };
	};
	await tomarVersion(contexto, pagos, datos.pago_id, version, visible);
	const leido = await leer();
	if (leido === undefined) throw noExiste();
	const { fila: pago } = leido;
	if (pago.estado === "cancelado") throw errorDeRegla("pago_cancelado", `${pago.folio} ya está cancelado.`);
	const motivo = datos.motivo.trim();
	const quien = quienCambia(contexto);
	// Su anticipo recibido y lo que el pedido pasó a favor con él (regla 5).
	const anticipo = await cancelarAnticipoDelPago(contexto, pago, motivo);
	// Una devolución de saldo a favor: su `devuelto` se cancela y el saldo a favor regresa.
	if (pago.concepto === "devolucion_saldo_favor" && pago.clienteId !== null) {
		await bloquearSaldoAFavor(transaccion, pago.clienteId);
		await transaccion
			.update(saldoFavorMovimientos)
			.set({
				estado: "cancelado",
				canceladoEn: contexto.ahora.toString(),
				canceladoPor: quien,
				motivoCancelacion: motivo,
			})
			.where(and(eq(saldoFavorMovimientos.pagoId, pago.id), eq(saldoFavorMovimientos.estado, "vigente")));
	}
	await transaccion
		.update(pagos)
		.set({
			estado: "cancelado",
			canceladoEn: contexto.ahora.toString(),
			canceladoPor: quien,
			motivoCancelacion: motivo,
		})
		.where(eq(pagos.id, pago.id));
	// Sus aplicaciones se cancelan y el saldo, el estado y `pagada_en` de sus cuentas regresan.
	const cuentas = await regresarAplicacionesDelPago(contexto, pago.id, motivo);
	contexto.guardarEvento({
		tipo: "pago.cancelado",
		datos: { pago_id: pago.id, cliente_id: pago.clienteId },
		tablas: ["pagos", "aplicaciones_pago", "cuentas_por_cobrar", "anticipos", "saldo_favor_movimientos"],
		entidad: "pagos",
		entidadId: pago.id,
		entidadFolio: pago.folio,
	});
	contexto.bitacora({
		descripcion: `Canceló el pago ${pago.folio}: ${motivo}`,
		entidad: "pagos",
		entidadId: pago.id,
		entidadFolio: pago.folio,
		antes: {
			estado: pago.estado,
			cuentas: cuentas.map(({ cuenta_por_cobrar_id, antes }) => ({ cuenta_por_cobrar_id, saldo_centavos: antes })),
		},
		despues: {
			estado: "cancelado",
			cuentas: cuentas.map(({ cuenta_por_cobrar_id, despues }) => ({ cuenta_por_cobrar_id, saldo_centavos: despues })),
			anticipo_cancelado_centavos: anticipo.anticipo_centavos,
			a_favor_cancelado_centavos: anticipo.a_favor_centavos,
		},
		confirmadoConGoogleEn: confirmadoConGoogle(contexto),
	});
	return {
		resultado: {
			mensaje: `${pago.folio} cancelado`,
			pago_id: pago.id,
			version: await versionActual(transaccion, pagos, pago.id),
		},
		entidad: { nombre: "pagos", id: pago.id },
	};
});
