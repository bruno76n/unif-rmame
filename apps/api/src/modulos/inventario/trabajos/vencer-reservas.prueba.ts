/**
 * Prueba del trabajo «Vencer reservas»: con pago pendiente, las reservas vencidas se liberan y el W- queda vencido;
 * otra vuelta no hace nada; un W- pagado a tiempo no se vence; el pago tardío lo vuelve a apartar.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «Con pago pendiente, las reservas vencen
 * y el W- queda vencido; el pago tardío vuelve a apartar o abre `pago_despues_de_vencer`»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { meterPiezas, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import {
	comoElSitio,
	pedidoDelSitio,
	pedidoLineaComoQuedo,
	prendaEnLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo, type DependenciasDelTrabajador } from "../../../nucleo/trabajos/trabajador.ts";
import { vencerReservas } from "./vencer-reservas.ts";

describe("Con pago pendiente, las reservas vencen y el W- queda vencido", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	let dependencias: DependenciasDelTrabajador;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_booleano = true WHERE clave = 'linea.acepta_pago_pendiente'",
		);
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

	/** Un W- con pago pendiente de una prenda en Bodega, que vence en `minutos` (negativo: ya venció). */
	async function pendiente(minutos: number) {
		const [cuatro = ""] = await prendaEnLinea(servidor);
		await meterPiezas(servidor, ubicacion.BOD ?? "", cuatro, 1);
		const venceEn = new Date(Date.now() + minutos * 60_000).toISOString();
		const pedido = pedidoDelSitio([{ variante_id: cuatro, cantidad: 1 }], {
			pago: { estado: "pendiente", pagado_en: undefined, vence_en: venceEn, metodo: "oxxo" },
		});
		const respuesta = await comoElSitio(servidor, "linea.recibir_pedido", pedido);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return pedido;
	}

	it("lo vencido se libera y el W- queda vencido; otra vuelta no hace nada; lo que no ha vencido sigue", async () => {
		const vencido = await pendiente(-5);
		const aTiempo = await pendiente(60);
		await correrTrabajo(dependencias, vencerReservas, {});
		expect(await pedidoLineaComoQuedo(servidor, vencido.id)).toMatchObject({
			estado: "vencido",
			pago_estado: "vencido",
			reservas: [],
		});
		expect(await pedidoLineaComoQuedo(servidor, aTiempo.id)).toMatchObject({
			estado: "esperando_pago",
			reservas: [{ ubicacion: "BOD", piezas: 1, vence: true }],
		});
		const { rows: liberadas } = await servidor.base.dueno.query(
			"SELECT motivo_fin FROM reservas WHERE pedido_linea_id = $1",
			[vencido.id],
		);
		expect(liberadas).toEqual([{ motivo_fin: "vencio_pago" }]);
		const { rows: renglones } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE entidad_id = $1 ORDER BY ocurrido_en",
			[vencido.id],
		);
		expect(renglones.at(-1)?.descripcion).toMatch(/^W-\d{4} venció sin pago: sus prendas se liberaron$/);
		await correrTrabajo(dependencias, vencerReservas, {});
		expect(
			(await servidor.base.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE entidad_id = $1", [vencido.id]))
				.rows,
		).toEqual([{ n: renglones.length }]);
	});

	it("el pago tardío vuelve a apartar lo que se liberó y el W- queda por surtir", async () => {
		const pedido = await pendiente(-1);
		await correrTrabajo(dependencias, vencerReservas, {});
		const respuesta = await comoElSitio(servidor, "linea.confirmar_pago", {
			pedido_linea_id: pedido.id,
			pasarela: "mercado_pago",
			referencia: `OXXO-${pedido.id.slice(-10)}`,
			monto_centavos: pedido.total_centavos,
			pagado_en: new Date().toISOString(),
		});
		expect(respuesta.cuerpo.resultado).toMatchObject({ estado: "por_surtir", promesa: "sale_hoy" });
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({
			reservas: [{ ubicacion: "BOD", piezas: 1, vence: false }],
		});
	});
});
