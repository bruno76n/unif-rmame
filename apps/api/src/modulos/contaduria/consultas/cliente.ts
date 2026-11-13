/**
 * `contaduria.cliente`: el cajón del cliente en Contaduría. Abrirlo deja «Consultó el saldo de {cliente}» en la
 * bitácora como consulta sensible.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («El cliente (ancho)») y docs/modulos/contaduria/credito-de-clientes.md,
 * cuentas-por-cobrar.md y pagos-y-saldo-a-favor.md
 *
 * Lo que nos debe sale de sus cuentas por cobrar con saldo; lo que le debemos, de sus cuentas por pagar si también es
 * proveedor o acreedor; el semáforo sugerido, del dominio.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { clienteDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-cobrar";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { semaforoSugerido } from "../dominio/semaforo-sugerido.ts";
import { parametrosDelSemaforo, semaforoConTexto } from "./antiguedad-saldos.ts";
import {
	cuentasDeLaFabrica,
	cuentasPorCobrarConSaldo,
	cuentasPorPagarQueSeDeben,
	dondeSeRecibio,
	fechaConTextoDe,
} from "./comun.ts";

/** Cómo se lee cada tipo de cliente. */
const tiposDeCliente: Readonly<Record<string, string>> = {
	escuela: "Escuela",
	mayorista: "Mayorista",
	empresa_otro: "Empresa u otro",
};

/** El cliente con su crédito. */
const clienteLeido = z.object({
	id: z.uuid(),
	tercero_id: z.uuid(),
	nombre: z.string(),
	tipo: z.string(),
	municipio: z.string(),
	limite: z.coerce.number(),
	dias: z.number().int(),
	semaforo: z.enum(["al_corriente", "cerca_del_limite", "detenido"]),
	version: z.coerce.number(),
	pedidos_abiertos: z.coerce.number(),
});

/** Un pago del cliente. */
const pagoLeido = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	fecha: z.string(),
	documento: z.string(),
	medio: z.string(),
	tercero: z.string().nullable(),
	monto: z.coerce.number(),
	estado: z.string(),
});

/** Un movimiento del saldo a favor del cliente. */
const movimientoLeido = z.object({
	fecha: z.string(),
	tipo: z.enum(["entra", "aplicado_nota", "aplicado_pedido", "devuelto"]),
	origen: z.string().nullable(),
	documento: z.string().nullable(),
	monto: z.coerce.number(),
});

/**
 * El cliente con su crédito y cuántos pedidos tiene abiertos.
 * @param contexto El contexto de la consulta.
 * @param clienteId El cliente.
 * @throws `404` si no existe.
 */
async function leerCliente(contexto: ContextoDeConsulta, clienteId: string) {
	const { rows } = await contexto.base.execute(sql`SELECT cl.id, cl.tercero_id, t.nombre, cl.tipo, cl.municipio,
			c.limite_centavos AS limite, c.dias_credito AS dias, c.semaforo, c.version,
			(SELECT count(*) FROM pedidos p WHERE p.cliente_id = cl.id AND p.estado = 'confirmado') AS pedidos_abiertos
		FROM clientes cl JOIN terceros t ON t.id = cl.tercero_id JOIN credito_clientes c ON c.cliente_id = cl.id
		WHERE cl.id = ${clienteId}::uuid`);
	const [cliente] = z.array(clienteLeido).parse(rows);
	if (cliente === undefined) throw noExiste();
	return cliente;
}

/**
 * Los pagos recibidos del cliente, el más reciente arriba.
 * @param contexto El contexto de la consulta.
 * @param clienteId El cliente.
 */
async function pagosDelCliente(contexto: ContextoDeConsulta, clienteId: string) {
	const { rows } = await contexto.base.execute(sql`SELECT p.id, p.version, p.folio, p.fecha::text,
			coalesce(n.folio, pe.folio, '') AS documento, p.medio, td.nombre AS tercero, p.monto_centavos AS monto, p.estado
		FROM pagos p
		LEFT JOIN notas_entrega n ON n.id = p.nota_entrega_id
		LEFT JOIN pedidos pe ON pe.id = p.pedido_id
		LEFT JOIN terceros td ON td.id = p.tercero_deposito_id
		WHERE p.cliente_id = ${clienteId}::uuid AND p.direccion = 'recibido'
		ORDER BY p.fecha DESC, p.folio DESC`);
	return z.array(pagoLeido).parse(rows);
}

/**
 * Los movimientos vigentes del saldo a favor del cliente, del más viejo al más nuevo.
 * @param contexto El contexto de la consulta.
 * @param clienteId El cliente.
 */
async function movimientosAFavor(contexto: ContextoDeConsulta, clienteId: string) {
	const { rows } = await contexto.base.execute(sql`SELECT s.fecha::text, s.tipo, s.origen,
			coalesce(nc.folio, n.folio, pe.folio, pg.folio) AS documento, s.monto_centavos AS monto
		FROM saldo_favor_movimientos s
		LEFT JOIN notas_credito nc ON nc.id = s.nota_credito_id
		LEFT JOIN cuentas_por_cobrar c ON c.id = s.cuenta_por_cobrar_id
		LEFT JOIN notas_entrega n ON n.id = c.nota_entrega_id
		LEFT JOIN pedidos pe ON pe.id = s.pedido_id
		LEFT JOIN pagos pg ON pg.id = s.pago_id
		WHERE s.cliente_id = ${clienteId}::uuid AND s.estado = 'vigente'
		ORDER BY s.fecha, s.id`);
	return z
		.array(movimientoLeido)
		.parse(rows)
		.map((movimiento) => {
			const documento = movimiento.documento ?? "";
			const texto =
				movimiento.tipo === "entra"
					? movimiento.origen === "nota_credito"
						? `Entró: nota de crédito ${documento}`
						: `Entró: anticipo de ${documento}`
					: movimiento.tipo === "devuelto"
						? `Devuelto · ${documento}`
						: `Aplicado a ${documento}`;
			return {
				fecha: textoDeDiaCorto(movimiento.fecha),
				texto,
				monto_centavos: movimiento.tipo === "entra" ? movimiento.monto : -movimiento.monto,
			};
		});
}

export const consultaCliente = implementarConsulta(clienteDeContaduria, async (contexto, parametros) => {
	const cliente = await leerCliente(contexto, parametros.cliente_id);
	await contexto.apuntarConsultaSensible({
		descripcion: `Consultó el saldo de ${cliente.nombre}`,
		entidad: "clientes",
		entidadId: cliente.id,
	});
	const cuentas = await cuentasPorCobrarConSaldo(contexto, cliente.id);
	const calculado = semaforoSugerido({
		limiteCentavos: cliente.limite,
		cuentas: cuentas.map((cuenta) => ({ vence: cuenta.vence, saldoCentavos: cuenta.saldo })),
		hoy: contexto.diaDeNegocio,
		...(await parametrosDelSemaforo(contexto)),
	});
	const leDebemos = (await cuentasPorPagarQueSeDeben(contexto, cliente.tercero_id)).reduce(
		(suma, cuenta) => suma + cuenta.saldo,
		0,
	);
	const pagos = await pagosDelCliente(contexto, cliente.id);
	const aFavor = await movimientosAFavor(contexto, cliente.id);
	return {
		resultado: {
			cliente_id: cliente.id,
			nombre: cliente.nombre,
			contexto: `${tiposDeCliente[cliente.tipo] ?? cliente.tipo} · ${cliente.municipio}`,
			tercero_id: cliente.tercero_id,
			pedidos_abiertos: cliente.pedidos_abiertos,
			notas_con_saldo: cuentas.length,
			pagos_registrados: pagos.filter((pago) => pago.estado === "registrado").length,
			le_debemos_centavos: leDebemos,
			nos_debe_centavos: calculado.saldoCentavos,
			limite_centavos: cliente.limite,
			dias_credito: cliente.dias,
			semaforo: semaforoConTexto(cliente.semaforo),
			sugerido: calculado.sugerido === cliente.semaforo ? null : semaforoConTexto(calculado.sugerido),
			saldo_favor_centavos: aFavor.reduce((suma, movimiento) => suma + (movimiento.monto_centavos ?? 0), 0),
			version_credito: cliente.version,
			notas: cuentas.map((cuenta) => ({
				nota_entrega_id: cuenta.nota_entrega_id,
				folio: cuenta.nota,
				entregada: textoDeDiaCorto(cuenta.fecha_entrega),
				vence: fechaConTextoDe(cuenta.vence, contexto.diaDeNegocio),
				saldo_centavos: cuenta.saldo,
			})),
			pagos: pagos.map((pago) => ({
				pago_id: pago.id,
				version: pago.version,
				folio: pago.folio,
				fecha: textoDeDiaCorto(pago.fecha),
				detalle:
					pago.medio === "cuenta_tercero"
						? `${pago.documento} · a ${pago.tercero ?? ""}`
						: `${pago.documento} · ${dondeSeRecibio(pago.medio, null)}`,
				monto_centavos: pago.monto,
				cancelado: pago.estado === "cancelado",
			})),
			movimientos_a_favor: aFavor,
			cuentas_fabrica: await cuentasDeLaFabrica(contexto),
		},
	};
});
