/**
 * `patronaje.desarrollos` y `patronaje.desarrollo`: el tablero de los desarrollos de producto (cinco columnas, cómo va
 * cada muestra, los descartados y las opciones de una solicitud nueva) y el cajón de uno, con sus pasos, sus datos, su
 * ficha técnica, su historial y los botones de su etapa. Sin escuela, la aprobación es de Dirección: Patronaje solo
 * puede descartar mientras espera. Sin dinero.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Desarrollo de producto» y el cajón del desarrollo) y
 * docs/modulos/patronaje/desarrollos.md (regla 1)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import {
	type botonesDelDesarrollo,
	desarrolloDePatronaje,
	etapasDelTablero,
	tableroDeDesarrollos,
} from "@uniformame/compartido/contratos/patronaje/tablero-de-desarrollos";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { basicoOGeneral, type DesarrolloLeido, esperaAprobacion, leerDesarrollos, nombresDeEtapa } from "./comun.ts";

/** El color de cada columna del tablero. */
const coloresDeEtapa = {
	solicitud: "gris",
	muestra: "azul",
	aprobacion: "morado",
	ficha_tecnica: "ambar",
	en_catalogo: "verde",
} as const;

/** Los botones de cada etapa (con escuela). */
const botonesDeEtapa: Readonly<Record<DesarrolloLeido["etapa"], readonly (typeof botonesDelDesarrollo)[number][]>> = {
	solicitud: ["descartar", "empezar_muestra"],
	muestra: ["descartar", "entregar_muestra"],
	aprobacion: ["descartar", "pedir_cambios", "aprobo_cliente"],
	ficha_tecnica: ["descartar", "alta_en_catalogo"],
	en_catalogo: ["abrir_receta"],
	cancelado: [],
};

/**
 * Cómo va la muestra: «En costura, talla M», «Con cambios: {motivo}», «Talla 6, entregada el 8 oct», «Aprobada el 22
 * sep»; en la solicitud, nada.
 * @param desarrollo El desarrollo.
 */
function comoVaLaMuestra(desarrollo: DesarrolloLeido): string | null {
	const talla = desarrollo.muestra_talla;
	switch (desarrollo.etapa) {
		case "muestra":
			if (desarrollo.motivo_cambios !== null) return `Con cambios: ${desarrollo.motivo_cambios}`;
			return talla === null ? "En costura" : `En costura, talla ${talla}`;
		case "aprobacion": {
			const como = desarrollo.escuela === null ? "lista" : "entregada";
			const cuando =
				desarrollo.muestra_entregada === null ? "" : ` el ${textoDeDiaCorto(desarrollo.muestra_entregada)}`;
			return talla === null
				? `${como.charAt(0).toUpperCase()}${como.slice(1)}${cuando}`
				: `Talla ${talla}, ${como}${cuando}`;
		}
		case "ficha_tecnica":
		case "en_catalogo":
			return desarrollo.aprobado === null ? null : `Aprobada el ${textoDeDiaCorto(desarrollo.aprobado)}`;
		default:
			return null;
	}
}

/**
 * Para quién es un desarrollo: su escuela con su color, o «Básico o general».
 * @param desarrollo El desarrollo.
 */
function paraQuien(desarrollo: DesarrolloLeido) {
	return { nombre: desarrollo.escuela ?? basicoOGeneral, color: desarrollo.color };
}

export const consultaDesarrollos = implementarConsulta(tableroDeDesarrollos, async (contexto) => {
	const desarrollos = await leerDesarrollos(contexto);
	const { rows: escuelas } = await contexto.base.execute(sql`
		SELECT id AS escuela_id, nombre FROM escuelas WHERE baja_en IS NULL ORDER BY nombre`);
	const { rows: telas } = await contexto.base.execute(sql`
		SELECT id AS material_id, nombre FROM materiales WHERE tipo = 'tela' AND baja_en IS NULL ORDER BY nombre`);
	return {
		resultado: {
			en_proceso: desarrollos.filter((uno) => uno.etapa !== "en_catalogo" && uno.etapa !== "cancelado").length,
			columnas: etapasDelTablero.map((etapa) => ({
				etapa,
				nombre: nombresDeEtapa[etapa],
				color: coloresDeEtapa[etapa],
				tarjetas: desarrollos
					.filter((desarrollo) => desarrollo.etapa === etapa)
					.map((desarrollo) => ({
						desarrollo_id: desarrollo.id,
						folio: desarrollo.folio,
						desde: `desde el ${textoDeDiaCorto(desarrollo.ultimo)}`,
						prenda: desarrollo.prenda,
						para: paraQuien(desarrollo),
						muestra: comoVaLaMuestra(desarrollo),
					})),
			})),
			descartados: desarrollos
				.filter((desarrollo) => desarrollo.etapa === "cancelado")
				.map((desarrollo) => ({
					folio: desarrollo.folio,
					prenda: desarrollo.prenda,
					para: desarrollo.escuela ?? basicoOGeneral,
					desde: textoDeDiaCorto(desarrollo.cancelado ?? desarrollo.ultimo),
					por: desarrollo.cancelo ?? "",
					motivo: desarrollo.motivo_cancelacion ?? "",
				})),
			opciones: {
				escuelas: z.array(z.object({ escuela_id: z.uuid(), nombre: z.string() })).parse(escuelas),
				telas: z.array(z.object({ material_id: z.uuid(), nombre: z.string() })).parse(telas),
			},
		},
	};
});

/** Un paso del historial como sale de la base. */
const dePaso = z.object({
	id: z.uuid(),
	accion: z.string(),
	motivo: z.string().nullable(),
	de_direccion: z.boolean(),
	quien: z.string(),
	dia: z.string(),
});

/**
 * Qué hizo cada paso del historial, como se lee después de quién: «registró la solicitud», «empezó la muestra en talla
 * M», «regresó la muestra con cambios: {motivo}»…
 * @param paso El paso.
 * @param desarrollo Su desarrollo.
 */
function queHizo(paso: z.infer<typeof dePaso>, desarrollo: DesarrolloLeido): string {
	const motivo = paso.motivo === null ? "" : `: ${paso.motivo}`;
	switch (paso.accion) {
		case "solicitud_registrada":
			return "registró la solicitud";
		case "muestra_empezada":
			return desarrollo.muestra_talla === null
				? "empezó la muestra"
				: `empezó la muestra en talla ${desarrollo.muestra_talla}`;
		case "muestra_entregada":
			return desarrollo.escuela === null ? "terminó la muestra para aprobar" : "entregó la muestra al cliente";
		case "cambios_pedidos":
			return paso.de_direccion ? `pidió cambios a la muestra${motivo}` : `regresó la muestra con cambios${motivo}`;
		case "aprobado":
			return paso.de_direccion ? "aprobó la muestra en Dirección" : "registró que el cliente aprobó la muestra";
		case "alta_en_catalogo":
			return "dio de alta el producto en catálogo";
		default:
			return `descartó el desarrollo${motivo}`;
	}
}

/**
 * El historial de un desarrollo, lo más nuevo arriba.
 * @param contexto El contexto de la consulta.
 * @param desarrollo El desarrollo.
 */
async function historial(contexto: ContextoDeConsulta, desarrollo: DesarrolloLeido) {
	const { rows } = await contexto.base.execute(sql`
		SELECT e.id, e.accion, e.motivo, e.autorizacion_id IS NOT NULL AS de_direccion, coalesce(u.nombre, p.nombre, '') AS quien,
			(e.creado_en AT TIME ZONE 'America/Mexico_City')::date::text AS dia
		FROM desarrollo_eventos e LEFT JOIN usuarios u ON u.id = e.creado_por LEFT JOIN personas p ON p.id = u.persona_id
		WHERE e.desarrollo_id = ${desarrollo.id} ORDER BY e.creado_en DESC, e.id DESC`);
	return z
		.array(dePaso)
		.parse(rows)
		.map((paso) => ({
			paso_id: paso.id,
			quien: paso.quien,
			que: queHizo(paso, desarrollo),
			fecha: textoDeDiaCorto(paso.dia),
		}));
}

/**
 * Qué dice la ficha de la receta: la versión del producto con su estado, o que se captura al dar de alta.
 * @param contexto El contexto de la consulta.
 * @param productoId El producto del desarrollo, si ya está en catálogo.
 */
async function recetaDelProducto(contexto: ContextoDeConsulta, productoId: string | null): Promise<string> {
	if (productoId === null) return "Se captura al dar de alta el producto en catálogo";
	const { rows } = await contexto.base.execute(sql`
		SELECT r.estado, v.numero FROM recetas r LEFT JOIN receta_versiones v ON v.id = r.version_vigente_id
		WHERE r.producto_id = ${productoId}`);
	const [receta] = z.array(z.object({ estado: z.string(), numero: z.number().nullable() })).parse(rows);
	if (receta === undefined || receta.numero === null) return "Sin receta";
	return `Versión ${receta.numero}, ${receta.estado === "verificada" ? "verificada" : "sin verificar"}`;
}

export const consultaDesarrollo = implementarConsulta(desarrolloDePatronaje, async (contexto, parametros) => {
	const [desarrollo] = await leerDesarrollos(contexto, parametros.desarrollo_id);
	if (desarrollo === undefined) throw noExiste();
	const conEscuela = desarrollo.escuela !== null;
	const esperandoADireccion = !conEscuela && desarrollo.etapa === "aprobacion";
	return {
		resultado: {
			desarrollo_id: desarrollo.id,
			folio: desarrollo.folio,
			version: desarrollo.version,
			prenda: desarrollo.prenda,
			para: paraQuien(desarrollo),
			con_escuela: conEscuela,
			paso: desarrollo.etapa === "cancelado" ? -1 : etapasDelTablero.indexOf(desarrollo.etapa),
			datos: {
				solicito: textoDeDiaCorto(desarrollo.solicito),
				muestra: comoVaLaMuestra(desarrollo) ?? "Todavía no",
				en_catalogo:
					desarrollo.producto_id === null
						? null
						: { producto_id: desarrollo.producto_id, nombre: desarrollo.producto ?? "" },
			},
			ficha: {
				que_pidieron: desarrollo.descripcion ?? "",
				tela: desarrollo.tela_detalle === null ? desarrollo.tela : `${desarrollo.tela}, ${desarrollo.tela_detalle}`,
				tallas: desarrollo.tallas,
				receta: await recetaDelProducto(contexto, desarrollo.producto_id),
			},
			autorizacion:
				esperandoADireccion && desarrollo.autorizacion !== null
					? `${desarrollo.autorizacion} · ${esperaAprobacion(desarrollo)}`
					: null,
			historial: await historial(contexto, desarrollo),
			// Sin escuela, la aprobación la decide Dirección: Patronaje solo puede descartar mientras espera.
			botones: esperandoADireccion ? ["descartar" as const] : [...botonesDeEtapa[desarrollo.etapa]],
		},
	};
});
