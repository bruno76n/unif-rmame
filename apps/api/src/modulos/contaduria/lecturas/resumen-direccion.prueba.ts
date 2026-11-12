/**
 * Prueba de `contaduria.resumen_direccion`: los saldos por cobrar y por pagar con lo vencido, y el cliente que más
 * debe con su parte y lo que tiene vencido de más de los días que se piden.
 * Fase 18 · docs/modulos/contaduria/contador-y-cuadres.md («Lecturas»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clienteDePrueba, notaEntregadaDePrueba } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { leerDePrueba } from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("el resumen de las cuentas para Dirección", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("suma lo de las tablas y encuentra al cliente que más debe, con su parte y lo vencido de más de esos días", async () => {
		const grande = await clienteDePrueba(servidor);
		await notaEntregadaDePrueba(servidor, grande, { totalCentavos: 900_000_000, fechaEntrega: "2026-01-05" });
		const resumen = await leerDePrueba(servidor, "contaduria.resumen_direccion", { dias_vencido: 30 });
		const { rows } = await servidor.base.dueno.query(
			`SELECT
				(SELECT sum(saldo_centavos)::bigint FROM cuentas_por_cobrar WHERE estado <> 'pagada') AS por_cobrar,
				(SELECT coalesce(sum(saldo_centavos), 0)::bigint FROM cuentas_por_pagar
					WHERE estado IN ('detenida', 'por_pagar', 'pagada_en_parte')) AS por_pagar,
				(SELECT sum(saldo_centavos)::bigint FROM cuentas_por_cobrar WHERE estado <> 'pagada' AND cliente_id = $1) AS suyo`,
			[grande.clienteId],
		);
		const [suma] = rows;
		expect(resumen).toMatchObject({
			por_cobrar_centavos: Number(suma?.por_cobrar),
			por_pagar_centavos: Number(suma?.por_pagar),
			cliente_que_mas_debe: {
				cliente_id: grande.clienteId,
				saldo_centavos: Number(suma?.suyo),
				parte_milesimas: Math.round((Number(suma?.suyo) * 1000) / Number(suma?.por_cobrar)),
				vencido_centavos: Number(suma?.suyo),
			},
		});
	});
});
