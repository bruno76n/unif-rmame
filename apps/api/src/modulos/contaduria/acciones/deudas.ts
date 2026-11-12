/**
 * Las deudas PR- con un acreedor: registrarlas, con una cuenta por pagar por mensualidad, y cancelarlas sin pagos.
 * Fase 17 · docs/modulos/contaduria/terceros-y-deudas.md (reglas 3, 6 y 7, «`contaduria.registrar_deuda`» y
 * «`contaduria.cancelar_deuda`»)
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDia } from "@uniformame/compartido/calculos/fechas";
import { cancelarDeuda, registrarDeuda } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { asc, eq, inArray } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { nombreDeCuenta, quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { nombreDelTercero } from "../dominio/facturas.ts";

import { cuentasPorPagar, deudaMensualidades, deudas, terceros } from "../tablas.ts";

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

/** Lo que regresa `contaduria.crear_tercero`. */
const terceroCreado = z.object({ tercero_id: z.uuid(), ya_existia: z.boolean() });

/** Una mensualidad como nace. */
export interface Mensualidad {
	numero: number;
	vence: string;
	importe_centavos: number;
}

/**
 * Las mensualidades iguales de una deuda (regla 6): una por mes desde el primer vencimiento, con el ajuste de centavos
 * en la última.
 * @param total Lo que se va a pagar en total.
 * @param cuantas Cuántas mensualidades.
 * @param primerVencimiento Cuándo vence la primera.
 */
export function mensualidadesIguales(total: number, cuantas: number, primerVencimiento: string): Mensualidad[] {
	const base = Math.floor(total / cuantas);
	const primera = Temporal.PlainDate.from(primerVencimiento);
	return Array.from({ length: cuantas }, (_, i) => ({
		numero: i + 1,
		vence: primera.add({ months: i }).toString(),
		importe_centavos: i === cuantas - 1 ? total - base * (cuantas - 1) : base,
	}));
}

/**
 * Revisa las mensualidades que se escribieron a mano: una por número, que sumen el total y que cada una venza después
 * de la anterior (regla 6).
 * @throws `400` en `mensualidades`; `422 mensualidades_no_suman`; `422 vencimientos_desordenados`.
 */
function revisarMensualidades(mensualidades: readonly Mensualidad[], cuantas: number, total: number): Mensualidad[] {
	const ordenadas = [...mensualidades].sort((una, otra) => una.numero - otra.numero);
	if (ordenadas.length !== cuantas || ordenadas.some((una, i) => una.numero !== i + 1)) {
		throw errorDeCampo("mensualidades", `Escribe las ${cuantas} mensualidades.`);
	}
	const suma = ordenadas.reduce((acumulado, una) => acumulado + una.importe_centavos, 0);
	if (suma !== total) {
		throw errorDeRegla(
			"mensualidades_no_suman",
			`Las mensualidades suman ${enPesos(suma)} y la deuda es ${enPesos(total)}.`,
		);
	}
	if (ordenadas.some((una, i) => i > 0 && una.vence <= (ordenadas[i - 1]?.vence ?? ""))) {
		throw errorDeRegla("vencimientos_desordenados", "Cada mensualidad vence después de la anterior.");
	}
	return ordenadas;
}

/**
 * El acreedor de la deuda: el tercero que ya existe (con su rol de acreedor prendido) o uno nuevo, con
 * `contaduria.crear_tercero` (regla 3: un nombre que ya existe pregunta «¿Es el mismo?»).
 * @returns El tercero, su nombre y si se dio de alta.
 */
async function acreedorDeLaDeuda(
	contexto: ContextoDeAccion,
	datos: {
		tercero_id?: string | undefined;
		tercero_nuevo?: { nombre: string; clase: "persona" | "banco" | "empresa" } | undefined;
		ligar_a_tercero_id?: string | undefined;
	},
): Promise<{ id: string; nombre: string; nuevo: boolean }> {
	if ((datos.tercero_id === undefined) === (datos.tercero_nuevo === undefined)) {
		throw errorDeCampo("tercero_id", "¿A quién le debemos?");
	}
	const existente = datos.tercero_id ?? datos.ligar_a_tercero_id;
	if (existente !== undefined) {
		const [tercero] = await contexto.transaccion.select().from(terceros).where(eq(terceros.id, existente));
		if (tercero === undefined) throw noExiste();
		if (!tercero.esAcreedor) {
			await contexto.interna("contaduria.crear_tercero", {
				nombre: tercero.nombre,
				rol: "acreedor",
				ligar_a_tercero_id: tercero.id,
			});
		}
		return { id: tercero.id, nombre: tercero.nombre, nuevo: false };
	}
	const nuevo = datos.tercero_nuevo;
	if (nuevo === undefined) throw errorDeCampo("tercero_id", "¿A quién le debemos?");
	const creado = terceroCreado.parse(
		await contexto.interna("contaduria.crear_tercero", { nombre: nuevo.nombre, rol: "acreedor", clase: nuevo.clase }),
	);
	return { id: creado.tercero_id, nombre: nuevo.nombre, nuevo: !creado.ya_existia };
}

export const accionRegistrarDeuda = implementarAccion(registrarDeuda, async (contexto, datos) => {
	const { transaccion } = contexto;
	// Cada mensualidad lleva al menos un peso (decisión 716).
	if (datos.mensualidades === undefined && datos.monto_total_centavos < datos.numero_mensualidades * 100) {
		throw errorDeCampo("numero_mensualidades", "Cada mensualidad lleva al menos $1.");
	}
	const mensualidades =
		datos.mensualidades === undefined
			? mensualidadesIguales(datos.monto_total_centavos, datos.numero_mensualidades, datos.primer_vencimiento)
			: revisarMensualidades(datos.mensualidades, datos.numero_mensualidades, datos.monto_total_centavos);
	const acreedor = await acreedorDeLaDeuda(contexto, datos);
	const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "deuda" }));
	const id = uuidv7();
	const quien = quienCambia(contexto);
	const hoy = contexto.diaDeNegocio.toString();
	await transaccion.insert(deudas).values({
		id,
		folio,
		terceroId: acreedor.id,
		descripcion: datos.descripcion,
		montoTotalCentavos: datos.monto_total_centavos,
		numeroMensualidades: datos.numero_mensualidades,
		creadoPor: quien,
	});
	for (const mensualidad of mensualidades) {
		const mensualidadId = uuidv7();
		await transaccion.insert(deudaMensualidades).values({
			id: mensualidadId,
			deudaId: id,
			numero: mensualidad.numero,
			vence: mensualidad.vence,
			importeCentavos: mensualidad.importe_centavos,
			creadoPor: quien,
		});
		await transaccion.insert(cuentasPorPagar).values({
			id: uuidv7(),
			terceroId: acreedor.id,
			tipo: "acreedor",
			deudaMensualidadId: mensualidadId,
			fecha: hoy,
			vence: mensualidad.vence,
			importeCentavos: mensualidad.importe_centavos,
			saldoCentavos: mensualidad.importe_centavos,
			estado: "por_pagar",
			creadoPor: quien,
		});
	}
	contexto.guardarEvento({
		tipo: "deuda.registrada",
		datos: { deuda_id: id, tercero_id: acreedor.id },
		tablas: ["deudas", "deuda_mensualidades", "cuentas_por_pagar"],
		entidad: "deudas",
		entidadId: id,
		entidadFolio: folio,
	});
	const monto = enPesos(datos.monto_total_centavos);
	const quienLoHizo = await nombreDeCuenta(contexto, quien);
	contexto.bitacora({
		descripcion: `${quienLoHizo} registró la deuda ${folio} con ${acreedor.nombre}: ${monto} en ${datos.numero_mensualidades} mensualidades`,
		entidad: "deudas",
		entidadId: id,
		entidadFolio: folio,
		despues: { monto_total_centavos: datos.monto_total_centavos, mensualidades },
	});
	if (acreedor.nuevo) {
		contexto.bitacora({
			descripcion: `${quienLoHizo} dio de alta al tercero ${acreedor.nombre} (acreedor)`,
			entidad: "terceros",
			entidadId: acreedor.id,
		});
	}
	const primera = mensualidades[0]?.vence ?? datos.primer_vencimiento;
	return {
		resultado: {
			mensaje: `${folio} registrada: ${monto} a ${acreedor.nombre}, vence el ${textoDeDia(primera)}`,
			deuda_id: id,
			folio,
		},
		avisos: primera < hoy ? ["Ojo: la primera mensualidad ya venció"] : [],
		entidad: { nombre: "deudas", id },
	};
});

export const accionCancelarDeuda = implementarAccion(cancelarDeuda, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const { motivo } = datos;
	const [deuda] = await transaccion.select().from(deudas).where(eq(deudas.id, datos.deuda_id)).for("update");
	if (deuda === undefined) throw noExiste();
	await tomarVersion(contexto, deudas, deuda.id, version, async () => ({ deuda_id: deuda.id, estado: deuda.estado }));
	if (deuda.estado !== "abierta") throw errorDeRegla("deuda_no_abierta", `${deuda.folio} ya está saldada o cancelada.`);
	const mensualidades = await transaccion
		.select({ id: deudaMensualidades.id })
		.from(deudaMensualidades)
		.where(eq(deudaMensualidades.deudaId, deuda.id));
	const cuentas = await transaccion
		.select()
		.from(cuentasPorPagar)
		.where(
			inArray(
				cuentasPorPagar.deudaMensualidadId,
				mensualidades.map((mensualidad) => mensualidad.id),
			),
		)
		.orderBy(asc(cuentasPorPagar.id))
		.for("update");
	// Solo sin pagos: ni un depósito ni una compensación (regla 7).
	if (cuentas.some((cuenta) => cuenta.saldoCentavos < cuenta.importeCentavos)) {
		throw errorDeRegla("deuda_con_pagos", `${deuda.folio} ya tiene pagos: no se puede cancelar.`);
	}
	const quien = quienCambia(contexto);
	const cancelacion = { canceladoEn: contexto.ahora.toString(), canceladoPor: quien, motivoCancelacion: motivo };
	await transaccion
		.update(deudas)
		.set({ estado: "cancelada", ...cancelacion })
		.where(eq(deudas.id, deuda.id));
	await transaccion
		.update(cuentasPorPagar)
		.set({ estado: "cancelada", ...cancelacion })
		.where(
			inArray(
				cuentasPorPagar.id,
				cuentas.map((cuenta) => cuenta.id),
			),
		);
	contexto.guardarEvento({
		tipo: "deuda.cancelada",
		datos: { deuda_id: deuda.id },
		tablas: ["deudas", "cuentas_por_pagar"],
		entidad: "deudas",
		entidadId: deuda.id,
		entidadFolio: deuda.folio,
	});
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} canceló la deuda ${deuda.folio} con ${await nombreDelTercero(transaccion, deuda.terceroId)}: ${motivo}`,
		entidad: "deudas",
		entidadId: deuda.id,
		entidadFolio: deuda.folio,
		antes: { estado: deuda.estado },
		despues: { estado: "cancelada" },
	});
	return {
		resultado: { mensaje: `${deuda.folio} cancelada`, deuda_id: deuda.id },
		entidad: { nombre: "deudas", id: deuda.id },
	};
});
