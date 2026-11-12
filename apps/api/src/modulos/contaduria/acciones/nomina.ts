/**
 * Las acciones de la nómina: el descuento semanal de una persona y pagar la nómina de una semana, una sola vez,
 * congelada.
 * Fase 17 · docs/modulos/contaduria/nomina.md (reglas 2 y 9 a 11, «Acciones»)
 *
 * Las dos piden «ven sueldos y tarifas» y su bitácora lleva `sensible_sueldos`: sus montos van en los campos de
 * sueldo que declara Contaduría.
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { guardarDescuentoSemanal, pagarNomina } from "@uniformame/compartido/contratos/contaduria/nomina";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { confirmadoConGoogle } from "../../admin/dominio/cuentas.ts";
import { textoDeSemana } from "../../personal/dominio/asistencia.ts";
import type { RenglonDeNomina } from "../dominio/cuenta-nomina.ts";
import {
	asistenciaDeLaNomina,
	bloquearNomina,
	candadoDeLaNomina,
	cuentaDeLaNomina,
	fichasDePersonas,
} from "../dominio/nomina.ts";
import { descuentosNomina, nominaLineaPiezas, nominaLineas, nominas } from "../tablas.ts";

/** Un monto de sueldo como se lee: «$1,252» o «$962.50». */
function enPesos(monto: number): string {
	return centavosATexto(centavos(monto), { conCentavos: monto % 100 !== 0 });
}

export const accionGuardarDescuentoSemanal = implementarAccion(
	guardarDescuentoSemanal,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		const ficha = (await fichasDePersonas(contexto, [datos.persona_id])).get(datos.persona_id);
		if (ficha === undefined) throw errorDeCampo("persona_id", "Escoge a la persona.");
		// Un descuento por persona a la vez: su candado, y luego el vigente con su versión.
		await transaccion.execute(
			sql`SELECT pg_advisory_xact_lock(hashtextextended(${`descuento_nomina:${datos.persona_id}`}, 0))`,
		);
		const [vigente] = await transaccion
			.select()
			.from(descuentosNomina)
			.where(and(eq(descuentosNomina.personaId, datos.persona_id), eq(descuentosNomina.estado, "vigente")))
			.for("update");
		if (vigente !== undefined) {
			await tomarVersion(contexto, descuentosNomina, vigente.id, version, async () => ({
				descuento_nomina_id: vigente.id,
				estado: vigente.estado,
			}));
		}
		const monto = datos.monto_semanal_centavos;
		if (monto === 0 && vigente === undefined) {
			throw errorDeRegla("sin_descuento", `${ficha.nombre} no tiene descuento semanal.`);
		}
		const motivo = datos.motivo?.trim() ?? "";
		if (monto > 0) {
			const minimo = Number(await contexto.lectura("admin.parametro", { clave: "general.largo_minimo_motivo" }));
			if (motivo.length < minimo) throw errorDeCampo("motivo", "Escribe por qué se le descuenta.");
			if (ficha.bajaEn !== null) throw errorDeRegla("persona_de_baja", `${ficha.nombre} está dada de baja.`);
		}
		const quien = quienCambia(contexto);
		if (vigente !== undefined) {
			await transaccion
				.update(descuentosNomina)
				.set({ estado: "terminado", terminadoEn: contexto.ahora.toString(), terminadoPor: quien })
				.where(eq(descuentosNomina.id, vigente.id));
		}
		const nuevoId = monto > 0 ? uuidv7() : undefined;
		if (nuevoId !== undefined) {
			await transaccion.insert(descuentosNomina).values({
				id: nuevoId,
				personaId: datos.persona_id,
				montoSemanalCentavos: monto,
				motivo,
				creadoPor: quien,
			});
		}
		contexto.guardarEvento({
			tipo: "descuento_nomina.cambiado",
			datos: { persona_id: datos.persona_id },
			tablas: ["descuentos_nomina"],
			entidad: "descuentos_nomina",
			entidadId: nuevoId ?? vigente?.id ?? datos.persona_id,
		});
		const sinDescuento = "sin descuento";
		contexto.bitacora({
			descripcion: {
				plantilla: "Descuento semanal de {persona}: {antes} → {despues} · {motivo}",
				valores: {
					persona: ficha.nombre,
					antes: vigente === undefined ? sinDescuento : { sueldo: enPesos(vigente.montoSemanalCentavos) },
					despues: monto === 0 ? sinDescuento : { sueldo: enPesos(monto) },
					motivo: monto === 0 ? (vigente?.motivo ?? "") : motivo,
				},
			},
			entidad: "descuentos_nomina",
			entidadId: nuevoId ?? vigente?.id ?? datos.persona_id,
			antes: { descuento_semanal_centavos: vigente?.montoSemanalCentavos ?? 0 },
			despues: { descuento_semanal_centavos: monto },
		});
		return {
			resultado: {
				mensaje:
					monto === 0
						? `${ficha.nombre} ya no tiene descuento semanal`
						: `${ficha.nombre}: ${enPesos(monto)} de descuento cada semana, desde esta nómina`,
				...(nuevoId === undefined ? {} : { descuento_nomina_id: nuevoId }),
			},
			entidad: { nombre: "descuentos_nomina", id: nuevoId ?? vigente?.id ?? datos.persona_id },
		};
	},
);

/** El aviso de lo que no alcanzó de una persona, que no detiene. */
function avisoDeNoAlcanzo(renglon: RenglonDeNomina): string[] {
	if (renglon.noAlcanzoCentavos === 0) return [];
	const monto = enPesos(renglon.noAlcanzoCentavos);
	return [
		renglon.destinoNoAlcanzo === "perdonado"
			? `${renglon.ficha.nombre}: se perdonan ${monto}`
			: `${renglon.ficha.nombre}: pasan ${monto} a la siguiente semana`,
	];
}

export const accionPagarNomina = implementarAccion(pagarNomina, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	// Un solo candado para toda la nómina: dos pagos nunca corren a la vez.
	await candadoDeLaNomina(transaccion);
	const nomina = await bloquearNomina(transaccion, datos.nomina_id);
	await tomarVersion(contexto, nominas, nomina.id, version, async () => ({
		nomina_id: nomina.id,
		estado: nomina.estado,
	}));
	const semana = textoDeSemana(nomina.fechaInicio, nomina.fechaFin);
	if (nomina.estado === "pagada") throw errorDeRegla("nomina_pagada", `La nómina del ${semana} ya está pagada`);
	const asistencia = await asistenciaDeLaNomina(contexto, nomina);
	if (!asistencia.semana.cerrada) {
		throw errorDeRegla(
			"asistencia_sin_cerrar",
			`Asistencia sin cerrar: Personal tiene que cerrar la semana del ${semana}`,
		);
	}
	// Se pagan en orden: ni una nómina anterior por pagar ni una semana anterior abierta (regla 2).
	const [anterior] = await transaccion
		.select({ inicio: nominas.fechaInicio, fin: nominas.fechaFin })
		.from(nominas)
		.where(and(eq(nominas.estado, "por_pagar"), lt(nominas.fechaInicio, nomina.fechaInicio)))
		.orderBy(asc(nominas.fechaInicio))
		.limit(1);
	const sinPagar = anterior ?? asistencia.abiertas_anteriores[0];
	if (sinPagar !== undefined) {
		throw errorDeRegla(
			"semana_anterior_sin_pagar",
			`Primero paga la nómina del ${textoDeSemana(sinPagar.inicio, sinPagar.fin)}`,
		);
	}
	const { cuenta, reglas } = await cuentaDeLaNomina(contexto, nomina, asistencia);
	if (cuenta.totalCentavos !== datos.total_visto_centavos) {
		throw errorDeRegla(
			"nomina_cambio",
			`La nómina cambió desde que la abriste: ahora suma ${enPesos(cuenta.totalCentavos)}. Revísala y vuelve a pagar`,
		);
	}
	const comoSePago = new Map((datos.renglones ?? []).map((renglon) => [renglon.persona_id, renglon]));
	for (const personaId of comoSePago.keys()) {
		if (!cuenta.renglones.some((renglon) => renglon.ficha.personaId === personaId)) {
			const nombre = (await fichasDePersonas(contexto, [personaId])).get(personaId)?.nombre ?? "Esa persona";
			throw errorDeRegla("persona_fuera_de_nomina", `${nombre} no está en esta nómina.`);
		}
	}
	// La cuenta, congelada (regla 11): un renglón por persona y uno por cada registro que entró.
	const quien = quienCambia(contexto);
	for (const renglon of cuenta.renglones) {
		const lineaId = uuidv7();
		const pago = comoSePago.get(renglon.ficha.personaId);
		await transaccion.insert(nominaLineas).values({
			id: lineaId,
			nominaId: nomina.id,
			personaId: renglon.ficha.personaId,
			area: renglon.ficha.area,
			ubicacionId: renglon.ficha.ubicacionId,
			puesto: renglon.ficha.puesto,
			formaPago: renglon.ficha.formaPago,
			bajaEn: renglon.ficha.bajaEn,
			dias: renglon.dias.toFixed(1),
			pagoDiaCentavos: renglon.ficha.formaPago === "pieza" ? null : renglon.ficha.pagoDiaCentavos,
			importeTiempoCentavos: renglon.importeTiempoCentavos,
			piezas: renglon.piezas,
			importePiezasCentavos: renglon.importePiezasCentavos,
			correccionesCentavos: renglon.correccionesCentavos,
			brutoCentavos: renglon.brutoCentavos,
			descuentoNominaId: renglon.descuento?.id ?? null,
			descuentoCentavos: renglon.descuentoCentavos,
			descuentoMotivo: renglon.descuento?.motivo ?? null,
			arrastreCentavos: renglon.arrastreCentavos,
			descontadoCentavos: renglon.descontadoCentavos,
			noAlcanzoCentavos: renglon.noAlcanzoCentavos,
			destinoNoAlcanzo: renglon.destinoNoAlcanzo,
			totalCentavos: renglon.totalCentavos,
			medioPago: pago?.medio_pago ?? null,
			referenciaPago: pago?.referencia_pago ?? null,
			creadoPor: quien,
		});
		if (renglon.detalle.length > 0) {
			await transaccion.insert(nominaLineaPiezas).values(
				renglon.detalle.map((pieza) => ({
					id: uuidv7(),
					nominaLineaId: lineaId,
					registroOperacionId: pieza.registroId,
					tipo: pieza.tipo,
					fecha: pieza.fecha,
					flujoOperacionId: pieza.flujoOperacionId,
					piezasBuenas: pieza.piezasBuenas,
					piezasDanadas: pieza.piezasDanadas,
					piezasPagadas: pieza.piezasPagadas,
					tarifaCentavos: pieza.tarifaCentavos,
					importeCentavos: pieza.importeCentavos,
					sePaga: pieza.sePaga,
					motivoNoPago: pieza.motivoNoPago,
					creadoPor: quien,
				})),
			);
		}
	}
	const confirmado = confirmadoConGoogle(contexto);
	const totales = {
		totalTiempoCentavos: cuenta.totalTiempoCentavos,
		totalPiezasCentavos: cuenta.totalPiezasCentavos,
		totalCorreccionesCentavos: cuenta.totalCorreccionesCentavos,
		totalDescontadoCentavos: cuenta.totalDescontadoCentavos,
		totalCentavos: cuenta.totalCentavos,
	};
	await transaccion
		.update(nominas)
		.set({
			estado: "pagada",
			...totales,
			personas: cuenta.renglones.length,
			reglaPiezasDanadas: reglas.pagarDanadas,
			reglaDescuentoMayor: reglas.descuentoMayor,
			pagadaEn: contexto.ahora.toString(),
			pagadaPor: quien,
			confirmadoConGoogleEn: confirmado,
		})
		.where(eq(nominas.id, nomina.id));
	contexto.guardarEvento({
		tipo: "nomina.pagada",
		datos: { nomina_id: nomina.id },
		tablas: ["nominas", "nomina_lineas", "nomina_linea_piezas"],
		entidad: "nominas",
		entidadId: nomina.id,
	});
	contexto.bitacora({
		descripcion: { plantilla: "Pagó la nómina del {semana} · confirmado con Google", valores: { semana } },
		entidad: "nominas",
		entidadId: nomina.id,
		antes: { estado: "por_pagar" },
		despues: {
			estado: "pagada",
			personas: cuenta.renglones.length,
			total_nomina_centavos: cuenta.totalCentavos,
			total_tiempo_nomina_centavos: cuenta.totalTiempoCentavos,
			total_piezas_nomina_centavos: cuenta.totalPiezasCentavos,
			total_correcciones_nomina_centavos: cuenta.totalCorreccionesCentavos,
			total_descontado_nomina_centavos: cuenta.totalDescontadoCentavos,
		},
		confirmadoConGoogleEn: confirmado,
	});
	return {
		resultado: { mensaje: `Nómina del ${semana} pagada`, nomina_id: nomina.id },
		avisos: cuenta.renglones.flatMap(avisoDeNoAlcanzo),
		entidad: { nombre: "nominas", id: nomina.id },
	};
});
