/**
 * `admin.escribir_bitacora`: escribe un renglón de la bitácora en la transacción de quien la llama.
 * Fase 4 · docs/modulos/admin/bitacora.md («`admin.escribir_bitacora` · interna»)
 *
 * Quién, el comando, el módulo, el origen y la acción salen del contexto. Falla como error del programa si
 * `antes` o `despues` traen un campo de secreto. Si la descripción trae sueldos o tarifas, o `antes` o
 * `despues` traen uno de los campos de sueldo o de tarifa que declaran los módulos en su `permisos.ts`,
 * guarda también la descripción con «••••» en su lugar y marca `sensible_sueldos`. Una consulta sensible no se vuelve a
 * apuntar si la misma cuenta ya la apuntó sobre el mismo documento en los últimos
 * `admin.minutos_consulta_sensible`. Una alerta guarda `alerta.registrada`.
 */

import { pareceSecreto } from "@uniformame/compartido/contratos/definir";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion, DescripcionConSueldos, QuienEscribe } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { bitacora, departamentos } from "../tablas.ts";

/** Lo que va en lugar de un sueldo o una tarifa en la descripción recortada. */
export const montoTapado = "••••";

/** Lo que recibe: un renglón, con su tipo y, en un acceso, el correo y la IP. */
const renglonAEscribir = z.object({
	tipo: z.enum(["cambio", "acceso", "consulta_sensible"]).default("cambio"),
	descripcion: z.union([
		z.string().min(1),
		z.object({
			plantilla: z.string().min(1),
			valores: z.record(z.string(), z.union([z.string(), z.object({ sueldo: z.string() })])),
		}),
	]),
	entidad: z.string().optional(),
	entidadId: z.uuid().optional(),
	entidadFolio: z.string().optional(),
	antes: z.unknown().optional(),
	despues: z.unknown().optional(),
	esAlerta: z.boolean().optional(),
	mismaPersona: z.boolean().optional(),
	confirmadoConGoogleEn: z.string().optional(),
	correoIntento: z.string().optional(),
	ip: z.string().optional(),
	departamento: z.string().optional(),
});

/**
 * Busca un campo con nombre de secreto en un valor, a cualquier profundidad.
 * @returns El nombre del primero que encuentra.
 */
function campoSecreto(valor: unknown): string | undefined {
	if (Array.isArray(valor)) return valor.map(campoSecreto).find((campo) => campo !== undefined);
	if (typeof valor !== "object" || valor === null) return undefined;
	for (const [campo, interior] of Object.entries(valor)) {
		if (pareceSecreto(campo)) return campo;
		const adentro = campoSecreto(interior);
		if (adentro !== undefined) return adentro;
	}
	return undefined;
}

/**
 * Dice si un valor trae uno de los campos de sueldo o de tarifa que declaran los módulos, a cualquier
 * profundidad.
 * @param valor El `antes` o el `despues` de un renglón.
 * @param camposDeSueldo Los campos de sueldo o de tarifa.
 */
function traeCampoDeSueldo(valor: unknown, camposDeSueldo: ReadonlySet<string>): boolean {
	if (Array.isArray(valor)) return valor.some((interior) => traeCampoDeSueldo(interior, camposDeSueldo));
	if (typeof valor !== "object" || valor === null) return false;
	return Object.entries(valor).some(
		([campo, interior]) => camposDeSueldo.has(campo) || traeCampoDeSueldo(interior, camposDeSueldo),
	);
}

/**
 * Arma las dos descripciones: la completa y, si trae sueldos o tarifas, la que los tapa.
 * @param descripcion El texto, o la plantilla con sus valores.
 */
export function armarDescripciones(descripcion: string | DescripcionConSueldos): {
	completa: string;
	recortada: string | null;
} {
	if (typeof descripcion === "string") return { completa: descripcion, recortada: null };
	const conValor = (tapar: boolean) =>
		descripcion.plantilla.replace(/\{(\w+)\}/g, (marca, nombre: string) => {
			const valor = descripcion.valores[nombre];
			if (valor === undefined) return marca;
			if (typeof valor === "string") return valor;
			return tapar ? montoTapado : valor.sueldo;
		});
	const traeSueldos = Object.values(descripcion.valores).some((valor) => typeof valor !== "string");
	return { completa: conValor(false), recortada: traeSueldos ? conValor(true) : null };
}

/**
 * Desde qué lado se hizo: la fábrica (la web y el puente), la tablet o el sistema.
 * @param quien Quién escribe.
 */
function origenDe(quien: QuienEscribe): "fabrica" | "tablet" | "sistema" {
	if (quien.tipo === "sistema") return "sistema";
	return quien.tipo === "aparato" && quien.tipoDeAparato === "tablet" ? "tablet" : "fabrica";
}

/**
 * Escribe un renglón de bitácora.
 * @param contexto El contexto de la acción, del trabajo o de la consulta.
 * @param datos El renglón (`renglonAEscribir`).
 * @returns `bitacora_id`, o `undefined` si era una consulta sensible ya apuntada hace poco.
 * @throws Error (un `500`) si `antes` o `despues` traen un secreto.
 */
export async function escribirBitacora(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ bitacora_id: string } | undefined> {
	const renglon = renglonAEscribir.parse(datos);
	const secreto = campoSecreto(renglon.antes) ?? campoSecreto(renglon.despues);
	if (secreto !== undefined) throw new Error(`un renglón de bitácora trae el secreto ${secreto}`);
	const { quien, transaccion } = contexto;
	const usuarioId =
		quien.tipo === "cuenta" ? quien.usuarioId : quien.tipo === "sistema" ? (quien.aNombreDe ?? null) : null;
	if (
		renglon.tipo === "consulta_sensible" &&
		(await yaSeApunto(contexto, usuarioId, renglon.entidad, renglon.entidadId))
	) {
		return undefined;
	}
	const { completa, recortada } = armarDescripciones(renglon.descripcion);
	// Un sueldo o una tarifa en antes o despues hace sensible el renglón, aunque la descripción no lo diga;
	// si la descripción va en texto suelto no se puede tapar nada: es un error del programa.
	const sueldosEnLoQueCambio =
		traeCampoDeSueldo(renglon.antes, contexto.camposDeSueldo) ||
		traeCampoDeSueldo(renglon.despues, contexto.camposDeSueldo);
	if (sueldosEnLoQueCambio && typeof renglon.descripcion === "string") {
		throw new Error("un renglón con sueldos o tarifas tiene que dar su descripción como plantilla");
	}
	const sensible = recortada !== null || sueldosEnLoQueCambio;
	const departamentoId =
		renglon.departamento === undefined ? null : await idDelDepartamento(contexto, renglon.departamento);
	const id = uuidv7();
	await transaccion.insert(bitacora).values({
		id,
		ocurridoEn: contexto.ahora.toString(),
		tipo: renglon.tipo,
		esAlerta: renglon.esAlerta ?? false,
		usuarioId,
		sesionId: quien.tipo === "cuenta" ? quien.sesionId : null,
		departamentoId,
		personaId: quien.tipo === "aparato" ? (quien.personaId ?? null) : null,
		dispositivoId: quien.tipo === "aparato" ? quien.dispositivoId : null,
		comandoId: contexto.comandoId ?? null,
		correoIntento: renglon.correoIntento ?? null,
		modulo: contexto.modulo,
		origen: origenDe(quien),
		accion: contexto.accion,
		descripcion: completa,
		descripcionRecortada: sensible ? (recortada ?? completa) : null,
		entidad: renglon.entidad ?? null,
		entidadId: renglon.entidadId ?? null,
		entidadFolio: renglon.entidadFolio ?? null,
		antes: renglon.antes ?? null,
		despues: renglon.despues ?? null,
		sensibleSueldos: sensible,
		mismaPersona: renglon.mismaPersona ?? false,
		confirmadoConGoogleEn: renglon.confirmadoConGoogleEn ?? null,
		ip: renglon.ip ?? null,
	});
	if (renglon.esAlerta === true) {
		await contexto.interna("admin.guardar_evento", {
			tipo: "alerta.registrada",
			modulo: "admin",
			datos: { bitacora_id: id },
			tablas: ["bitacora"],
			entidad: "bitacora",
			entidadId: id,
		});
	}
	return { bitacora_id: id };
}

/**
 * El id de un departamento por su clave.
 * @throws Error del programa si la clave no existe.
 */
async function idDelDepartamento(contexto: ContextoDeAccion, clave: string): Promise<string> {
	const [depto] = await contexto.transaccion
		.select({ id: departamentos.id })
		.from(departamentos)
		.where(eq(departamentos.clave, clave));
	if (depto === undefined) throw new Error(`no hay departamento ${clave}`);
	return depto.id;
}

/**
 * Dice si la misma cuenta ya apuntó la consulta sensible de ese documento hace menos de
 * `admin.minutos_consulta_sensible`. Toma un candado por cuenta y documento para que dos lecturas a la vez
 * no apunten dos renglones.
 */
async function yaSeApunto(
	contexto: ContextoDeAccion,
	usuarioId: string | null,
	entidad: string | undefined,
	entidadId: string | undefined,
): Promise<boolean> {
	const { transaccion } = contexto;
	await transaccion.execute(
		sql`SELECT pg_advisory_xact_lock(hashtext(${`consulta_sensible:${usuarioId}:${entidad}:${entidadId}`}))`,
	);
	const minutos = Number(await leerParametro(transaccion, { clave: "admin.minutos_consulta_sensible" }));
	const desde = contexto.ahora.subtract({ minutes: minutos }).toString();
	const [reciente] = await transaccion
		.select({ id: bitacora.id })
		.from(bitacora)
		.where(
			and(
				eq(bitacora.tipo, "consulta_sensible"),
				usuarioId === null ? sql`${bitacora.usuarioId} is null` : eq(bitacora.usuarioId, usuarioId),
				entidad === undefined ? sql`${bitacora.entidad} is null` : eq(bitacora.entidad, entidad),
				entidadId === undefined ? sql`${bitacora.entidadId} is null` : eq(bitacora.entidadId, entidadId),
				gt(bitacora.ocurridoEn, desde),
			),
		)
		.orderBy(desc(bitacora.ocurridoEn))
		.limit(1);
	return reciente !== undefined;
}
