/**
 * Los parámetros del negocio: cómo los declara cada módulo, cómo se siembran y cómo se leen.
 * Fase 4 · docs/modulos/admin/configuracion.md («Reglas», «La tabla `parametros`» y «Lecturas»)
 *
 * Cada módulo declara los suyos en su `parametros.ts` con `semillaDeParametros`: la siembra crea los que
 * faltan, con su primer renglón de historial, y nunca cambia uno que ya existe. El valor se guarda en la
 * columna de su tipo y, en el historial, como texto canónico; `leerParametro` lo regresa ya con su tipo, el
 * de hoy o, con `en`, el que valía en ese momento.
 */

import type { App } from "@uniformame/compartido/contratos/versiones";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { parametros, parametrosHistorial, type tiposDeDispositivo } from "../modulos/admin/tablas.ts";
import type { Base } from "./base/conexion.ts";
import type { Semilla } from "./base/siembra.ts";
import type { Transaccion } from "./base/transacciones.ts";

/** El tipo del valor de un parámetro. */
export type TipoDeParametro = "entero" | "centavos" | "porcentaje" | "opcion" | "booleano" | "texto" | "hora";

/** El valor de un parámetro, ya con su tipo; `null` si está vacío. */
export type ValorDeParametro = number | string | boolean | null;

/** Un parámetro, como lo declara el `parametros.ts` de su módulo. */
export interface DefinicionDeParametro {
	/** Con el prefijo del módulo que lo lee: `produccion.lote_atorado_dias`. */
	clave: string;
	seccion: "decision_operacion" | "parametro" | "tecnico";
	nombre: string;
	explicacion?: string;
	tipo: TipoDeParametro;
	unidad?: string;
	inicial: ValorDeParametro;
	minimo?: number;
	maximo?: number;
	permiteVacio?: boolean;
	/** Los valores de una `opcion`. */
	opciones?: readonly string[];
	/** Los tipos de aparato que lo reciben al sincronizar, por su tipo de registro (`tablet_taller`). */
	bajaA?: readonly (typeof tiposDeDispositivo)[number][];
	/** Sale «Por decidir» hasta que la dueña lo cambia. */
	porDecidir?: boolean;
	orden: number;
}

/** Lo que se guarda de un parámetro: sus columnas de valor. */
interface ColumnasDeValor {
	valorEntero: number | null;
	valorPorcentaje: string | null;
	valorTexto: string | null;
	valorBooleano: boolean | null;
}

/**
 * Las columnas de valor de un parámetro según su tipo: la suya llena y las demás en nulo.
 * @param tipo El tipo del parámetro.
 * @param valor El valor, ya revisado.
 */
export function columnasDelValor(tipo: TipoDeParametro, valor: ValorDeParametro): ColumnasDeValor {
	const vacias: ColumnasDeValor = { valorEntero: null, valorPorcentaje: null, valorTexto: null, valorBooleano: null };
	if (valor === null) return vacias;
	if (tipo === "entero" || tipo === "centavos") return { ...vacias, valorEntero: Number(valor) };
	if (tipo === "porcentaje") return { ...vacias, valorPorcentaje: String(valor) };
	if (tipo === "booleano") return { ...vacias, valorBooleano: valor === true };
	return { ...vacias, valorTexto: String(valor) };
}

/**
 * El valor en texto canónico, como va al historial: `90`, `12.5`, `true`, `02:00`; vacío es `""`.
 * @param valor El valor.
 */
export function textoCanonico(valor: ValorDeParametro): string {
	return valor === null ? "" : String(valor);
}

/**
 * Lee un valor guardado en texto canónico con su tipo.
 * @param tipo El tipo del parámetro.
 * @param texto El texto del historial.
 */
export function valorDelTexto(tipo: TipoDeParametro, texto: string): ValorDeParametro {
	if (texto === "") return null;
	if (tipo === "entero" || tipo === "centavos" || tipo === "porcentaje") return Number(texto);
	if (tipo === "booleano") return texto === "true";
	return texto;
}

/**
 * El valor de un renglón de `parametros`, con su tipo: el de la única columna de valor que va llena.
 * @param renglon Sus columnas de valor.
 */
export function valorDelRenglon(renglon: ColumnasDeValor): ValorDeParametro {
	if (renglon.valorEntero !== null) return renglon.valorEntero;
	if (renglon.valorPorcentaje !== null) return Number(renglon.valorPorcentaje);
	if (renglon.valorBooleano !== null) return renglon.valorBooleano;
	return renglon.valorTexto;
}

/**
 * La siembra de los parámetros de un módulo: crea los que faltan con su primer renglón de historial (sin
 * valor anterior ni quién), y deja como está uno que ya existe.
 * @param modulo El módulo que los lee.
 * @param definiciones Los de su `parametros.ts`.
 */
export function semillaDeParametros(modulo: string, definiciones: readonly DefinicionDeParametro[]): Semilla {
	return {
		sembrar: async (base) => {
			if (definiciones.length === 0) return 0;
			const nuevos = await base
				.insert(parametros)
				.values(
					definiciones.map((definicion) => ({
						id: uuidv7(),
						clave: definicion.clave,
						seccion: definicion.seccion,
						nombre: definicion.nombre,
						explicacion: definicion.explicacion ?? null,
						tipoValor: definicion.tipo,
						unidad: definicion.unidad ?? null,
						...columnasDelValor(definicion.tipo, definicion.inicial),
						opciones: definicion.opciones === undefined ? null : [...definicion.opciones],
						minimo: definicion.minimo ?? null,
						maximo: definicion.maximo ?? null,
						permiteVacio: definicion.permiteVacio ?? false,
						estadoDecision: definicion.porDecidir === true ? "por_decidir" : "decidido",
						moduloLector: modulo,
						bajaA: [...(definicion.bajaA ?? [])],
						orden: definicion.orden,
					})),
				)
				.onConflictDoNothing()
				.returning({ id: parametros.id, clave: parametros.clave });
			const porClave = new Map(definiciones.map((definicion) => [definicion.clave, definicion.inicial]));
			if (nuevos.length > 0) {
				await base.insert(parametrosHistorial).values(
					nuevos.map((nuevo) => ({
						id: uuidv7(),
						parametroId: nuevo.id,
						valorNuevo: textoCanonico(porClave.get(nuevo.clave) ?? null),
					})),
				);
			}
			return nuevos.length;
		},
	};
}

/** Cómo se pide un parámetro. */
export interface ParametroPedido {
	clave: string;
	/** Para un valor por ubicación; sin ella, el de todo el sistema. */
	ubicacionId?: string | undefined;
	/** Un momento (ISO): el valor que valía entonces, del historial. */
	en?: string | undefined;
}

/**
 * Lee un parámetro: el valor vigente o, con `en`, el que valía en ese momento.
 * @param ejecutor La base o la transacción con que se lee.
 * @param pedido La clave, la ubicación y el momento.
 * @returns El valor con su tipo.
 * @throws Error si no existe: un parámetro lo siembra su módulo, así que es un error del programa.
 */
export async function leerParametro(ejecutor: Base | Transaccion, pedido: ParametroPedido): Promise<ValorDeParametro> {
	const [parametro] = await ejecutor
		.select({
			id: parametros.id,
			tipoValor: parametros.tipoValor,
			valorEntero: parametros.valorEntero,
			valorPorcentaje: parametros.valorPorcentaje,
			valorTexto: parametros.valorTexto,
			valorBooleano: parametros.valorBooleano,
		})
		.from(parametros)
		.where(
			and(
				eq(parametros.clave, pedido.clave),
				pedido.ubicacionId === undefined
					? isNull(parametros.ubicacionId)
					: eq(parametros.ubicacionId, pedido.ubicacionId),
			),
		);
	if (parametro === undefined) throw new Error(`no existe el parámetro ${pedido.clave}`);
	const tipo = tipoDeParametro(parametro.tipoValor);
	if (pedido.en === undefined) return valorDelRenglon(parametro);
	const [entonces] = await ejecutor
		.select({ valorNuevo: parametrosHistorial.valorNuevo })
		.from(parametrosHistorial)
		.where(
			and(
				eq(parametrosHistorial.parametroId, parametro.id),
				lte(parametrosHistorial.creadoEn, sql`${pedido.en}::timestamptz`),
			),
		)
		.orderBy(desc(parametrosHistorial.creadoEn))
		.limit(1);
	// Antes de su primer valor, vale el primero que tuvo.
	if (entonces === undefined) {
		const [primero] = await ejecutor
			.select({ valorNuevo: parametrosHistorial.valorNuevo })
			.from(parametrosHistorial)
			.where(eq(parametrosHistorial.parametroId, parametro.id))
			.orderBy(parametrosHistorial.creadoEn)
			.limit(1);
		return primero === undefined ? valorDelRenglon(parametro) : valorDelTexto(tipo, primero.valorNuevo);
	}
	return valorDelTexto(tipo, entonces.valorNuevo);
}

/** Los tipos que acepta la tabla. */
const tiposDeParametro: readonly TipoDeParametro[] = [
	"entero",
	"centavos",
	"porcentaje",
	"opcion",
	"booleano",
	"texto",
	"hora",
];

/**
 * El tipo de un parámetro leído de la base.
 * @param texto La columna `tipo_valor`.
 */
export function tipoDeParametro(texto: string): TipoDeParametro {
	const tipo = tiposDeParametro.find((posible) => posible === texto);
	if (tipo === undefined) throw new Error(`tipo de parámetro desconocido: ${texto}`);
	return tipo;
}

/**
 * La versión mínima que pide el parámetro de cada app (`admin.version_minima_web` y los demás): el paso 2
 * de cada llamada la junta con la del código.
 * @param base La base.
 */
export function versionMinimaDeLosParametros(base: Base): (app: App) => Promise<string> {
	return async (app) => String(await leerParametro(base, { clave: `admin.version_minima_${app}` }));
}
