/**
 * `direccion.autorizaciones`: la pantalla de Autorizaciones de Dirección.
 * Fase 7 · docs/interfaz/fabrica/direccion.md («Autorizaciones») y docs/modulos/direccion/autorizaciones.md
 *
 * Las que esperan, de la más vieja a la más nueva, con «Lo pidió {persona}», «Pedida por ti» y si quien ve
 * la puede decidir; los filtros por tipo con su conteo; y las resueltas por páginas, la más reciente arriba.
 * Hasta Personal (fase 7, parte 2) la persona que pidió se nombra con su cuenta.
 */

import {
	autorizaciones as consultaDeAutorizaciones,
	nombreDelTipoDeAutorizacion,
	tiposDeAutorizacion,
} from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { and, asc, count, desc, eq, ne, or, type SQL, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { cursorDe, leerCursor } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { departamentos, usuarios } from "../../admin/tablas.ts";
import { documentoDe } from "../dominio/autorizaciones.ts";
import { autorizaciones } from "../tablas.ts";

/** Cuántas resueltas por página: lo que cabe en la tabla de la pantalla. */
const resueltasPorPagina = 20;

/** Cuándo quedó resuelta: decidida o cancelada. */
const resueltaEn = sql<string>`coalesce(${autorizaciones.decididaEn}, ${autorizaciones.canceladoEn})`;

export const consultaAutorizaciones = implementarConsulta(consultaDeAutorizaciones, async (contexto, parametros) => {
	const { base, quien, ahora } = contexto;
	const usuarioId = quien.tipo === "cuenta" ? quien.usuarioId : undefined;
	const esDuena = quien.tipo === "cuenta" && quien.esDuena;
	const esperando = eq(autorizaciones.estado, "por_autorizar");
	// Los filtros: «Todas» y cada tipo con algo pendiente.
	const conteos = await base
		.select({ tipo: autorizaciones.tipo, cuantas: count() })
		.from(autorizaciones)
		.where(esperando)
		.groupBy(autorizaciones.tipo);
	const cuantasDe = new Map(conteos.map((conteo) => [conteo.tipo, conteo.cuantas]));
	const filtros = [
		{ tipo: null, nombre: "Todas", cuantas: conteos.reduce((suma, conteo) => suma + conteo.cuantas, 0) },
		...tiposDeAutorizacion
			.filter((tipo) => (cuantasDe.get(tipo) ?? 0) > 0)
			.map((tipo) => ({ tipo, nombre: nombreDelTipoDeAutorizacion[tipo], cuantas: cuantasDe.get(tipo) ?? 0 })),
	];
	// Las que esperan.
	const leidas = await base
		.select({
			autorizacion: autorizaciones,
			departamento: departamentos.nombre,
			pidio: sql<string | null>`coalesce(${usuarios.nombre}, ${usuarios.correo})`,
		})
		.from(autorizaciones)
		.innerJoin(departamentos, eq(departamentos.id, autorizaciones.departamentoOrigenId))
		.leftJoin(usuarios, eq(usuarios.id, autorizaciones.creadoPor))
		.where(and(esperando, parametros.tipo === undefined ? undefined : eq(autorizaciones.tipo, parametros.tipo)))
		.orderBy(asc(autorizaciones.creadoEn), asc(autorizaciones.id));
	const porAutorizar = leidas.map(({ autorizacion, departamento, pidio }) => {
		const tipo = z.enum(tiposDeAutorizacion).parse(autorizacion.tipo);
		const soloLaDuena = tipo === "alta_usuario" && !esDuena;
		const pedidaEn = Temporal.Instant.from(new Date(autorizacion.creadoEn).toISOString());
		return {
			id: autorizacion.id,
			folio: autorizacion.folio,
			tipo,
			departamento,
			pedida_en: autorizacion.creadoEn,
			dias_esperando: Math.max(0, Math.floor(pedidaEn.until(ahora).total("hours") / 24)),
			resumen: autorizacion.resumen,
			detalle: autorizacion.detalle,
			importe_centavos: autorizacion.importeCentavos,
			importe_facturado_centavos: autorizacion.importeFacturadoCentavos,
			cantidad: autorizacion.cantidad,
			unidad: autorizacion.unidad,
			pedida_por: pidio,
			pedida_por_ti: usuarioId !== undefined && autorizacion.creadoPor === usuarioId,
			puede_decidir: !soloLaDuena,
			no_puede_porque: soloLaDuena ? "Las cuentas nuevas solo las da la dueña" : null,
			documento_id: documentoDe(autorizacion),
			version: autorizacion.version,
		};
	});
	// Las resueltas, por páginas: la más reciente arriba.
	const desde = leerCursor(parametros.cursor_resueltas);
	const despues: SQL | undefined =
		desde === undefined
			? undefined
			: or(
					sql`${resueltaEn} < ${String(desde.en)}::timestamptz`,
					and(
						sql`${resueltaEn} = ${String(desde.en)}::timestamptz`,
						sql`${autorizaciones.id} < ${String(desde.id)}::uuid`,
					),
				);
	const resueltas = await base
		.select({ autorizacion: autorizaciones, en: sql<string>`${resueltaEn}::text` })
		.from(autorizaciones)
		.where(and(ne(autorizaciones.estado, "por_autorizar"), despues))
		.orderBy(desc(resueltaEn), desc(autorizaciones.id))
		.limit(resueltasPorPagina + 1);
	const pagina = resueltas.slice(0, resueltasPorPagina);
	const ultima = pagina.at(-1);
	const hayMas = resueltas.length > resueltasPorPagina;
	return {
		resultado: {
			filtros,
			por_autorizar: porAutorizar,
			resueltas: pagina.map(({ autorizacion, en }) => ({
				id: autorizacion.id,
				folio: autorizacion.folio,
				tipo: z.enum(tiposDeAutorizacion).parse(autorizacion.tipo),
				resuelta_en: en,
				resumen: autorizacion.resumen,
				detalle: autorizacion.detalle,
				resultado: z.enum(["autorizada", "rechazada", "cancelada"]).parse(autorizacion.estado),
				motivo: autorizacion.motivoRechazo ?? autorizacion.motivoCancelacion,
				misma_persona: autorizacion.mismaPersona === true,
			})),
			cursor_resueltas: hayMas && ultima !== undefined ? cursorDe({ en: ultima.en, id: ultima.autorizacion.id }) : null,
			hay_mas_resueltas: hayMas,
		},
	};
});
