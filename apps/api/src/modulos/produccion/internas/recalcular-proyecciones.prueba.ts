/**
 * Prueba de `produccion.recalcular_proyecciones`: con cualquier descuadre, las terminadas y la merma de cada talla
 * vuelven a ser la suma de sus registros vigentes; correrlo dos veces deja lo mismo; el lote que con eso queda completo
 * se termina.
 * Fase 12 · docs/fases/12-produccion.md («Criterios de terminado»)
 */

import fc from "fast-check";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { type LoteCortado, loteCortado, subirDeLaTablet } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la interna. */
const recalculado = z.object({ siguiente: z.uuid().nullable(), corregidas: z.number() });

describe("Las proyecciones de cada talla siempre son la suma de sus registros vigentes", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** La tablet registra en un bulto. */
	async function registrar(lote: LoteCortado, bulto: number, operacion: number, buenas: number, danadas = 0) {
		const respuesta = await subirDeLaTablet(
			servidor,
			"produccion.registrar_operacion",
			{
				id: uuidv7(),
				bulto_id: lote.bultos[bulto]?.id,
				flujo_operacion_id: lote.prenda.flujo.operaciones[operacion]?.flujoOperacionId,
				piezas_buenas: buenas,
				piezas_danadas: danadas,
				sin_internet: false,
			},
			lote.personaId,
		);
		expect(respuesta).toMatchObject({ resultado: "aplicado" });
	}

	/** Corre la interna por tramos, como el cuadre (con sus eventos y su bitácora), hasta acabar los lotes; regresa cuántas tallas corrigió. */
	async function recalcular(): Promise<number> {
		let corregidas = 0;
		let despues: string | null = null;
		do {
			const tramo = recalculado.parse(
				await enAccionDePrueba(
					crearBase(servidor.base.app),
					servidor.modulos,
					(contexto) =>
						contexto.interna("produccion.recalcular_proyecciones", {
							limite: 1,
							...(despues === null ? {} : { despues_de: despues }),
						}),
					{ guardarEventos: true, escribirBitacora: true },
				),
			);
			corregidas += tramo.corregidas;
			despues = tramo.siguiente;
		} while (despues !== null);
		return corregidas;
	}

	/** Lo que guardan las tallas de un lote y lo que dicen sus registros vigentes, por talla. */
	async function tallasDe(loteId: string) {
		return consultar(
			`SELECT lt.id, lt.piezas_terminadas AS terminadas, lt.piezas_merma AS merma,
				(SELECT coalesce(sum(r.piezas_danadas), 0)::int FROM registros_operacion r JOIN bultos b ON b.id = r.bulto_id
					WHERE b.lote_id = lt.lote_id AND b.variante_id = lt.variante_id AND r.estado = 'vigente') AS merma_real,
				(SELECT coalesce(sum(r.piezas_buenas), 0)::int FROM registros_operacion r JOIN bultos b ON b.id = r.bulto_id
					JOIN flujo_operaciones f ON f.id = r.flujo_operacion_id
					WHERE b.lote_id = lt.lote_id AND b.variante_id = lt.variante_id AND r.estado = 'vigente'
						AND f.orden = (SELECT max(o.orden) FROM flujo_operaciones o WHERE o.flujo_id = f.flujo_id AND o.baja_en IS NULL)
				) AS terminadas_real
			FROM lote_tallas lt WHERE lt.lote_id = $1 ORDER BY lt.id`,
			[loteId],
		);
	}

	it("con terminadas y merma al azar en cada talla, el recálculo las deja en lo que dicen los registros, y otra vuelta no corrige nada", async () => {
		const lote = await loteCortado(servidor, siembra);
		await registrar(lote, 0, 1, 6, 2);
		await registrar(lote, 0, 2, 3, 1);
		await registrar(lote, 1, 1, 4);
		await registrar(lote, 1, 2, 2, 1);
		// Uno cancelado no cuenta.
		await registrar(lote, 1, 2, 1);
		const [cancelable] = await consultar(
			"SELECT id, version::int AS v FROM registros_operacion WHERE bulto_id = $1 AND origen = 'tablet' ORDER BY recibido_en DESC LIMIT 1",
			[lote.bultos[1]?.id],
		);
		const cancelado = await mandarAccion(
			servidor,
			"produccion.cancelar_registro",
			{ datos: { registro_id: cancelable?.id, motivo: "Se registró de más" }, version: cancelable?.v },
			"produccion",
		);
		expect(cancelado.estado).toBe(200);
		const tallas = await tallasDe(lote.loteId);
		await fc.assert(
			fc.asyncProperty(
				fc.array(fc.record({ terminadas: fc.nat({ max: 10 }), merma: fc.nat({ max: 10 }) }), {
					minLength: tallas.length,
					maxLength: tallas.length,
				}),
				async (descuadre) => {
					for (const [i, talla] of tallas.entries()) {
						await consultar("UPDATE lote_tallas SET piezas_terminadas = $2, piezas_merma = $3 WHERE id = $1", [
							talla.id,
							descuadre[i]?.terminadas,
							descuadre[i]?.merma,
						]);
					}
					await recalcular();
					const despues = await tallasDe(lote.loteId);
					expect(despues.every((talla) => talla.terminadas === talla.terminadas_real)).toBe(true);
					expect(despues.every((talla) => talla.merma === talla.merma_real)).toBe(true);
					expect(await recalcular()).toBe(0);
				},
			),
			{ numRuns: 25 },
		);
		const [{ estado } = { estado: "" }] = await consultar("SELECT estado FROM lotes WHERE id = $1", [lote.loteId]);
		expect(estado).toBe("en_proceso");
	});

	it("si con la corrección un lote en proceso queda completo, lo termina como un registro y guarda `lote.terminado`", async () => {
		const lote = await loteCortado(servidor, siembra, [2, 0, 0]);
		await registrar(lote, 0, 1, 2);
		await registrar(lote, 0, 2, 2);
		// La tablet ya lo terminó; se descuadra a mano para que lo corrija el recálculo.
		await consultar("UPDATE lotes SET estado = 'en_proceso', terminado_en = NULL WHERE id = $1", [lote.loteId]);
		await consultar("UPDATE lote_tallas SET piezas_terminadas = 0 WHERE lote_id = $1", [lote.loteId]);
		const [{ v: version } = { v: 0 }] = await consultar("SELECT version::int AS v FROM lotes WHERE id = $1", [
			lote.loteId,
		]);
		const terminados = () =>
			consultar("SELECT count(*)::int AS n FROM eventos WHERE tipo = 'lote.terminado' AND entidad_id = $1", [
				lote.loteId,
			]);
		const [{ n: antes } = { n: 0 }] = await terminados();
		expect(await recalcular()).toBe(1);
		expect(await consultar("SELECT estado FROM lotes WHERE id = $1", [lote.loteId])).toEqual([{ estado: "terminado" }]);
		expect(await terminados()).toEqual([{ n: antes + 1 }]);
		// Sus tallas cambiaron: su versión subió.
		const [{ v: despues } = { v: 0 }] = await consultar("SELECT version::int AS v FROM lotes WHERE id = $1", [
			lote.loteId,
		]);
		expect(despues).toBeGreaterThan(version);
	});
});
