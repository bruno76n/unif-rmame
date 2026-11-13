/**
 * `admin.historial_entidad`: el historial de un documento en su cajón, de su bitácora.
 * Fase 19 · docs/interfaz/comunes.md («`admin.historial_entidad`») y docs/modulos/admin/bitacora.md
 *
 * Lo ve quien lee la tabla del documento (los lectores que declara su módulo dueño) y la dueña. Los montos no viajan
 * a quien solo tiene Aduana o Bodega, y los sueldos los quita el recorte común: el renglón sensible llega con su
 * descripción tapada.
 */

import { historialEntidad } from "@uniformame/compartido/contratos/admin/armazon";
import { and, desc, eq, lt, or, type SQL, sql } from "drizzle-orm";
import { veSueldosYTarifas } from "../../../nucleo/acceso/quien.ts";
import { cursorDe, leerCursor } from "../../../nucleo/http/consultas.ts";
import { ErrorDeApi, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { personas } from "../../personal/tablas.ts";
import { bitacora, departamentos, dispositivos, usuarios } from "../tablas.ts";

/** Cuántos renglones por página si no se pide otro número. */
const porPagina = 20;

/** Los departamentos que nunca ven montos (ver docs/cimientos/ACCESO-Y-PERMISOS.md). */
const sinMontos = ["aduana", "bodega"];

/**
 * Quita a cualquier profundidad los campos de montos (`*_centavos`).
 * @param valor El antes o el después de un renglón.
 */
function sinCentavos(valor: unknown): unknown {
	if (Array.isArray(valor)) return valor.map(sinCentavos);
	if (typeof valor !== "object" || valor === null) return valor;
	return Object.fromEntries(
		Object.entries(valor).flatMap(([campo, adentro]) =>
			campo.endsWith("_centavos") ? [] : [[campo, sinCentavos(adentro)]],
		),
	);
}

/** Un antes o un después: un objeto, o nada. */
function comoObjeto(valor: unknown): Record<string, unknown> | null {
	return typeof valor === "object" && valor !== null && !Array.isArray(valor)
		? Object.fromEntries(Object.entries(valor))
		: null;
}

export const consultaHistorialEntidad = implementarConsulta(
	historialEntidad,
	async ({ base, quien, registro }, parametros) => {
		if (quien.tipo !== "cuenta") throw noExiste();
		const lectores = registro.lectores.get(parametros.entidad);
		if (lectores === undefined) throw noExiste();
		if (!quien.esDuena && !lectores.some((departamento) => quien.departamentos.includes(departamento))) {
			throw new ErrorDeApi("sin_permiso", "sin_departamento");
		}
		const veMontos = quien.esDuena || quien.departamentos.some((departamento) => !sinMontos.includes(departamento));
		const veSueldos = veSueldosYTarifas(quien);
		const posicion = leerCursor(parametros.cursor);
		const despues: SQL | undefined =
			posicion === undefined
				? undefined
				: or(
						lt(bitacora.ocurridoEn, String(posicion.ocurrido_en)),
						and(eq(bitacora.ocurridoEn, String(posicion.ocurrido_en)), lt(bitacora.id, String(posicion.id))),
					);
		const limite = parametros.limite ?? porPagina;
		const leidos = await base
			.select({
				id: bitacora.id,
				ocurridoEn: bitacora.ocurridoEn,
				quien: sql<string>`coalesce(${personas.nombre}, ${usuarios.nombre}, ${usuarios.correo}, ${dispositivos.nombre}, 'El sistema')`,
				departamento: departamentos.nombre,
				descripcion: bitacora.descripcion,
				descripcionRecortada: bitacora.descripcionRecortada,
				sensible: bitacora.sensibleSueldos,
				antes: bitacora.antes,
				despues: bitacora.despues,
			})
			.from(bitacora)
			.leftJoin(usuarios, eq(usuarios.id, bitacora.usuarioId))
			.leftJoin(personas, eq(personas.id, sql`coalesce(${bitacora.personaId}, ${usuarios.personaId})`))
			.leftJoin(dispositivos, eq(dispositivos.id, bitacora.dispositivoId))
			.leftJoin(departamentos, eq(departamentos.id, bitacora.departamentoId))
			.where(and(eq(bitacora.entidad, parametros.entidad), eq(bitacora.entidadId, parametros.entidad_id), despues))
			.orderBy(desc(bitacora.ocurridoEn), desc(bitacora.id))
			.limit(limite + 1);
		const pagina = leidos.slice(0, limite);
		const ultimo = pagina.at(-1);
		const recortar = (valor: unknown) => comoObjeto(veMontos ? valor : sinCentavos(valor));
		return {
			resultado: {
				renglones: pagina.map((renglon) => ({
					ocurrido_en: new Date(renglon.ocurridoEn).toISOString(),
					quien: renglon.quien,
					departamento: renglon.departamento,
					descripcion:
						renglon.sensible && !veSueldos
							? (renglon.descripcionRecortada ?? renglon.descripcion)
							: renglon.descripcion,
					antes: recortar(renglon.antes),
					despues: recortar(renglon.despues),
				})),
				cursor:
					leidos.length > limite && ultimo !== undefined
						? cursorDe({ ocurrido_en: ultimo.ocurridoEn, id: ultimo.id })
						: null,
				hay_mas: leidos.length > limite,
			},
		};
	},
);
