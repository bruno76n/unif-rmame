/**
 * `admin.cerrar_mi_sesion`: cierra una sesión de la propia cuenta, o todas las demás.
 * Fase 5 · docs/modulos/admin/acceso-con-google.md («`admin.cerrar_mi_sesion`»)
 *
 * Solo toca sesiones de quien llama: una de otra cuenta responde `404`, como una que no existe. Se cierran
 * por la misma cuenta con `salio`.
 */

import { cerrarMiSesion } from "@uniformame/compartido/contratos/admin/cuentas";
import { and, eq } from "drizzle-orm";
import { errorDeCampo, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { avisarSesionesCerradas, cerrarSesionesDe } from "../dominio/cuentas.ts";
import { sesiones } from "../tablas.ts";

export const accionCerrarMiSesion = implementarAccion(cerrarMiSesion, async (contexto, datos) => {
	const { quien, transaccion } = contexto;
	if (quien.tipo !== "cuenta") throw new Error("admin.cerrar_mi_sesion es de una cuenta con sesión");
	const todas = datos.todas_las_demas === true;
	if (datos.sesion_id === undefined && !todas) throw errorDeCampo("sesion_id", "Escoge la sesión que cierras.");
	if (datos.sesion_id !== undefined) {
		const [suya] = await transaccion
			.select({ id: sesiones.id })
			.from(sesiones)
			.where(and(eq(sesiones.id, datos.sesion_id), eq(sesiones.usuarioId, quien.usuarioId)));
		if (suya === undefined) throw noExiste();
	}
	const cerradas = await cerrarSesionesDe(transaccion, quien.usuarioId, {
		motivo: "salio",
		cerradaPor: quien.usuarioId,
		ahora: contexto.ahora.toString(),
		...(datos.sesion_id === undefined ? { menos: quien.sesionId } : { solo: datos.sesion_id }),
	});
	const texto = cerradas.length === 1 ? "1 sesión cerrada" : `${cerradas.length} sesiones cerradas`;
	contexto.bitacora({
		tipo: "acceso",
		departamento: "admin",
		descripcion: `Cerró ${cerradas.length} de sus sesiones`,
	});
	avisarSesionesCerradas(contexto, quien.usuarioId, cerradas, "salio");
	return { resultado: { cerradas: cerradas.length, mensaje: texto } };
});
