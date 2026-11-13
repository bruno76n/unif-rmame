/**
 * `personal.persona`: el cajón de una persona, o los valores del alta.
 * Fase 7 · docs/interfaz/fabrica/personal.md («La persona y «Nueva persona»») y docs/modulos/personal/personas.md
 *
 * Abrir la ficha de una persona deja en la bitácora «Consultó la ficha de {persona}» (consulta sensible).
 * El pago por día solo viaja con «ven sueldos y tarifas»: el recorte común se lo quita a quien no lo tiene.
 * Fase 19 · lo que pide el cajón: las tiendas para el área, si la cuenta ve sueldos, y de una persona que existe su
 * semana (sus días de asistencia, contados por `personal.asistencia_para_nomina`, y sus piezas buenas de los registros
 * vigentes desde el primer día de trabajo) y si puede tener PIN y lo tiene.
 */

import {
	areas,
	persona as consultaDePersona,
	formasDePago,
	rolesDeTienda,
} from "@uniformame/compartido/contratos/personal/personas";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { veSueldosYTarifas } from "../../../nucleo/acceso/quien.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarConsulta } from "../../../nucleo/modulos.ts";
import { diasDeTrabajo, formasConAsistencia, semanaDe } from "../dominio/asistencia.ts";
import { type Persona, tieneCuenta } from "../dominio/personas.ts";
import { porDondeEntran } from "../lecturas/entra-al-sistema.ts";
import { asistenciaSemanas, personas, pines } from "../tablas.ts";
import { tiendasParaEscoger } from "./comun.ts";

/** Lo que regresa `personal.asistencia_para_nomina`: los días contados de cada quien. */
const asistenciaLeida = z.object({ personas: z.array(z.object({ persona_id: z.uuid(), dias: z.number() })) });

/**
 * Los días de la semana que corre de quien lleva asistencia: los que cuenta la nómina; sin semana abierta, 0.
 * @param accion El contexto de lectura.
 * @param persona La persona.
 * @param semana La semana que corre.
 * @returns Vacío si cobra por pieza.
 */
async function diasDeLaSemana(
	accion: ContextoDeAccion,
	persona: Persona,
	semana: ReturnType<typeof semanaDe>,
): Promise<number | null> {
	if (!formasConAsistencia.includes(persona.formaPago)) return null;
	const [guardada] = await accion.transaccion
		.select({ id: asistenciaSemanas.id })
		.from(asistenciaSemanas)
		.where(
			and(
				gte(asistenciaSemanas.fechaInicio, semana.inicio.toString()),
				lte(asistenciaSemanas.fechaInicio, semana.fin.toString()),
			),
		);
	if (guardada === undefined) return 0;
	const leida = asistenciaLeida.parse(
		await accion.lectura("personal.asistencia_para_nomina", { asistencia_semana_id: guardada.id }),
	);
	return leida.personas.find((suya) => suya.persona_id === persona.id)?.dias ?? 0;
}

/**
 * Sus piezas buenas de esta semana, de sus registros vigentes (también los del corte), desde el primer día de trabajo
 * hasta hoy: como las cuenta Producción por persona.
 * @param accion El contexto de lectura.
 * @param persona La persona.
 * @param semana La semana que corre.
 * @returns Vacío fuera del Taller.
 */
async function piezasDeLaSemana(
	accion: ContextoDeAccion,
	persona: Persona,
	semana: ReturnType<typeof semanaDe>,
): Promise<number | null> {
	if (persona.area !== "taller") return null;
	const { rows } = await accion.transaccion.execute(sql`
		SELECT coalesce(sum(piezas_buenas), 0)::int AS piezas FROM registros_operacion
		WHERE persona_id = ${persona.id} AND estado = 'vigente'
			AND fecha >= ${semana.inicio.toString()}::date AND fecha <= ${accion.diaDeNegocio.toString()}::date`);
	return z.object({ piezas: z.number().int() }).parse(rows[0]).piezas;
}

/**
 * Si puede tener PIN (activa, del Taller y sin cuenta viva) y si tiene uno vivo.
 * @param accion El contexto de lectura.
 * @param persona La persona.
 */
async function suTablet(accion: ContextoDeAccion, persona: Persona) {
	const vivos = await accion.transaccion
		.select({ id: pines.id })
		.from(pines)
		.where(and(sql`${pines.personaId} = ${persona.id}`, inArray(pines.estado, ["activo", "bloqueado"])));
	const puede =
		persona.bajaEn === null && persona.area === "taller" && !(await tieneCuenta(accion.transaccion, persona.id));
	return { puede, tiene: puede && vivos.length > 0 };
}

export const consultaPersona = implementarConsulta(consultaDePersona, async (contexto, parametros) => {
	if (parametros.persona_id === undefined) {
		// Los valores del alta: del Taller, por pieza, con ingreso hoy.
		return {
			resultado: {
				id: null,
				folio: null,
				nombre: "",
				area: "taller" as const,
				ubicacion_id: null,
				rol_tienda: null,
				puesto: "",
				forma_pago: "pieza" as const,
				pago_dia_centavos: null,
				fecha_ingreso: contexto.diaDeNegocio.toString(),
				baja_en: null,
				motivo_baja: null,
				entra_al_sistema: null,
				version: null,
				esta_semana: null,
				tablet: null,
				tiendas: await tiendasParaEscoger(contexto.base),
				ve_sueldos: veSueldosYTarifas(contexto.quien),
			},
		};
	}
	const [persona] = await contexto.base.select().from(personas).where(eq(personas.id, parametros.persona_id));
	if (persona === undefined) throw noExiste();
	await contexto.apuntarConsultaSensible({
		descripcion: `Consultó la ficha de ${persona.nombre}`,
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
	});
	const entran = await porDondeEntran(contexto.base, [persona.id]);
	const extra = await contexto.comoAccion(async (accion) => {
		const semana = semanaDe(accion.diaDeNegocio, await diasDeTrabajo(accion));
		return {
			esta_semana: {
				dias: await diasDeLaSemana(accion, persona, semana),
				piezas: await piezasDeLaSemana(accion, persona, semana),
			},
			tablet: await suTablet(accion, persona),
		};
	});
	return {
		resultado: {
			id: persona.id,
			folio: persona.folio,
			nombre: persona.nombre,
			area: z.enum(areas).parse(persona.area),
			ubicacion_id: persona.ubicacionId,
			rol_tienda: z.enum(rolesDeTienda).nullable().parse(persona.rolTienda),
			puesto: persona.puesto,
			forma_pago: z.enum(formasDePago).parse(persona.formaPago),
			pago_dia_centavos: persona.pagoDiaCentavos,
			fecha_ingreso: persona.fechaIngreso,
			baja_en: persona.bajaEn,
			motivo_baja: persona.motivoBaja,
			entra_al_sistema: entran.get(persona.id) ?? null,
			version: persona.version,
			...extra,
			tiendas: await tiendasParaEscoger(contexto.base),
			ve_sueldos: veSueldosYTarifas(contexto.quien),
		},
	};
});
