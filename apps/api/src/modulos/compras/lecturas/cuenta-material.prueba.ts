/**
 * Prueba de `compras.cuenta_material`: el ejemplo de la gabardina azul marino da lo mismo en la API que en la
 * función del paquete compartido; lo que viene en camino y el borrador; con 90 días de salidas, el consumo es el
 * medido; y la cuenta se memoriza durante la petición.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 5); fase 11, el plazo real y lo que falta con las recepciones
 */

import { aMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { proyectarMaterial } from "@uniformame/compartido/calculos/proyeccion-material";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { ordenParaRecibir, recibirDePrueba } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import {
	altaDeMaterial,
	altaDeProveedor,
	levantarDePrueba,
	ordenEnEstado,
} from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { escribirMovimiento } from "../../inventario/dominio/escribir-movimiento.ts";
import { plazosReales } from "../dominio/ordenes.ts";

/** Las 12 del día en México de una fecha. */
const mediodia = (dia: string) => Temporal.Instant.from(`${dia}T18:00:00Z`);

/** Lo que regresa la lectura de un material, en lo que revisa esta prueba. */
const deLaCuenta = z.record(
	z.string(),
	z
		.object({
			hay_bodega: z.string(),
			hay_aduana: z.string(),
			plazo: z.number(),
			libre_para_comprar: z.string(),
			en_camino: z.array(
				z.object({ folio: z.string(), cantidad: z.string(), llegada_esperada: z.string() }).passthrough(),
			),
			consumo_normal: z.string().nullable(),
			consumo_medido: z.boolean(),
			se_acaba: z.string().nullable(),
			por_pedir: z.string(),
			en_borrador: z.object({ folio: z.string() }).passthrough().nullable(),
		})
		.passthrough(),
);

describe("La proyección da los números del ejemplo de la gabardina azul marino, y lo mismo en la pantalla que en la API; con 90 días de salidas, el consumo sale de las salidas", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Corre algo con el contexto de una acción a una hora. */
	function aLas<T>(ahora: Temporal.Instant, hacer: (contexto: ContextoDeAccion) => Promise<T>) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, hacer, { ahora });
	}

	/** Un movimiento de material de prueba: un ajuste que entra a Bodega, o un consumible que sale de ahí. */
	function mover(
		contexto: ContextoDeAccion,
		materialId: string,
		cantidad: string,
		tipo: "ajuste" | "consumible_tomado",
	) {
		const bodega = ubicacion.BOD ?? "";
		return escribirMovimiento(contexto, {
			tipo,
			documento: { tipo: "ajuste", id: uuidv7() },
			renglones: [
				{
					origen: tipo === "ajuste" ? null : bodega,
					destino: tipo === "ajuste" ? bodega : null,
					materialId,
					rolloId: null,
					cantidad,
				},
			],
			clave: uuidv7(),
		});
	}

	/** Lee la cuenta de unos materiales a una hora. */
	async function cuentaDe(ahora: Temporal.Instant, materialIds: string[]) {
		return deLaCuenta.parse(
			await aLas(ahora, (contexto) => contexto.lectura("compras.cuenta_material", { material_ids: materialIds })),
		);
	}

	it("la gabardina: se acaba el 21 oct, faltan 4 días y pide 1,700 m; igual que la función que corre la pantalla", async () => {
		const aurora = await altaDeProveedor(servidor, { nombre: "Textiles Alborada", dias_dice_tardar: 14 });
		const gabardina = await altaDeMaterial(servidor, aurora, {
			nombre: "Gabardina azul noche",
			tipo: "tela",
			unidad: "m",
			multiplo_compra: 50,
			minimo: 150,
			dias_cubre: 60,
			consumo_diario_inicial: "34",
			costo_centavos: 7_800,
		});
		const hoy = mediodia("2026-10-11");
		// Lo comprometido con los lotes llega en la fase 12: de los 700 m, quedan 369 libres.
		await aLas(hoy, (contexto) => mover(contexto, gabardina, "369.000", "ajuste"));
		const cuenta = (await cuentaDe(hoy, [gabardina]))[gabardina];
		expect(cuenta).toMatchObject({
			hay_bodega: "369.000",
			hay_aduana: "0.000",
			comprometido: "0.000",
			libre_para_comprar: "369.000",
			libre_para_corte: "369.000",
			bajo_minimo: false,
			consumo_normal: "34.000",
			consumo_medido: false,
			se_acaba: "2026-10-21",
			plazo: 14,
			dias_sin_material: 4,
			estado: "sin_tiempo_de_entrega",
			linea: "Faltará material 4 días",
			para_cuando: "2026-10-25",
			por_pedir: "1700.000",
			en_borrador: null,
		});
		// La función del paquete compartido, con los mismos insumos, da lo mismo.
		const pantalla = proyectarMaterial({
			hoy: "2026-10-11",
			libre: aMilesimos("369"),
			llegadas: [],
			consumoNormal: aMilesimos("34"),
			factores: [900n, 800n, 900n, 1100n, 1700n, 2500n, 3200n, 2200n, 1200n, 1000n, 800n, 600n],
			plazo: 14,
			minimo: aMilesimos("150"),
			multiplo: aMilesimos("50"),
			diasCubre: 60,
			limites: { diasMaximos: 420, diasPedirEstaSemana: 7, diasMasDeSeisMeses: 200 },
		});
		expect(cuenta).toMatchObject({
			se_acaba: pantalla.seAcaba,
			fecha_limite: pantalla.fechaLimite,
			estado: pantalla.estado,
			para_cuando: pantalla.paraCuando,
		});
		expect(aMilesimos(String(cuenta?.por_pedir))).toBe(pantalla.porPedir);
	});

	it("lo que viene en camino entra en su llegada esperada; el borrador no cuenta, pero marca el material con su folio", async () => {
		const proveedor = await altaDeProveedor(servidor, { dias_dice_tardar: 10 });
		const boton = await altaDeMaterial(servidor, proveedor, { consumo_diario_inicial: "10", minimo: 50 });
		const otro = await altaDeProveedor(servidor);
		const enviada = await levantarDePrueba(servidor, [
			{ material_id: boton, proveedor_id: otro, cantidad: 500, precio_centavos: 38 },
		]);
		await ordenEnEstado(servidor, enviada.id, "enviada");
		const borrador = await levantarDePrueba(servidor, [
			{ material_id: boton, proveedor_id: proveedor, cantidad: 300, precio_centavos: 38 },
		]);
		const ahora = Temporal.Now.instant();
		await aLas(ahora, (contexto) => mover(contexto, boton, "20.000", "ajuste"));
		const cuenta = (await cuentaDe(ahora, [boton]))[boton];
		const { rows } = await servidor.base.dueno.query(
			"SELECT fecha_prometida::text AS dia FROM ordenes_compra WHERE id = $1",
			[enviada.id],
		);
		expect(cuenta).toMatchObject({
			hay_bodega: "20.000",
			libre_para_comprar: "20.000",
			libre_en_la_cuenta: "520.000",
			bajo_minimo: true,
			en_camino: [{ folio: enviada.folio, cantidad: "500.000", llegada_esperada: rows[0]?.dia, atrasada: false }],
			en_borrador: { orden_compra_id: borrador.id, folio: borrador.folio },
		});
	});

	it("con 90 días de salidas, el consumo deja de ser el inicial: las salidas de cada día entre el factor de su mes", async () => {
		const proveedor = await altaDeProveedor(servidor);
		const aguja = await altaDeMaterial(servidor, proveedor, {
			tipo: "consumible",
			unidad: "pza",
			consumo_diario_inicial: "5",
		});
		const hoy = mediodia("2026-08-30");
		// Sin salidas, el inicial.
		expect((await cuentaDe(hoy, [aguja]))[aguja]).toMatchObject({ consumo_normal: "5.000", consumo_medido: false });
		// Una salida de hace más de 90 días ya la mide, aunque en esos días no haya salido nada.
		await aLas(mediodia("2026-05-01"), (contexto) => mover(contexto, aguja, "1.000", "consumible_tomado"));
		expect((await cuentaDe(hoy, [aguja]))[aguja]).toMatchObject({ consumo_normal: "0.000", consumo_medido: true });
		// 96 al día todo julio (factor 3.2: 30 de un mes normal).
		for (let dia = 1; dia <= 31; dia++) {
			const fecha = `2026-07-${String(dia).padStart(2, "0")}`;
			await aLas(mediodia(fecha), (contexto) => mover(contexto, aguja, "96.000", "consumible_tomado"));
		}
		// Una salida de hoy no cuenta.
		await aLas(hoy, (contexto) => mover(contexto, aguja, "500.000", "consumible_tomado"));
		// 31 días × 30 ÷ 90 días.
		expect((await cuentaDe(hoy, [aguja]))[aguja]).toMatchObject({ consumo_normal: "10.333", consumo_medido: true });
	});

	it("se calcula una vez por petición: leída dos veces en la misma transacción, da los mismos números", async () => {
		const proveedor = await altaDeProveedor(servidor);
		const material = await altaDeMaterial(servidor, proveedor, { consumo_diario_inicial: "1" });
		const ahora = Temporal.Now.instant();
		const [antes, despues, todos] = await aLas(ahora, async (contexto) => {
			const primera = await contexto.lectura("compras.cuenta_material", { material_ids: [material] });
			await mover(contexto, material, "40.000", "ajuste");
			const segunda = await contexto.lectura("compras.cuenta_material", { material_ids: [material] });
			return [primera, segunda, await contexto.lectura("compras.cuenta_material", {})];
		});
		expect(despues).toEqual(antes);
		expect(deLaCuenta.parse(despues)[material]).toMatchObject({ hay_bodega: "0.000" });
		// Sin materiales, todos los activos.
		expect(Object.keys(deLaCuenta.parse(todos))).toContain(material);
		expect((await cuentaDe(ahora, [material]))[material]).toMatchObject({ hay_bodega: "40.000" });
	});

	it("lo que falta en camino y el plazo real del proveedor salen de las recepciones (fase 11)", async () => {
		const orden = await ordenParaRecibir(servidor);
		// Se envió hace 14 días; el proveedor dice que tarda 12.
		await servidor.base.dueno.query(
			"UPDATE ordenes_compra SET enviada_en = now() - interval '14 days', fecha_prometida = current_date + 5 WHERE id = $1",
			[orden.id],
		);
		const ahora = Temporal.Now.instant();
		expect((await cuentaDe(ahora, [orden.tela]))[orden.tela]).toMatchObject({
			plazo: 12,
			en_camino: [{ folio: orden.folio, cantidad: "100.000" }],
		});
		await recibirDePrueba(servidor, orden, [{ metros: "60", partida: "A" }]);
		// Llegaron 60 hoy: faltan 40 en camino y su única entrega tardó 14 días.
		expect((await cuentaDe(ahora, [orden.tela]))[orden.tela]).toMatchObject({
			plazo: 14,
			hay_aduana: "60.000",
			en_camino: [{ folio: orden.folio, cantidad: "40.000" }],
		});
		// 14 días contra los 12 que dice: la entrega no llegó a tiempo y el proveedor está fuera de plazo.
		const plazos = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			plazosReales(contexto, [{ id: orden.proveedor, diasDiceTardar: 12 }]),
		);
		expect(plazos.get(orden.proveedor)).toMatchObject({
			plazo: 14,
			fueraDePlazo: true,
			entregas: [{ ordenCompraId: orden.id, dias: 14, aTiempo: false }],
		});
		// Si dijera que tarda 14, la misma entrega llegó a tiempo y no está fuera de plazo.
		const aTiempo = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			plazosReales(contexto, [{ id: orden.proveedor, diasDiceTardar: 14 }]),
		);
		expect(aTiempo.get(orden.proveedor)).toMatchObject({ fueraDePlazo: false, entregas: [{ aTiempo: true }] });
	});
});
