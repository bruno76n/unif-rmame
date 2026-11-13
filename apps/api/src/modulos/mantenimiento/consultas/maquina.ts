/**
 * `mantenimiento.maquina`: el cajón de una máquina. Su estado, lo que costaron sus reparaciones del año, su paro en
 * horas y en pesos, cuántas fallas tuvo en el año; su tipo, marca, modelo, serie y quién la trae; su historial de
 * fallas y servicios, del más reciente al más viejo; su falla abierta (que no deja darla de baja) y su baja.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Cajones»: Máquina) y
 * docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (reglas 1, 6, 7 y 12)
 */

import { maquinaDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	columnasDeQuienReporto,
	costoDeLaHoraDeParo,
	estadoDeMaquina,
	horasDeLasFallasQueDetienen,
	leerMaquinas,
	marcaYModelo,
	serviciosDelAnioPorMaquina,
	unionesDeQuienReporto,
} from "./comun.ts";

/** Lo que regresa la consulta. */
type Resultado = z.infer<typeof maquinaDeMantenimiento.resultado>;

/**
 * El historial de una máquina: sus fallas y sus servicios, del más reciente al más viejo.
 * @param contexto El contexto de la lectura.
 * @param maquinaId La máquina.
 */
async function historialDe(contexto: ContextoDeAccion, maquinaId: string): Promise<Resultado["historial"]> {
	const { rows: deFallas } = await contexto.transaccion.execute(sql`
		SELECT f.folio AS clave, f.fecha::text AS fecha, mf.nombre AS motivo, ${columnasDeQuienReporto}
		FROM fallas f JOIN motivos_falla mf ON mf.id = f.motivo_falla_id ${unionesDeQuienReporto}
		WHERE f.maquina_id = ${maquinaId}::uuid`);
	const { rows: deServicios } = await contexto.transaccion.execute(sql`
		SELECT s.folio AS clave, s.fecha::text AS fecha, s.que_se_hizo, t.nombre AS tecnico, s.costo_centavos, s.horas_paro
		FROM servicios s JOIN tecnicos t ON t.id = s.tecnico_id WHERE s.maquina_id = ${maquinaId}::uuid`);
	const fallas = z
		.array(z.object({ clave: z.string(), fecha: z.string(), motivo: z.string(), reporto: z.string() }))
		.parse(deFallas)
		.map((falla) => ({
			tipo: "falla" as const,
			clave: falla.clave,
			fecha: falla.fecha,
			texto: `Falla: ${falla.motivo.toLocaleLowerCase("es-MX")}, reportó ${falla.reporto}`,
		}));
	const servicios = z
		.array(
			z.object({
				clave: z.string(),
				fecha: z.string(),
				que_se_hizo: z.string(),
				tecnico: z.string(),
				costo_centavos: z.coerce.number(),
				horas_paro: z.number(),
			}),
		)
		.parse(deServicios)
		.map((servicio) => ({ tipo: "servicio" as const, ...servicio }));
	// Del más reciente al más viejo; el mismo día, el folio más nuevo primero.
	return [...fallas, ...servicios].sort((uno, otro) =>
		uno.fecha === otro.fecha ? otro.clave.localeCompare(uno.clave) : otro.fecha.localeCompare(uno.fecha),
	);
}

export const consultaMaquinaDeMantenimiento = implementarConsulta(
	maquinaDeMantenimiento,
	async (contexto, parametros) => ({
		resultado: await contexto.comoAccion(async (accion): Promise<Resultado> => {
			const [maquina] = await leerMaquinas(accion, parametros.maquina_id);
			if (maquina === undefined) throw noExiste();
			const anio = accion.diaDeNegocio.year;
			const servicios = (await serviciosDelAnioPorMaquina(accion, anio)).get(maquina.id);
			// El paro suma las horas de sus servicios del año y las de su falla abierta, si la detuvo (regla 6).
			const horasAbierta =
				maquina.falla_id === null ? 0 : ((await horasDeLasFallasQueDetienen(accion)).get(maquina.falla_id) ?? 0);
			const horas = (servicios?.horas ?? 0) + horasAbierta;
			const { rows } = await accion.transaccion.execute(sql`
			SELECT count(*)::int AS n FROM fallas WHERE maquina_id = ${maquina.id}::uuid AND extract(year from fecha) = ${anio}`);
			return {
				maquina_id: maquina.id,
				version: maquina.version,
				folio: maquina.folio,
				nombre: maquina.nombre,
				area: maquina.area,
				estado: estadoDeMaquina(maquina.detuvo),
				tipo: maquina.tipo,
				marca_modelo: marcaYModelo(maquina),
				serie: maquina.serie,
				la_trae: maquina.persona_id === null ? null : { id: maquina.persona_id, nombre: maquina.la_trae ?? "" },
				reparaciones_centavos: servicios?.costo ?? 0,
				horas_paro: horas,
				paro_centavos: horas * (await costoDeLaHoraDeParo(accion)),
				fallas_en_el_anio: z.object({ n: z.number() }).parse(rows[0]).n,
				historial: await historialDe(accion, maquina.id),
				falla_abierta: maquina.falla_folio,
				dada_de_baja:
					maquina.baja_el_dia === null ? null : { desde: maquina.baja_el_dia, motivo: maquina.motivo_baja ?? "" },
			};
		}),
	}),
);
