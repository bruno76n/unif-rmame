/**
 * `mantenimiento.costo_por_maquina`: lo gastado contra lo parado de cada máquina en el año. Por máquina con gasto o paro:
 * cuántos servicios, quién la trae, lo que costaron sus reparaciones y su paro en horas y en pesos; de la que más cuesta
 * (reparaciones más paro en pesos) a la que menos, con los totales.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Costo por máquina») y
 * docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (reglas 6 y 7)
 *
 * El paro de una máquina suma las horas de sus servicios del año y las de su falla abierta, si la detuvo. El costo de la
 * hora es `mantenimiento.costo_hora_paro`, o el que se escribe en la pantalla (mayor que 0), que no se guarda.
 */

import { costoPorMaquina } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { costoDeLaHoraDeParo, horasDeLasFallasQueDetienen, leerMaquinas, serviciosDelAnioPorMaquina } from "./comun.ts";

export const consultaCostoPorMaquina = implementarConsulta(costoPorMaquina, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const deConfiguracion = await costoDeLaHoraDeParo(accion);
		// Con 0 o sin escribir, la pantalla regresa al costo de Configuración.
		const costoHora =
			parametros.costo_hora_centavos === undefined || parametros.costo_hora_centavos === 0
				? deConfiguracion
				: parametros.costo_hora_centavos;
		const servicios = await serviciosDelAnioPorMaquina(accion, accion.diaDeNegocio.year);
		const horasAbiertas = await horasDeLasFallasQueDetienen(accion);
		const maquinas = (await leerMaquinas(accion))
			.map((maquina) => {
				const suyos = servicios.get(maquina.id) ?? { servicios: 0, costo: 0, horas: 0 };
				const horas = suyos.horas + (maquina.falla_id === null ? 0 : (horasAbiertas.get(maquina.falla_id) ?? 0));
				return {
					maquina_id: maquina.id,
					nombre: maquina.nombre,
					servicios: suyos.servicios,
					la_trae: maquina.la_trae,
					reparaciones_centavos: suyos.costo,
					horas_paro: horas,
					paro_centavos: horas * costoHora,
				};
			})
			.filter((maquina) => maquina.reparaciones_centavos > 0 || maquina.horas_paro > 0)
			.sort(
				(una, otra) =>
					otra.reparaciones_centavos + otra.paro_centavos - (una.reparaciones_centavos + una.paro_centavos),
			);
		const horasParo = maquinas.reduce((suma, maquina) => suma + maquina.horas_paro, 0);
		return {
			costo_hora_centavos: costoHora,
			costo_hora_configuracion_centavos: deConfiguracion,
			reparaciones_centavos: maquinas.reduce((suma, maquina) => suma + maquina.reparaciones_centavos, 0),
			horas_paro: horasParo,
			paro_centavos: horasParo * costoHora,
			maquinas,
		};
	}),
}));
