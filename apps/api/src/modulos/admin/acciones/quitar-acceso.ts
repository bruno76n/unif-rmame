/**
 * `admin.quitar_acceso`: la dueña le quita el acceso a una cuenta.
 * Fase 5 · docs/modulos/admin/cuentas.md («`admin.quitar_acceso`»)
 *
 * La cuenta queda `sin_acceso` con su baja y su confirmación; sus departamentos y permisos finos vigentes
 * se dan de baja y sus sesiones abiertas se cierran con `acceso_quitado`, todo en la misma transacción.
 * `cuenta.acceso_quitado` les manda `sesion_cerrada` a sus pantallas. A la dueña nadie le quita el acceso.
 */

import { quitarAcceso } from "@uniformame/compartido/contratos/admin/cuentas";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import {
	confirmadoConGoogle,
	cuentaQueLlama,
	leerCuenta,
	nombreDeCuenta,
	quitarElAcceso,
	revisarQueSePuedeCambiar,
} from "../dominio/cuentas.ts";
import { usuarios } from "../tablas.ts";

export const accionQuitarAcceso = implementarAccion(quitarAcceso, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const duena = cuentaQueLlama(contexto);
	const confirmado = confirmadoConGoogle(contexto);
	const cuenta = await leerCuenta(transaccion, datos.usuario_id);
	revisarQueSePuedeCambiar(cuenta, "La dueña no se quita el acceso.");
	await tomarVersion(contexto, usuarios, cuenta.id, version, async () => ({
		usuario_id: cuenta.id,
		estado: (await leerCuenta(transaccion, cuenta.id)).estado,
	}));
	const motivo = datos.motivo === undefined || datos.motivo === "" ? null : datos.motivo;
	const cerradas = await quitarElAcceso(contexto, cuenta.id, { por: duena, motivo, confirmado });
	const nombre = nombreDeCuenta(cuenta);
	contexto.bitacora({
		descripcion: `Quitó el acceso a ${nombre}`,
		entidad: "usuarios",
		entidadId: cuenta.id,
		antes: { estado: cuenta.estado },
		despues: { estado: "sin_acceso", motivo, sesiones_cerradas: cerradas.length },
		esAlerta: true,
		confirmadoConGoogleEn: confirmado,
	});
	return {
		resultado: {
			mensaje: `${nombre} ya no entra al sistema`,
			version: await versionActual(transaccion, usuarios, cuenta.id),
		},
		entidad: { nombre: "usuarios", id: cuenta.id },
	};
});
