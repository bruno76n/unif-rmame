/**
 * `admin.aplicar_comando_retenido`: la dueña aplica lo que llegó de un aparato revocado y pasó antes de revocarlo.
 * Fase 9 · docs/modulos/admin/dispositivos.md («`admin.aplicar_comando_retenido`») y
 * docs/modulos/inventario/excepciones.md («`inventario.marcar_excepcion_resuelta`»)
 *
 * Corre la carga guardada por el camino de la subida, a nombre del aparato revocado, con su hora, su persona y su
 * código. La bitácora es la de la acción del comando, con «retenido de {aparato} revocado; aplicado por {nombre}»;
 * la excepción queda resuelta. Si le falta su documento, queda apartado y sigue retenido.
 */

import { aplicarComandoRetenido } from "@uniformame/compartido/contratos/admin/dispositivos";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion, type RenglonDeBitacora } from "../../../nucleo/modulos.ts";
import { aplicarRetenido, leerRetenido } from "../../../nucleo/sincronizacion/comandos.ts";
import { excepciones } from "../../inventario/tablas.ts";
import { cuentaQueLlama, leerCuenta, nombreDeCuenta } from "../dominio/cuentas.ts";

export const accionAplicarComandoRetenido = implementarAccion(
	aplicarComandoRetenido,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		const usuarioId = cuentaQueLlama(contexto);
		const nombre = nombreDeCuenta(await leerCuenta(transaccion, usuarioId));
		const retenido = await leerRetenido(transaccion, datos.comando_id);
		if (retenido === "no_existe") throw noExiste();
		if (retenido === "no_retenido") throw errorDeRegla("no_retenido", "Ese comando no está retenido.");
		if (retenido === "ya_aplicado") throw errorDeRegla("ya_aplicado", "Ese movimiento ya se aplicó.");
		// La versión que se leyó es la de la excepción.
		await tomarVersion(contexto, excepciones, retenido.excepcionId, version, async () => ({
			excepcion_id: retenido.excepcionId,
		}));
		const nota = `retenido de ${retenido.nombreDelAparato} revocado; aplicado por ${nombre}`;
		const ajustar = (renglon: RenglonDeBitacora): RenglonDeBitacora => ({
			...renglon,
			despues:
				typeof renglon.despues === "object" && renglon.despues !== null && !Array.isArray(renglon.despues)
					? { ...renglon.despues, retenido: nota }
					: { retenido: nota },
		});
		const hecho = await aplicarRetenido(
			{
				registro: contexto.registro,
				servicios: { escribirBitacora: escribirBitacoraConAdmin, guardarEventos: guardarEventosConAdmin },
				...(contexto.almacen === undefined ? {} : { almacen: contexto.almacen }),
			},
			transaccion,
			retenido,
			usuarioId,
			ajustar,
		);
		const { resultado, motivo, excepciones: abiertas } = hecho.respuesta;
		if (resultado === "apartado" || resultado === "repetido") {
			contexto.bitacora({
				descripcion: `Intentó aplicar un movimiento retenido de ${retenido.nombreDelAparato} (${retenido.tipoComando}): queda apartado por ${motivo ?? "su regla"}`,
				entidad: "comandos_recibidos",
				entidadId: retenido.id,
			});
			return {
				resultado: {
					resultado: "apartado" as const,
					motivo,
					excepciones: abiertas,
					mensaje: `Sigue retenido: ${motivo ?? "su regla"}`,
				},
			};
		}
		await contexto.interna("inventario.marcar_excepcion_resuelta", {
			excepcion_id: retenido.excepcionId,
			resolucion: "Se aplicó el movimiento retenido",
			resuelta_por: usuarioId,
		});
		return {
			resultado: {
				resultado,
				motivo: null,
				excepciones: abiertas,
				mensaje: `Movimiento de ${retenido.nombreDelAparato} aplicado: ${retenido.tipoComando}`,
			},
			// La bitácora es la de la acción del comando, con quién lo aplicó.
			sinBitacora: true,
		};
	},
);
