/**
 * `admin.permisos_de`: lo que puede una cuenta: sus departamentos efectivos y sus permisos finos.
 * Fase 5 · docs/modulos/admin/permisos.md («`admin.permisos_de`»)
 *
 * La dueña tiene todos los departamentos y todos los permisos finos, sin renglones; las demás cuentas, sus
 * departamentos y permisos sin baja, y solo si la cuenta está activa. Un departamento sin ubicación vale
 * para todas. Lo de los aparatos llega con ellos, en la fase 6.
 */

import { clavesDeDepartamento, permisosFinosDeCuenta } from "@uniformame/compartido/contratos/admin/cuentas";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Base } from "../../../nucleo/base/conexion.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { departamentosVigentes, permisosFinosVigentes } from "../dominio/cuentas.ts";
import { usuarios } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ usuario_id: z.uuid() });

/** Lo que puede una cuenta. */
export interface PermisosDeCuenta {
	activa: boolean;
	es_duena: boolean;
	es_soporte: boolean;
	/** Sus departamentos efectivos; `ubicacion_id` nulo es en todas. */
	departamentos: { clave: string; ubicacion_id: string | null }[];
	permisos_finos: string[];
}

/**
 * Lee lo que puede una cuenta.
 * @param transaccion La transacción o la base.
 * @param usuarioId La cuenta.
 * @returns Sus permisos, o `undefined` si la cuenta no existe.
 */
export async function leerPermisosDe(
	transaccion: Base | Transaccion,
	usuarioId: string,
): Promise<PermisosDeCuenta | undefined> {
	const [cuenta] = await transaccion
		.select({ estado: usuarios.estado, esDuena: usuarios.esDuena, esSoporte: usuarios.esSoporte })
		.from(usuarios)
		.where(eq(usuarios.id, usuarioId));
	if (cuenta === undefined) return undefined;
	const activa = cuenta.estado === "activa";
	const base = { activa, es_duena: cuenta.esDuena, es_soporte: cuenta.esSoporte };
	if (!activa) return { ...base, departamentos: [], permisos_finos: [] };
	if (cuenta.esDuena) {
		return {
			...base,
			departamentos: clavesDeDepartamento.map((clave) => ({ clave, ubicacion_id: null })),
			permisos_finos: [...permisosFinosDeCuenta],
		};
	}
	return {
		...base,
		departamentos: (await departamentosVigentes(transaccion, usuarioId)).map((depto) => ({
			clave: depto.clave,
			ubicacion_id: depto.ubicacionId,
		})),
		permisos_finos: (await permisosFinosVigentes(transaccion, usuarioId)).map((renglon) => renglon.permiso),
	};
}

/**
 * La lectura para los demás módulos.
 * @param contexto El contexto de la acción.
 * @param datos `usuario_id`.
 */
export async function permisosDe(contexto: ContextoDeAccion, datos: unknown): Promise<PermisosDeCuenta | undefined> {
	return leerPermisosDe(contexto.transaccion, pedido.parse(datos).usuario_id);
}
