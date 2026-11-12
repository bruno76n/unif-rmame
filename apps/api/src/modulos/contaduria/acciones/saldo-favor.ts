/**
 * `contaduria.aplicar_saldo_a_favor` y `contaduria.devolver_saldo_a_favor`: Contaduría usa el saldo a favor de un
 * cliente en una de sus notas, o se lo devuelve con un pago emitido.
 * Fase 15 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md (reglas 6 a 9, «Acciones»)
 *
 * Las dos toman primero el candado del saldo a favor (el renglón del crédito del cliente) y, al aplicar, después la
 * cuenta de la nota: el orden de `dominio/cuentas.ts`. Nunca pasan del saldo a favor, aun dos a la vez.
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { aplicarSaldoAFavor, devolverSaldoAFavor } from "@uniformame/compartido/contratos/contaduria/saldo-favor";
import { centavos } from "@uniformame/compartido/tipos/base";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { confirmadoConGoogle } from "../../admin/dominio/cuentas.ts";
import { creditoDelCliente } from "../dominio/credito.ts";
import { aplicarACuenta, bloquearCuentaDeNota, foliosDeVentas } from "../dominio/cuentas.ts";
import { revisarMedio } from "../dominio/pagos.ts";
import { bloquearSaldoAFavor, saldoAFavor } from "../dominio/saldo-favor.ts";
import { pagos, saldoFavorMovimientos } from "../tablas.ts";

/** Un monto como se lee: «$1,000». */
const enPesos = (monto: number) => centavosATexto(centavos(monto), { conCentavos: monto % 100 !== 0 });

export const accionAplicarSaldoAFavor = implementarAccion(aplicarSaldoAFavor, async (contexto, datos) => {
	const { transaccion } = contexto;
	const credito = await creditoDelCliente(transaccion, datos.cliente_id);
	await bloquearSaldoAFavor(transaccion, datos.cliente_id);
	const aFavor = await saldoAFavor(transaccion, datos.cliente_id);
	if (aFavor <= 0) throw errorDeRegla("sin_saldo_a_favor", `${credito.cliente} no tiene saldo a favor.`);
	if (datos.monto_centavos > aFavor) throw errorDeRegla("monto_mayor_que_saldo_a_favor", `Hasta ${enPesos(aFavor)}.`);
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
	const movimientoId = uuidv7();
	await transaccion.insert(saldoFavorMovimientos).values({
		id: movimientoId,
		clienteId: datos.cliente_id,
		terceroId: credito.terceroId,
		tipo: "aplicado_nota",
		montoCentavos: datos.monto_centavos,
		fecha: contexto.diaDeNegocio.toString(),
		cuentaPorCobrarId: cuenta.id,
		creadoPor: quienCambia(contexto),
	});
	const saldo = await aplicarACuenta(contexto, cuenta, datos.monto_centavos, { saldoFavorMovimientoId: movimientoId });
	contexto.guardarEvento({
		tipo: "saldo_favor.aplicado",
		datos: { movimiento_id: movimientoId, cliente_id: datos.cliente_id, nota_entrega_id: datos.nota_entrega_id },
		tablas: ["saldo_favor_movimientos", "aplicaciones_pago", "cuentas_por_cobrar"],
		entidad: "saldo_favor_movimientos",
		entidadId: movimientoId,
	});
	const monto = enPesos(datos.monto_centavos);
	contexto.bitacora({
		descripcion: `Aplicó ${monto} a favor de ${credito.cliente} a ${nota}`,
		entidad: "saldo_favor_movimientos",
		entidadId: movimientoId,
		antes: { saldo_a_favor_centavos: aFavor, saldo_centavos: cuenta.saldoCentavos },
		despues: { saldo_a_favor_centavos: aFavor - datos.monto_centavos, saldo_centavos: saldo },
	});
	return {
		resultado: { mensaje: `${monto} a favor aplicados a ${nota}`, saldo_favor_movimiento_id: movimientoId },
		entidad: { nombre: "saldo_favor_movimientos", id: movimientoId },
	};
});

export const accionDevolverSaldoAFavor = implementarAccion(devolverSaldoAFavor, async (contexto, datos) => {
	const { transaccion } = contexto;
	const { cuentaFabricaId, referencia } = await revisarMedio(transaccion, datos, true);
	const credito = await creditoDelCliente(transaccion, datos.cliente_id);
	await bloquearSaldoAFavor(transaccion, datos.cliente_id);
	const aFavor = await saldoAFavor(transaccion, datos.cliente_id);
	if (aFavor <= 0) throw errorDeRegla("sin_saldo_a_favor", `${credito.cliente} no tiene saldo a favor.`);
	if (datos.monto_centavos > aFavor) throw errorDeCampo("monto_centavos", `Hasta ${enPesos(aFavor)}`);
	const { folio } = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "pago" }));
	const pagoId = uuidv7();
	const quien = quienCambia(contexto);
	const confirmado = confirmadoConGoogle(contexto);
	await transaccion.insert(pagos).values({
		id: pagoId,
		folio,
		direccion: "emitido",
		concepto: "devolucion_saldo_favor",
		fecha: contexto.diaDeNegocio.toString(),
		terceroId: credito.terceroId,
		clienteId: datos.cliente_id,
		montoCentavos: datos.monto_centavos,
		medio: datos.medio,
		cuentaFabricaId,
		referencia,
		confirmadoConGoogleEn: confirmado,
		creadoPor: quien,
	});
	const movimientoId = uuidv7();
	await transaccion.insert(saldoFavorMovimientos).values({
		id: movimientoId,
		clienteId: datos.cliente_id,
		terceroId: credito.terceroId,
		tipo: "devuelto",
		montoCentavos: datos.monto_centavos,
		fecha: contexto.diaDeNegocio.toString(),
		pagoId,
		creadoPor: quien,
	});
	contexto.guardarEvento({
		tipo: "pago.emitido",
		datos: { pago_id: pagoId, cliente_id: datos.cliente_id },
		tablas: ["pagos"],
		entidad: "pagos",
		entidadId: pagoId,
		entidadFolio: folio,
	});
	contexto.guardarEvento({
		tipo: "saldo_favor.devuelto",
		datos: { movimiento_id: movimientoId, cliente_id: datos.cliente_id },
		tablas: ["saldo_favor_movimientos"],
		entidad: "saldo_favor_movimientos",
		entidadId: movimientoId,
	});
	const monto = enPesos(datos.monto_centavos);
	contexto.bitacora({
		descripcion: `Devolvió ${monto} a favor a ${credito.cliente} (${folio})`,
		entidad: "pagos",
		entidadId: pagoId,
		entidadFolio: folio,
		antes: { saldo_a_favor_centavos: aFavor },
		despues: { saldo_a_favor_centavos: aFavor - datos.monto_centavos },
		confirmadoConGoogleEn: confirmado,
	});
	return {
		resultado: { mensaje: `${monto} devueltos a ${credito.cliente}`, pago_id: pagoId, folio },
		entidad: { nombre: "pagos", id: pagoId },
	};
});
