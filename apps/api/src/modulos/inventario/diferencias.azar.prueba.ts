/**
 * Prueba con datos al azar de las diferencias y los ajustes: recepciones con diferencias en camino a aduana y en
 * tránsito, aclaraciones al azar (`llego`, `no_salio`, `venia_en_otro`, `perdida`) y ajustes autorizados o rechazados.
 * Después de cualquier mezcla, el cuadre de la noche corre sin residuo: cada tramo tiene justo lo de sus DF- abiertas
 * y ninguna existencia queda distinta del libro.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Cómo se construye»)
 */

import { join } from "node:path";
import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardarEventosConAdmin } from "../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../nucleo/base/conexion.ts";
import { cargarModulos } from "../../nucleo/modulos.ts";
import {
	aclararDePrueba,
	decidirAjusteDePrueba,
	diferenciaEnCamino,
	diferenciaEnTransito,
	motivoDeAjuste,
	salidaDe,
} from "../../nucleo/pruebas/diferencias-de-prueba.ts";
import { meterPiezas, ubicacionesPorCodigo, variantesLibres } from "../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo } from "../../nucleo/trabajos/trabajador.ts";
import { type CuadreCorrido, correrCuadre } from "./internas/correr-cuadre.ts";

/** Lo que se hace con una DF-: nada, una aclaración que mueve, o un ajuste que Dirección autoriza o rechaza. */
const destinos = ["nada", "llego", "no_salio", "autorizar", "rechazar"] as const;
type Destino = (typeof destinos)[number];
const destino = fc.constantFrom(...destinos);

/** Una recepción con diferencias y lo que se hace con su DF-. */
const caso = fc.oneof(
	fc.record({
		donde: fc.constant("camino" as const),
		enviadas: fc.integer({ min: 1, max: 6 }),
		llegaron: fc.integer({ min: 0, max: 8 }),
		destino,
	}),
	fc.record({ donde: fc.constant("transito" as const), llegaron: fc.integer({ min: 0, max: 8 }), destino }),
	fc.record({ donde: fc.constant("espejo" as const), piezas: fc.integer({ min: 1, max: 4 }) }),
);

describe("Con recepciones, aclaraciones y ajustes al azar, el cuadre corre sin residuo", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	let motivo: string;
	let dia = Temporal.PlainDate.from("2032-01-01");
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
		motivo = await motivoDeAjuste(servidor);
		// Lo que ya traía la muestra queda explicado en una primera corrida.
		await cuadrar(dia.toString());
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Corre el cuadre de una fecha como lo corre el trabajo. */
	async function cuadrar(fecha: string): Promise<CuadreCorrido> {
		let corrido: CuadreCorrido | undefined;
		const registro = await cargarModulos(join(import.meta.dirname, ".."));
		const pruebas = await cargarModulos(join(import.meta.dirname, "../../nucleo/pruebas/modulos"));
		await correrTrabajo(
			{
				base: crearBase(servidor.base.app),
				registro: { ...registro, lecturas: new Map([...registro.lecturas, ...pruebas.lecturas]) },
				servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: async () => undefined },
				avisarFalla: async () => undefined,
				enviarCorreo: async () => undefined,
				dominioWeb: "https://fabrica.prueba.invalid",
				reloj: () => Temporal.Now.instant(),
			},
			{
				nombre: "prueba.cuadre",
				correr: async (contexto) => {
					corrido = await correrCuadre(contexto, fecha);
				},
			},
			{},
		);
		if (corrido === undefined) throw new Error("el cuadre no regresó nada");
		return corrido;
	}

	/** Hace con una DF- lo que dice el caso. Una aclaración que no aplica deja todo como estaba. */
	async function resolver(diferencia: string, que: Destino) {
		if (que === "nada") return;
		const aclaracion = que === "autorizar" || que === "rechazar" ? "perdida" : que;
		const respuesta = await aclararDePrueba(servidor, diferencia, {
			aclaracion,
			...(aclaracion === "perdida" ? { motivo_id: motivo } : {}),
		});
		if (respuesta.estado !== 200) {
			expect(respuesta.cuerpo).toMatchObject({ codigo: "aclaracion_no_aplica" });
			return;
		}
		if (aclaracion !== "perdida") return;
		const decision = await decidirAjusteDePrueba(servidor, salidaDe(respuesta).ajuste_id ?? "", {
			decision: que === "autorizar" ? "autorizar" : "rechazar",
			...(que === "rechazar" ? { motivo: "Búsquenlas otra vez" } : {}),
		});
		expect(decision.estado).toBe(200);
	}

	it("recepciones con diferencias, aclaraciones y ajustes al azar: el cuadre de la noche cuadra", async () => {
		await fc.assert(
			fc.asyncProperty(fc.array(caso, { minLength: 1, maxLength: 4 }), async (casos) => {
				for (const suyo of casos) {
					if (suyo.donde === "espejo") {
						// Dos traspasos de la misma prenda que se cruzaron: a uno le faltó lo que al otro le sobró.
						const [variante = ""] = await variantesLibres(servidor, 1);
						const falta = await diferenciaEnCamino(servidor, 5, 5 - suyo.piezas, variante);
						const sobra = await diferenciaEnCamino(servidor, 5, 5 + suyo.piezas, variante);
						const respuesta = await aclararDePrueba(servidor, falta.diferencia, {
							aclaracion: "venia_en_otro",
							otra_diferencia_id: sobra.diferencia,
						});
						expect(respuesta.estado).toBe(200);
						continue;
					}
					if (suyo.donde === "camino") {
						if (suyo.enviadas === suyo.llegaron) continue;
						// Bodega tiene de sobra: lo que «no salió» de más sale de ahí sin dejarla en negativo.
						const [variante = ""] = await variantesLibres(servidor, 1);
						await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 10);
						const { diferencia } = await diferenciaEnCamino(servidor, suyo.enviadas, suyo.llegaron, variante);
						await resolver(diferencia, suyo.destino);
						continue;
					}
					if (suyo.llegaron === 5) continue;
					const { diferencia } = await diferenciaEnTransito(servidor, suyo.llegaron);
					await resolver(diferencia, suyo.destino);
				}
				dia = dia.add({ days: 1 });
				const cuadre = await cuadrar(dia.toString());
				if ("yaCorrio" in cuadre) throw new Error("el cuadre ya había corrido");
				const { rows } = await servidor.base.dueno.query(
					"SELECT tipo, descripcion FROM excepciones WHERE cuadre_id = $1",
					[cuadre.cuadreId],
				);
				expect(rows).toEqual([]);
				expect(cuadre.estado).toBe("cuadro");
			}),
			{ numRuns: 15 },
		);
	});
});
