/**
 * `contaduria.nomina_semana`: la pestaña Nómina. Abrirla deja «Consultó la nómina del {semana}» en la bitácora como
 * consulta sensible.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Nómina») y docs/modulos/contaduria/nomina.md («La cuenta de la
 * nómina», reglas 3 a 11)
 *
 * Lo que se ve es lo que se paga: mientras está por pagar (o la asistencia sigue abierta), la cuenta es
 * `cuentaDeLaNomina`, la misma que corre `contaduria.pagar_nomina`; pagada, son sus renglones congelados.
 */

import { textoDeDia, textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { nominaSemana } from "@uniformame/compartido/contratos/contaduria/consultas-nomina";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { textoDeSemana } from "../../personal/dominio/asistencia.ts";
import type { ReglasDeNomina } from "../dominio/cuenta-nomina.ts";
import { asistenciaDeLaNomina, cuentaDeLaNomina } from "../dominio/nomina.ts";

/** Lo que regresa la consulta. */
type Resultado = z.infer<typeof nominaSemana.resultado>;
/** El renglón de una persona. */
type Renglon = Resultado["grupos"][number]["renglones"][number];

/** Un renglón antes de agruparlo: con su área y su tienda. */
type RenglonConArea = Renglon & { area: string; ubicacionId: string | null };

/** Cómo se lee cada forma de pago. */
const formas: Readonly<Record<string, string>> = { tiempo: "Por tiempo", pieza: "Por pieza", mixta: "Mixta" };

/** Cómo se titula cada área, en su orden; las tiendas van con su nombre. */
const areas: Readonly<Record<string, string>> = {
	taller: "Taller",
	oficina: "Oficina",
	aduana_bodega: "Aduana y bodega",
};

/** Una semana de asistencia con su nómina, si tiene. */
const semanaLeida = z.object({
	id: z.uuid(),
	inicio: z.string(),
	fin: z.string(),
	nomina_id: z.uuid().nullable(),
	version: z.coerce.number().nullable(),
	estado: z.enum(["por_pagar", "pagada"]).nullable(),
	fecha_pago: z.string().nullable(),
	pagada: z.string().nullable(),
	total_tiempo: z.coerce.number().nullable(),
	total_piezas: z.coerce.number().nullable(),
	total: z.coerce.number().nullable(),
	regla_danadas: z.boolean().nullable(),
	regla_mayor: z.string().nullable(),
});

/** Una semana de asistencia con su nómina. */
type Semana = z.infer<typeof semanaLeida>;

/**
 * Las semanas de asistencia, de la más vieja a la más nueva, con su nómina si tienen.
 * @param contexto El contexto de la consulta.
 */
async function semanas(contexto: ContextoDeConsulta): Promise<Semana[]> {
	const { rows } =
		await contexto.base.execute(sql`SELECT s.id, s.fecha_inicio::text AS inicio, s.fecha_fin::text AS fin,
			n.id AS nomina_id, n.version, n.estado, n.fecha_pago::text,
			(n.pagada_en AT TIME ZONE 'America/Mexico_City')::date::text AS pagada,
			n.total_tiempo_centavos AS total_tiempo, n.total_piezas_centavos AS total_piezas, n.total_centavos AS total,
			n.regla_piezas_danadas AS regla_danadas, n.regla_descuento_mayor AS regla_mayor
		FROM asistencia_semanas s LEFT JOIN nominas n ON n.asistencia_semana_id = s.id
		ORDER BY s.fecha_inicio`);
	return z.array(semanaLeida).parse(rows);
}

/**
 * La semana que se abre: la pedida; sin ella, la de la nómina por pagar más vieja, la que corre o la última.
 * @param contexto El contexto de la consulta.
 * @param todas Las semanas.
 * @param pedida La semana pedida.
 */
function semanaQueSeAbre(contexto: ContextoDeConsulta, todas: readonly Semana[], pedida: string | undefined) {
	if (pedida !== undefined) return todas.find((semana) => semana.id === pedida);
	const hoy = contexto.diaDeNegocio.toString();
	return (
		todas.find((semana) => semana.estado === "por_pagar") ??
		todas.find((semana) => semana.inicio <= hoy && hoy <= semana.fin) ??
		todas.at(-1)
	);
}

/**
 * La línea de las dos opciones con que se calcula la nómina.
 * @param reglas Las opciones.
 */
function lineaDeOpciones(reglas: ReglasDeNomina): string {
	const danadas = reglas.pagarDanadas ? "se pagan" : "no se pagan";
	const mayor = reglas.descuentoMayor === "perdonar" ? "se perdona" : "pasa a la siguiente semana";
	return `Piezas dañadas: ${danadas} · Descuento mayor que lo ganado: ${mayor}`;
}

/**
 * La cuenta en vivo de una semana por pagar o abierta: la misma de `contaduria.pagar_nomina`.
 * @param contexto El contexto de la consulta.
 * @param semana La semana.
 */
async function cuentaEnVivo(contexto: ContextoDeConsulta, semana: Semana) {
	const { cuenta, reglas } = await contexto.comoAccion(async (accion) =>
		cuentaDeLaNomina(
			accion,
			{ fechaFin: semana.fin },
			await asistenciaDeLaNomina(accion, { asistenciaSemanaId: semana.id }),
		),
	);
	const renglones: RenglonConArea[] = cuenta.renglones.map((renglon) => ({
		persona_id: renglon.ficha.personaId,
		nombre: renglon.ficha.nombre,
		puesto: renglon.ficha.puesto,
		forma: formas[renglon.ficha.formaPago] ?? renglon.ficha.formaPago,
		dias: renglon.dias,
		piezas: renglon.piezas,
		total_tiempo_nomina_centavos: renglon.importeTiempoCentavos,
		total_piezas_nomina_centavos: renglon.importePiezasCentavos,
		total_correcciones_nomina_centavos: renglon.correccionesCentavos,
		descuento_semanal_centavos: renglon.descuentoCentavos,
		descuento_motivo: renglon.descuento?.motivo ?? null,
		arrastre_nomina_centavos: renglon.arrastreCentavos,
		total_descontado_nomina_centavos: renglon.descontadoCentavos,
		total_nomina_centavos: renglon.totalCentavos,
		no_alcanzo_nomina_centavos: renglon.noAlcanzoCentavos,
		destino_no_alcanzo: renglon.destinoNoAlcanzo,
		cobra_por_tiempo: renglon.detalle.some((pieza) => pieza.motivoNoPago === "cobra_por_tiempo"),
		medio_pago: null,
		referencia_pago: null,
		area: renglon.ficha.area,
		ubicacionId: renglon.ficha.ubicacionId,
	}));
	return {
		renglones,
		total: cuenta.totalCentavos,
		tiempo: cuenta.totalTiempoCentavos,
		piezas: cuenta.totalPiezasCentavos,
		reglas,
	};
}

/** Un renglón congelado de una nómina pagada. */
const lineaLeida = z.object({
	persona_id: z.uuid(),
	nombre: z.string(),
	puesto: z.string(),
	forma_pago: z.string(),
	area: z.string(),
	ubicacion_id: z.uuid().nullable(),
	dias: z.coerce.number(),
	piezas: z.number().int(),
	tiempo: z.coerce.number(),
	importe_piezas: z.coerce.number(),
	correcciones: z.coerce.number(),
	descuento: z.coerce.number(),
	descuento_motivo: z.string().nullable(),
	arrastre: z.coerce.number(),
	descontado: z.coerce.number(),
	no_alcanzo: z.coerce.number(),
	destino: z.enum(["perdonado", "siguiente_semana"]).nullable(),
	total: z.coerce.number(),
	cobra_por_tiempo: z.boolean(),
	medio_pago: z.enum(["efectivo", "transferencia"]).nullable(),
	referencia_pago: z.string().nullable(),
});

/**
 * Los renglones congelados de una nómina pagada.
 * @param contexto El contexto de la consulta.
 * @param nominaId La nómina.
 */
async function renglonesCongelados(contexto: ContextoDeConsulta, nominaId: string): Promise<RenglonConArea[]> {
	const { rows } = await contexto.base.execute(sql`SELECT l.persona_id, p.nombre, l.puesto, l.forma_pago, l.area,
			l.ubicacion_id, l.dias, l.piezas, l.importe_tiempo_centavos AS tiempo, l.importe_piezas_centavos AS importe_piezas,
			l.correcciones_centavos AS correcciones, l.descuento_centavos AS descuento, l.descuento_motivo,
			l.arrastre_centavos AS arrastre, l.descontado_centavos AS descontado, l.no_alcanzo_centavos AS no_alcanzo,
			l.destino_no_alcanzo AS destino, l.total_centavos AS total,
			EXISTS (SELECT 1 FROM nomina_linea_piezas lp WHERE lp.nomina_linea_id = l.id
				AND lp.motivo_no_pago = 'cobra_por_tiempo') AS cobra_por_tiempo,
			l.medio_pago, l.referencia_pago
		FROM nomina_lineas l JOIN personas p ON p.id = l.persona_id
		WHERE l.nomina_id = ${nominaId}::uuid ORDER BY p.nombre`);
	return z
		.array(lineaLeida)
		.parse(rows)
		.map((linea) => ({
			persona_id: linea.persona_id,
			nombre: linea.nombre,
			puesto: linea.puesto,
			forma: formas[linea.forma_pago] ?? linea.forma_pago,
			dias: linea.dias,
			piezas: linea.piezas,
			total_tiempo_nomina_centavos: linea.tiempo,
			total_piezas_nomina_centavos: linea.importe_piezas,
			total_correcciones_nomina_centavos: linea.correcciones,
			descuento_semanal_centavos: linea.descuento,
			descuento_motivo: linea.descuento_motivo,
			arrastre_nomina_centavos: linea.arrastre,
			total_descontado_nomina_centavos: linea.descontado,
			total_nomina_centavos: linea.total,
			no_alcanzo_nomina_centavos: linea.no_alcanzo,
			destino_no_alcanzo: linea.destino,
			cobra_por_tiempo: linea.cobra_por_tiempo,
			medio_pago: linea.medio_pago,
			referencia_pago: linea.referencia_pago,
			area: linea.area,
			ubicacionId: linea.ubicacion_id,
		}));
}

/**
 * Agrupa los renglones por área y, en las tiendas, por tienda: Taller, Oficina, Aduana y bodega y cada tienda.
 * @param contexto El contexto de la consulta.
 * @param renglones Los renglones.
 */
async function agrupar(
	contexto: ContextoDeConsulta,
	renglones: readonly RenglonConArea[],
): Promise<Resultado["grupos"]> {
	const { rows } = await contexto.base.execute(sql`SELECT id, nombre, orden FROM ubicaciones WHERE tipo = 'tienda'`);
	const tiendas = new Map(
		z
			.array(z.object({ id: z.uuid(), nombre: z.string(), orden: z.number() }))
			.parse(rows)
			.map((tienda) => [tienda.id, tienda]),
	);
	const claveDe = (renglon: RenglonConArea) =>
		renglon.area === "tienda" ? `tienda:${renglon.ubicacionId ?? ""}` : renglon.area;
	const orden = (clave: string) => {
		const fijo = Object.keys(areas).indexOf(clave);
		return fijo === -1 ? 10 + (tiendas.get(clave.slice(7))?.orden ?? 0) : fijo;
	};
	return [...Map.groupBy(renglones, claveDe).entries()]
		.sort(([una], [otra]) => orden(una) - orden(otra))
		.map(([clave, suyos]) => ({
			clave,
			titulo: areas[clave] ?? tiendas.get(clave.slice(7))?.nombre ?? "Tienda",
			personas: suyos.length,
			total_nomina_centavos: suyos.reduce((suma, renglon) => suma + (renglon.total_nomina_centavos ?? 0), 0),
			renglones: suyos.map(({ area: _area, ubicacionId: _ubicacion, ...renglon }) => renglon),
		}));
}

/** Una persona activa con su descuento semanal vigente. */
const personaLeida = z.object({
	persona_id: z.uuid(),
	nombre: z.string(),
	area: z.string(),
	monto: z.coerce.number().nullable(),
	motivo: z.string().nullable(),
	version: z.coerce.number().nullable(),
});

/**
 * Las personas activas con su área y su descuento semanal vigente, para la ventana «Descuento semanal».
 * @param contexto El contexto de la consulta.
 */
async function personasParaDescuento(contexto: ContextoDeConsulta): Promise<Resultado["personas"]> {
	const { rows } = await contexto.base.execute(sql`SELECT p.id AS persona_id, p.nombre, p.area,
			d.monto_semanal_centavos AS monto, d.motivo, d.version
		FROM personas p LEFT JOIN descuentos_nomina d ON d.persona_id = p.id AND d.estado = 'vigente'
		WHERE p.baja_en IS NULL ORDER BY p.nombre`);
	return z
		.array(personaLeida)
		.parse(rows)
		.map((persona) => ({
			persona_id: persona.persona_id,
			nombre: persona.nombre,
			area: areas[persona.area] ?? "Tienda",
			...(persona.monto === null ? {} : { descuento_semanal_centavos: persona.monto }),
			descuento_motivo: persona.motivo,
			version: persona.version,
		}));
}

/** Lo que regresa la consulta cuando todavía no hay semanas de asistencia. */
const sinSemanas = { semana: null, nomina: null, total_nomina_centavos: 0, grafica: [], opciones: "", grupos: [] };

export const consultaNominaSemana = implementarConsulta(nominaSemana, async (contexto, parametros) => {
	const todas = await semanas(contexto);
	const semana = semanaQueSeAbre(contexto, todas, parametros.asistencia_semana_id);
	if (semana === undefined) {
		return { resultado: { ...sinSemanas, personas: await personasParaDescuento(contexto) } };
	}
	const texto = `del ${textoDeSemana(semana.inicio, semana.fin)}`;
	await contexto.apuntarConsultaSensible({
		descripcion: `Consultó la nómina ${texto}`,
		entidad: "nominas",
		...(semana.nomina_id === null ? {} : { entidadId: semana.nomina_id }),
	});
	const pagada = semana.estado === "pagada" && semana.nomina_id !== null;
	const cuenta = pagada
		? {
				renglones: await renglonesCongelados(contexto, semana.nomina_id ?? ""),
				total: semana.total ?? 0,
				tiempo: semana.total_tiempo ?? 0,
				piezas: semana.total_piezas ?? 0,
				reglas: {
					pagarDanadas: semana.regla_danadas === true,
					descuentoMayor:
						semana.regla_mayor === "siguiente_semana" ? ("siguiente_semana" as const) : ("perdonar" as const),
				},
			}
		: await cuentaEnVivo(contexto, semana);
	const lugar = todas.indexOf(semana);
	const cuantas = parametros.semanas ?? 8;
	return {
		resultado: {
			semana: {
				asistencia_semana_id: semana.id,
				texto,
				anterior_id: todas[lugar - 1]?.id ?? null,
				siguiente_id: todas[lugar + 1]?.id ?? null,
			},
			nomina:
				semana.nomina_id === null || semana.estado === null || semana.version === null || semana.fecha_pago === null
					? null
					: {
							nomina_id: semana.nomina_id,
							version: semana.version,
							estado: semana.estado,
							fecha_pago: textoDeDia(semana.fecha_pago),
							pagada: semana.pagada === null ? null : `Pagada el ${textoDeDia(semana.pagada)}`,
						},
			total_nomina_centavos: cuenta.total,
			grafica: todas.slice(Math.max(0, lugar + 1 - cuantas), lugar + 1).map((una) => ({
				semana: textoDeDiaCorto(una.inicio),
				actual: una.id === semana.id,
				total_tiempo_nomina_centavos: una.id === semana.id ? cuenta.tiempo : (una.total_tiempo ?? 0),
				total_piezas_nomina_centavos: una.id === semana.id ? cuenta.piezas : (una.total_piezas ?? 0),
			})),
			opciones: lineaDeOpciones(cuenta.reglas),
			grupos: await agrupar(contexto, cuenta.renglones),
			personas: await personasParaDescuento(contexto),
		},
	};
});
