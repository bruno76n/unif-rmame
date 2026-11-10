/**
 * La forma de un contrato de acción y de consulta.
 * Fase 3 · .claude/rules/contratos.md y docs/cimientos/API.md («Los contratos»)
 *
 * Un contrato dice el nombre exacto, la entrada y la salida en Zod (estrictas, con su descripción en
 * español), quién puede llamarla y qué errores de regla puede dar. De él salen la validación de la API,
 * la de los formularios, el cliente con tipos y la documentación OpenAPI.
 */

import { z } from "zod";

/** Un esquema de objeto de Zod, estricto o no: la forma de una entrada o de un resultado. */
export type EsquemaDeObjeto = z.ZodObject<z.core.$ZodShape, z.core.$ZodObjectConfig>;

/** Quién puede llamar una acción o consulta (ver docs/cimientos/ACCESO-Y-PERMISOS.md). */
export interface Permiso {
	/** El departamento que pide; la dueña los tiene todos. */
	departamento?: string;
	/** El permiso fino que pide (`ven_sueldos_y_tarifas`); la dueña los tiene todos. */
	permisoFino?: string;
	/** Solo la dueña, no el departamento. */
	soloDuena?: true;
	/** Pide «Confirmar con Google» reciente, con su propósito. */
	confirmarConGoogle?: string;
	/** Los aparatos en cuyo alcance está. Sin esto, ningún aparato la llama. */
	aparatos?: readonly ("tablet" | "puente" | "caja")[];
}

/** Un error de regla que puede dar una acción: su código estable y su mensaje. */
export interface ErrorDeRegla {
	codigo: string;
	mensaje: string;
}

/** El contrato de una acción: algo que cambia. */
export interface ContratoDeAccion<
	Nombre extends string = string,
	Entrada extends EsquemaDeObjeto = EsquemaDeObjeto,
	Resultado extends EsquemaDeObjeto = EsquemaDeObjeto,
> {
	tipo: "accion";
	nombre: Nombre;
	descripcion: string;
	entrada: Entrada;
	/** Lo que regresa la acción, con su `mensaje` (el aviso verde) y, si edita, su `version` nueva. */
	resultado: Resultado;
	permiso: Permiso;
	errores: readonly ErrorDeRegla[];
	/** Si edita algo que ya existe: entonces el cuerpo trae la `version` que se leyó. */
	edita: boolean;
	/** Los campos del resultado que son secretos: se entregan una vez y nunca se guardan. */
	secretos: readonly string[];
}

/** El contrato de una consulta: algo que solo lee. */
export interface ContratoDeConsulta<
	Nombre extends string = string,
	Entrada extends EsquemaDeObjeto = EsquemaDeObjeto,
	Resultado extends EsquemaDeObjeto = EsquemaDeObjeto,
> {
	tipo: "consulta";
	nombre: Nombre;
	descripcion: string;
	/** Los parámetros de la dirección (`?…`). */
	entrada: Entrada;
	resultado: Resultado;
	permiso: Permiso;
	errores: readonly ErrorDeRegla[];
	/** Los campos que se le pueden recortar a una cuenta. */
	recortables: readonly string[];
}

/** Un nombre de acción o de consulta: `modulo.nombre`, en snake_case. */
type NombreDeContrato = `${string}.${string}`;

/**
 * Define el contrato de una acción.
 * @param contrato Su nombre, descripción, entrada, salida, permiso y errores; `edita` y `secretos` son opcionales.
 * @returns El contrato, con el resultado que siempre lleva `mensaje` y, si edita, `version`.
 */
export function definirAccion<
	const Nombre extends NombreDeContrato,
	FormaDeEntrada extends z.ZodRawShape,
	FormaDeSalida extends z.ZodRawShape,
>(contrato: {
	nombre: Nombre;
	descripcion: string;
	entrada: z.ZodObject<FormaDeEntrada>;
	salida: z.ZodObject<FormaDeSalida>;
	permiso: Permiso;
	errores?: readonly ErrorDeRegla[];
	edita?: boolean;
	secretos?: readonly string[];
}) {
	// Un secreto se entrega una vez: en la respuesta repetida ya no viene, así que su campo es opcional.
	for (const secreto of contrato.secretos ?? []) {
		const campo = contrato.salida.shape[secreto];
		if (campo === undefined || !z.safeParse(campo, undefined).success) {
			throw new Error(`${contrato.nombre}: el secreto ${secreto} tiene que ser un campo opcional de la salida`);
		}
	}
	// Un secreto se entrega una vez: en la respuesta repetida ya no viene, así que su campo es opcional.
	for (const secreto of contrato.secretos ?? []) {
		const campo = contrato.salida.shape[secreto];
		if (campo === undefined || !z.safeParse(campo, undefined).success) {
			throw new Error(`${contrato.nombre}: el secreto ${secreto} tiene que ser un campo opcional de la salida`);
		}
	}
	const resultado = z
		.object(contrato.salida.shape)
		.extend({
			mensaje: z.string().describe("El aviso verde que muestra la pantalla"),
			version: z.number().int().optional().describe("La versión nueva de lo que cambió, si la acción editó algo"),
		})
		.strict();
	return {
		tipo: "accion",
		nombre: contrato.nombre,
		descripcion: contrato.descripcion,
		entrada: z.object(contrato.entrada.shape).strict(),
		resultado,
		permiso: contrato.permiso,
		errores: contrato.errores ?? [],
		edita: contrato.edita ?? false,
		secretos: contrato.secretos ?? [],
	} satisfies ContratoDeAccion<Nombre, EsquemaDeObjeto, typeof resultado>;
}

/**
 * Define el contrato de una consulta.
 * @param contrato Su nombre, descripción, parámetros, salida, permiso, errores y lo que se puede recortar.
 * @returns El contrato.
 */
export function definirConsulta<
	const Nombre extends NombreDeContrato,
	FormaDeEntrada extends z.ZodRawShape,
	FormaDeSalida extends z.ZodRawShape,
>(contrato: {
	nombre: Nombre;
	descripcion: string;
	entrada: z.ZodObject<FormaDeEntrada>;
	salida: z.ZodObject<FormaDeSalida>;
	permiso: Permiso;
	errores?: readonly ErrorDeRegla[];
	recortables?: readonly string[];
}) {
	return {
		tipo: "consulta",
		nombre: contrato.nombre,
		descripcion: contrato.descripcion,
		entrada: z.object(contrato.entrada.shape).strict(),
		resultado: z.object(contrato.salida.shape).strict(),
		permiso: contrato.permiso,
		errores: contrato.errores ?? [],
		recortables: contrato.recortables ?? [],
	} satisfies ContratoDeConsulta<Nombre>;
}

/**
 * Los parámetros de una consulta que pagina: `cursor` (opaco) y `limite`.
 * @param limiteMaximo El tope de renglones por página.
 */
export function parametrosDePagina(limiteMaximo: number) {
	return {
		cursor: z.string().optional().describe("El cursor que regresó la página anterior; opaco"),
		limite: z.coerce
			.number()
			.int()
			.min(1)
			.max(limiteMaximo)
			.optional()
			.describe(`Cuántos renglones, hasta ${limiteMaximo}`),
	};
}

/**
 * La salida de una consulta que pagina.
 * @param renglon La forma de cada renglón.
 */
export function paginaDe<Renglon extends z.ZodType>(renglon: Renglon) {
	return {
		renglones: z.array(renglon).describe("Los renglones de esta página"),
		cursor: z.string().nullable().describe("El cursor para pedir la página siguiente; nulo si no hay más"),
		hay_mas: z.boolean().describe("Si hay más renglones después de esta página"),
	};
}
