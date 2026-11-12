/**
 * La cuenta de la nómina: con lo que dicen las tablas y las lecturas, cada renglón con sus días, sus piezas, sus
 * correcciones, lo que se descuenta, lo que no alcanzó y su total, y los totales de la nómina.
 * Fase 17 · docs/modulos/contaduria/nomina.md (reglas 3 a 8, «La cuenta de la nómina»)
 *
 * Es una función pura: la usan `contaduria.pagar_nomina` y la consulta de Nómina (fase 19), así lo que ve la pantalla
 * es lo que se paga.
 */

/** La forma de pago de una persona. */
export type FormaDePago = "tiempo" | "pieza" | "mixta";

/** La ficha de una persona como la usa la nómina. */
export interface FichaParaNomina {
	personaId: string;
	nombre: string;
	area: string;
	ubicacionId: string | null;
	puesto: string;
	formaPago: FormaDePago;
	pagoDiaCentavos: number | null;
	bajaEn: string | null;
}

/** Un registro de la tablet que todavía no entra a ninguna nómina: vigente, con tarifa y de la semana o de antes. */
export interface RegistroParaPagar {
	registroId: string;
	personaId: string;
	fecha: string;
	flujoOperacionId: string;
	piezasBuenas: number;
	piezasDanadas: number;
	tarifaCentavos: number;
}

/** Un registro que se pagó y después se canceló: entra con lo que se le pagó, en negativo. */
export interface RegistroACorregir extends RegistroParaPagar {
	piezasPagadas: number;
	importePagadoCentavos: number;
}

/** El descuento semanal vigente de una persona. */
export interface DescuentoVigente {
	id: string;
	montoCentavos: number;
	motivo: string;
}

/** Las dos opciones de la nómina (sus parámetros). */
export interface ReglasDeNomina {
	pagarDanadas: boolean;
	descuentoMayor: "perdonar" | "siguiente_semana";
}

/** Lo que necesita la cuenta. */
export interface EntradaDeNomina {
	/** Quien lleva asistencia en la semana (por tiempo o mixta, activo en ella), con sus días contados. */
	conAsistencia: ReadonlyMap<string, number>;
	fichas: ReadonlyMap<string, FichaParaNomina>;
	registros: readonly RegistroParaPagar[];
	correcciones: readonly RegistroACorregir[];
	/** Lo que pasó de la nómina anterior, por persona. */
	arrastres: ReadonlyMap<string, number>;
	descuentos: ReadonlyMap<string, DescuentoVigente>;
	reglas: ReglasDeNomina;
}

/** Un registro dentro de un renglón: un `pago` o una `correccion`. */
export interface PiezaDeNomina {
	registroId: string;
	tipo: "pago" | "correccion";
	fecha: string;
	flujoOperacionId: string;
	piezasBuenas: number;
	piezasDanadas: number;
	piezasPagadas: number;
	tarifaCentavos: number;
	importeCentavos: number;
	sePaga: boolean;
	motivoNoPago: "cobra_por_tiempo" | null;
}

/** El renglón de una persona. */
export interface RenglonDeNomina {
	ficha: FichaParaNomina;
	dias: number;
	importeTiempoCentavos: number;
	piezas: number;
	importePiezasCentavos: number;
	correccionesCentavos: number;
	brutoCentavos: number;
	descuento: DescuentoVigente | null;
	descuentoCentavos: number;
	arrastreCentavos: number;
	descontadoCentavos: number;
	noAlcanzoCentavos: number;
	destinoNoAlcanzo: "perdonado" | "siguiente_semana" | null;
	totalCentavos: number;
	detalle: PiezaDeNomina[];
}

/** Lo que regresa la cuenta. */
export interface CuentaDeNomina {
	renglones: RenglonDeNomina[];
	totalTiempoCentavos: number;
	totalPiezasCentavos: number;
	totalCorreccionesCentavos: number;
	totalDescontadoCentavos: number;
	totalCentavos: number;
}

/**
 * Lo de tiempo de una persona (regla 4): sus días por su pago por día, en tiempo y en mixta; 0 en pieza. Medio día con
 * un pago impar da medio centavo: se redondea una vez, al total de la semana, con la mitad hacia arriba (decisión 711).
 * @param ficha Su ficha.
 * @param dias Sus días de la semana, en medios.
 */
export function importeDeTiempo(ficha: Pick<FichaParaNomina, "formaPago" | "pagoDiaCentavos">, dias: number): number {
	if (ficha.formaPago === "pieza" || ficha.pagoDiaCentavos === null) return 0;
	const medios = Math.round(dias * 2);
	return Math.floor((medios * ficha.pagoDiaCentavos + 1) / 2);
}

/**
 * Un registro que entra a pagarse (regla 5): sus buenas, más sus dañadas si así se decidió, por su tarifa congelada.
 * Si la persona cobra por tiempo, entra sin pagarse, para que no vuelva a entrar.
 */
function piezaAPagar(registro: RegistroParaPagar, ficha: FichaParaNomina, reglas: ReglasDeNomina): PiezaDeNomina {
	const sePaga = ficha.formaPago !== "tiempo";
	const piezasPagadas = sePaga ? registro.piezasBuenas + (reglas.pagarDanadas ? registro.piezasDanadas : 0) : 0;
	return {
		registroId: registro.registroId,
		tipo: "pago",
		fecha: registro.fecha,
		flujoOperacionId: registro.flujoOperacionId,
		piezasBuenas: registro.piezasBuenas,
		piezasDanadas: registro.piezasDanadas,
		piezasPagadas,
		tarifaCentavos: registro.tarifaCentavos,
		importeCentavos: piezasPagadas * registro.tarifaCentavos,
		sePaga,
		motivoNoPago: sePaga ? null : "cobra_por_tiempo",
	};
}

/** Un registro pagado y cancelado después (regla 6): lo que se le pagó, en negativo. */
function piezaACorregir(registro: RegistroACorregir): PiezaDeNomina {
	return {
		registroId: registro.registroId,
		tipo: "correccion",
		fecha: registro.fecha,
		flujoOperacionId: registro.flujoOperacionId,
		piezasBuenas: registro.piezasBuenas,
		piezasDanadas: registro.piezasDanadas,
		piezasPagadas: registro.piezasPagadas,
		tarifaCentavos: registro.tarifaCentavos,
		importeCentavos: -registro.importePagadoCentavos,
		sePaga: true,
		motivoNoPago: null,
	};
}

/**
 * Quiénes entran (regla 3): quien lleva asistencia en la semana, y cualquiera con piezas por pagar, con
 * correcciones o con algo que pasó de la nómina anterior.
 */
function quienesEntran(entrada: EntradaDeNomina): string[] {
	return [
		...new Set([
			...entrada.conAsistencia.keys(),
			...entrada.registros.map((registro) => registro.personaId),
			...entrada.correcciones.map((registro) => registro.personaId),
			...[...entrada.arrastres].filter(([, monto]) => monto > 0).map(([personaId]) => personaId),
		]),
	];
}

/**
 * Lo que se descuenta de un bruto (reglas 7 y 8): por descontar es el descuento, lo que pasó de la anterior y lo que
 * el bruto quedó bajo cero; se descuenta hasta el bruto y el total nunca baja de 0. Lo que no alcanzó se perdona o
 * pasa a la siguiente semana.
 * @param bruto El bruto: tiempo + piezas + correcciones, que puede ser negativo.
 * @param descuento El descuento semanal vigente.
 * @param arrastre Lo que pasó de la nómina anterior.
 * @param reglas Las opciones de la nómina.
 */
export function descontar(
	bruto: number,
	descuento: number,
	arrastre: number,
	reglas: Pick<ReglasDeNomina, "descuentoMayor">,
): Pick<RenglonDeNomina, "descontadoCentavos" | "noAlcanzoCentavos" | "destinoNoAlcanzo" | "totalCentavos"> {
	const ganado = Math.max(0, bruto);
	const porDescontar = descuento + arrastre + Math.max(0, -bruto);
	const descontado = Math.min(porDescontar, ganado);
	const noAlcanzo = porDescontar - descontado;
	return {
		descontadoCentavos: descontado,
		noAlcanzoCentavos: noAlcanzo,
		destinoNoAlcanzo: noAlcanzo === 0 ? null : reglas.descuentoMayor === "perdonar" ? "perdonado" : "siguiente_semana",
		totalCentavos: ganado - descontado,
	};
}

/**
 * La cuenta de una nómina (reglas 3 a 8).
 * @param entrada Lo que dicen las tablas y las lecturas.
 * @returns Un renglón por persona, en el orden de su nombre, y los totales.
 * @throws Error del programa si falta la ficha de alguien que entra.
 */
export function contarNomina(entrada: EntradaDeNomina): CuentaDeNomina {
	const renglones = quienesEntran(entrada).map((personaId): RenglonDeNomina => {
		const ficha = entrada.fichas.get(personaId);
		if (ficha === undefined) throw new Error(`falta la ficha de ${personaId} para la nómina`);
		const dias = entrada.conAsistencia.get(personaId) ?? 0;
		const importeTiempoCentavos = importeDeTiempo(ficha, dias);
		const pagos = entrada.registros
			.filter((registro) => registro.personaId === personaId)
			.map((registro) => piezaAPagar(registro, ficha, entrada.reglas));
		const correcciones = entrada.correcciones
			.filter((registro) => registro.personaId === personaId)
			.map(piezaACorregir);
		const importePiezasCentavos = pagos.reduce((suma, pieza) => suma + pieza.importeCentavos, 0);
		const correccionesCentavos = correcciones.reduce((suma, pieza) => suma + pieza.importeCentavos, 0);
		const brutoCentavos = importeTiempoCentavos + importePiezasCentavos + correccionesCentavos;
		const descuento = entrada.descuentos.get(personaId) ?? null;
		const descuentoCentavos = descuento?.montoCentavos ?? 0;
		const arrastreCentavos = entrada.arrastres.get(personaId) ?? 0;
		return {
			ficha,
			dias,
			importeTiempoCentavos,
			piezas: pagos.reduce((suma, pieza) => suma + pieza.piezasPagadas, 0),
			importePiezasCentavos,
			correccionesCentavos,
			brutoCentavos,
			descuento,
			descuentoCentavos,
			arrastreCentavos,
			...descontar(brutoCentavos, descuentoCentavos, arrastreCentavos, entrada.reglas),
			detalle: [...pagos, ...correcciones],
		};
	});
	renglones.sort((uno, otro) =>
		uno.ficha.nombre === otro.ficha.nombre
			? uno.ficha.personaId.localeCompare(otro.ficha.personaId)
			: uno.ficha.nombre.localeCompare(otro.ficha.nombre, "es"),
	);
	const suma = (campo: (renglon: RenglonDeNomina) => number) =>
		renglones.reduce((total, renglon) => total + campo(renglon), 0);
	return {
		renglones,
		totalTiempoCentavos: suma((renglon) => renglon.importeTiempoCentavos),
		totalPiezasCentavos: suma((renglon) => renglon.importePiezasCentavos),
		totalCorreccionesCentavos: suma((renglon) => renglon.correccionesCentavos),
		totalDescontadoCentavos: suma((renglon) => renglon.descontadoCentavos),
		totalCentavos: suma((renglon) => renglon.totalCentavos),
	};
}
