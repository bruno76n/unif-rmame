/**
 * `admin.descartar_comando_apartado`: la dueña descarta un comando apartado de un aparato, con su motivo.
 * Fase 6 · docs/modulos/admin/dispositivos.md («`admin.descartar_comando_apartado`»)
 *
 * No aplica nada: si era un hecho real, se captura con la acción de su módulo. El comando queda con quién,
 * cuándo y por qué se descartó, y ya no se reintenta solo.
 */

import { descartarComandoApartado } from "@uniformame/compartido/contratos/admin/dispositivos";
import { eq, sql } from "drizzle-orm";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { cuentaQueLlama } from "../dominio/cuentas.ts";
import { leerApartado } from "../dominio/dispositivos.ts";
import { comandosRecibidos } from "../tablas.ts";

export const accionDescartarComandoApartado = implementarAccion(descartarComandoApartado, async (contexto, datos) => {
	const { transaccion } = contexto;
	const duena = cuentaQueLlama(contexto);
	const comando = await leerApartado(transaccion, datos.comando_id);
	await transaccion
		.update(comandosRecibidos)
		.set({
			descartadoEn: contexto.ahora.toString(),
			descartadoPor: duena,
			motivoDescarte: datos.motivo,
			actualizadoEn: sql`now()`,
		})
		.where(eq(comandosRecibidos.id, comando.id));
	contexto.bitacora({
		descripcion: `Descartó un comando apartado de ${comando.nombreDelAparato} (${comando.tipoComando}): ${datos.motivo}`,
		entidad: "comandos_recibidos",
		entidadId: comando.id,
	});
	return { resultado: { mensaje: "Comando descartado" } };
});
