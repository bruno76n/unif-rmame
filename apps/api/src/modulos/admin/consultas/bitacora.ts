/**
 * `admin.bitacora`: la pestaña Bitácora, solo para leer.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Bitácora») y docs/modulos/admin/bitacora.md
 *
 * Lo más reciente arriba, por páginas. El buscador compara sin acentos ni mayúsculas contra quién, el departamento y
 * lo que pasó (con `sin_acentos`, la función de la base que usa su índice). Sin «ven sueldos y tarifas», el renglón
 * sensible llega con su descripción recortada, y el buscador busca en esa: un monto tapado no se encuentra. A la cuenta
 * de soporte le llega sin ningún monto («$••••»), porque nunca recibe uno.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { bitacoraDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-bitacora";
import { and, count, desc, eq, gte, lt, or, type SQL, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { esLaDuena, veSueldosYTarifas } from "../../../nucleo/acceso/quien.ts";
import { leerCursor, paginar } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { bitacora, departamentos, dispositivos, usuarios } from "../tablas.ts";
import {
	alertaRevisada,
	diaDe,
	horaDe,
	inicioDelDia,
	personaDeLaBitacora,
	personaDelRenglon,
	quienEnLaBitacora,
	sinMontosEnLaBase,
} from "./comun.ts";

/** Cuántos renglones por página si no se pide otro número. */
const porPagina = 50;

/** Cómo se lee cada tipo. */
const textoDelTipo = { cambio: "Cambios", acceso: "Accesos", consulta_sensible: "Consultas sensibles" } as const;

/**
 * Lee el tipo de un renglón como lo conoce el contrato.
 * @param tipo El de la base.
 */
function tipoDe(tipo: string): keyof typeof textoDelTipo {
	return tipo === "acceso" || tipo === "consulta_sensible" ? tipo : "cambio";
}

export const consultaBitacora = implementarConsulta(bitacoraDeAdmin, async ({ base, quien }, parametros) => {
	const veSueldos = veSueldosYTarifas(quien);
	// Lo que ve quien pregunta: sin el permiso, la descripción sin los montos de sueldos; la cuenta de soporte, sin
	// ningún monto.
	const conSueldos: SQL<string> = veSueldos
		? sql<string>`${bitacora.descripcion}`
		: sql<string>`case when ${bitacora.sensibleSueldos} then coalesce(${bitacora.descripcionRecortada}, '••••') else ${bitacora.descripcion} end`;
	const descripcion = quien.tipo === "cuenta" && quien.esSoporte ? sinMontosEnLaBase(conSueldos) : conSueldos;
	const texto = parametros.buscar ?? "";
	const buscado: SQL | undefined =
		texto === ""
			? undefined
			: sql`sin_acentos(concat_ws(' ', ${quienEnLaBitacora}, ${departamentos.nombre}, ${descripcion})) ilike '%' || sin_acentos(${texto}) || '%'`;
	const desde = parametros.desde === undefined ? undefined : gte(bitacora.ocurridoEn, inicioDelDia(parametros.desde));
	const hasta =
		parametros.hasta === undefined
			? undefined
			: lt(bitacora.ocurridoEn, inicioDelDia(Temporal.PlainDate.from(parametros.hasta).add({ days: 1 })));
	const comunes = and(buscado, desde, hasta);
	// Los conteos de los filtros van con lo buscado y las fechas, sin el filtro de tipo.
	const porTipo = await base
		.select({ tipo: bitacora.tipo, alerta: bitacora.esAlerta, cuantos: count() })
		.from(bitacora)
		.leftJoin(usuarios, eq(usuarios.id, bitacora.usuarioId))
		.leftJoin(dispositivos, eq(dispositivos.id, bitacora.dispositivoId))
		.leftJoin(personaDeLaBitacora, personaDelRenglon)
		.leftJoin(departamentos, eq(departamentos.id, bitacora.departamentoId))
		.where(comunes)
		.groupBy(bitacora.tipo, bitacora.esAlerta);
	const sumar = (cumple: (renglon: (typeof porTipo)[number]) => boolean) =>
		porTipo.filter(cumple).reduce((suma, renglon) => suma + renglon.cuantos, 0);
	const posicion = leerCursor(parametros.cursor);
	const despues: SQL | undefined =
		posicion === undefined
			? undefined
			: or(
					lt(bitacora.ocurridoEn, String(posicion.ocurrido_en)),
					and(eq(bitacora.ocurridoEn, String(posicion.ocurrido_en)), lt(bitacora.id, String(posicion.id))),
				);
	const limite = parametros.limite ?? porPagina;
	// La página, con quién, su persona y su departamento (los mismos que usa el buscador).
	const leidos = await base
		.select({
			id: bitacora.id,
			ocurridoEn: bitacora.ocurridoEn,
			tipo: bitacora.tipo,
			esAlerta: bitacora.esAlerta,
			revisada: alertaRevisada,
			quien: quienEnLaBitacora,
			departamento: departamentos.nombre,
			descripcion,
			folio: bitacora.entidadFolio,
		})
		.from(bitacora)
		.leftJoin(usuarios, eq(usuarios.id, bitacora.usuarioId))
		.leftJoin(dispositivos, eq(dispositivos.id, bitacora.dispositivoId))
		.leftJoin(personaDeLaBitacora, personaDelRenglon)
		.leftJoin(departamentos, eq(departamentos.id, bitacora.departamentoId))
		.where(
			and(
				comunes,
				parametros.tipo === undefined ? undefined : eq(bitacora.tipo, parametros.tipo),
				parametros.solo_alertas === "si" ? eq(bitacora.esAlerta, true) : undefined,
				despues,
			),
		)
		.orderBy(desc(bitacora.ocurridoEn), desc(bitacora.id))
		.limit(limite + 1);
	const pagina = paginar(leidos, limite, (renglon) => ({ ocurrido_en: renglon.ocurridoEn, id: renglon.id }));
	return {
		resultado: {
			es_duena: esLaDuena(quien),
			conteos: {
				todo: sumar(() => true),
				cambio: sumar((renglon) => renglon.tipo === "cambio"),
				acceso: sumar((renglon) => renglon.tipo === "acceso"),
				consulta_sensible: sumar((renglon) => renglon.tipo === "consulta_sensible"),
				alertas: sumar((renglon) => renglon.alerta),
			},
			...pagina,
			renglones: pagina.renglones.map((renglon) => ({
				id: renglon.id,
				fecha: textoDeDiaCorto(diaDe(renglon.ocurridoEn)),
				hora: horaDe(renglon.ocurridoEn),
				tipo: tipoDe(renglon.tipo),
				tipo_texto: textoDelTipo[tipoDe(renglon.tipo)],
				es_alerta: renglon.esAlerta,
				revisada: renglon.revisada,
				quien: renglon.quien,
				departamento: renglon.departamento,
				descripcion: renglon.descripcion,
				folio: renglon.folio,
			})),
		},
	};
});
