/**
 * La proyección de un material: la serie de cada día, el día en que se acaba, la fecha límite para pedir, el estado,
 * para cuándo y cuánto pedir, y hasta cuándo alcanza otra cantidad. Es la única del sistema: la corre la pantalla
 * mientras se escribe la cantidad y `compras.cuenta_material`, con los mismos insumos.
 * Fase 10 · docs/modulos/compras/proyeccion-de-material.md (reglas 6 a 16 y «El consumo»)
 *
 * Pura: lo libre, las llegadas, el consumo y los parámetros llegan ya leídos. Las cantidades van en milésimos con
 * enteros grandes, y los factores de cada mes en milésimos del factor (`900n` es 0.9): nunca pasa por un número con
 * decimales.
 */

import { Temporal } from "temporal-polyfill";
import { textoDeDia } from "./fechas.ts";

/** Lo que llega de una orden, en su llegada esperada. */
export interface Llegada {
	/** El día, ISO («2026-10-25»). */
	dia: string;
	/** En milésimos de su unidad. */
	cantidad: bigint;
}

/** Los límites que vienen de los parámetros de Compras. */
export interface LimitesDeProyeccion {
	/** `compras.dias_maximos_proyeccion`: hasta dónde se busca el día en que se acaba. */
	diasMaximos: number;
	/** `compras.dias_pedir_esta_semana`. */
	diasPedirEstaSemana: number;
	/** `compras.dias_etiqueta_mas_de_6_meses`. */
	diasMasDeSeisMeses: number;
}

/** Lo que recibe la proyección. */
export interface InsumosDeProyeccion {
	/** Hoy, en hora de México. */
	hoy: Temporal.PlainDate | string;
	/** Lo libre para comprar, en milésimos: hay en bodega más hay en aduana menos lo comprometido. */
	libre: bigint;
	/** Lo que viene en camino, por día. */
	llegadas: readonly Llegada[];
	/** El consumo de un mes normal por día, en milésimos; `null` si no tiene. */
	consumoNormal: bigint | null;
	/** Los doce factores, de enero a diciembre, en milésimos del factor. */
	factores: readonly bigint[];
	/** El plazo del proveedor habitual, en días. */
	plazo: number;
	/** El mínimo del material, en milésimos. */
	minimo: bigint;
	/** Lo que se compra junto, en milésimos. */
	multiplo: bigint;
	/** Los días que cubre cada pedido. */
	diasCubre: number;
	limites: LimitesDeProyeccion;
	/** Otra cantidad que se quiere probar, en milésimos, llegando el día «para cuándo». */
	otraCantidad?: bigint;
}

/** El estado del material en Por pedir. */
export type EstadoDeMaterial = "sin_tiempo_de_entrega" | "pedir_esta_semana" | "alcanza";

/** Lo que regresa la proyección. */
export interface Proyeccion {
	/** Lo que queda al final de cada día, desde hoy, en milésimos. */
	serie: bigint[];
	/** El consumo por día de cada mes, de enero a diciembre, en milésimos. */
	consumoPorMes: bigint[];
	/** El primer día en que la serie baja de cero; `null` si no baja en los días máximos (cuenta como sin consumo). */
	seAcaba: string | null;
	/** Hoy más el plazo: cuándo llegaría un pedido de hoy. */
	llegariaHoy: string;
	/** El día en que se acaba menos el plazo. */
	fechaLimite: string | null;
	/** Los días que faltará material: lo que llegaría hoy menos el día en que se acaba, si es mayor que cero. */
	diasSinMaterial: number;
	estado: EstadoDeMaterial;
	/** «Faltará material 4 días», «Pedir hoy», «Pedir antes del 3 de noviembre»… */
	linea: string;
	/** El día para el que se calcula el pedido sugerido. */
	paraCuando: string;
	/** El pedido sugerido, en milésimos, múltiplo de compra. */
	porPedir: bigint;
	/** Con otra cantidad: el primer día, desde su llegada, en que vuelve a bajar de cero; `null` si alcanza más de un año. */
	alcanzaHasta?: string | null;
}

/** Los días que se miran después de la llegada de otra cantidad. */
const diasDeOtraCantidad = 365;

/**
 * El consumo por día de cada mes: el de un mes normal por el factor del mes, al milésimo más cercano.
 * @param consumoNormal En milésimos; `null` es cero.
 * @param factores Los doce factores en milésimos.
 */
export function consumoPorMes(consumoNormal: bigint | null, factores: readonly bigint[]): bigint[] {
	if (factores.length !== 12) throw new RangeError("Faltan factores: son doce, uno por mes");
	return factores.map((factor) => ((consumoNormal ?? 0n) * factor + 500n) / 1000n);
}

/**
 * La serie desde hoy: cada día, si llega algo y lo que había es negativo, la llegada suma desde cero (lo que faltó
 * no se recupera); después se resta el consumo del día.
 * @param hoy Hoy.
 * @param libre Lo libre para comprar.
 * @param llegadas Lo que llega, por día.
 * @param consumos El consumo por día de cada mes.
 * @param dias Cuántos días.
 */
function serieDesde(
	hoy: Temporal.PlainDate,
	libre: bigint,
	llegadas: ReadonlyMap<string, bigint>,
	consumos: readonly bigint[],
	dias: number,
): bigint[] {
	const serie: bigint[] = [];
	let queda = libre;
	for (let numero = 0; numero < dias; numero++) {
		const dia = hoy.add({ days: numero });
		const llega = llegadas.get(dia.toString()) ?? 0n;
		if (llega > 0n) queda = (queda < 0n ? 0n : queda) + llega;
		queda -= consumos[dia.month - 1] ?? 0n;
		serie.push(queda);
	}
	return serie;
}

/**
 * Junta las llegadas de un mismo día.
 * @param llegadas Lo que llega.
 * @param extra Otra llegada, si hay.
 */
function llegadasPorDia(llegadas: readonly Llegada[], extra?: Llegada): Map<string, bigint> {
	const porDia = new Map<string, bigint>();
	for (const llegada of extra === undefined ? llegadas : [...llegadas, extra]) {
		const dia = Temporal.PlainDate.from(llegada.dia).toString();
		porDia.set(dia, (porDia.get(dia) ?? 0n) + llegada.cantidad);
	}
	return porDia;
}

/**
 * Lo que se consume en unos días seguidos.
 * @param desde El primer día, incluido.
 * @param dias Cuántos.
 * @param consumos El consumo por día de cada mes.
 */
function consumoDeDias(desde: Temporal.PlainDate, dias: number, consumos: readonly bigint[]): bigint {
	let total = 0n;
	for (let numero = 0; numero < dias; numero++) total += consumos[desde.add({ days: numero }).month - 1] ?? 0n;
	return total;
}

/**
 * El estado y su línea.
 * @param hoy Hoy.
 * @param fechaLimite La fecha límite para pedir, o `null` sin consumo.
 * @param diasSinMaterial Los días que faltará material.
 * @param limites Los límites de los parámetros.
 */
function estadoYLinea(
	hoy: Temporal.PlainDate,
	fechaLimite: Temporal.PlainDate | null,
	diasSinMaterial: number,
	limites: LimitesDeProyeccion,
): { estado: EstadoDeMaterial; linea: string } {
	if (diasSinMaterial > 0) {
		return {
			estado: "sin_tiempo_de_entrega",
			linea: `Faltará material ${diasSinMaterial} ${diasSinMaterial === 1 ? "día" : "días"}`,
		};
	}
	if (fechaLimite === null) return { estado: "alcanza", linea: "Sin consumo todavía" };
	const faltan = hoy.until(fechaLimite).days;
	const linea =
		faltan === 0
			? "Pedir hoy"
			: faltan > limites.diasMasDeSeisMeses
				? "Pedir en más de 6 meses"
				: `Pedir antes del ${textoDeDia(fechaLimite)}`;
	return { estado: faltan <= limites.diasPedirEstaSemana ? "pedir_esta_semana" : "alcanza", linea };
}

/**
 * La proyección de un material (los pasos 7 a 14 de su archivo).
 * @param insumos Lo libre, las llegadas, el consumo, el plazo, el mínimo, el múltiplo, los días que cubre, los límites
 * y, si hay, otra cantidad.
 * @returns La serie y todo lo que sale de ella.
 */
export function proyectarMaterial(insumos: InsumosDeProyeccion): Proyeccion {
	const hoy = Temporal.PlainDate.from(insumos.hoy);
	const consumos = consumoPorMes(insumos.consumoNormal, insumos.factores);
	const llegadas = llegadasPorDia(insumos.llegadas);
	const serie = serieDesde(hoy, insumos.libre, llegadas, consumos, insumos.limites.diasMaximos);
	// El día en que se acaba: hoy si lo libre ya es negativo; si no, el primero en que la serie baja de cero.
	const indice = insumos.libre < 0n ? 0 : serie.findIndex((queda) => queda < 0n);
	const seAcaba = indice < 0 ? null : hoy.add({ days: indice });
	const llegariaHoy = hoy.add({ days: insumos.plazo });
	const fechaLimite = seAcaba === null ? null : seAcaba.subtract({ days: insumos.plazo });
	const diasSinMaterial = seAcaba === null ? 0 : Math.max(0, seAcaba.until(llegariaHoy).days);
	// Para cuándo: el día en que se acaba si todavía da tiempo; si no, o sin consumo, lo que llegaría hoy.
	const paraCuando = seAcaba !== null && Temporal.PlainDate.compare(llegariaHoy, seAcaba) <= 0 ? seAcaba : llegariaHoy;
	const necesita = consumoDeDias(paraCuando, insumos.diasCubre, consumos) + insumos.minimo;
	const porPedir = ((necesita + insumos.multiplo - 1n) / insumos.multiplo) * insumos.multiplo;
	const proyeccion: Proyeccion = {
		serie,
		consumoPorMes: consumos,
		seAcaba: seAcaba?.toString() ?? null,
		llegariaHoy: llegariaHoy.toString(),
		fechaLimite: fechaLimite?.toString() ?? null,
		diasSinMaterial,
		...estadoYLinea(hoy, fechaLimite, diasSinMaterial, insumos.limites),
		paraCuando: paraCuando.toString(),
		porPedir,
	};
	if (insumos.otraCantidad === undefined) return proyeccion;
	return { ...proyeccion, alcanzaHasta: alcanzaHasta(insumos, hoy, consumos, paraCuando) };
}

/**
 * Con otra cantidad llegando «para cuándo», el primer día desde esa llegada en que la serie vuelve a bajar de cero.
 * @returns El día, o `null` si no baja en los 365 días siguientes.
 */
function alcanzaHasta(
	insumos: InsumosDeProyeccion,
	hoy: Temporal.PlainDate,
	consumos: readonly bigint[],
	paraCuando: Temporal.PlainDate,
): string | null {
	const llega = hoy.until(paraCuando).days;
	const llegadas = llegadasPorDia(insumos.llegadas, {
		dia: paraCuando.toString(),
		cantidad: insumos.otraCantidad ?? 0n,
	});
	const serie = serieDesde(hoy, insumos.libre, llegadas, consumos, llega + diasDeOtraCantidad + 1);
	const indice = serie.findIndex((queda, numero) => numero >= llega && queda < 0n);
	return indice < 0 ? null : hoy.add({ days: indice }).toString();
}

/** Lo que sale de un material en un día, en milésimos. */
export interface SalidaDelDia {
	dia: string;
	cantidad: bigint;
}

/**
 * El consumo de un mes normal: medido, si el material tiene salidas desde hace al menos `dias` días; si no, el
 * inicial que escribió Compras.
 *
 * Medido: de los últimos `dias` días, sin contar hoy, cada día se divide entre el factor de su mes, y el total entre
 * los días, al milésimo más cercano.
 * @param datos Hoy, el consumo inicial, la primera salida del material, sus salidas por día, los factores y los días.
 * @returns El consumo por día de un mes normal y si es medido.
 */
export function consumoNormal(datos: {
	hoy: Temporal.PlainDate | string;
	inicial: bigint | null;
	primeraSalida: string | null;
	salidas: readonly SalidaDelDia[];
	factores: readonly bigint[];
	dias: number;
}): { consumo: bigint | null; medido: boolean } {
	const hoy = Temporal.PlainDate.from(datos.hoy);
	const desde = hoy.subtract({ days: datos.dias });
	const sinMedir =
		datos.primeraSalida === null || Temporal.PlainDate.compare(Temporal.PlainDate.from(datos.primeraSalida), desde) > 0;
	if (sinMedir) return { consumo: datos.inicial, medido: false };
	// Cada salida entre el factor de su mes, en una escala de un millón para no perder decimales antes de redondear.
	const escala = 1_000_000n;
	let total = 0n;
	for (const salida of datos.salidas) {
		const dia = Temporal.PlainDate.from(salida.dia);
		if (Temporal.PlainDate.compare(dia, desde) < 0 || Temporal.PlainDate.compare(dia, hoy) >= 0) continue;
		const factor = datos.factores[dia.month - 1];
		if (factor === undefined || factor <= 0n) throw new RangeError("Un factor de mes es mayor que cero");
		total += (salida.cantidad * 1000n * escala) / factor;
	}
	const divisor = BigInt(datos.dias) * escala;
	return { consumo: (total + divisor / 2n) / divisor, medido: true };
}
