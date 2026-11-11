/**
 * `escribirMovimiento` y `revertirMovimiento`: la única forma de escribir el libro de inventario.
 * Fase 9 · docs/modulos/inventario/libro-de-movimientos.md («Cómo se escribe un movimiento», reglas 4, 5, 7, 8
 * y 9)
 *
 * Corren en la transacción de quien las llama (una interna o una acción de inventario). Revisan cada renglón
 * contra su tipo, toman los candados en el orden fijo, escriben el movimiento con su clave y suman la
 * existencia. Nunca rechazan por falta de existencia: queda negativa. Lo que no cumple es un error del programa:
 * quien llama ya validó lo que llegó. No guardan eventos ni bitácora: los guarda la acción que las llamó.
 */

import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { eq, sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { v5 as uuidv5, v7 as uuidv7 } from "uuid";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { comandosRecibidos } from "../../admin/tablas.ts";
import {
	existencias,
	existenciasMaterial,
	movimientoLineas,
	movimientos,
	type TipoDeMovimiento,
	tiposDeDocumentoDeMovimiento,
	ubicaciones,
} from "../tablas.ts";
import {
	bloquearExistencias,
	bloquearExistenciasMaterial,
	candadoDeVariantes,
	type LugarDeMaterial,
	type LugarDePrenda,
} from "./candados.ts";
import { type Lado, reglasDeTipo, vaPorSuCamino } from "./tipos-de-movimiento.ts";

/** Un renglón: de prenda (variante y piezas) o de material (material, su rollo y la cantidad, con tres decimales). */
export interface RenglonDeMovimiento {
	/** La ubicación de donde sale; `null`: viene de Fuera. */
	origen: string | null;
	/** La ubicación a donde llega; `null`: sale a Fuera. */
	destino: string | null;
	varianteId?: string;
	piezas?: number;
	materialId?: string;
	rolloId?: string | null;
	/** En la unidad de inventario del material, como texto decimal: `"12.500"`. */
	cantidad?: string;
	loteId?: string | null;
	traspasoId?: string | null;
}

/** El documento que pide el movimiento. */
export interface DocumentoDeMovimiento {
	tipo: (typeof tiposDeDocumentoDeMovimiento)[number];
	id: string;
	folio?: string;
}

/** Lo que se pide escribir. */
export interface PedidoDeMovimiento {
	tipo: Exclude<TipoDeMovimiento, "reversion">;
	documento: DocumentoDeMovimiento;
	renglones: readonly RenglonDeMovimiento[];
	/** Cuándo pasó; si no viene, la hora de la acción (la del aparato, en lo que subió un aparato). */
	ocurridoEn?: Temporal.Instant;
	/** Si la acción crea varios movimientos: el número de este, para su clave derivada. */
	numero?: number;
	/** La clave, si quien llama no es una acción con su comando (un trabajo). */
	clave?: string;
	personaId?: string | null;
	dispositivoId?: string | null;
	nota?: string | null;
}

/** Lo que regresa: el movimiento, si nació ahora (o ya estaba con esa clave) y las tablas que tocó. */
export interface MovimientoEscrito {
	movimientoId: string;
	nuevo: boolean;
	tablas: string[];
}

/** Un renglón ya revisado, con el número que lleva en su movimiento. */
interface RenglonRevisado extends RenglonDeMovimiento {
	renglon: number;
}

/** Los lados que son ubicaciones (todos menos Fuera), como los dice `ubicaciones.tipo`. */
const ladosDeUbicacion: readonly Lado[] = ["aduana", "bodega", "tienda", "taller", "transito", "en_camino_aduana"];

/** Los lados donde todo renglón lleva su traspaso. */
const ladosDeCamino: readonly Lado[] = ["transito", "en_camino_aduana"];

/** Un texto decimal positivo con hasta tres decimales. */
const cantidadValida = /^\d{1,9}(\.\d{1,3})?$/;

/**
 * La clave de un movimiento: la del comando de la acción o, si crea varios, una derivada (uuid v5 de la clave
 * de la acción, el tipo y el número).
 * @throws Error si no hay de dónde sacarla.
 */
async function claveDelMovimiento(
	contexto: ContextoDeAccion,
	pedido: { tipo: TipoDeMovimiento; numero?: number | undefined; clave?: string | undefined },
): Promise<string> {
	if (pedido.clave !== undefined) return pedido.clave;
	if (contexto.comandoId === undefined) throw new Error("un movimiento sin comando necesita su clave");
	const [comando] = await contexto.transaccion
		.select({ clave: comandosRecibidos.claveIdempotencia })
		.from(comandosRecibidos)
		.where(eq(comandosRecibidos.id, contexto.comandoId));
	if (comando === undefined) throw new Error(`no está el comando ${contexto.comandoId}`);
	return pedido.numero === undefined ? comando.clave : claveDerivada(comando.clave, pedido.tipo, pedido.numero);
}

/**
 * La clave derivada del movimiento número `numero` de una acción.
 * @param clave La clave de idempotencia de la acción.
 * @param tipo El tipo del movimiento.
 * @param numero Su número dentro de la acción.
 */
export function claveDerivada(clave: string, tipo: TipoDeMovimiento, numero: number): string {
	return uuidv5(`${tipo}:${numero}`, clave);
}

/**
 * El lado de cada ubicación, por id.
 * @param contexto El contexto de la acción.
 */
async function ladosDeUbicaciones(contexto: ContextoDeAccion): Promise<Map<string, Lado>> {
	const todas = await contexto.transaccion.select({ id: ubicaciones.id, tipo: ubicaciones.tipo }).from(ubicaciones);
	const lados = new Map<string, Lado>();
	for (const { id, tipo } of todas) {
		const lado = ladosDeUbicacion.find((conocido) => conocido === tipo);
		if (lado === undefined) throw new Error(`ubicación de tipo desconocido: ${tipo}`);
		lados.set(id, lado);
	}
	return lados;
}

/**
 * Revisa la forma de un renglón: prenda o material, con su cantidad positiva.
 * @throws Error si no la cumple.
 */
function revisarForma(renglon: RenglonDeMovimiento, forma: "prenda" | "material" | "las_dos", numero: number): void {
	const esPrenda = renglon.varianteId !== undefined;
	const esMaterial = renglon.materialId !== undefined;
	if (esPrenda === esMaterial) throw new Error(`renglón ${numero}: o prenda o material`);
	if (esPrenda && (forma === "material" || !Number.isInteger(renglon.piezas) || (renglon.piezas ?? 0) <= 0)) {
		throw new Error(`renglón ${numero}: piezas enteras mayores que cero, en un tipo de prendas`);
	}
	if (esMaterial) {
		const cantidad = renglon.cantidad ?? "";
		if (forma === "prenda" || !cantidadValida.test(cantidad) || Number(cantidad) <= 0) {
			throw new Error(`renglón ${numero}: cantidad decimal mayor que cero, en un tipo de material`);
		}
	}
}

/**
 * Revisa los renglones de un movimiento contra su tipo (regla 7: lo que toca un tramo de camino lleva su
 * traspaso). La reversión no tiene regla de tipo: sus caminos son los del original al revés.
 * @throws Error (un `500`) si un renglón no cumple.
 */
function revisarRenglones(
	tipo: TipoDeMovimiento,
	renglones: readonly RenglonDeMovimiento[],
	lados: ReadonlyMap<string, Lado>,
): RenglonRevisado[] {
	if (renglones.length === 0) throw new Error("un movimiento sin renglones");
	const regla = tipo === "reversion" ? undefined : reglasDeTipo[tipo];
	return renglones.map((renglon, indice) => {
		const numero = indice + 1;
		const lado = (ubicacion: string | null): Lado => {
			if (ubicacion === null) return "fuera";
			const suyo = lados.get(ubicacion);
			if (suyo === undefined) throw new Error(`renglón ${numero}: no existe la ubicación ${ubicacion}`);
			return suyo;
		};
		const origen = lado(renglon.origen);
		const destino = lado(renglon.destino);
		if (renglon.origen === renglon.destino) throw new Error(`renglón ${numero}: el mismo origen y destino`);
		if (regla !== undefined && !vaPorSuCamino(regla, origen, destino)) {
			throw new Error(`renglón ${numero}: ${tipo} no va de ${origen} a ${destino}`);
		}
		revisarForma(renglon, regla?.forma ?? "las_dos", numero);
		const tocaCamino = ladosDeCamino.includes(origen) || ladosDeCamino.includes(destino);
		if (tocaCamino && (renglon.traspasoId ?? null) === null) {
			throw new Error(`renglón ${numero}: lo que toca ${origen === "fuera" ? destino : origen} lleva su traspaso`);
		}
		return { ...renglon, renglon: numero };
	});
}

/** La cabecera de lo que se escribe. */
interface Cabecera {
	tipo: TipoDeMovimiento;
	documento: DocumentoDeMovimiento;
	ocurridoEn: Temporal.Instant;
	clave: string;
	revierte?: string;
	personaId: string | null;
	dispositivoId: string | null;
	nota: string | null;
}

/**
 * Escribe un movimiento ya revisado: candados, encabezado, renglones y la suma de la existencia.
 * @returns El movimiento escrito.
 */
async function escribir(
	contexto: ContextoDeAccion,
	cabecera: Cabecera,
	renglones: readonly RenglonRevisado[],
): Promise<MovimientoEscrito> {
	const { transaccion } = contexto;
	// Paso 2: los candados en el orden fijo. Primero las variantes, luego sus existencias, luego el material.
	const prendas = renglones.filter((renglon) => renglon.varianteId !== undefined);
	const materiales = renglones.filter((renglon) => renglon.materialId !== undefined);
	const lugaresDePrenda: LugarDePrenda[] = prendas.flatMap((renglon) =>
		[renglon.origen, renglon.destino].flatMap((ubicacionId) =>
			ubicacionId === null ? [] : [{ ubicacionId, varianteId: renglon.varianteId ?? "" }],
		),
	);
	const lugaresDeMaterial: LugarDeMaterial[] = materiales.flatMap((renglon) =>
		[renglon.origen, renglon.destino].flatMap((ubicacionId) =>
			ubicacionId === null
				? []
				: [{ ubicacionId, materialId: renglon.materialId ?? "", rolloId: renglon.rolloId ?? null }],
		),
	);
	await candadoDeVariantes(
		transaccion,
		prendas.map((renglon) => renglon.varianteId ?? ""),
	);
	const deExistencias = await bloquearExistencias(transaccion, lugaresDePrenda);
	const deMaterial = await bloquearExistenciasMaterial(transaccion, lugaresDeMaterial);
	// Paso 3: el movimiento y sus renglones.
	const movimientoId = uuidv7();
	const creadoPor = contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null;
	await transaccion.insert(movimientos).values({
		id: movimientoId,
		tipo: cabecera.tipo,
		fecha: diaDeNegocio(cabecera.ocurridoEn).toString(),
		ocurridoEn: cabecera.ocurridoEn.toString(),
		documentoTipo: cabecera.documento.tipo,
		documentoId: cabecera.documento.id,
		documentoFolio: cabecera.documento.folio ?? null,
		revierteMovimientoId: cabecera.revierte ?? null,
		claveIdempotencia: cabecera.clave,
		comandoId: contexto.comandoId ?? null,
		dispositivoId: cabecera.dispositivoId,
		personaId: cabecera.personaId,
		nota: cabecera.nota,
		creadoPor,
	});
	await transaccion.insert(movimientoLineas).values(
		renglones.map((renglon) => ({
			id: uuidv7(),
			movimientoId,
			renglon: renglon.renglon,
			origenUbicacionId: renglon.origen,
			destinoUbicacionId: renglon.destino,
			varianteId: renglon.varianteId ?? null,
			piezas: renglon.piezas ?? null,
			materialId: renglon.materialId ?? null,
			rolloId: renglon.rolloId ?? null,
			cantidad: renglon.cantidad ?? null,
			loteId: renglon.loteId ?? null,
			traspasoId: renglon.traspasoId ?? null,
			creadoPor,
		})),
	);
	// Paso 4: la suma de la proyección, en el mismo orden de los candados. Cada renglón resta en su origen y
	// suma en su destino.
	for (const lugar of deExistencias) {
		const cambio = prendas.reduce(
			(suma, renglon) =>
				renglon.varianteId !== lugar.varianteId
					? suma
					: suma +
						(renglon.destino === lugar.ubicacionId ? (renglon.piezas ?? 0) : 0) -
						(renglon.origen === lugar.ubicacionId ? (renglon.piezas ?? 0) : 0),
			0,
		);
		await transaccion
			.update(existencias)
			.set({ piezas: sql`${existencias.piezas} + ${cambio}`, ultimoMovimientoId: movimientoId })
			.where(
				sql`${existencias.ubicacionId} = ${lugar.ubicacionId} AND ${existencias.varianteId} = ${lugar.varianteId}`,
			);
	}
	for (const lugar of deMaterial) {
		const suyos = materiales.filter(
			(renglon) => renglon.materialId === lugar.materialId && (renglon.rolloId ?? null) === lugar.rolloId,
		);
		const entra = suyos.filter((renglon) => renglon.destino === lugar.ubicacionId).map((renglon) => renglon.cantidad);
		const sale = suyos.filter((renglon) => renglon.origen === lugar.ubicacionId).map((renglon) => renglon.cantidad);
		// La suma de decimales la hace Postgres, en `numeric`: nunca se pierde un milésimo.
		const sumar = (lista: readonly (string | undefined)[]) =>
			sql.join([sql`0`, ...lista.map((cantidad) => sql`${cantidad ?? "0"}::numeric`)], sql` + `);
		await transaccion
			.update(existenciasMaterial)
			.set({
				cantidad: sql`${existenciasMaterial.cantidad} + (${sumar(entra)}) - (${sumar(sale)})`,
				ultimoMovimientoId: movimientoId,
			})
			.where(
				sql`${existenciasMaterial.ubicacionId} = ${lugar.ubicacionId} AND ${existenciasMaterial.materialId} = ${lugar.materialId} AND ${existenciasMaterial.rolloId} IS NOT DISTINCT FROM ${lugar.rolloId}::uuid`,
			);
	}
	return {
		movimientoId,
		nuevo: true,
		tablas: [
			"movimientos",
			"movimiento_lineas",
			...(deExistencias.length > 0 ? ["existencias"] : []),
			...(deMaterial.length > 0 ? ["existencias_material"] : []),
		],
	};
}

/**
 * El movimiento que ya se escribió con esa clave, si hay.
 * @param contexto El contexto de la acción.
 * @param clave La clave del movimiento.
 */
async function yaEscrito(contexto: ContextoDeAccion, clave: string): Promise<string | undefined> {
	const [suyo] = await contexto.transaccion
		.select({ id: movimientos.id })
		.from(movimientos)
		.where(eq(movimientos.claveIdempotencia, clave));
	return suyo?.id;
}

/**
 * Escribe un movimiento en el libro y suma su existencia, en la transacción de quien llama.
 * @param contexto El contexto de la acción que lo pide.
 * @param pedido El tipo, el documento, los renglones y, si hacen falta, la hora, el número y la clave.
 * @returns El movimiento y las tablas que tocó, para el evento de la acción. Si ya había uno con esa clave (la
 * misma acción repetida), regresa ese, sin escribir nada.
 * @throws Error (un `500`) si un renglón no va por un camino de su tipo o no tiene su forma.
 */
export async function escribirMovimiento(
	contexto: ContextoDeAccion,
	pedido: PedidoDeMovimiento,
): Promise<MovimientoEscrito> {
	const clave = await claveDelMovimiento(contexto, pedido);
	const existente = await yaEscrito(contexto, clave);
	if (existente !== undefined) return { movimientoId: existente, nuevo: false, tablas: [] };
	const renglones = revisarRenglones(pedido.tipo, pedido.renglones, await ladosDeUbicaciones(contexto));
	const { quien } = contexto;
	return escribir(
		contexto,
		{
			tipo: pedido.tipo,
			documento: pedido.documento,
			ocurridoEn: pedido.ocurridoEn ?? contexto.ahora,
			clave,
			personaId: pedido.personaId ?? (quien.tipo === "aparato" ? (quien.personaId ?? null) : null),
			dispositivoId: pedido.dispositivoId ?? (quien.tipo === "aparato" ? quien.dispositivoId : null),
			nota: pedido.nota ?? null,
		},
		renglones,
	);
}

/**
 * El tipo de documento de un movimiento guardado (su CHECK solo deja los conocidos).
 * @throws Error si no es uno conocido.
 */
function tipoDeDocumento(tipo: string): DocumentoDeMovimiento["tipo"] {
	const conocido = tiposDeDocumentoDeMovimiento.find((suyo) => suyo === tipo);
	if (conocido === undefined) throw new Error(`documento de tipo desconocido: ${tipo}`);
	return conocido;
}

/** Lo que se pide para revertir. */
export interface PedidoDeReversion {
	movimientoId: string;
	/** El documento que cancela; si no viene, el del original. */
	documento?: DocumentoDeMovimiento;
	numero?: number;
	clave?: string;
	nota?: string | null;
}

/**
 * Revierte un movimiento: otro, de tipo `reversion`, con los renglones del original al revés.
 * @param contexto El contexto de la acción que cancela.
 * @param pedido El movimiento y, si hacen falta, el documento, el número y la clave.
 * @returns La reversión; si ya había una con esa clave, esa.
 * @throws Error (un `500`) si el movimiento no existe, es una reversión o ya se revirtió.
 */
export async function revertirMovimiento(
	contexto: ContextoDeAccion,
	pedido: PedidoDeReversion,
): Promise<MovimientoEscrito> {
	const { transaccion } = contexto;
	const [original] = await transaccion.select().from(movimientos).where(eq(movimientos.id, pedido.movimientoId));
	if (original === undefined) throw new Error(`no existe el movimiento ${pedido.movimientoId}`);
	if (original.tipo === "reversion") throw new Error("una reversión no se revierte");
	const clave = await claveDelMovimiento(contexto, { tipo: "reversion", numero: pedido.numero, clave: pedido.clave });
	const existente = await yaEscrito(contexto, clave);
	if (existente !== undefined) return { movimientoId: existente, nuevo: false, tablas: [] };
	const [revertido] = await transaccion
		.select({ id: movimientos.id })
		.from(movimientos)
		.where(eq(movimientos.revierteMovimientoId, original.id));
	if (revertido !== undefined) throw new Error(`el movimiento ${original.id} ya se revirtió`);
	const lineas = await transaccion
		.select()
		.from(movimientoLineas)
		.where(eq(movimientoLineas.movimientoId, original.id))
		.orderBy(movimientoLineas.renglon);
	const alReves: RenglonDeMovimiento[] = lineas.map((linea) => ({
		origen: linea.destinoUbicacionId,
		destino: linea.origenUbicacionId,
		...(linea.varianteId === null ? {} : { varianteId: linea.varianteId, piezas: linea.piezas ?? 0 }),
		...(linea.materialId === null
			? {}
			: { materialId: linea.materialId, rolloId: linea.rolloId, cantidad: linea.cantidad ?? "0" }),
		loteId: linea.loteId,
		traspasoId: linea.traspasoId,
	}));
	const renglones = revisarRenglones("reversion", alReves, await ladosDeUbicaciones(contexto));
	const { quien } = contexto;
	return escribir(
		contexto,
		{
			tipo: "reversion",
			documento: pedido.documento ?? {
				tipo: tipoDeDocumento(original.documentoTipo),
				id: original.documentoId,
				...(original.documentoFolio === null ? {} : { folio: original.documentoFolio }),
			},
			ocurridoEn: contexto.ahora,
			clave,
			revierte: original.id,
			personaId: quien.tipo === "aparato" ? (quien.personaId ?? null) : null,
			dispositivoId: quien.tipo === "aparato" ? quien.dispositivoId : null,
			nota: pedido.nota ?? null,
		},
		renglones,
	);
}
