/**
 * `admin.cambiar_permiso_fino`: la dueña da o quita «ven sueldos y tarifas» o «imprime guías» a una cuenta.
 * Fase 5 · docs/modulos/admin/permisos.md («`admin.cambiar_permiso_fino`»)
 *
 * Dar es un renglón nuevo; quitar, la baja del vigente; y sube la versión de la cuenta. Si ya estaba así,
 * responde bien sin escribir. La casilla de la dueña no se toca y la cuenta de soporte nunca ve sueldos.
 * `cuenta.permisos_cambiados` les manda `permisos_cambiados` a sus sesiones.
 */

import { cambiarPermisoFino } from "@uniformame/compartido/contratos/admin/cuentas";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { revisarVersion, tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import {
	confirmadoConGoogle,
	cuentaQueLlama,
	leerCuenta,
	nombreDeCuenta,
	permisosFinosVigentes,
	revisarQueSePuedeCambiar,
} from "../dominio/cuentas.ts";
import { permisosFinos, usuarios } from "../tablas.ts";

/** El texto del aviso y de la bitácora, por permiso y por si lo da o lo quita. */
const textos = {
	ven_sueldos_y_tarifas: { da: "Dio acceso a sueldos y tarifas", quita: "Quitó acceso a sueldos y tarifas" },
	imprime_guias: { da: "Puede imprimir guías", quita: "Ya no puede imprimir guías" },
};

export const accionCambiarPermisoFino = implementarAccion(cambiarPermisoFino, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const duena = cuentaQueLlama(contexto);
	const confirmado = confirmadoConGoogle(contexto);
	const cuenta = await leerCuenta(transaccion, datos.usuario_id);
	revisarQueSePuedeCambiar(cuenta, "La casilla de la dueña no se puede quitar.");
	if (cuenta.esSoporte && datos.permiso === "ven_sueldos_y_tarifas" && datos.tiene) {
		throw errorDeRegla("soporte_sin_dinero", "La cuenta de soporte no ve dinero ni nómina.");
	}
	const visible = async () => ({
		usuario_id: cuenta.id,
		permisos_finos: (await permisosFinosVigentes(transaccion, cuenta.id)).map((renglon) => renglon.permiso),
	});
	const vigente = (await permisosFinosVigentes(transaccion, cuenta.id)).find(
		(renglon) => renglon.permiso === datos.permiso,
	);
	// Ya estaba así: responde bien sin escribir nada.
	if ((vigente !== undefined) === datos.tiene) {
		await revisarVersion(contexto, usuarios, cuenta.id, version, visible);
		return { resultado: { mensaje: "Sin cambios", version: cuenta.version }, sinBitacora: true };
	}
	await tomarVersion(contexto, usuarios, cuenta.id, version, visible);
	if (vigente === undefined) {
		await transaccion
			.insert(permisosFinos)
			.values({ id: uuidv7(), usuarioId: cuenta.id, permiso: datos.permiso, creadoPor: duena });
	} else {
		await transaccion
			.update(permisosFinos)
			.set({ bajaEn: contexto.ahora.toString(), bajaPor: duena })
			.where(eq(permisosFinos.id, vigente.id));
	}
	const texto = `${textos[datos.permiso][datos.tiene ? "da" : "quita"]}: ${nombreDeCuenta(cuenta)}`;
	contexto.bitacora({
		descripcion: texto,
		entidad: "usuarios",
		entidadId: cuenta.id,
		antes: { [datos.permiso]: !datos.tiene },
		despues: { [datos.permiso]: datos.tiene },
		esAlerta: true,
		confirmadoConGoogleEn: confirmado,
	});
	contexto.guardarEvento({
		tipo: "cuenta.permisos_cambiados",
		datos: { usuario_id: cuenta.id },
		tablas: ["permisos_finos", "usuarios"],
		entidad: "usuarios",
		entidadId: cuenta.id,
	});
	return {
		resultado: { mensaje: texto, version: await versionActual(transaccion, usuarios, cuenta.id) },
		entidad: { nombre: "usuarios", id: cuenta.id },
	};
});
