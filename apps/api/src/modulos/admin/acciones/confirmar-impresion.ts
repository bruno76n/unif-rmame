/**
 * `admin.confirmar_impresion`: el programa puente confirma un trabajo.
 * Fase 4 · docs/modulos/admin/impresion.md («`admin.confirmar_impresion`»)
 *
 * Solo un trabajo de una impresora suya (si no, `403 fuera_de_alcance`). Un trabajo terminado no cambia:
 * confirmarlo otra vez contesta lo mismo. Guarda `impresion.terminada`, que le llega en vivo a la sesión
 * que pidió imprimir. Sin bitácora: imprimir no cambia datos del negocio.
 */

import { confirmarImpresion } from "@uniformame/compartido/contratos/admin/impresion";
import { eq } from "drizzle-orm";
import { ErrorDeApi, errorDeCampo, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { impresoras, trabajosImpresion } from "../tablas.ts";

/** Un trabajo que ya terminó. */
function terminado(estado: string): estado is "impreso" | "fallo" {
	return estado === "impreso" || estado === "fallo";
}

export const accionConfirmarImpresion = implementarAccion(confirmarImpresion, async (contexto, datos) => {
	const { quien, transaccion } = contexto;
	if (quien.tipo !== "aparato") throw new Error("solo un puente confirma impresiones");
	const [trabajo] = await transaccion
		.select({
			estado: trabajosImpresion.estado,
			sesionId: trabajosImpresion.sesionId,
			dispositivoId: impresoras.dispositivoId,
			impresora: impresoras.nombre,
		})
		.from(trabajosImpresion)
		.innerJoin(impresoras, eq(impresoras.id, trabajosImpresion.impresoraId))
		.where(eq(trabajosImpresion.id, datos.trabajo_id))
		.for("update", { of: trabajosImpresion });
	if (trabajo === undefined) throw noExiste();
	if (trabajo.dispositivoId !== quien.dispositivoId) throw new ErrorDeApi("sin_permiso", "fuera_de_alcance");
	if (terminado(trabajo.estado)) {
		return { resultado: { mensaje: "Trabajo confirmado", estado: trabajo.estado }, sinBitacora: true };
	}
	if (datos.resultado === "fallo" && (datos.error ?? "") === "") {
		throw errorDeCampo("error", "Escribe lo que dijo la impresora.");
	}
	await transaccion
		.update(trabajosImpresion)
		.set({
			estado: datos.resultado,
			terminadoEn: contexto.ahora.toString(),
			error: datos.resultado === "fallo" ? (datos.error ?? null) : null,
		})
		.where(eq(trabajosImpresion.id, datos.trabajo_id));
	const texto =
		datos.resultado === "impreso"
			? `Etiquetas impresas en ${trabajo.impresora}`
			: `No se imprimió en ${trabajo.impresora}: ${datos.error ?? ""}. Usa el PDF.`;
	contexto.guardarEvento({
		tipo: "impresion.terminada",
		datos: { trabajo_id: datos.trabajo_id, sesion_id: trabajo.sesionId, resultado: datos.resultado, texto },
		tablas: ["trabajos_impresion"],
		entidad: "trabajos_impresion",
		entidadId: datos.trabajo_id,
	});
	return { resultado: { mensaje: "Trabajo confirmado", estado: datos.resultado }, sinBitacora: true };
});
