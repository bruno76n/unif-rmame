/**
 * Prueba de `compras.material_por_que` con los datos de la muestra: «La cuenta» cuadra (hay + en camino − comprometido
 * = libre), lo comprometido va lote por lote con su folio, y los insumos que lleva la pantalla, corridos con
 * `proyectarMaterial` del paquete compartido, dan el mismo estado, la misma línea y el mismo pedido sugerido que la
 * cuenta del servidor; un material que no existe no viene; y solo la piden las cuentas con Compras.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada consulta revisa el departamento y el permiso fino en el
 * servidor…» y «Lo que la pantalla calcula mientras se escribe sale del paquete compartido y da lo mismo que la
 * acción al guardar»)
 */

import { aMilesimosConSigno } from "@uniformame/compartido/calculos/cuenta-material";
import { proyectarMaterial } from "@uniformame/compartido/calculos/proyeccion-material";
import { materialPorQue } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El «por qué» de un material: la cuenta y la proyección que corre la pantalla", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la cuenta cuadra y los insumos dan lo mismo en la pantalla que en el servidor, en cada material", async () => {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM materiales WHERE baja_en IS NULL ORDER BY nombre");
		for (const { id } of rows as { id: string }[]) {
			const respuesta = await pedirConsulta(servidor, "compras.material_por_que", { material_id: id }, "compras");
			expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
			const { material, cuenta, insumos, sugerido, resumen } = materialPorQue.resultado.parse(
				respuesta.cuerpo.resultado,
			);
			const hay = aMilesimosConSigno(cuenta.hay_bodega) + aMilesimosConSigno(cuenta.hay_aduana);
			expect(hay + aMilesimosConSigno(cuenta.en_camino_total) - aMilesimosConSigno(cuenta.comprometido_total)).toBe(
				aMilesimosConSigno(cuenta.libre),
			);
			expect(cuenta.comprometido.every((lote) => /^L-/.test(lote.folio) && lote.detalle.length > 0)).toBe(true);
			const enLaPantalla = proyectarMaterial({
				hoy: insumos.hoy,
				libre: BigInt(insumos.libre),
				llegadas: insumos.llegadas.map((llegada) => ({ dia: llegada.dia, cantidad: BigInt(llegada.cantidad) })),
				consumoNormal: insumos.consumo_normal === null ? null : BigInt(insumos.consumo_normal),
				factores: insumos.factores.map(BigInt),
				plazo: insumos.plazo,
				minimo: BigInt(insumos.minimo),
				multiplo: BigInt(insumos.multiplo),
				diasCubre: insumos.dias_cubre,
				limites: {
					diasMaximos: insumos.limites.dias_maximos,
					diasPedirEstaSemana: insumos.limites.dias_pedir_esta_semana,
					diasMasDeSeisMeses: insumos.limites.dias_mas_de_seis_meses,
				},
			});
			expect(enLaPantalla.estado, material.nombre).toBe(material.estado);
			expect(enLaPantalla.linea, material.nombre).toBe(material.linea);
			expect(enLaPantalla.porPedir, material.nombre).toBe(BigInt(sugerido.cantidad) * 1000n);
			if (material.estado === "sin_tiempo_de_entrega") expect(resumen).toMatch(/sin material\.$/);
		}
	});

	it("un material que no existe no viene", async () => {
		const respuesta = await pedirConsulta(servidor, "compras.material_por_que", { material_id: uuidv7() }, "compras");
		expect(respuesta.estado).toBe(404);
	});

	it("solo la piden las cuentas con Compras", async () => {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM materiales LIMIT 1");
		const id = String(rows[0]?.id);
		for (const quien of ["aduana", "bodega"]) {
			expect((await pedirConsulta(servidor, "compras.material_por_que", { material_id: id }, quien)).estado).toBe(403);
		}
	});
});
