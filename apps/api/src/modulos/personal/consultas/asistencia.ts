/**
 * `personal.asistencia` y la pastilla de Personal en el menú.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Quién entra», «Asistencia»)
 *
 * Personal abre en Asistencia: los indicadores de la semana, de las personas y del PIN del taller; los pendientes (un
 * renglón por semana abierta, uno por persona del Taller sin PIN o bloqueada y, con «ven sueldos y tarifas», uno por
 * operación sin tarifa); la cuadrícula de una semana con sus días de trabajo; y las últimas semanas cerradas, que solo
 * la dueña reabre mientras su nómina no esté pagada.
 *
 * Las reglas son las del módulo: quién lleva asistencia y lo que vale cada día salen de `personal.asistencia_para_nomina`,
 * los días que faltan de `diasSinCapturar`, el día de pago de `fechaDePago` de Contaduría con `nomina.dia_pago`, y si
 * una nómina está pagada de `contaduria.estado_nomina_semana`. Se lee en una transacción que solo lee.
 */

import { inicioDeSemana, textoDeDiaCorto, textoDeMomentoCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import {
	asistenciaDePersonal,
	type botonDePendiente,
	type estadoDePersonal,
	valoresDeDia,
} from "@uniformame/compartido/contratos/personal/asistencia";
import { formasDePago, nombresDeFormaDePago } from "@uniformame/compartido/contratos/personal/personas";
import { and, asc, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { esLaDuena, veSueldosYTarifas } from "../../../nucleo/acceso/quien.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ConteoDePastilla, ContextoDeAccion, ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { usuarios } from "../../admin/tablas.ts";
import { fechaDePago } from "../../contaduria/dominio/nomina.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import {
	type DiaSinCapturar,
	type DiasDeLaSemana,
	diasDeTrabajo,
	diasSinCapturar,
	semanaDe,
	textoDeSemana,
} from "../dominio/asistencia.ts";

import { ubicacionDelPin } from "../dominio/pines.ts";
import { resumenPin } from "../lecturas/resumen-pin.ts";
import { asistenciaDias, asistenciaSemanas, personas, pines } from "../tablas.ts";
import { nombreDelArea, operacionesSinTarifa } from "./comun.ts";

/** Lo que regresa la consulta. */
type Resultado = z.infer<typeof asistenciaDePersonal.resultado>;

/** Un renglón de Pendientes. */
type Pendiente = Resultado["pendientes"][number];

/** Una semana guardada en la base. */
type SemanaGuardada = typeof asistenciaSemanas.$inferSelect;

/** Lo que regresa `personal.asistencia_para_nomina`: quién lleva asistencia en la semana y sus días contados. */
const asistenciaLeida = z.object({ personas: z.array(z.object({ persona_id: z.uuid(), dias: z.number() })) });

/** Cuántas semanas cerradas se muestran. */
const semanasCerradasQueSeVen = 4;

/** Una semana leída: la guardada (si ya se abrió), sus días de trabajo, quién la lleva y lo que falta. */
interface SemanaLeida {
	guardada: SemanaGuardada | undefined;
	dias: DiasDeLaSemana;
	personas: { persona_id: string; dias: number }[];
	faltan: DiaSinCapturar[];
}

/**
 * Lee una semana: quién lleva asistencia en ella con sus días contados (la lectura de la nómina, si ya se abrió) y
 * los días exigidos que faltan. Una semana que todavía no se abre no tiene días capturados: quien la lleva es quien
 * tiene días exigidos.
 * @param accion El contexto de lectura.
 * @param dias Sus días de trabajo.
 * @param guardada La semana en la base, si ya se abrió.
 */
async function leerSemana(
	accion: ContextoDeAccion,
	dias: DiasDeLaSemana,
	guardada: SemanaGuardada | undefined,
): Promise<SemanaLeida> {
	const faltan = await diasSinCapturar(accion.transaccion, dias);
	if (guardada !== undefined) {
		const leida = asistenciaLeida.parse(
			await accion.lectura("personal.asistencia_para_nomina", { asistencia_semana_id: guardada.id }),
		);
		return { guardada, dias, personas: leida.personas, faltan };
	}
	const ids = [...new Set(faltan.map((dia) => dia.personaId))];
	return { guardada, dias, personas: ids.map((persona_id) => ({ persona_id, dias: 0 })), faltan };
}

/**
 * Las semanas que se ven: las anteriores que siguen abiertas, la pasada aunque ya se haya cerrado (su renglón de
 * Pendientes se queda como «Cerrada» hasta que pasa otra semana) y la que corre (guardada o no).
 * @param accion El contexto de lectura.
 * @param trabajo Los días de trabajo.
 */
async function semanasAbiertas(accion: ContextoDeAccion, trabajo: Parameters<typeof semanaDe>[1]) {
	const actual = semanaDe(accion.diaDeNegocio, trabajo);
	// La semana guardada se busca por su semana de lunes a domingo, como la abren las acciones.
	const lunes = inicioDeSemana(accion.diaDeNegocio);
	const [delaActual] = await accion.transaccion
		.select()
		.from(asistenciaSemanas)
		.where(
			and(
				gte(asistenciaSemanas.fechaInicio, lunes.toString()),
				lte(asistenciaSemanas.fechaInicio, lunes.add({ days: 6 }).toString()),
			),
		);
	const anteriores = await accion.transaccion
		.select()
		.from(asistenciaSemanas)
		.where(
			and(
				lt(asistenciaSemanas.fechaInicio, lunes.toString()),
				or(
					eq(asistenciaSemanas.estado, "abierta"),
					gte(asistenciaSemanas.fechaInicio, lunes.subtract({ days: 7 }).toString()),
				),
			),
		)
		.orderBy(asc(asistenciaSemanas.fechaInicio));
	const leidas: SemanaLeida[] = [];
	for (const guardada of anteriores) {
		leidas.push(await leerSemana(accion, semanaDe(Temporal.PlainDate.from(guardada.fechaInicio), trabajo), guardada));
	}
	leidas.push(
		await leerSemana(
			accion,
			delaActual === undefined ? actual : semanaDe(Temporal.PlainDate.from(delaActual.fechaInicio), trabajo),
			delaActual,
		),
	);
	return leidas;
}

/**
 * Cómo se escribe un día de trabajo en el encabezado de la cuadrícula: «lun 9».
 * @param fecha El día.
 */
function textoDelDia(fecha: Temporal.PlainDate): string {
	return `${fecha.toLocaleString("es-MX", { weekday: "short" }).replace(".", "")} ${fecha.day}`;
}

/**
 * La cuadrícula de una semana: una fila por quien la lleva, en orden de nombre, con cada día de trabajo (capturado,
 * vacío o fuera de su ingreso y su baja) y la suma de sus días.
 * @param accion El contexto de lectura.
 * @param semana La semana leída.
 */
async function cuadricula(accion: ContextoDeAccion, semana: SemanaLeida): Promise<Resultado["semana"]> {
	const { dias, guardada, faltan } = semana;
	const ids = semana.personas.map((persona) => persona.persona_id);
	const filas =
		ids.length === 0
			? []
			: await accion.transaccion
					.select({
						id: personas.id,
						nombre: personas.nombre,
						area: personas.area,
						formaPago: personas.formaPago,
						tienda: ubicaciones.nombre,
					})
					.from(personas)
					.leftJoin(ubicaciones, eq(ubicaciones.id, personas.ubicacionId))
					.where(inArray(personas.id, ids))
					.orderBy(asc(personas.nombre), asc(personas.id));
	const capturados =
		ids.length === 0
			? []
			: await accion.transaccion
					.select({
						personaId: asistenciaDias.personaId,
						fecha: asistenciaDias.fecha,
						valor: asistenciaDias.valor,
						version: asistenciaDias.version,
					})
					.from(asistenciaDias)
					.where(
						and(
							inArray(asistenciaDias.personaId, ids),
							gte(asistenciaDias.fecha, dias.inicio.toString()),
							lte(asistenciaDias.fecha, dias.fin.toString()),
						),
					);
	const porDia = new Map(capturados.map((dia) => [`${dia.personaId}|${dia.fecha}`, dia]));
	const exigidos = new Set(faltan.map((dia) => `${dia.personaId}|${dia.fecha.toString()}`));
	const totales = new Map(semana.personas.map((persona) => [persona.persona_id, persona.dias]));
	const filasDeLaCuadricula = filas.map((fila) => ({
		persona_id: fila.id,
		nombre: fila.nombre,
		detalle: `${nombreDelArea(fila.area, fila.tienda)} · ${nombresDeFormaDePago[z.enum(formasDePago).parse(fila.formaPago)]}`,
		dias: dias.dias.map((fecha) => {
			const clave = `${fila.id}|${fecha.toString()}`;
			const capturado = porDia.get(clave);
			return {
				fecha: fecha.toString(),
				valor: capturado === undefined ? null : z.enum(valoresDeDia).parse(capturado.valor),
				version: capturado?.version ?? null,
				capturable: capturado !== undefined || exigidos.has(clave),
				// Un día que todavía no llega no se pinta como falta de captura.
				por_llegar: Temporal.PlainDate.compare(fecha, accion.diaDeNegocio) > 0,
			};
		}),
		total: totales.get(fila.id) ?? 0,
	}));
	const valores = filasDeLaCuadricula.flatMap((fila) => fila.dias.map((dia) => dia.valor));
	const cuantos = (valor: string) => valores.filter((uno) => uno === valor).length;
	const [primero] = faltan;
	return {
		asistencia_semana_id: guardada?.id ?? null,
		inicio: dias.inicio.toString(),
		fin: dias.fin.toString(),
		texto: textoDeSemana(dias.inicio.toString(), dias.fin.toString()),
		cerrada: guardada?.estado === "cerrada",
		version: guardada?.version ?? null,
		dias: dias.dias.map((fecha) => ({ fecha: fecha.toString(), texto: textoDelDia(fecha) })),
		personas: filasDeLaCuadricula,
		sin_capturar: faltan.length,
		primero_sin_capturar:
			primero === undefined ? null : { persona_id: primero.personaId, fecha: primero.fecha.toString() },
		conteo: { completos: cuantos("completo"), medios: cuantos("medio"), faltas: cuantos("falta") },
	};
}

/** Los estados de los pendientes de Personal, escritos como los dice la guía de textos. */
const estados = {
	porCapturar: { texto: "Por capturar", color: "ambar" },
	porCerrar: { texto: "Por cerrar", color: "ambar" },
	cerrada: { texto: "Cerrada", color: "verde" },
	sinPin: { texto: "Sin PIN", color: "ambar" },
	bloqueado: { texto: "Bloqueado", color: "rojo" },
	sinTarifa: { texto: "Sin tarifa", color: "ambar" },
} as const satisfies Record<string, z.infer<typeof estadoDePersonal>>;

/**
 * El renglón de Pendientes de una semana: por capturar, por cerrar o cerrada (el renglón se queda).
 * @param semana La semana leída.
 * @param diaDePago `nomina.dia_pago`.
 */
function renglonDeSemana(semana: SemanaLeida, diaDePago: string): Pendiente {
	const { dias, guardada, faltan, personas: suyas } = semana;
	const cerrada = guardada?.estado === "cerrada";
	const pago = fechaDePago(dias.fin.toString(), diaDePago);
	const boton: z.infer<typeof botonDePendiente> | null = cerrada
		? null
		: {
				tipo: "cerrar_semana",
				asistencia_semana_id: guardada?.id ?? null,
				version: guardada?.version ?? null,
				principal: faltan.length === 0,
			};
	return {
		clave: `semana-${dias.inicio.toString()}`,
		grupo: "asistencia",
		tipo: "Asistencia",
		referencia: `Semana del ${textoDeSemana(dias.inicio.toString(), dias.fin.toString())}`,
		detalle: `${plural(suyas.length, "persona por tiempo", "personas por tiempo")}${
			faltan.length > 0 ? ` · ${plural(faltan.length, "día sin capturar", "días sin capturar")}` : ""
		}`,
		fecha: pago,
		fecha_texto: `Nómina ${textoDeDiaCorto(pago)}`,
		estado: cerrada ? estados.cerrada : faltan.length > 0 ? estados.porCapturar : estados.porCerrar,
		boton,
	};
}

/** Lo que pesa cada color al ordenar Pendientes: rojo, ámbar, verde. */
const pesoDelColor: Readonly<Record<string, number>> = { rojo: 0, ambar: 1, verde: 3 };

/**
 * Ordena Pendientes: rojo, ámbar, verde; dentro de cada color, por fecha (sin fecha al final).
 * @param uno Un renglón.
 * @param otro Otro renglón.
 */
function enOrden(uno: Pendiente, otro: Pendiente): number {
	const color = (pesoDelColor[uno.estado.color] ?? 2) - (pesoDelColor[otro.estado.color] ?? 2);
	if (color !== 0) return color;
	if (uno.fecha !== otro.fecha) {
		if (uno.fecha === null) return 1;
		if (otro.fecha === null) return -1;
		return uno.fecha < otro.fecha ? -1 : 1;
	}
	return uno.referencia.localeCompare(otro.referencia, "es-MX");
}

/** El PIN bloqueado de una persona, con su versión y sus intentos, para «Desbloquear». */
async function pinesBloqueados(accion: ContextoDeAccion) {
	const ubicacionId = await ubicacionDelPin(accion.transaccion);
	return accion.transaccion
		.select({ personaId: pines.personaId, version: pines.version, intentos: pines.intentosFallidos })
		.from(pines)
		.where(and(eq(pines.ubicacionId, ubicacionId), eq(pines.estado, "bloqueado")));
}

/**
 * Los pendientes de Personal y lo que se cuenta con ellos: las semanas abiertas, el PIN del taller y, con el permiso,
 * las operaciones sin tarifa. Los usan la consulta y la pastilla.
 * @param accion El contexto de lectura.
 * @param conTarifas Si la cuenta ve sueldos y tarifas.
 */
async function leerPendientes(accion: ContextoDeAccion, conTarifas: boolean) {
	const trabajo = await diasDeTrabajo(accion);
	const diaDePago = String(await accion.lectura("admin.parametro", { clave: "nomina.dia_pago" }));
	const semanas = await semanasAbiertas(accion, trabajo);
	const resumen = await resumenPin(accion);
	const bloqueados = await pinesBloqueados(accion);
	const delPin = new Map(bloqueados.map((pin) => [pin.personaId, pin]));
	const sinTarifa = conTarifas ? await operacionesSinTarifa(accion.transaccion) : [];
	const renglones: Pendiente[] = [
		...semanas.map((semana) => renglonDeSemana(semana, diaDePago)),
		...resumen.sin_pin.map(
			(persona): Pendiente => ({
				clave: `sin-pin-${persona.persona_id}`,
				grupo: "pin",
				tipo: "PIN",
				referencia: persona.nombre,
				detalle: `${persona.puesto} · sin acceso a la tablet del taller`,
				fecha: null,
				fecha_texto: null,
				estado: estados.sinPin,
				boton: { tipo: "asignar_pin", persona_id: persona.persona_id },
			}),
		),
		...resumen.bloqueados.map((persona): Pendiente => {
			const pin = delPin.get(persona.persona_id);
			const desde = persona.desde === null ? null : new Date(persona.desde).toISOString();
			return {
				clave: `bloqueado-${persona.persona_id}`,
				grupo: "pin",
				tipo: "PIN",
				referencia: persona.nombre,
				detalle: `Se bloqueó por ${plural(pin?.intentos ?? 0, "PIN equivocado", "PIN equivocados")}`,
				fecha: desde,
				fecha_texto: desde === null ? null : textoDeMomentoCorto(desde),
				estado: estados.bloqueado,
				boton:
					pin === undefined
						? null
						: { tipo: "desbloquear_pin", persona_id: persona.persona_id, nombre: persona.nombre, version: pin.version },
			};
		}),
		...sinTarifa.map(
			(operacion): Pendiente => ({
				clave: `sin-tarifa-${operacion.flujo_operacion_id}`,
				grupo: "tarifas",
				tipo: "Tarifa",
				referencia: `${operacion.operacion} · ${operacion.flujo}`,
				detalle: `${plural(operacion.registros, "registro espera", "registros esperan")} su tarifa`,
				fecha: null,
				fecha_texto: null,
				estado: estados.sinTarifa,
				boton: {
					tipo: "poner_tarifa",
					flujo_id: operacion.flujo_id,
					flujo_operacion_id: operacion.flujo_operacion_id,
				},
			}),
		),
	].sort(enOrden);
	const abiertas = semanas.filter((semana) => semana.guardada?.estado !== "cerrada");
	return {
		trabajo,
		semanas,
		resumen,
		renglones,
		sinTarifa: sinTarifa.length,
		pastilla: {
			conteo: abiertas.length + resumen.sin_pin.length + resumen.bloqueados.length + sinTarifa.length,
			rojo: resumen.bloqueados.length > 0,
		} satisfies ConteoDePastilla,
		pestanaAsistencia: abiertas.reduce(
			(suma, semana) => suma + (semana.faltan.length > 0 ? semana.faltan.length : 1),
			0,
		),
	};
}

/**
 * La semana de la cuadrícula: la que se pidió por su id, o la que corre.
 * @param accion El contexto de lectura.
 * @param id La semana pedida.
 * @param leidas Las semanas abiertas ya leídas.
 * @param trabajo Los días de trabajo.
 * @throws `404` si la semana pedida no existe.
 */
async function semanaDeLaCuadricula(
	accion: ContextoDeAccion,
	id: string | undefined,
	leidas: SemanaLeida[],
	trabajo: Parameters<typeof semanaDe>[1],
): Promise<SemanaLeida> {
	const actual = leidas.at(-1);
	if (actual === undefined) throw new Error("no se leyó la semana que corre");
	if (id === undefined) return actual;
	const yaLeida = leidas.find((semana) => semana.guardada?.id === id);
	if (yaLeida !== undefined) return yaLeida;
	const [guardada] = await accion.transaccion.select().from(asistenciaSemanas).where(eq(asistenciaSemanas.id, id));
	if (guardada === undefined) throw noExiste();
	return leerSemana(accion, semanaDe(Temporal.PlainDate.from(guardada.fechaInicio), trabajo), guardada);
}

/**
 * Las últimas semanas cerradas: quién la cerró, cuándo y sus faltas.
 * @param accion El contexto de lectura.
 */
async function semanasCerradas(accion: ContextoDeAccion) {
	const cerradas = await accion.transaccion
		.select({
			id: asistenciaSemanas.id,
			inicio: asistenciaSemanas.fechaInicio,
			fin: asistenciaSemanas.fechaFin,
			cerradaEn: asistenciaSemanas.cerradaEn,
			version: asistenciaSemanas.version,
			laCerro: sql<string | null>`coalesce(${personas.nombre}, ${usuarios.nombre}, ${usuarios.correo})`,
			faltas: sql<number>`(select count(*) from asistencia_dias d
				where d.asistencia_semana_id = ${asistenciaSemanas.id} and d.valor = 'falta')::int`,
		})
		.from(asistenciaSemanas)
		.leftJoin(usuarios, eq(usuarios.id, asistenciaSemanas.cerradaPor))
		.leftJoin(personas, eq(personas.id, usuarios.personaId))
		.where(eq(asistenciaSemanas.estado, "cerrada"))
		.orderBy(desc(asistenciaSemanas.fechaInicio))
		.limit(semanasCerradasQueSeVen);
	return cerradas;
}

/** Lo que regresa `contaduria.estado_nomina_semana`. */
const estadoDeNomina = z.object({ pagada: z.boolean() });

export const consultaAsistencia = implementarConsulta(asistenciaDePersonal, async (contexto, parametros) => {
	const conTarifas = veSueldosYTarifas(contexto.quien);
	const leido = await contexto.comoAccion(async (accion) => {
		const pendientes = await leerPendientes(accion, conTarifas);
		const semana = await semanaDeLaCuadricula(
			accion,
			parametros.asistencia_semana_id,
			pendientes.semanas,
			pendientes.trabajo,
		);
		return { pendientes, semana: await cuadricula(accion, semana), cerradas: await semanasCerradas(accion) };
	});
	const { pendientes, semana, cerradas } = leido;
	// Reabrir es solo de la dueña, y solo si Contaduría dice que su nómina no está pagada.
	const esDuena = esLaDuena(contexto.quien);
	const semanasCerradasConReabrir = await Promise.all(
		cerradas.map(async (cerrada) => ({
			asistencia_semana_id: cerrada.id,
			texto: textoDeSemana(cerrada.inicio, cerrada.fin),
			la_cerro: cerrada.laCerro,
			cuando:
				cerrada.cerradaEn === null
					? null
					: Temporal.Instant.from(new Date(cerrada.cerradaEn).toISOString())
							.toZonedDateTimeISO("America/Mexico_City")
							.toPlainDate()
							.toString(),
			faltas: cerrada.faltas,
			version: cerrada.version,
			reabrible:
				esDuena &&
				!estadoDeNomina.parse(
					await contexto.lectura("contaduria.estado_nomina_semana", { asistencia_semana_id: cerrada.id }),
				).pagada,
		})),
	);
	const { resumen } = pendientes;
	return {
		resultado: {
			indicadores: {
				asistencia: {
					sin_capturar: semana.sin_capturar,
					cerrada: semana.cerrada,
					personas: semana.personas.length,
					...semana.conteo,
				},
				personas: { activas: resumen.personas_activas, sin_cuenta: resumen.sin_cuenta },
				tablet: {
					sin_acceso: resumen.sin_pin.length,
					activos: resumen.pines_activos,
					bloqueados: resumen.bloqueados.length,
				},
			},
			pendientes: pendientes.renglones,
			pestanas: {
				asistencia: pendientes.pestanaAsistencia,
				tablet: resumen.sin_pin.length + resumen.bloqueados.length,
				tarifas: conTarifas ? pendientes.sinTarifa : null,
			},
			semanas_abiertas: pendientes.semanas
				.filter((leida) => leida.guardada?.estado !== "cerrada" || leida === pendientes.semanas.at(-1))
				.map((leida) => ({
					asistencia_semana_id: leida.guardada?.id ?? null,
					texto: textoDeSemana(leida.dias.inicio.toString(), leida.dias.fin.toString()),
				})),
			semana,
			semanas_cerradas: semanasCerradasConReabrir,
			ve_tarifas: conTarifas,
			pastilla: pendientes.pastilla,
		},
	};
});

/**
 * La pastilla de Personal: 1 por semana sin cerrar, más las personas del Taller sin PIN y las bloqueadas y, con el
 * permiso de sueldos, las operaciones sin tarifa; roja si alguien está bloqueado.
 * @param contexto El contexto de la consulta del armazón.
 */
export async function pastillaPersonal(contexto: ContextoDeConsulta): Promise<ConteoDePastilla> {
	const conTarifas = veSueldosYTarifas(contexto.quien);
	return contexto.comoAccion(async (accion) => (await leerPendientes(accion, conTarifas)).pastilla);
}
