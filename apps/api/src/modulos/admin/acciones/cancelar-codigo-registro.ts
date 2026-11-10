/**
 * `admin.cancelar_codigo_registro`: la dueña cancela un código que no se usó.
 * Fase 6 · docs/modulos/admin/dispositivos.md («`admin.cancelar_codigo_registro`»)
 *
 * Toma el código con candado: si el aparato lo canjeó a la vez, una de las dos espera. Uno ya canjeado
 * responde `codigo_no_vigente` y dice qué aparato nació.
 */

import { cancelarCodigoRegistro } from "@uniformame/compartido/contratos/admin/dispositivos";
import { eq } from "drizzle-orm";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { codigosRegistro } from "../tablas.ts";

export const accionCancelarCodigoRegistro = implementarAccion(cancelarCodigoRegistro, async (contexto, datos) => {
	const { transaccion } = contexto;
	const [codigo] = await transaccion
		.select()
		.from(codigosRegistro)
		.where(eq(codigosRegistro.id, datos.codigo_registro_id))
		.for("update");
	if (codigo === undefined) throw noExiste();
	if (codigo.estado !== "vigente") {
		const nacio = codigo.dispositivoId === null ? "" : " El aparato ya quedó registrado.";
		throw errorDeRegla("codigo_no_vigente", `Ese código ya se canjeó o se canceló.${nacio}`);
	}
	await transaccion
		.update(codigosRegistro)
		.set({ estado: "cancelado", canceladoEn: contexto.ahora.toString() })
		.where(eq(codigosRegistro.id, codigo.id));
	contexto.bitacora({
		descripcion: `Canceló el código para registrar ${codigo.nombre}`,
		entidad: "codigos_registro",
		entidadId: codigo.id,
	});
	return { resultado: { mensaje: "Código cancelado" }, entidad: { nombre: "codigos_registro", id: codigo.id } };
});
