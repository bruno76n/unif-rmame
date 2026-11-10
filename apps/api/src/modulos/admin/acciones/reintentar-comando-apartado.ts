/**
 * `admin.reintentar_comando_apartado`: Administración del sistema vuelve a correr un comando apartado de un
 * aparato, por el mismo camino de la subida.
 * Fase 6 · docs/modulos/admin/dispositivos.md («`admin.reintentar_comando_apartado`»)
 *
 * Corre con la hora, la persona y el código de origen del comando, a nombre del mismo aparato. Si se aplica,
 * la bitácora es la de la acción del comando, con quién lo reintentó en `despues`; lo que se aplicó también
 * puede ser el documento que esperaban otros apartados, que se reintentan detrás. Si sigue apartado, la
 * bitácora lo dice.
 */

import { reintentarComandoApartado } from "@uniformame/compartido/contratos/admin/dispositivos";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { implementarAccion, type RenglonDeBitacora } from "../../../nucleo/modulos.ts";
import { reintentarComando, reintentarLosQueEsperaban } from "../../../nucleo/sincronizacion/comandos.ts";
import { cuentaQueLlama, leerCuenta, nombreDeCuenta } from "../dominio/cuentas.ts";
import { leerApartado } from "../dominio/dispositivos.ts";

/**
 * Agrega a lo que cambió quién reintentó el comando.
 * @param despues El `despues` del renglón de la acción.
 * @param nombre El nombre de quien lo reintentó.
 */
function conReintento(despues: unknown, nombre: string): Record<string, unknown> {
	const reintento = `reintentado por ${nombre}`;
	if (typeof despues === "object" && despues !== null && !Array.isArray(despues)) return { ...despues, reintento };
	return despues === undefined ? { reintento } : { valor: despues, reintento };
}

export const accionReintentarComandoApartado = implementarAccion(reintentarComandoApartado, async (contexto, datos) => {
	const { transaccion } = contexto;
	const nombre = nombreDeCuenta(await leerCuenta(transaccion, cuentaQueLlama(contexto)));
	const comando = await leerApartado(transaccion, datos.comando_id);
	const dependencias = {
		registro: contexto.registro,
		servicios: { escribirBitacora: escribirBitacoraConAdmin, guardarEventos: guardarEventosConAdmin },
		...(contexto.almacen === undefined ? {} : { almacen: contexto.almacen }),
	};
	const ajustar = (renglon: RenglonDeBitacora): RenglonDeBitacora => ({
		...renglon,
		despues: conReintento(renglon.despues, nombre),
	});
	const hecho = await reintentarComando(dependencias, transaccion, comando.id, ajustar);
	if (hecho === undefined) throw new Error("el comando apartado se leyó bloqueado y ya no estaba apartado");
	const { resultado, motivo, excepciones } = hecho.respuesta;
	if (resultado === "apartado" || resultado === "repetido") {
		contexto.bitacora({
			descripcion: `Reintentó un comando apartado de ${comando.nombreDelAparato} (${comando.tipoComando}): sigue apartado por ${motivo ?? "su regla"}`,
			entidad: "comandos_recibidos",
			entidadId: comando.id,
		});
		return {
			resultado: {
				resultado: "apartado" as const,
				motivo,
				excepciones,
				mensaje: `Sigue apartado: ${motivo ?? "su regla"}`,
			},
		};
	}
	if (hecho.entidad !== undefined) {
		await reintentarLosQueEsperaban(dependencias, transaccion, comando.dispositivoId, hecho.entidad.id);
	}
	return {
		resultado: {
			resultado,
			motivo: null,
			excepciones,
			mensaje: resultado === "excepcion" ? "Comando aplicado; abrió una excepción" : "Comando aplicado",
		},
		// La bitácora es la de la acción del comando, con quién lo reintentó.
		sinBitacora: true,
	};
});
