/**
 * `admin.salir`: cierra la sesión de quien llama.
 * Fase 5 · docs/modulos/admin/acceso-con-google.md («`admin.salir`»)
 *
 * La sesión queda cerrada por la misma cuenta con `salio`; el servidor borra la cookie `ua_sesion`
 * (`cierraLaSesion` del contrato) y `sesion.cerrada` les manda `sesion_cerrada` a las otras pestañas.
 */

import { salir } from "@uniformame/compartido/contratos/admin/cuentas";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { avisarSesionesCerradas, cerrarSesionesDe } from "../dominio/cuentas.ts";

export const accionSalir = implementarAccion(salir, async (contexto) => {
	const { quien } = contexto;
	if (quien.tipo !== "cuenta") throw new Error("admin.salir es de una cuenta con sesión");
	const cerradas = await cerrarSesionesDe(contexto.transaccion, quien.usuarioId, {
		motivo: "salio",
		cerradaPor: quien.usuarioId,
		ahora: contexto.ahora.toString(),
		solo: quien.sesionId,
	});
	contexto.bitacora({ tipo: "acceso", departamento: "admin", descripcion: "Salió del sistema" });
	avisarSesionesCerradas(contexto, quien.usuarioId, cerradas, "salio");
	return { resultado: { mensaje: "Sesión cerrada" } };
});
