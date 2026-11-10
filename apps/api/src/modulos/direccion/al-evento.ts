/**
 * Lo que hace `direccion` al llegar sus eventos, dentro del proceso de la bandeja: los avisos de las
 * autorizaciones.
 * Fase 7 · docs/modulos/direccion/autorizaciones.md («Eventos») y docs/modulos/admin/avisos.md («Los tipos»)
 *
 * `autorizacion.pedida` avisa `autorizacion_pedida` a las cuentas con Dirección (el alta de usuario, solo a la
 * dueña); `autorizacion.decidida`, `autorizacion_decidida` a quien la pidió, si tiene cuenta, con el motivo si
 * se rechazó.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AlEvento, ContextoDeAccion } from "../../nucleo/modulos.ts";
import { departamentos } from "../admin/tablas.ts";
import { autorizaciones } from "./tablas.ts";

/** Los datos de los eventos de una autorización. */
const deUnaAutorizacion = z.object({ autorizacion_id: z.uuid() });

/** Lee la autorización de un evento, con el nombre de su departamento. */
async function leer(contexto: ContextoDeAccion, datos: unknown) {
	const { autorizacion_id } = deUnaAutorizacion.parse(datos);
	const [leida] = await contexto.transaccion
		.select({ autorizacion: autorizaciones, departamento: departamentos.nombre })
		.from(autorizaciones)
		.innerJoin(departamentos, eq(departamentos.id, autorizaciones.departamentoOrigenId))
		.where(eq(autorizaciones.id, autorizacion_id));
	if (leida === undefined) throw new Error(`no existe la autorización ${autorizacion_id}`);
	return leida;
}

/** `autorizacion.pedida` → `autorizacion_pedida` a Dirección (el alta, a la dueña). */
const avisarPedida: AlEvento = async (contexto, evento) => {
	const { autorizacion, departamento } = await leer(contexto, evento.datos);
	await contexto.interna("admin.crear_aviso", {
		tipo: "autorizacion_pedida",
		destinatarios: { regla: autorizacion.tipo === "alta_usuario" ? "duena" : "departamento:direccion" },
		texto: `${departamento} pide autorización: ${autorizacion.resumen}`,
		enlace: "direccion/autorizaciones",
		entidad: "autorizaciones",
		entidadId: autorizacion.id,
		eventoId: evento.id,
	});
};

/** `autorizacion.decidida` → `autorizacion_decidida` a quien la pidió, si tiene cuenta. */
const avisarDecidida: AlEvento = async (contexto, evento) => {
	const { autorizacion } = await leer(contexto, evento.datos);
	if (autorizacion.creadoPor === null) return;
	const texto =
		autorizacion.estado === "rechazada"
			? `${autorizacion.folio} rechazada: ${autorizacion.resumen} · ${autorizacion.motivoRechazo ?? ""}`
			: `${autorizacion.folio} autorizada: ${autorizacion.resumen}`;
	await contexto.interna("admin.crear_aviso", {
		tipo: "autorizacion_decidida",
		destinatarios: { cuentas: [autorizacion.creadoPor] },
		texto,
		entidad: "autorizaciones",
		entidadId: autorizacion.id,
		eventoId: evento.id,
	});
};

/** Por tipo de evento, lo que hace `direccion`. */
export const alEventoDeDireccion: Record<string, AlEvento> = {
	"autorizacion.pedida": avisarPedida,
	"autorizacion.decidida": avisarDecidida,
};
