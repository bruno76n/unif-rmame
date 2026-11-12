/**
 * Las ayudas de las pruebas de Contaduría: un cliente de prueba con su tercero y su crédito, la versión de su crédito y
 * una cuenta por cobrar escrita directo en la base.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Cómo se construye»)
 *
 * Ventas todavía no existe: el cliente es solo un id, con su tercero real y su crédito abierto con la interna que Ventas
 * llamará en la fase 16.
 */

import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { llamarInterna } from "./inventario-de-prueba.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Un cliente de prueba: su id, su tercero, su crédito y su nombre. */
export interface ClienteDePrueba {
	clienteId: string;
	terceroId: string;
	creditoId: string;
	nombre: string;
}

/**
 * Da de alta un cliente de prueba: su tercero, con un nombre que nadie más tiene, y su crédito.
 * @param servidor El servidor de prueba.
 * @param opciones Su tipo (mayorista si no se dice) y su límite en centavos (0 si no se dice), escrito directo.
 */
export async function clienteDePrueba(
	servidor: ServidorDePrueba,
	opciones: { tipo?: "escuela" | "mayorista" | "empresa_otro"; limiteCentavos?: number } = {},
): Promise<ClienteDePrueba> {
	const nombre = `Cliente de prueba ${uuidv7().slice(-12)}`;
	const { tercero_id: terceroId } = z
		.object({ tercero_id: z.uuid() })
		.parse(await llamarInterna(servidor, "contaduria.crear_tercero", { nombre, rol: "cliente" }));
	const clienteId = uuidv7();
	const { credito_cliente_id: creditoId } = z.object({ credito_cliente_id: z.uuid() }).parse(
		await llamarInterna(servidor, "contaduria.abrir_credito_cliente", {
			cliente_id: clienteId,
			tercero_id: terceroId,
			tipo_cliente: opciones.tipo ?? "mayorista",
		}),
	);
	if (opciones.limiteCentavos !== undefined) {
		await servidor.base.dueno.query("UPDATE credito_clientes SET limite_centavos = $1 WHERE id = $2", [
			opciones.limiteCentavos,
			creditoId,
		]);
	}
	return { clienteId, terceroId, creditoId, nombre };
}

/**
 * La versión del crédito de un cliente.
 * @param servidor El servidor de prueba.
 * @param clienteId El cliente.
 */
export async function versionDelCredito(servidor: ServidorDePrueba, clienteId: string): Promise<number> {
	const { rows } = await servidor.base.dueno.query(
		"SELECT version::int AS v FROM credito_clientes WHERE cliente_id = $1",
		[clienteId],
	);
	return z.number().parse(rows[0]?.v);
}

/**
 * Escribe directo una cuenta por cobrar del cliente con su saldo y su vencimiento, sin pagos: para lo que solo lee
 * saldos.
 * @param servidor El servidor de prueba.
 * @param cliente El cliente.
 * @param cuenta Su importe y su saldo en centavos, y a cuántos días de hoy vence (negativo: ya venció).
 */
export async function cuentaEscritaDePrueba(
	servidor: ServidorDePrueba,
	cliente: ClienteDePrueba,
	cuenta: { importeCentavos: number; saldoCentavos: number; venceEnDias: number },
): Promise<string> {
	const id = uuidv7();
	const estado =
		cuenta.saldoCentavos === 0
			? "pagada"
			: cuenta.saldoCentavos === cuenta.importeCentavos
				? "sin_pagar"
				: "pagada_en_parte";
	await servidor.base.dueno.query(
		`INSERT INTO cuentas_por_cobrar (id, nota_entrega_id, pedido_id, cliente_id, tercero_id, fecha_entrega, dias_credito,
			vence, total_nota_centavos, importe_centavos, saldo_centavos, estado, pagada_en)
		 VALUES ($1, gen_random_uuid(), gen_random_uuid(), $2, $3, (now() AT TIME ZONE 'America/Mexico_City')::date + $4::int,
			0, (now() AT TIME ZONE 'America/Mexico_City')::date + $4::int, $5, $5, $6, $7,
			CASE WHEN $7 = 'pagada' THEN now() END)`,
		[
			id,
			cliente.clienteId,
			cliente.terceroId,
			cuenta.venceEnDias,
			cuenta.importeCentavos,
			cuenta.saldoCentavos,
			estado,
		],
	);
	return id;
}
