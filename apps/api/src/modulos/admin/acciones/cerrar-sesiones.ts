/**
 * `admin.cerrar_sesiones`: Administración del sistema cierra las sesiones abiertas de una cuenta.
 * Fase 5 · docs/modulos/admin/acceso-con-google.md («`admin.cerrar_sesiones`», regla 9)
 *
 * Las sesiones de la dueña solo las cierra ella (`403 solo_duena`). Se cierran con
 * `cerrada_por_otra_cuenta` y `sesion.cerrada` les manda `sesion_cerrada` a esas pantallas.
 */

import { cerrarSesiones } from "@uniformame/compartido/contratos/admin/cuentas";
import { ErrorDeApi, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import {
	avisarSesionesCerradas,
	cerrarSesionesDe,
	cuentaQueLlama,
	leerCuenta,
	nombreDeCuenta,
} from "../dominio/cuentas.ts";

export const accionCerrarSesiones = implementarAccion(cerrarSesiones, async (contexto, datos) => {
	const quienCierra = cuentaQueLlama(contexto);
	const cuenta = await leerCuenta(contexto.transaccion, datos.usuario_id);
	const nombre = nombreDeCuenta(cuenta);
	const esLaDuenaQuienLlama = contexto.quien.tipo === "cuenta" && contexto.quien.esDuena;
	if (cuenta.esDuena && !esLaDuenaQuienLlama) {
		throw new ErrorDeApi("sin_permiso", "solo_duena", "Las sesiones de la dueña solo las cierra ella.");
	}
	const cerradas = await cerrarSesionesDe(contexto.transaccion, cuenta.id, {
		motivo: "cerrada_por_otra_cuenta",
		cerradaPor: quienCierra,
		ahora: contexto.ahora.toString(),
	});
	if (cerradas.length === 0) throw errorDeRegla("sin_sesiones_abiertas", `${nombre} no tiene sesiones abiertas.`);
	contexto.bitacora({
		tipo: "acceso",
		departamento: "admin",
		descripcion:
			cerradas.length === 1 ? `Cerró 1 sesión de ${nombre}` : `Cerró ${cerradas.length} sesiones de ${nombre}`,
		entidad: "usuarios",
		entidadId: cuenta.id,
	});
	avisarSesionesCerradas(contexto, cuenta.id, cerradas, "cerrada_por_otra_cuenta");
	return { resultado: { cerradas: cerradas.length, mensaje: `Sesiones de ${nombre} cerradas` } };
});
