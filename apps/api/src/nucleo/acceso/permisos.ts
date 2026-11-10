/**
 * La revisión del permiso de cada llamada: el paso 4 del corredor, antes de abrir la transacción.
 * Fase 5 · docs/cimientos/ACCESO-Y-PERMISOS.md («Cómo se revisa cada llamada», pasos 3 a 7)
 *
 * En este orden: el departamento que pide el contrato (`403 sin_departamento`), su permiso fino
 * (`403 sin_permiso_fino`), `solo_duena` (`403 solo_duena`) y «Confirmar con Google» de hace menos de
 * `admin.reautenticacion_minutos` (`401 reautenticar`, con su propósito). La dueña tiene todos los
 * departamentos y permisos finos, pero también confirma con Google. Un aparato solo llama lo que está en
 * el alcance de su tipo (`403 fuera_de_alcance`), y lo que nombra aparatos sin pedir departamento ni a la
 * dueña (`admin.trabajos_impresion`) es solo de aparatos: una cuenta recibe `403 fuera_de_alcance`.
 */

import type { Permiso } from "@uniformame/compartido/contratos/definir";
import { Temporal } from "temporal-polyfill";
import type { Base } from "../base/conexion.ts";
import { ErrorDeApi } from "../http/errores.ts";
import type { QuienLlama } from "./quien.ts";
import { parametroEntero } from "./sesion.ts";

/**
 * Arma la revisión del permiso, que lee de la base los minutos de «Confirmar con Google».
 * @param base La base.
 */
export function revisionDePermisos(
	base: Base,
): (quien: QuienLlama, permiso: Permiso, ahora: Temporal.Instant) => Promise<void> {
	return async (quien, permiso, ahora) => {
		if (quien.tipo === "aparato") {
			if (!(permiso.aparatos ?? []).includes(quien.tipoDeAparato)) {
				throw new ErrorDeApi("sin_permiso", "fuera_de_alcance");
			}
			return;
		}
		// Lo que nombra aparatos sin pedir departamento ni a la dueña es solo de aparatos.
		if (permiso.aparatos !== undefined && permiso.departamento === undefined && permiso.soloDuena !== true) {
			throw new ErrorDeApi("sin_permiso", "fuera_de_alcance");
		}
		if (permiso.departamento !== undefined && !quien.esDuena && !quien.departamentos.includes(permiso.departamento)) {
			throw new ErrorDeApi("sin_permiso", "sin_departamento");
		}
		if (permiso.permisoFino !== undefined && !quien.esDuena && !quien.permisosFinos.includes(permiso.permisoFino)) {
			throw new ErrorDeApi("sin_permiso", "sin_permiso_fino");
		}
		if (permiso.soloDuena === true && !quien.esDuena) throw new ErrorDeApi("sin_permiso", "solo_duena");
		if (permiso.confirmarConGoogle !== undefined) {
			const minutos = await parametroEntero(base, "admin.reautenticacion_minutos");
			const desde = quien.confirmadoConGoogleEn;
			if (desde === undefined || Temporal.Instant.compare(desde.add({ minutes: minutos }), ahora) < 0) {
				throw new ErrorDeApi("reautenticar", null, undefined, { proposito: permiso.confirmarConGoogle, minutos });
			}
		}
	};
}
