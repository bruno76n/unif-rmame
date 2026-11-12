/**
 * Lo que comparten las acciones de Mantenimiento: quién puede traer una máquina, el área, el prefijo de un tipo nuevo,
 * la máquina bloqueada y el técnico.
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (reglas 2, 3, 8 y 12)
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { listas, listaValores } from "../../admin/tablas.ts";
import { personas } from "../../personal/tablas.ts";
import { listaDeAreas } from "../siembra.ts";
import { maquinas, tecnicos, tiposMaquina } from "../tablas.ts";

/**
 * Una persona activa del Taller, para traer una máquina.
 * @returns Su nombre.
 * @throws `422 persona_no_valida`: «¿Quién la trae?».
 */
export async function personaQueLaTrae(contexto: ContextoDeAccion, personaId: string): Promise<string> {
	const [persona] = await contexto.transaccion
		.select({ nombre: personas.nombre })
		.from(personas)
		.where(and(eq(personas.id, personaId), eq(personas.area, "taller"), isNull(personas.bajaEn)));
	if (persona === undefined) throw errorDeRegla("persona_no_valida", "¿Quién la trae?");
	return persona.nombre;
}

/**
 * Un área vigente de la lista «Áreas del taller».
 * @returns Su nombre.
 * @throws `400` «Escoge el área.».
 */
export async function areaDelTaller(contexto: ContextoDeAccion, areaId: string): Promise<string> {
	const [area] = await contexto.transaccion
		.select({ nombre: listaValores.nombre })
		.from(listaValores)
		.innerJoin(listas, eq(listas.id, listaValores.listaId))
		.where(and(eq(listaValores.id, areaId), eq(listas.clave, listaDeAreas), isNull(listaValores.bajaEn)));
	if (area === undefined) throw errorDeCampo("area_id", "Escoge el área.");
	return area.nombre;
}

/**
 * Las letras de un nombre, en mayúsculas y sin acentos.
 * @param nombre El nombre del tipo.
 */
function letrasDe(nombre: string): string {
	return nombre
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/[^A-Z ]/g, "");
}

/**
 * Los prefijos que puede tomar un tipo nuevo, en orden: sus iniciales y, si chocan, las iniciales con la siguiente
 * letra del nombre, una a la vez (regla 3, decisión 626).
 * @param nombre El nombre del tipo.
 */
export function prefijosDe(nombre: string): string[] {
	const palabras = letrasDe(nombre)
		.split(" ")
		.filter((palabra) => palabra.length > 0);
	const iniciales = palabras.map((palabra) => palabra[0]).join("");
	const resto = palabras.join("").slice(1);
	const posibles = [iniciales];
	for (const letra of resto) {
		const siguiente = `${posibles.at(-1) ?? ""}${letra}`;
		if (siguiente.length > 6) break;
		posibles.push(siguiente);
	}
	return posibles.filter((prefijo) => prefijo.length > 0);
}

/**
 * El tipo de la máquina: el escogido, o el nuevo de «Otro tipo». Un nombre que ya existe usa ese tipo; uno nuevo toma
 * el primer prefijo que no choca.
 * @returns El tipo y su prefijo.
 * @throws `400` «Escoge el tipo.» o «Escribe el tipo.».
 */
export async function tipoDeLaMaquina(
	contexto: ContextoDeAccion,
	datos: { tipo_maquina_id?: string | undefined; tipo_nuevo?: string | undefined },
): Promise<{ id: string; prefijo: string }> {
	const { transaccion } = contexto;
	if (datos.tipo_maquina_id !== undefined) {
		const [tipo] = await transaccion
			.select({ id: tiposMaquina.id, prefijo: tiposMaquina.prefijo })
			.from(tiposMaquina)
			.where(and(eq(tiposMaquina.id, datos.tipo_maquina_id), isNull(tiposMaquina.bajaEn)));
		if (tipo === undefined) throw errorDeCampo("tipo_maquina_id", "Escoge el tipo.");
		return tipo;
	}
	const nombre = datos.tipo_nuevo;
	if (nombre === undefined) throw errorDeCampo("tipo_maquina_id", "Escoge el tipo.");
	// Un candado por tipos: dos altas con tipos nuevos no toman el mismo prefijo.
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('mantenimiento.tipos_maquina', 0))`);
	const [existe] = await transaccion
		.select({ id: tiposMaquina.id, prefijo: tiposMaquina.prefijo })
		.from(tiposMaquina)
		.where(sql`lower(${tiposMaquina.nombre}) = lower(${nombre})`);
	if (existe !== undefined) return existe;
	const usados = new Set(
		(await transaccion.select({ prefijo: tiposMaquina.prefijo }).from(tiposMaquina)).map((t) => t.prefijo),
	);
	const prefijo = prefijosDe(nombre).find((posible) => !usados.has(posible));
	if (prefijo === undefined) throw errorDeCampo("tipo_nuevo", "Escribe el tipo.");
	const id = uuidv7();
	await transaccion.insert(tiposMaquina).values({ id, nombre, prefijo, creadoPor: quienCambia(contexto) });
	return { id, prefijo };
}

/** Una máquina bloqueada, con su folio, su nombre, su baja y quién la trae. */
export async function maquinaBloqueada(contexto: ContextoDeAccion, maquinaId: string) {
	const [maquina] = await contexto.transaccion
		.select({
			id: maquinas.id,
			folio: maquinas.folio,
			nombre: maquinas.nombre,
			bajaEn: maquinas.bajaEn,
			personaId: maquinas.personaId,
		})
		.from(maquinas)
		.where(eq(maquinas.id, maquinaId))
		.for("update");
	if (maquina === undefined) throw noExiste();
	return maquina;
}

/**
 * El técnico de una reparación: el de la lista, o uno nuevo de «Otro técnico» que se queda en ella (si ya existe sin
 * importar mayúsculas, se usa ese).
 * @returns Su id y su nombre.
 * @throws `400` «Escoge el técnico.»; `422 tecnico_de_baja`.
 */
export async function tecnicoDe(
	contexto: ContextoDeAccion,
	datos: { tecnico_id?: string | undefined; tecnico_nombre?: string | undefined },
): Promise<{ id: string; nombre: string }> {
	const { transaccion } = contexto;
	if (datos.tecnico_id !== undefined) {
		const [tecnico] = await transaccion
			.select({ id: tecnicos.id, nombre: tecnicos.nombre, bajaEn: tecnicos.bajaEn })
			.from(tecnicos)
			.where(eq(tecnicos.id, datos.tecnico_id));
		if (tecnico === undefined || tecnico.bajaEn !== null) throw errorDeRegla("tecnico_de_baja", "Escoge el técnico.");
		return tecnico;
	}
	if (datos.tecnico_nombre === undefined) throw errorDeCampo("tecnico_id", "Escoge el técnico.");
	const id = uuidv7();
	await transaccion
		.insert(tecnicos)
		.values({ id, nombre: datos.tecnico_nombre, creadoPor: quienCambia(contexto) })
		.onConflictDoNothing();
	const [tecnico] = await transaccion
		.select({ id: tecnicos.id, nombre: tecnicos.nombre, bajaEn: tecnicos.bajaEn })
		.from(tecnicos)
		.where(sql`lower(${tecnicos.nombre}) = lower(${datos.tecnico_nombre})`);
	if (tecnico === undefined || tecnico.bajaEn !== null) throw errorDeRegla("tecnico_de_baja", "Escoge el técnico.");
	return tecnico;
}
