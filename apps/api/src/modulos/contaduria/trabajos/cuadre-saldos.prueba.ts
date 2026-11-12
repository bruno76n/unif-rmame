/**
 * Prueba del cuadre de saldos: con todo cuadrado no avisa; un saldo guardado que no es su importe menos sus
 * aplicaciones avisa a la dueña con su renglón del sistema, una sola vez ese día.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «El cuadre de saldos encuentra un saldo
 * guardado que no es su importe menos sus aplicaciones, y avisa a la dueña»)
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { clienteDePrueba, notaEntregadaDePrueba } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo, type DependenciasDelTrabajador } from "../../../nucleo/trabajos/trabajador.ts";
import { cuadreSaldos } from "./cuadre-saldos.ts";

describe("El cuadre de saldos encuentra un saldo que no cuadra y avisa a la dueña", () => {
	let servidor: ServidorDePrueba;
	let dependencias: DependenciasDelTrabajador;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		dependencias = {
			base: crearBase(servidor.base.app),
			registro: servidor.modulos,
			servicios: { escribirBitacora: escribirBitacoraConAdmin, guardarEventos: guardarEventosConAdmin },
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => Temporal.Now.instant(),
		};
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Los avisos `saldos_no_cuadran` de la dueña. */
	async function avisosALaDuena() {
		const { rows } = await servidor.base.dueno.query(
			"SELECT texto FROM avisos WHERE tipo = 'saldos_no_cuadran' AND usuario_id = $1",
			[cuentaDePrueba("duena")],
		);
		return rows.map((fila) => fila.texto);
	}

	it("con todo cuadrado no avisa; una cuenta por cobrar y una por pagar descuadradas avisan una sola vez", async () => {
		await correrTrabajo(dependencias, cuadreSaldos, {});
		expect(await avisosALaDuena()).toEqual([]);
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 100_000 });
		await servidor.base.dueno.query(
			"UPDATE cuentas_por_cobrar SET saldo_centavos = 90000, estado = 'pagada_en_parte' WHERE id = $1",
			[nota.cuentaId],
		);
		// Una cuenta por pagar de la muestra, con su saldo guardado $1 abajo de lo que dan sus pagos.
		const { rows: porPagar } = await servidor.base.dueno.query(
			`UPDATE cuentas_por_pagar SET saldo_centavos = importe_centavos - 100, estado = 'pagada_en_parte'
			 WHERE id = (SELECT id FROM cuentas_por_pagar WHERE estado = 'por_pagar' ORDER BY id LIMIT 1)
			 RETURNING id, importe_centavos::int AS importe`,
		);
		const [cuentaPorPagar] = porPagar;
		await correrTrabajo(dependencias, cuadreSaldos, {});
		expect(await avisosALaDuena()).toEqual([
			"Los saldos de 2 cuentas no cuadran con sus pagos: soporte ya lo está revisando",
		]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT origen, despues FROM bitacora WHERE accion = 'contaduria.cuadre_saldos' OR entidad = 'cuadre_saldos'",
		);
		expect(rows).toEqual([
			{
				origen: "sistema",
				despues: {
					diferencias: [
						`cuenta por cobrar ${nota.cuentaId}: guarda $900 y sus pagos dan $1,000`,
						`cuenta por pagar ${cuentaPorPagar?.id}: guarda ${enPesos(Number(cuentaPorPagar?.importe) - 100)} y sus pagos dan ${enPesos(Number(cuentaPorPagar?.importe))}`,
					],
				},
			},
		]);
		// Otra vuelta el mismo día no vuelve a avisar.
		await correrTrabajo(dependencias, cuadreSaldos, {});
		expect(await avisosALaDuena()).toHaveLength(1);
	});
});
