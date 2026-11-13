/**
 * Lo que comparten las consultas de las pantallas de Administración del sistema: cómo se escribe un momento (la hora,
 * el día con la hora, la última entrada), el área de una persona, el inicio de un día de negocio, el nombre de quien
 * hizo algo en la bitácora, cuándo una alerta sigue sin revisar, las altas de usuario por confirmar y cómo se tapan los
 * montos escritos en la descripción de un renglón de la bitácora.
 * Fase 19 · docs/interfaz/fabrica/administracion.md y docs/modulos/admin/bitacora.md («`admin.marcar_alerta_revisada`»)
 */

import { textoDeDiaCorto, zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { and, asc, eq, not, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Temporal } from "temporal-polyfill";
import type { Base } from "../../../nucleo/base/conexion.ts";
import { autorizaciones } from "../../direccion/tablas.ts";
import { personas } from "../../personal/tablas.ts";
import { bitacora, dispositivos, usuarios } from "../tablas.ts";

/**
 * Un momento de la base (`2026-11-09 16:42:00+00`) como instante.
 * @param momento Como lo da la base, o en ISO.
 */
export function instanteDe(momento: string): Temporal.Instant {
	return Temporal.Instant.from(new Date(momento).toISOString());
}

/**
 * Un momento en hora de México.
 * @param momento Como lo da la base, o en ISO.
 */
function enMexico(momento: string): Temporal.ZonedDateTime {
	return instanteDe(momento).toZonedDateTimeISO(zonaDelNegocio);
}

/**
 * La hora de un momento, en hora de México: «7:58», «18:20».
 * @param momento Como lo da la base, o en ISO.
 */
export function horaDe(momento: string): string {
	const hora = enMexico(momento);
	return `${hora.hour}:${String(hora.minute).padStart(2, "0")}`;
}

/**
 * El día de negocio de un momento en ISO («2026-11-09»), en hora de México.
 * @param momento Como lo da la base, o en ISO.
 */
export function diaDe(momento: string): string {
	return enMexico(momento).toPlainDate().toString();
}

/**
 * El día corto y la hora de un momento: «9 nov · 10:42».
 * @param momento Como lo da la base, o en ISO.
 */
export function diaYHora(momento: string): string {
	return `${textoDeDiaCorto(diaDe(momento))} · ${horaDe(momento)}`;
}

/**
 * La última entrada de una cuenta como la lee Usuarios y accesos: «hoy 7:58», «ayer 18:20», «2 oct 11:15» o «Nunca».
 * @param momento Cuándo entró por última vez, si entró.
 * @param hoy El día de negocio.
 */
export function ultimaEntrada(momento: string | null, hoy: Temporal.PlainDate): string {
	if (momento === null) return "Nunca";
	const dia = Temporal.PlainDate.from(diaDe(momento));
	const hora = horaDe(momento);
	if (dia.equals(hoy)) return `hoy ${hora}`;
	if (dia.equals(hoy.subtract({ days: 1 }))) return `ayer ${hora}`;
	return `${textoDeDiaCorto(dia)} ${hora}`;
}

/**
 * El inicio de un día de negocio (medianoche en México), en ISO, para comparar con los momentos de la base.
 * @param dia El día de negocio.
 */
export function inicioDelDia(dia: Temporal.PlainDate | string): string {
	return Temporal.PlainDate.from(dia).toZonedDateTime(zonaDelNegocio).toInstant().toString();
}

/** Cómo se lee el área de una persona. */
const textoDelArea: Readonly<Record<string, string>> = {
	taller: "Taller",
	oficina: "Oficina",
	aduana_bodega: "Aduana y bodega",
	tienda: "Tienda",
};

/**
 * El área de una persona como la lee la pantalla: «Taller», «Oficina», «Aduana y bodega».
 * @param area La clave del área, si la cuenta tiene persona.
 */
export function areaParaLeer(area: string | null): string {
	return area === null ? "—" : (textoDelArea[area] ?? area);
}

/** La persona de quien hizo algo: la de la cuenta o la del aparato. */
export const personaDeLaBitacora = alias(personas, "persona_de_la_bitacora");

/**
 * Quién hizo algo en la bitácora: la persona de la cuenta; un aparato con su persona («Tablet del taller · Lupita
 * Ramos»); la cuenta sin persona (soporte); o «Sistema». Pide los `leftJoin` de `usuarios`, `dispositivos` y
 * `personaDeLaBitacora` (por `coalesce(bitacora.persona_id, usuarios.persona_id)`).
 */
export const quienEnLaBitacora: SQL<string> = sql<string>`case
	when ${dispositivos.id} is not null then ${dispositivos.nombre} || coalesce(' · ' || ${personaDeLaBitacora.nombre}, '')
	else coalesce(${personaDeLaBitacora.nombre}, ${usuarios.nombre}, ${usuarios.correo}, 'Sistema') end`;

/** La persona de un renglón de bitácora, para su `leftJoin`. */
export const personaDelRenglon = eq(
	personaDeLaBitacora.id,
	sql`coalesce(${bitacora.personaId}, ${usuarios.personaId})`,
);

/** Si una alerta ya se revisó: hay un renglón de `admin.marcar_alerta_revisada` que apunta a ella. */
export const alertaRevisada: SQL<boolean> = sql<boolean>`exists (
	select 1 from ${bitacora} revisiones
	where revisiones.accion = 'admin.marcar_alerta_revisada' and revisiones.entidad = 'bitacora'
		and revisiones.entidad_id = ${bitacora.id})`;

/** Una alerta de seguridad que sigue sin revisar. */
export const alertaSinRevisar = and(eq(bitacora.esAlerta, true), not(alertaRevisada));

/** La cuenta que pidió una autorización. */
export const quienPidio = alias(usuarios, "quien_pidio");
/** La persona de la cuenta que pidió una autorización. */
export const personaQuePidio = alias(personas, "persona_que_pidio");
/** Quién pidió una autorización: su persona, su cuenta o «—». Pide los `leftJoin` de `quienPidio` y `personaQuePidio`. */
export const quienLaPidio = sql<string>`coalesce(${personaQuePidio.nombre}, ${quienPidio.nombre}, ${quienPidio.correo}, '—')`;

/**
 * Las altas de usuario por confirmar: las cuentas solicitadas cuya autorización AU- sigue por autorizar, la más vieja
 * primero, con quién la pidió y lo que pidió.
 * @param base La base de la consulta.
 */
export async function altasPorConfirmar(base: Base) {
	return base
		.select({
			autorizacionId: autorizaciones.id,
			folio: autorizaciones.folio,
			resumen: autorizaciones.resumen,
			pedidaEn: autorizaciones.creadoEn,
			pidio: quienLaPidio,
		})
		.from(usuarios)
		.innerJoin(autorizaciones, eq(autorizaciones.id, usuarios.autorizacionId))
		.leftJoin(quienPidio, eq(quienPidio.id, autorizaciones.creadoPor))
		.leftJoin(personaQuePidio, eq(personaQuePidio.id, quienPidio.personaId))
		.where(and(eq(usuarios.estado, "solicitada"), eq(autorizaciones.estado, "por_autorizar")))
		.orderBy(asc(autorizaciones.creadoEn));
}

/**
 * Un monto escrito en un texto («$1,250», «$12,500.50»), como lo escribe `enPesos`: el mismo patrón para la base
 * (`regexp_replace`) y para JavaScript.
 */
const patronDeMonto = "\\$ ?[0-9][0-9,]*(\\.[0-9]+)?";
/** Cómo queda un monto tapado. */
const montoTapado = "$••••";

/**
 * La descripción de la bitácora sin sus montos, para quien no ve montos: «Pagó FP-1172 por $••••».
 * Existe porque las acciones escriben montos en su descripción (Contaduría, Compras, Catálogo) y la cuenta de soporte,
 * y quien no ve montos en el historial de un documento, nunca reciben uno (docs/cimientos/ACCESO-Y-PERMISOS.md).
 * @param texto La descripción.
 */
export function sinMontosEnTexto(texto: string): string {
	return texto.replace(new RegExp(patronDeMonto, "g"), montoTapado);
}

/**
 * Lo mismo que `sinMontosEnTexto`, en la base: así el buscador busca en lo que se ve y un monto tapado no se encuentra.
 * @param descripcion La expresión de la descripción.
 */
export function sinMontosEnLaBase(descripcion: SQL<string>): SQL<string> {
	return sql<string>`regexp_replace(${descripcion}, ${patronDeMonto}, ${montoTapado}, 'g')`;
}
