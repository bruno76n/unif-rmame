/**
 * Lo que comparten las acciones de los aparatos: el código de registro, la parte pública de la llave, la
 * ubicación que le toca a cada tipo y leer un aparato.
 * Fase 6 · docs/modulos/admin/dispositivos.md
 */

import { randomBytes, randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Base } from "../../../nucleo/base/conexion.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { dispositivos, impresoras } from "../tablas.ts";

/** Las letras del código: sin las que se confunden (0 y O, 1, I y L, 5 y S, 2 y Z, 8 y B). */
const letrasDelCodigo = "ACDEFGHJKMNPQRTUVWXY34679";

/** Las letras de la parte pública de la llave. */
const letrasDeLaLlave = "abcdefghijkmnpqrstuvwxyz23456789";

/** Cómo se nombra cada tipo en los mensajes. */
export const nombreDelTipo: Readonly<Record<string, string>> = {
	tablet_taller: "tablet del taller",
	telefono_escanear: "teléfono para escanear",
	puente_impresion: "programa de impresión",
	computadora_tienda: "caja",
	credencial_servidor: "credencial de uniformame.mx",
};

/**
 * Un código de registro nuevo: 6 letras sin las que se confunden.
 * @returns El código como lo ve la dueña («K7Q-422») y como se compara («K7Q422»).
 */
export function nuevoCodigo(): { paraLeer: string; normal: string } {
	const normal = Array.from({ length: 6 }, () => letrasDelCodigo[randomInt(letrasDelCodigo.length)]).join("");
	return { paraLeer: `${normal.slice(0, 3)}-${normal.slice(3)}`, normal };
}

/**
 * Un código como se compara: sin guion ni espacios, en mayúsculas.
 * @param codigo Lo que escribió la persona.
 */
export function codigoNormal(codigo: string): string {
	return codigo.replace(/[\s-]/g, "").toUpperCase();
}

/** Una parte pública de llave nueva: 8 letras al azar, sin las que se confunden. */
export function nuevaLlaveId(): string {
	return [...randomBytes(8)].map((byte) => letrasDeLaLlave[byte % letrasDeLaLlave.length]).join("");
}

/** Un secreto de llave nuevo, para la credencial que se rota desde la web: 32 bytes en base64url. */
export function nuevoSecreto(): string {
	return randomBytes(32).toString("base64url");
}

/**
 * Revisa que un tipo de aparato vaya en esa ubicación: la tablet en el Taller; el teléfono en Aduana o
 * Bodega; la caja en una tienda; el programa de impresión donde haya una impresora sin baja.
 * @param transaccion La transacción.
 * @param tipo El tipo de aparato.
 * @param ubicacionId La ubicación.
 * @throws `422 ubicacion_no_corresponde`.
 */
export async function revisarUbicacion(transaccion: Transaccion, tipo: string, ubicacionId: string): Promise<void> {
	const [ubicacion] = await transaccion
		.select({ tipo: ubicaciones.tipo, nombre: ubicaciones.nombre, bajaEn: ubicaciones.bajaEn })
		.from(ubicaciones)
		.where(eq(ubicaciones.id, ubicacionId));
	if (ubicacion === undefined || ubicacion.bajaEn !== null) throw noExiste();
	const permitidas: Readonly<Record<string, readonly string[]>> = {
		tablet_taller: ["taller"],
		telefono_escanear: ["aduana", "bodega"],
		computadora_tienda: ["tienda"],
	};
	const tipos = permitidas[tipo];
	const vale =
		tipos === undefined
			? (
					await transaccion
						.select({ id: impresoras.id })
						.from(impresoras)
						.where(and(eq(impresoras.ubicacionId, ubicacionId), isNull(impresoras.bajaEn)))
						.limit(1)
				).length > 0
			: tipos.includes(ubicacion.tipo);
	if (!vale) {
		throw errorDeRegla("ubicacion_no_corresponde", `Un ${nombreDelTipo[tipo] ?? tipo} no va en ${ubicacion.nombre}.`);
	}
}

/** Un aparato como lo leen las acciones. */
export type Dispositivo = typeof dispositivos.$inferSelect;

/**
 * Lee un aparato.
 * @param base La base o la transacción.
 * @param dispositivoId El aparato.
 * @throws `404` si no existe.
 */
export async function leerDispositivo(base: Base | Transaccion, dispositivoId: string): Promise<Dispositivo> {
	const [aparato] = await base.select().from(dispositivos).where(eq(dispositivos.id, dispositivoId));
	if (aparato === undefined) throw noExiste();
	return aparato;
}
