/**
 * Lo que leen las pantallas de la tablet, todo de su copia y sin red: las personas con PIN, la producción de cada
 * persona (hoy, la semana, las barras por hora y sus últimos registros), «Bultos para ti», el tope de un bulto en una
 * operación, las operaciones con piezas listas, las máquinas con sus fallas, los motivos y los consumibles. El tope, la
 * salud, la semana y «Bultos para ti» salen de las mismas funciones del paquete compartido que usa la API.
 * Fase 20 · docs/interfaz/tablet.md y docs/apps/tablet.md (regla 4)
 *
 * Solo cuentan los registros vigentes que no se apartaron: lo cancelado y lo que no entró no suma.
 */

import { type BultoCandidato, bultosParaTi as ordenarBultos } from "@uniformame/compartido/calculos/bultos-para-ti";
import {
	type DiaDeLaSemana,
	diaDeNegocio,
	inicioDeSemana,
	zonaDelNegocio,
} from "@uniformame/compartido/calculos/fechas";
import { type SaludDeLote, saludDeLote } from "@uniformame/compartido/calculos/salud-lote";
import { topeDelBulto } from "@uniformame/compartido/calculos/tope-bulto";
import { Temporal } from "temporal-polyfill";
import type { z } from "zod";
import { leerDato } from "../sincronizacion/estado.ts";
import type { BaseDeLaTablet, TablaQueBaja } from "./base.ts";
import { esquemas, type RenglonDe } from "./esquemas.ts";
import { parametroBooleano, parametroEntero, parametroTexto } from "./parametros.ts";

/**
 * Los renglones de una tabla, leídos con su esquema; los que no cumplen no salen.
 * @param base La base local.
 * @param tabla La tabla.
 * @param esquema Su esquema.
 */
async function leer<Renglon>(
	base: BaseDeLaTablet,
	tabla: TablaQueBaja,
	esquema: z.ZodType<Renglon>,
): Promise<Renglon[]> {
	const renglones: Renglon[] = [];
	for (const renglon of await base.copia(tabla).toArray()) {
		const leido = esquema.safeParse(renglon);
		if (leido.success) renglones.push(leido.data);
	}
	return renglones;
}

/** Un registro que cuenta: vigente y no apartado. */
function cuenta(registro: RenglonDe<"registros_operacion">): boolean {
	return registro.estado === "vigente" && registro._local !== "apartado";
}

/** Una persona de «¿Quién eres?». */
export interface PersonaConPin {
	id: string;
	nombre: string;
	iniciales: string;
	bloqueada: boolean;
}

/**
 * Las personas con PIN activo o bloqueado, por nombre.
 * @param base La base local.
 * @param bloqueada Si la persona está bloqueada (por el servidor o por la tablet).
 */
export async function personasConPin(
	base: BaseDeLaTablet,
	bloqueada: (pin: RenglonDe<"pines">) => Promise<boolean>,
): Promise<PersonaConPin[]> {
	const pines = (await leer(base, "pines", esquemas.pines)).filter(
		(pin) => pin.estado === "activo" || pin.estado === "bloqueado",
	);
	const personas = await leer(base, "personas", esquemas.personas);
	const conPin: PersonaConPin[] = [];
	for (const persona of personas) {
		const pin = pines.find((suyo) => suyo.persona_id === persona.id);
		if (pin === undefined) continue;
		conPin.push({
			id: persona.id,
			nombre: persona.nombre,
			iniciales: persona.iniciales ?? persona.nombre.slice(0, 1).toUpperCase(),
			bloqueada: await bloqueada(pin),
		});
	}
	return conPin.sort((una, otra) => una.nombre.localeCompare(otra.nombre, "es"));
}

/** Lo que la copia sabe de los bultos, los lotes y los flujos, para el tope y «Bultos para ti». */
interface Taller {
	bultos: RenglonDe<"bultos">[];
	lotes: RenglonDe<"lotes">[];
	loteTallas: RenglonDe<"lote_tallas">[];
	pasos: RenglonDe<"flujo_operaciones">[];
	operaciones: RenglonDe<"operaciones">[];
	registros: RenglonDe<"registros_operacion">[];
	productos: RenglonDe<"productos">[];
	variantes: RenglonDe<"variantes">[];
	tallas: RenglonDe<"tallas">[];
}

/**
 * Lee de una vez lo que necesitan el tope y «Bultos para ti».
 * @param base La base local.
 */
export async function leerTaller(base: BaseDeLaTablet): Promise<Taller> {
	return {
		bultos: await leer(base, "bultos", esquemas.bultos),
		lotes: await leer(base, "lotes", esquemas.lotes),
		loteTallas: await leer(base, "lote_tallas", esquemas.lote_tallas),
		pasos: await leer(base, "flujo_operaciones", esquemas.flujo_operaciones),
		operaciones: await leer(base, "operaciones", esquemas.operaciones),
		registros: (await leer(base, "registros_operacion", esquemas.registros_operacion)).filter(cuenta),
		productos: await leer(base, "productos", esquemas.productos),
		variantes: await leer(base, "variantes", esquemas.variantes),
		tallas: await leer(base, "tallas", esquemas.tallas),
	};
}

/** El paso del flujo de un lote, con su operación. */
export interface PasoDelBulto {
	flujoOperacionId: string;
	operacion: string;
	orden: number;
	personaBaseId: string | null;
	/** El tope: cuántas piezas se pueden registrar ahí. */
	tope: number;
	/** De dónde sale el tope: «salieron de {operación anterior}» o «piezas del bulto». */
	deDonde: string;
}

/**
 * Los pasos del flujo de un bulto (sin el corte), en su orden, con el tope de cada uno.
 * @param taller Lo del taller.
 * @param bulto El bulto.
 */
export function pasosDelBulto(taller: Taller, bulto: RenglonDe<"bultos">): PasoDelBulto[] {
	const lote = taller.lotes.find((suyo) => suyo.id === bulto.lote_id);
	if (lote?.flujo_id === null || lote === undefined) return [];
	const delFlujo = taller.pasos
		.filter((paso) => paso.flujo_id === lote.flujo_id)
		.sort((uno, otro) => uno.orden - otro.orden);
	const operacionDe = (paso: RenglonDe<"flujo_operaciones">) =>
		taller.operaciones.find((operacion) => operacion.id === paso.operacion_id);
	const delBulto = taller.registros.filter((registro) => registro.bulto_id === bulto.id);
	const sumar = (pasoId: string, cuales: (registro: RenglonDe<"registros_operacion">) => number) =>
		delBulto
			.filter((registro) => registro.flujo_operacion_id === pasoId)
			.reduce((total, registro) => total + cuales(registro), 0);
	return delFlujo.flatMap((paso, i) => {
		const operacion = operacionDe(paso);
		if (operacion === undefined || operacion.es_corte) return [];
		const anterior = delFlujo[i - 1];
		const operacionAnterior = anterior === undefined ? undefined : operacionDe(anterior);
		// En la primera después del corte (o sin anterior), el límite son las piezas del bulto.
		const conAnterior = anterior !== undefined && operacionAnterior !== undefined && !operacionAnterior.es_corte;
		const tope = topeDelBulto({
			piezasDelBulto: bulto.piezas,
			buenasDeLaAnterior: conAnterior ? sumar(anterior.id, (registro) => registro.piezas_buenas) : null,
			hechasEnEsta: sumar(paso.id, (registro) => registro.piezas_buenas + registro.piezas_danadas),
		});
		return [
			{
				flujoOperacionId: paso.id,
				operacion: operacion.nombre,
				orden: paso.orden,
				personaBaseId: paso.persona_base_id,
				tope,
				deDonde: conAnterior ? `salieron de ${operacionAnterior.nombre}` : "piezas del bulto",
			},
		];
	});
}

/**
 * «{prenda} · talla {t}» de un bulto.
 * @param taller Lo del taller.
 * @param bulto El bulto.
 */
export function prendaYTalla(taller: Taller, bulto: RenglonDe<"bultos">): string {
	const variante = taller.variantes.find((suya) => suya.id === bulto.variante_id);
	const prenda = taller.productos.find((producto) => producto.id === variante?.producto_id)?.nombre ?? "";
	const talla = taller.tallas.find((suya) => suya.id === variante?.talla_id)?.nombre ?? "";
	return `${prenda} · talla ${talla}`;
}

/**
 * Los días de trabajo de la fábrica, del parámetro `general.dias_de_trabajo`.
 * @param base La base local.
 */
async function diasDeTrabajo(base: BaseDeLaTablet): Promise<DiaDeLaSemana[]> {
	return (await parametroTexto(base, "general.dias_de_trabajo"))
		.split(",")
		.map(Number)
		.filter((dia): dia is DiaDeLaSemana => Number.isInteger(dia) && dia >= 1 && dia <= 7);
}

/**
 * La salud de cada lote en proceso, con la función del paquete compartido: su último avance es su último registro, y
 * su última sincronización, la última bajada de esta tablet. Un lote está atorado por máquina si una falla abierta que
 * la detiene es de la máquina de quien hace una operación con piezas esperando.
 * @param base La base local.
 * @param taller Lo del taller.
 * @param hoy El día de hoy.
 */
async function saludDeLosLotes(
	base: BaseDeLaTablet,
	taller: Taller,
	hoy: Temporal.PlainDate,
): Promise<Map<string, SaludDeLote["tipo"]>> {
	const dias = await diasDeTrabajo(base);
	const loteAtoradoDias = await parametroEntero(base, "produccion.lote_atorado_dias");
	const riesgoAtrasoDias = await parametroEntero(base, "produccion.riesgo_atraso_dias");
	const bajada = await leerDato(base, "ultima_bajada");
	const ultimaSincronizacion = typeof bajada === "string" ? diaDeNegocio(Temporal.Instant.from(bajada)) : null;
	const fallas = (await leer(base, "fallas", esquemas.fallas)).filter((falla) => falla.estado !== "resuelta");
	const motivos = await leer(base, "motivos_falla", esquemas.motivos_falla);
	const maquinas = await leer(base, "maquinas", esquemas.maquinas);
	const paradas = new Set(
		fallas
			.filter((falla) => motivos.find((motivo) => motivo.id === falla.motivo_falla_id)?.detiene_maquina === true)
			.map((falla) => maquinas.find((maquina) => maquina.id === falla.maquina_id)?.persona_id)
			.filter((persona): persona is string => typeof persona === "string"),
	);
	const salud = new Map<string, SaludDeLote["tipo"]>();
	for (const lote of taller.lotes.filter((suyo) => suyo.estado === "en_proceso")) {
		const tallas = taller.loteTallas.filter((talla) => talla.lote_id === lote.id);
		const faltan = tallas.reduce(
			(total, talla) =>
				total + (talla.piezas_cortadas ?? 0) - (talla.piezas_merma ?? 0) - (talla.piezas_terminadas ?? 0),
			0,
		);
		const delLote = taller.bultos.filter((bulto) => bulto.lote_id === lote.id);
		const avances = taller.registros
			.filter((registro) => delLote.some((bulto) => bulto.id === registro.bulto_id))
			.map((registro) => diaDeNegocio(Temporal.Instant.from(registro.hecho_en)));
		const ultimoAvance = avances.sort(Temporal.PlainDate.compare).at(-1) ?? hoy;
		const esperando = delLote
			.flatMap((bulto) => pasosDelBulto(taller, bulto))
			.find((paso) => paso.tope > 0 && paso.personaBaseId !== null && paradas.has(paso.personaBaseId));
		salud.set(
			lote.id,
			saludDeLote({
				hoy,
				fechaEntrega: Temporal.PlainDate.from(lote.fecha_entrega),
				faltan,
				ultimoAvance,
				ultimaSincronizacion,
				diasSinSubir: [],
				cuelloDeBotella: null,
				atoradoPorMaquina: esperando === undefined ? null : { operacion: esperando.operacion, falla: "" },
				diasDeTrabajo: dias,
				loteAtoradoDias,
				riesgoAtrasoDias,
			}).tipo,
		);
	}
	return salud;
}

/** Un bulto de «Bultos para ti». */
export interface BultoParaTi {
	bultoId: string;
	folio: string;
	prendaYTalla: string;
	flujoOperacionId: string;
	operacion: string;
	listas: number;
	/** El color de la salud de su lote: rojo atorado o atrasado, ámbar en riesgo. */
	tono: "rojo" | "ambar" | "normal";
}

/**
 * «Bultos para ti»: los bultos de los lotes en proceso donde le toca una operación que hace de base, con piezas listas.
 * @param base La base local.
 * @param personaId La persona.
 * @param ahora Cuándo.
 */
export async function bultosParaTi(
	base: BaseDeLaTablet,
	personaId: string,
	ahora: Temporal.Instant,
): Promise<BultoParaTi[]> {
	const taller = await leerTaller(base);
	const salud = await saludDeLosLotes(base, taller, diaDeNegocio(ahora));
	const candidatos: (BultoCandidato & { paso: PasoDelBulto; bulto: RenglonDe<"bultos"> })[] = [];
	for (const lote of taller.lotes.filter((suyo) => suyo.estado === "en_proceso")) {
		for (const bulto of taller.bultos.filter((suyo) => suyo.lote_id === lote.id)) {
			for (const paso of pasosDelBulto(taller, bulto).filter((suyo) => suyo.personaBaseId === personaId)) {
				candidatos.push({
					bultoId: `${bulto.id}:${paso.flujoOperacionId}`,
					numero: bulto.numero * 1000 + paso.orden,
					tope: paso.tope,
					salud: salud.get(lote.id) ?? "en_tiempo",
					fechaEntrega: Temporal.PlainDate.from(lote.fecha_entrega),
					paso,
					bulto,
				});
			}
		}
	}
	const maximo = await parametroEntero(base, "produccion.bultos_para_ti_max");
	return ordenarBultos(candidatos, maximo).map((elegido) => {
		const candidato = candidatos.find((suyo) => suyo.bultoId === elegido.bultoId);
		const tipo = elegido.salud;
		return {
			bultoId: candidato?.bulto.id ?? "",
			folio: candidato?.bulto.folio ?? "",
			prendaYTalla: candidato === undefined ? "" : prendaYTalla(taller, candidato.bulto),
			flujoOperacionId: candidato?.paso.flujoOperacionId ?? "",
			operacion: candidato?.paso.operacion ?? "",
			listas: elegido.tope,
			tono:
				tipo === "atorado" || tipo === "atorado_maquina" || tipo === "atrasado"
					? "rojo"
					: tipo === "en_riesgo"
						? "ambar"
						: "normal",
		};
	});
}

/** Un registro de los últimos de una persona. */
export interface RegistroReciente {
	id: string;
	texto: string;
	/** «guardada aquí», «Cancelado» o «No entró: avisa al encargado». */
	marca: "guardada" | "cancelado" | "apartado" | null;
}

/** La producción de una persona. */
export interface ProduccionDeLaPersona {
	hoy: number;
	semana: number;
	/** Una barra por hora, de la primera con registro hoy a la actual. */
	barras: { hora: number; piezas: number }[];
	ultimos: RegistroReciente[];
	/** Las operaciones que hace de base: para quien todavía no tiene registros. */
	operaciones: string[];
}

/**
 * La producción de una persona: solo cuentan las buenas de sus registros vigentes.
 * @param base La base local.
 * @param personaId La persona.
 * @param ahora Cuándo.
 */
export async function produccionDe(
	base: BaseDeLaTablet,
	personaId: string,
	ahora: Temporal.Instant,
): Promise<ProduccionDeLaPersona> {
	const hoy = diaDeNegocio(ahora);
	const lunes = inicioDeSemana(hoy);
	const todos = (await leer(base, "registros_operacion", esquemas.registros_operacion)).filter(
		(registro) => registro.persona_id === personaId,
	);
	const vigentes = todos.filter(cuenta);
	const enMexico = (registro: RenglonDe<"registros_operacion">) =>
		Temporal.Instant.from(registro.hecho_en).toZonedDateTimeISO(zonaDelNegocio);
	const deHoy = vigentes.filter((registro) => enMexico(registro).toPlainDate().equals(hoy));
	const deLaSemana = vigentes.filter(
		(registro) => Temporal.PlainDate.compare(enMexico(registro).toPlainDate(), lunes) >= 0,
	);
	const sumar = (registros: RenglonDe<"registros_operacion">[]) =>
		registros.reduce((total, registro) => total + registro.piezas_buenas, 0);
	const horaActual = ahora.toZonedDateTimeISO(zonaDelNegocio).hour;
	const primera = Math.min(horaActual, ...deHoy.map((registro) => enMexico(registro).hour));
	const barras = Array.from({ length: horaActual - primera + 1 }, (_, i) => ({
		hora: primera + i,
		piezas: sumar(deHoy.filter((registro) => enMexico(registro).hour === primera + i)),
	}));
	const pasos = await leer(base, "flujo_operaciones", esquemas.flujo_operaciones);
	const operaciones = await leer(base, "operaciones", esquemas.operaciones);
	const bultos = await leer(base, "bultos", esquemas.bultos);
	const nombreDe = (pasoId: string) =>
		operaciones.find((operacion) => operacion.id === pasos.find((paso) => paso.id === pasoId)?.operacion_id)?.nombre ??
		"";
	const ultimos = todos
		.toSorted((uno, otro) => otro.hecho_en.localeCompare(uno.hecho_en))
		.slice(0, 3)
		.map((registro) => ({
			id: registro.id,
			texto: `${registro.piezas_buenas} ${nombreDe(registro.flujo_operacion_id)} · ${
				bultos.find((bulto) => bulto.id === registro.bulto_id)?.folio ?? ""
			}`,
			marca:
				registro._local === "guardada"
					? ("guardada" as const)
					: registro._local === "apartado"
						? ("apartado" as const)
						: registro.estado === "cancelado"
							? ("cancelado" as const)
							: null,
		}));
	const deBase = pasos.filter((paso) => paso.persona_base_id === personaId);
	return {
		hoy: sumar(deHoy),
		semana: sumar(deLaSemana),
		barras: deHoy.length === 0 ? [] : barras,
		ultimos,
		operaciones: [...new Set(deBase.map((paso) => nombreDe(paso.id)).filter((nombre) => nombre !== ""))],
	};
}

/**
 * La tarifa vigente de una operación, si la dueña decidió mostrarla en la tablet; si no, nada.
 * @param base La base local.
 * @param flujoOperacionId La operación del flujo.
 * @param hoy El día de hoy.
 * @returns La tarifa en centavos, `null` si no tiene, o `undefined` si no se muestra.
 */
export async function tarifaDe(
	base: BaseDeLaTablet,
	flujoOperacionId: string,
	hoy: Temporal.PlainDate,
): Promise<number | null | undefined> {
	if (!(await parametroBooleano(base, "produccion.tarifa_visible_tablet"))) return undefined;
	const vigente = (await leer(base, "tarifas_operacion", esquemas.tarifas_operacion))
		.filter((tarifa) => tarifa.flujo_operacion_id === flujoOperacionId && tarifa.vigente_desde <= hoy.toString())
		.sort((una, otra) => otra.vigente_desde.localeCompare(una.vigente_desde))[0];
	return vigente?.tarifa_centavos ?? null;
}

/** Una máquina de «¿Qué máquina?». */
export interface MaquinaDeLaTablet {
	id: string;
	nombre: string;
	folio: string;
	esSuya: boolean;
	/** Su falla abierta, si tiene. */
	falla: { estado: "reportada" | "en_reparacion"; desde: string; motivo: string; detiene: boolean } | null;
}

/**
 * Las máquinas activas, primero las que trae la persona, con su falla abierta.
 * @param base La base local.
 * @param personaId La persona.
 */
export async function maquinasDe(base: BaseDeLaTablet, personaId: string): Promise<MaquinaDeLaTablet[]> {
	const fallas = (await leer(base, "fallas", esquemas.fallas)).filter((falla) => falla.estado !== "resuelta");
	const motivos = await leer(base, "motivos_falla", esquemas.motivos_falla);
	return (await leer(base, "maquinas", esquemas.maquinas))
		.map((maquina) => {
			const falla = fallas.find((suya) => suya.maquina_id === maquina.id);
			const motivo = motivos.find((suyo) => suyo.id === falla?.motivo_falla_id);
			return {
				id: maquina.id,
				nombre: maquina.nombre,
				folio: maquina.folio,
				esSuya: maquina.persona_id === personaId,
				falla:
					falla === undefined
						? null
						: {
								estado: falla.estado === "en_reparacion" ? ("en_reparacion" as const) : ("reportada" as const),
								desde: diaDeNegocio(Temporal.Instant.from(falla.hecho_en)).toString(),
								motivo: motivo?.nombre ?? "",
								detiene: motivo?.detiene_maquina === true,
							},
			};
		})
		.sort((una, otra) => Number(otra.esSuya) - Number(una.esSuya) || una.nombre.localeCompare(otra.nombre, "es"));
}

/**
 * Los motivos de falla, en su orden.
 * @param base La base local.
 */
export async function motivosDeFalla(base: BaseDeLaTablet): Promise<RenglonDe<"motivos_falla">[]> {
	return (await leer(base, "motivos_falla", esquemas.motivos_falla)).sort((uno, otro) => uno.orden - otro.orden);
}

/**
 * Los consumibles activos, por nombre, con su unidad de la tablet.
 * @param base La base local.
 */
export async function consumibles(base: BaseDeLaTablet): Promise<RenglonDe<"materiales">[]> {
	return (await leer(base, "materiales", esquemas.materiales)).sort((uno, otro) =>
		uno.nombre.localeCompare(otro.nombre, "es"),
	);
}
