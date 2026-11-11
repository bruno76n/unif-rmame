/**
 * Lo que sube la tablet del taller (`produccion.registrar_operacion`, `produccion.tomar_consumible` y
 * `produccion.registrar_bloqueo_pin`) y `produccion.cancelar_registro`.
 * Fase 12 · docs/modulos/produccion/registros-de-operacion.md (reglas 1 a 10, «Acciones»)
 *
 * Lo que ya se hizo no se rechaza: lo mal formado se aparta (un `422` en la cola) y lo que pasa del tope o llega con
 * el lote ya revisado se aplica y abre su excepción. Cada registro bloquea su lote y sube su versión: así el tope se
 * cuenta en orden y una revisión de Calidad a la vez recibe `409`.
 */

import { aMilesimos, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { pasaDelTope, topeDelBulto } from "@uniformame/compartido/calculos/tope-bulto";
import {
	cancelarRegistro,
	registrarBloqueoPin,
	registrarOperacion,
	tomarConsumibleTaller,
} from "@uniformame/compartido/contratos/produccion/registros";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { personas, pines } from "../../personal/tablas.ts";
import {
	hechoEnElBulto,
	loteCompleto,
	moverLaTalla,
	operacionesDelLote,
	tarifaQueValia,
	terminarLote,
} from "../dominio/registros.ts";
import { bultos, lotes, registrosOperacion } from "../tablas.ts";

/**
 * La persona del sobre y la tablet: una persona activa del Taller.
 * @throws `422 persona_no_valida`: se aparta.
 */
async function quienRegistra(contexto: ContextoDeAccion) {
	const { quien } = contexto;
	if (quien.tipo !== "aparato" || quien.personaId === undefined) {
		throw errorDeRegla("persona_no_valida", "Esa persona no es del Taller.");
	}
	const [persona] = await contexto.transaccion
		.select({ id: personas.id, nombre: personas.nombre, area: personas.area })
		.from(personas)
		.where(eq(personas.id, quien.personaId));
	if (persona === undefined || persona.area !== "taller") {
		throw errorDeRegla("persona_no_valida", "Esa persona no es del Taller.");
	}
	return { persona, dispositivoId: quien.dispositivoId };
}

/** Abre una excepción del taller con la interna de Inventario y la regresa como la contesta la subida. */
async function abrirExcepcion(
	contexto: ContextoDeAccion,
	tipo: "pasa_tope_bulto" | "lote_no_en_proceso",
	descripcion: string,
	datos: object,
) {
	const { excepcion_id } = z
		.object({ excepcion_id: z.uuid() })
		.parse(await contexto.interna("inventario.registrar_excepcion", { tipo, descripcion, datos }));
	return { id: excepcion_id, codigo: tipo };
}

export const accionRegistrarOperacion = implementarAccion(registrarOperacion, async (contexto, datos) => {
	const { transaccion } = contexto;
	const { persona, dispositivoId } = await quienRegistra(contexto);
	if (datos.piezas_buenas + datos.piezas_danadas === 0)
		throw errorDeRegla("sin_piezas", "Registra al menos una pieza.");
	const [bulto] = await transaccion.select().from(bultos).where(eq(bultos.id, datos.bulto_id));
	if (bulto === undefined) throw errorDeRegla("bulto_no_existe", "Ese bulto no existe.");
	// El lote, bloqueado: los registros del mismo lote se cuentan en orden.
	const [lote] = await transaccion.select().from(lotes).where(eq(lotes.id, bulto.loteId)).for("update");
	if (lote === undefined || lote.flujoId === null) throw errorDeRegla("bulto_no_existe", "Ese bulto no existe.");
	const flujo = await operacionesDelLote(contexto, lote.flujoId);
	const lugar = flujo.findIndex((operacion) => operacion.flujoOperacionId === datos.flujo_operacion_id);
	const operacion = flujo[lugar];
	if (operacion === undefined) throw errorDeRegla("operacion_ajena", "Esa operación no es del flujo del lote.");
	if (operacion.esCorte) throw errorDeRegla("operacion_de_corte", "Las piezas del corte nacen al cerrar el corte.");
	// El tope: lo bueno de la anterior en este bulto (o sus piezas, después del corte) menos lo que ya lleva esta.
	const hecho = await hechoEnElBulto(contexto, bulto.id);
	const anterior = flujo[lugar - 1];
	const deEsta = hecho.get(operacion.flujoOperacionId);
	const delBulto = {
		piezasDelBulto: bulto.piezas,
		buenasDeLaAnterior:
			anterior === undefined || anterior.esCorte ? null : (hecho.get(anterior.flujoOperacionId)?.buenas ?? 0),
		hechasEnEsta: (deEsta?.buenas ?? 0) + (deEsta?.danadas ?? 0),
	};
	const tope = topeDelBulto(delBulto);
	const piezas = datos.piezas_buenas + datos.piezas_danadas;
	const descripcion = `${persona.nombre} registró ${datos.piezas_buenas} buenas y ${datos.piezas_danadas} dañadas de ${operacion.nombre} en ${bulto.folio}`;
	const excepcion =
		lote.estado === "revisado" || lote.estado === "en_aduana"
			? await abrirExcepcion(contexto, "lote_no_en_proceso", `${descripcion}, con ${lote.folio} ya revisado`, {
					registro_id: datos.id,
				})
			: pasaDelTope(delBulto, piezas)
				? await abrirExcepcion(contexto, "pasa_tope_bulto", `${descripcion}, y el tope era ${tope}`, {
						registro_id: datos.id,
						tope,
					})
				: undefined;
	const hechoEn = contexto.ahora.toString();
	const tarifa = await tarifaQueValia(contexto, operacion.flujoOperacionId, hechoEn);
	const clave = contexto.claveIdempotencia;
	if (clave === undefined) throw new Error("un registro de la tablet llega con su clave");
	await transaccion.insert(registrosOperacion).values({
		id: datos.id,
		origen: "tablet",
		bultoId: bulto.id,
		loteId: lote.id,
		flujoOperacionId: operacion.flujoOperacionId,
		personaId: persona.id,
		dispositivoId,
		piezasBuenas: datos.piezas_buenas,
		piezasDanadas: datos.piezas_danadas,
		tarifaCentavos: tarifa?.tarifa_centavos ?? null,
		tarifaOperacionId: tarifa?.tarifa_operacion_id ?? null,
		claveIdempotencia: clave,
		hechoEn,
		fecha: contexto.diaDeNegocio.toString(),
		sinInternet: datos.sin_internet,
		excepcionId: excepcion?.id ?? null,
	});
	const esUltima = lugar === flujo.length - 1;
	await moverLaTalla(
		contexto,
		{
			loteId: lote.id,
			varianteId: bulto.varianteId,
			buenas: datos.piezas_buenas,
			danadas: datos.piezas_danadas,
			esUltima,
		},
		1,
	);
	// Las dañadas salen del Taller con la persona y la tablet.
	if (datos.piezas_danadas > 0) {
		await contexto.interna("inventario.registrar_merma_produccion", {
			registro_operacion_id: datos.id,
			lote_id: lote.id,
			variante_id: bulto.varianteId,
			piezas: datos.piezas_danadas,
			ocurrido_en: hechoEn,
			dispositivo_id: dispositivoId,
			persona_id: persona.id,
		});
	}
	let estado = lote.estado;
	if (lote.estado === "en_proceso" && esUltima && (await loteCompleto(contexto, lote.id))) {
		await terminarLote(contexto, lote);
		estado = "terminado";
	}
	contexto.bitacora({
		descripcion,
		entidad: "registros_operacion",
		entidadId: datos.id,
		entidadFolio: bulto.folio,
		despues: {
			bulto_id: bulto.id,
			flujo_operacion_id: operacion.flujoOperacionId,
			piezas_buenas: datos.piezas_buenas,
			piezas_danadas: datos.piezas_danadas,
			hecho_en: hechoEn,
		},
	});
	contexto.guardarEvento({
		tipo: "registro_operacion.creado",
		datos: { registro_id: datos.id, lote_id: lote.id },
		tablas: ["registros_operacion", "lote_tallas", "lotes"],
		entidad: "registros_operacion",
		entidadId: datos.id,
	});
	return {
		resultado: { registro_id: datos.id, tope, estado_lote: estado, mensaje: descripcion },
		entidad: { nombre: "registros_operacion", id: datos.id },
		...(excepcion === undefined ? {} : { excepcion }),
	};
});

export const accionCancelarRegistro = implementarAccion(cancelarRegistro, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const [registro] = await transaccion
		.select()
		.from(registrosOperacion)
		.where(eq(registrosOperacion.id, datos.registro_id));
	if (registro === undefined) throw noExiste();
	const [lote] = await transaccion.select().from(lotes).where(eq(lotes.id, registro.loteId)).for("update");
	if (lote === undefined || lote.flujoId === null) throw noExiste();
	await tomarVersion(contexto, registrosOperacion, registro.id, version, async () => ({
		registro_id: registro.id,
		estado: registro.estado,
	}));
	if (registro.estado === "cancelado") throw errorDeRegla("registro_ya_cancelado", "Ese registro ya está cancelado.");
	if (registro.origen === "corte") {
		throw errorDeRegla("registro_de_corte", "Las piezas del corte no se cancelan: el corte cerrado no se modifica.");
	}
	if (lote.estado === "revisado" || lote.estado === "en_aduana") {
		throw errorDeRegla("lote_ya_revisado", `${lote.folio} ya pasó por Calidad: este registro ya no se cancela.`);
	}
	// La siguiente no puede quedar con más de lo que le quedaría a esta en el bulto.
	const flujo = await operacionesDelLote(contexto, lote.flujoId);
	const lugar = flujo.findIndex((operacion) => operacion.flujoOperacionId === registro.flujoOperacionId);
	const operacion = flujo[lugar];
	const siguiente = flujo[lugar + 1];
	const hecho = await hechoEnElBulto(contexto, registro.bultoId);
	if (siguiente !== undefined) {
		const deLaSiguiente = hecho.get(siguiente.flujoOperacionId);
		const reporto = (deLaSiguiente?.buenas ?? 0) + (deLaSiguiente?.danadas ?? 0);
		const leQuedaria = (hecho.get(registro.flujoOperacionId)?.buenas ?? 0) - registro.piezasBuenas;
		if (reporto > leQuedaria) {
			throw errorDeRegla(
				"operacion_siguiente_ya_reporto",
				`La operación siguiente ya reportó ${reporto}: primero se cancela lo de ${siguiente.nombre}`,
			);
		}
	}
	await transaccion
		.update(registrosOperacion)
		.set({
			estado: "cancelado",
			canceladoEn: contexto.ahora.toString(),
			canceladoPor: contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null,
			motivoCancelacion: datos.motivo,
		})
		.where(eq(registrosOperacion.id, registro.id));
	const [bulto] = await transaccion.select().from(bultos).where(eq(bultos.id, registro.bultoId));
	await moverLaTalla(
		contexto,
		{
			loteId: lote.id,
			varianteId: bulto?.varianteId ?? "",
			buenas: registro.piezasBuenas,
			danadas: registro.piezasDanadas,
			esUltima: lugar === flujo.length - 1,
		},
		-1,
	);
	if (registro.piezasDanadas > 0) {
		await contexto.interna("inventario.revertir_merma_produccion", { registro_operacion_id: registro.id });
	}
	// Un lote terminado regresa a en proceso, si con esto ya no está completo.
	if (lote.estado === "terminado" && !(await loteCompleto(contexto, lote.id))) {
		await transaccion.update(lotes).set({ estado: "en_proceso", terminadoEn: null }).where(eq(lotes.id, lote.id));
		contexto.guardarEvento({
			tipo: "lote.reabierto",
			datos: { lote_id: lote.id },
			tablas: ["lotes"],
			entidad: "lotes",
			entidadId: lote.id,
			entidadFolio: lote.folio,
		});
	}
	const [persona] = await transaccion
		.select({ nombre: personas.nombre })
		.from(personas)
		.where(eq(personas.id, registro.personaId));
	const piezas = registro.piezasBuenas + registro.piezasDanadas;
	contexto.bitacora({
		// La tarifa va en `antes`: es sueldo, así que la descripción va como plantilla.
		descripcion: {
			plantilla: "Canceló el registro de {persona}: {n} {operacion} en {bulto}. Motivo: {motivo}",
			valores: {
				persona: persona?.nombre ?? "",
				n: String(piezas),
				operacion: operacion?.nombre ?? "",
				bulto: bulto?.folio ?? "",
				motivo: datos.motivo,
			},
		},
		entidad: "registros_operacion",
		entidadId: registro.id,
		antes: {
			estado: "vigente",
			piezas_buenas: registro.piezasBuenas,
			piezas_danadas: registro.piezasDanadas,
			tarifa_centavos: registro.tarifaCentavos,
		},
		despues: { estado: "cancelado", motivo: datos.motivo },
	});
	contexto.guardarEvento({
		tipo: "registro_operacion.cancelado",
		datos: { registro_id: registro.id, lote_id: lote.id },
		tablas: ["registros_operacion", "lote_tallas", "lotes"],
		entidad: "registros_operacion",
		entidadId: registro.id,
	});
	return {
		resultado: {
			mensaje: `Registro cancelado: ${registro.piezasBuenas} piezas menos para ${persona?.nombre ?? ""} en la nómina`,
			version: await versionActual(transaccion, registrosOperacion, registro.id),
		},
		entidad: { nombre: "registros_operacion", id: registro.id },
	};
});

/** Lo que regresa `compras.datos_materiales`, en lo que se usa aquí. */
const datosDeConsumibles = z.record(
	z.string(),
	z.object({
		nombre: z.string(),
		tipo: z.string(),
		unidad_tablet: z.string().nullable(),
		factor_tablet: z.string().nullable(),
	}),
);

export const accionTomarConsumibleTaller = implementarAccion(tomarConsumibleTaller, async (contexto, datos) => {
	const { persona, dispositivoId } = await quienRegistra(contexto);
	const ids = datos.renglones.map((renglon) => renglon.material_id);
	if (new Set(ids).size !== ids.length) throw errorDeRegla("material_repetido", "Un consumible va una sola vez.");
	const materiales = datosDeConsumibles.parse(
		await contexto.lectura("compras.datos_materiales", { material_ids: ids }),
	);
	// De la unidad de la tablet a la de inventario: ÷ el factor, hacia arriba al milésimo.
	const descontado = datos.renglones.map((renglon) => {
		const material = materiales[renglon.material_id];
		if (material?.tipo !== "consumible") {
			throw errorDeRegla("no_es_consumible", `${material?.nombre ?? "Ese material"} no es consumible.`);
		}
		const factor = aMilesimos(material.factor_tablet ?? "1");
		const milesimos = (BigInt(renglon.cantidad) * 1_000_000n + factor - 1n) / factor;
		return { material_id: renglon.material_id, cantidad: deMilesimos(milesimos), material, tablet: renglon.cantidad };
	});
	const { movimiento_id } = z.object({ movimiento_id: z.uuid() }).parse(
		await contexto.interna("inventario.tomar_consumible", {
			id: datos.id,
			renglones: descontado.map(({ material_id, cantidad }) => ({ material_id, cantidad })),
			persona_id: persona.id,
			dispositivo_id: dispositivoId,
			ocurrido_en: contexto.ahora.toString(),
		}),
	);
	const lista = descontado
		.map((uno) => `${uno.tablet} ${uno.material.unidad_tablet ?? ""} de ${uno.material.nombre}`)
		.join(", ");
	contexto.bitacora({
		descripcion: `${persona.nombre} tomó ${lista}`,
		entidad: "movimientos",
		entidadId: movimiento_id,
		despues: { renglones: descontado.map(({ material_id, cantidad }) => ({ material_id, cantidad })) },
	});
	return {
		resultado: {
			movimiento_id,
			descontado: descontado.map(({ material_id, cantidad }) => ({ material_id, cantidad })),
			mensaje: `${persona.nombre} tomó ${lista}`,
		},
		entidad: { nombre: "movimientos", id: movimiento_id },
	};
});

export const accionRegistrarBloqueoPin = implementarAccion(registrarBloqueoPin, async (contexto, datos) => {
	const { persona, dispositivoId } = await quienRegistra(contexto);
	const [pin] = await contexto.transaccion
		.select({ id: pines.id })
		.from(pines)
		.where(and(eq(pines.id, datos.pin_id), eq(pines.personaId, persona.id)));
	if (pin === undefined) throw errorDeRegla("pin_ajeno", "Ese PIN no es de esa persona.");
	const { estado } = z.object({ estado: z.string() }).parse(
		await contexto.interna("personal.bloquear_pin", {
			pin_id: pin.id,
			persona_id: persona.id,
			intentos: datos.intentos,
			ocurrido_en: contexto.ahora.toString(),
			dispositivo_id: dispositivoId,
		}),
	);
	contexto.bitacora({
		descripcion: `PIN de ${persona.nombre} bloqueado en la tablet después de ${datos.intentos} intentos`,
		entidad: "pines",
		entidadId: pin.id,
		esAlerta: true,
		despues: { estado },
	});
	return {
		resultado: { estado, mensaje: `PIN de ${persona.nombre}: ${estado}` },
		entidad: { nombre: "pines", id: pin.id },
	};
});
