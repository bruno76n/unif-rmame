/**
 * `contaduria.terceros` y `contaduria.tercero`: la pestaña Terceros y el cajón del tercero. Abrir el cajón deja
 * «Consultó la ficha de {tercero}» en la bitácora como consulta sensible.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Terceros», «El tercero (ancho)») y
 * docs/modulos/contaduria/terceros-y-deudas.md (reglas 4 y 5)
 *
 * Lo que nos debe un tercero son sus cuentas por cobrar con saldo; lo que le debemos, sus cuentas por pagar que se
 * deben; el saldo neto, la diferencia (regla 4). Lo que se compensa llega hasta lo menor entre lo que nos debe y lo que
 * le debemos sin lo detenido (regla 5).
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import {
	terceroDeContaduria,
	tercerosDeContaduria,
} from "@uniformame/compartido/contratos/contaduria/consultas-terceros";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { diasVencida } from "../dominio/antiguedad.ts";
import {
	cuentasPorCobrarConSaldo,
	cuentasPorPagarQueSeDeben,
	depositosATerceros,
	documentoDe,
	paginar,
} from "./comun.ts";

/** Un tercero con sus roles y lo que se debe de cada lado. */
const terceroLeido = z.object({
	id: z.uuid(),
	nombre: z.string(),
	es_cliente: z.boolean(),
	es_proveedor: z.boolean(),
	es_acreedor: z.boolean(),
	por_cobrar: z.coerce.number(),
	por_pagar: z.coerce.number(),
	cliente_id: z.uuid().nullable(),
});

/**
 * Los roles de un tercero, en su orden.
 * @param tercero El tercero.
 */
function relacionDe(tercero: z.infer<typeof terceroLeido>): string[] {
	return [
		...(tercero.es_cliente ? ["Cliente"] : []),
		...(tercero.es_proveedor ? ["Proveedor"] : []),
		...(tercero.es_acreedor ? ["Acreedor"] : []),
	];
}

/**
 * El saldo neto (regla 4): a favor, en contra o saldado, sin signo.
 * @param porCobrar Lo que nos debe.
 * @param porPagar Lo que le debemos.
 */
function netoDe(porCobrar: number, porPagar: number) {
	const neto = porCobrar - porPagar;
	return {
		como: neto > 0 ? ("a_favor" as const) : neto < 0 ? ("en_contra" as const) : ("saldado" as const),
		monto_centavos: Math.abs(neto),
	};
}

/**
 * Los terceros con lo que nos deben y lo que les debemos; con un filtro por nombre, por rol o por id.
 * @param contexto El contexto de la consulta.
 * @param filtro Lo que se busca.
 */
async function tercerosConSaldos(
	contexto: ContextoDeConsulta,
	filtro: { buscar?: string | undefined; rol?: string | undefined; id?: string | undefined },
) {
	const buscar = filtro.buscar === undefined || filtro.buscar === "" ? null : filtro.buscar;
	const { rows } = await contexto.base.execute(sql`SELECT t.id, t.nombre, t.es_cliente, t.es_proveedor, t.es_acreedor,
			coalesce((SELECT sum(c.saldo_centavos) FROM cuentas_por_cobrar c WHERE c.tercero_id = t.id), 0) AS por_cobrar,
			coalesce((SELECT sum(c.saldo_centavos) FROM cuentas_por_pagar c
				WHERE c.tercero_id = t.id AND c.estado NOT IN ('pagada', 'cancelada')), 0) AS por_pagar,
			(SELECT cl.id FROM clientes cl WHERE cl.tercero_id = t.id) AS cliente_id
		FROM terceros t
		WHERE (${filtro.id ?? null}::uuid IS NULL OR t.id = ${filtro.id ?? null}::uuid)
			AND (${buscar}::text IS NULL OR sin_acentos(t.nombre) ILIKE '%' || sin_acentos(${buscar}::text) || '%')
			AND (${filtro.rol ?? null}::text IS NULL
				OR (${filtro.rol ?? null} = 'cliente' AND t.es_cliente)
				OR (${filtro.rol ?? null} = 'proveedor' AND t.es_proveedor)
				OR (${filtro.rol ?? null} = 'acreedor' AND t.es_acreedor))
		ORDER BY t.nombre`);
	return z.array(terceroLeido).parse(rows);
}

/** Una compensación con su tercero. */
const compensacionLeida = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	fecha: z.string(),
	tercero: z.string(),
	descripcion: z.string(),
	monto: z.coerce.number(),
	estado: z.string(),
});

/**
 * Las compensaciones, la más reciente arriba; de un tercero, si se dice.
 * @param contexto El contexto de la consulta.
 * @param terceroId El tercero.
 */
async function compensaciones(contexto: ContextoDeConsulta, terceroId?: string) {
	const { rows } = await contexto.base.execute(sql`SELECT c.id, c.version, c.fecha::text, t.nombre AS tercero,
			c.descripcion, c.monto_centavos AS monto, c.estado
		FROM compensaciones c JOIN terceros t ON t.id = c.tercero_id
		WHERE (${terceroId ?? null}::uuid IS NULL OR c.tercero_id = ${terceroId ?? null}::uuid)
		ORDER BY c.fecha DESC, c.id DESC`);
	return z
		.array(compensacionLeida)
		.parse(rows)
		.map((compensacion) => ({
			compensacion_id: compensacion.id,
			version: compensacion.version,
			fecha: textoDeDiaCorto(compensacion.fecha),
			tercero: compensacion.tercero,
			descripcion: compensacion.descripcion,
			monto_centavos: compensacion.monto,
			cancelada: compensacion.estado === "cancelada",
		}));
}

export const consultaTerceros = implementarConsulta(tercerosDeContaduria, async (contexto, parametros) => {
	const ordenados = (await tercerosConSaldos(contexto, { buscar: parametros.buscar, rol: parametros.rol })).sort(
		(uno, otro) =>
			Number(otro.por_cobrar > 0 && otro.por_pagar > 0) - Number(uno.por_cobrar > 0 && uno.por_pagar > 0) ||
			otro.por_cobrar + otro.por_pagar - (uno.por_cobrar + uno.por_pagar) ||
			uno.nombre.localeCompare(otro.nombre),
	);
	const pagina = paginar(ordenados, parametros.cursor);
	const todos = await tercerosConSaldos(contexto, {});
	return {
		resultado: {
			renglones: pagina.renglones.map((tercero) => ({
				tercero_id: tercero.id,
				nombre: tercero.nombre,
				relacion: relacionDe(tercero),
				por_cobrar_centavos: tercero.por_cobrar,
				por_pagar_centavos: tercero.por_pagar,
				neto: netoDe(tercero.por_cobrar, tercero.por_pagar),
			})),
			cursor: pagina.cursor,
			hay_mas: pagina.hay_mas,
			compensaciones: await compensaciones(contexto),
			para_deuda: todos.map((tercero) => ({ id: tercero.id, nombre: tercero.nombre })),
		},
	};
});

/** Una deuda con sus mensualidades. */
const deudaLeida = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	descripcion: z.string(),
	estado: z.enum(["abierta", "saldada", "cancelada"]),
	mensualidades: z.number().int(),
	pagadas: z.coerce.number(),
	con_pagos: z.boolean(),
});

/** El estado de una deuda como se pinta. */
const estadosDeDeuda = {
	abierta: { texto: "Por pagar", color: "ambar", abajo: null },
	saldada: { texto: "Saldada", color: "verde", abajo: null },
	cancelada: { texto: "Cancelada", color: "rojo", abajo: null },
} as const;

/**
 * Las deudas de un tercero, con cuántas mensualidades van pagadas y si tienen algún pago.
 * @param contexto El contexto de la consulta.
 * @param terceroId El tercero.
 */
async function deudasDe(contexto: ContextoDeConsulta, terceroId: string) {
	const { rows } = await contexto.base.execute(sql`SELECT d.id, d.version, d.folio, d.descripcion, d.estado,
			d.numero_mensualidades AS mensualidades,
			(SELECT count(*) FROM deuda_mensualidades m JOIN cuentas_por_pagar c ON c.deuda_mensualidad_id = m.id
				WHERE m.deuda_id = d.id AND c.estado = 'pagada') AS pagadas,
			EXISTS (SELECT 1 FROM deuda_mensualidades m JOIN cuentas_por_pagar c ON c.deuda_mensualidad_id = m.id
				JOIN aplicaciones_pago a ON a.cuenta_por_pagar_id = c.id
				WHERE m.deuda_id = d.id AND a.estado = 'vigente') AS con_pagos
		FROM deudas d WHERE d.tercero_id = ${terceroId}::uuid ORDER BY d.folio`);
	return z
		.array(deudaLeida)
		.parse(rows)
		.map((deuda) => ({
			deuda_id: deuda.id,
			version: deuda.version,
			folio: deuda.folio,
			descripcion: deuda.descripcion,
			estado: estadosDeDeuda[deuda.estado],
			mensualidades: `${deuda.pagadas} de ${deuda.mensualidades} pagadas`,
			cancelable: deuda.estado === "abierta" && !deuda.con_pagos,
		}));
}

/**
 * Los roles escritos como se leen: «Cliente y Acreedor».
 * @param roles Los roles.
 */
function enUnaLinea(roles: readonly string[]): string {
	if (roles.length <= 1) return roles.join("");
	return `${roles.slice(0, -1).join(", ")} y ${roles.at(-1) ?? ""}`;
}

export const consultaTercero = implementarConsulta(terceroDeContaduria, async (contexto, parametros) => {
	const [tercero] = await tercerosConSaldos(contexto, { id: parametros.tercero_id });
	if (tercero === undefined) throw noExiste();
	await contexto.apuntarConsultaSensible({
		descripcion: `Consultó la ficha de ${tercero.nombre}`,
		entidad: "terceros",
		entidadId: tercero.id,
	});
	const hoy = contexto.diaDeNegocio;
	const nosDebe = tercero.cliente_id === null ? [] : await cuentasPorCobrarConSaldo(contexto, tercero.cliente_id);
	const leDebemos = await cuentasPorPagarQueSeDeben(contexto, tercero.id);
	const sinDetener = leDebemos.filter((cuenta) => cuenta.estado !== "detenida").reduce((suma, c) => suma + c.saldo, 0);
	const depositos = await depositosATerceros(contexto, { terceroId: tercero.id });
	return {
		resultado: {
			tercero_id: tercero.id,
			nombre: tercero.nombre,
			relacion: enUnaLinea(relacionDe(tercero)),
			cliente_id: tercero.cliente_id,
			nos_debe_centavos: tercero.por_cobrar,
			le_debemos_centavos: tercero.por_pagar,
			maximo_compensar_centavos: Math.min(tercero.por_cobrar, sinDetener),
			neto: netoDe(tercero.por_cobrar, tercero.por_pagar),
			nos_debe: nosDebe.map((cuenta) => ({
				folio: cuenta.nota,
				vence: textoDeDiaCorto(cuenta.vence),
				vencida: diasVencida(cuenta.vence, hoy) > 0,
				saldo_centavos: cuenta.saldo,
			})),
			le_debemos: leDebemos.map((cuenta) => ({
				documento: documentoDe(cuenta),
				...(cuenta.prestamo === null || cuenta.de === 1 ? {} : { prestamo_total_centavos: cuenta.prestamo }),
				vence: textoDeDiaCorto(cuenta.vence),
				vencida: diasVencida(cuenta.vence, hoy) > 0,
				saldo_centavos: cuenta.saldo,
				detenida: cuenta.estado === "detenida",
			})),
			deudas: await deudasDe(contexto, tercero.id),
			pagos_a_su_cuenta: depositos.map((deposito) => ({
				pago_id: deposito.id,
				texto: `${deposito.cliente} depositó a ${deposito.tercero}`,
				aplicado:
					deposito.queda === deposito.monto || deposito.aplicado_a === null
						? "sin aplicar"
						: `aplicado a ${deposito.aplicado_a}`,
				monto_centavos: deposito.monto,
				a_favor_centavos: deposito.queda,
			})),
			compensaciones: await compensaciones(contexto, tercero.id),
		},
	};
});
