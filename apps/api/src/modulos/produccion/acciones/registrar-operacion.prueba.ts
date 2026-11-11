/**
 * Prueba de `produccion.registrar_operacion` y `produccion.cancelar_registro`: un registro de la tablet se aplica con
 * su hora y la tarifa que valía; uno mal formado se aparta; uno que pasa del tope se aplica con su excepción; el que
 * completa la última operación termina el lote y cancelarlo lo reabre; no se cancela si la siguiente ya reportó o si
 * es del corte; la tarifa que pone Personal llega a los registros que no la tenían.
 * Fase 12 · docs/fases/12-produccion.md (parte 4)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { type LoteCortado, loteCortado, subirDeLaTablet } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un registro de la tablet se aplica con su hora y la tarifa que valía; lo mal formado se aparta; lo que pasa del tope se aplica con su excepción", () => {
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
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** La tablet registra en un bulto. */
	function registrar(lote: LoteCortado, bulto: number, operacion: number, buenas: number, danadas = 0, hora?: string) {
		return subirDeLaTablet(
			servidor,
			"produccion.registrar_operacion",
			{
				id: uuidv7(),
				bulto_id: lote.bultos[bulto]?.id,
				flujo_operacion_id: lote.prenda.flujo.operaciones[operacion]?.flujoOperacionId,
				piezas_buenas: buenas,
				piezas_danadas: danadas,
				sin_internet: hora !== undefined,
			},
			lote.personaId,
			hora,
		);
	}

	/** Producción cancela un registro. */
	async function cancelar(registroId: string, motivo = "Se registró de más") {
		const [{ v } = { v: 0 }] = await consultar("SELECT version::int AS v FROM registros_operacion WHERE id = $1", [
			registroId,
		]);
		return mandarAccion(
			servidor,
			"produccion.cancelar_registro",
			{ datos: { registro_id: registroId, motivo }, version: v },
			"produccion",
		);
	}

	it("se aplica con la hora de la tablet y la tarifa que valía entonces; las dañadas son merma del Taller", async () => {
		const lote = await loteCortado(servidor, siembra);
		const costados = lote.prenda.flujo.operaciones[1]?.flujoOperacionId;
		// La tarifa de 1.20 valía desde ayer; la de 1.50, desde hoy, después de que se hizo.
		const ayer = new Date(Date.now() - 86_400_000);
		const hace = new Date(Date.now() - 3_600_000).toISOString();
		await servidor.base.dueno.query(
			"INSERT INTO tarifas_operacion (id, flujo_operacion_id, tarifa_centavos, vigente_desde, vigente_hasta) VALUES ($1, $2, 120, $3, now() - interval '30 minutes')",
			[uuidv7(), costados, ayer.toISOString()],
		);
		await servidor.base.dueno.query(
			"INSERT INTO tarifas_operacion (id, flujo_operacion_id, tarifa_centavos, vigente_desde) VALUES ($1, $2, 150, now() - interval '30 minutes')",
			[uuidv7(), costados],
		);
		const respuesta = await registrar(lote, 0, 1, 10, 2, hace);
		expect(respuesta).toMatchObject({ resultado: "aplicado" });
		expect(
			await consultar(
				"SELECT piezas_buenas, piezas_danadas, tarifa_centavos::int AS tarifa, hecho_en = $2::timestamptz AS con_su_hora, sin_internet FROM registros_operacion WHERE lote_id = $1 AND origen = 'tablet'",
				[lote.loteId, hace],
			),
		).toEqual([{ piezas_buenas: 10, piezas_danadas: 2, tarifa: 120, con_su_hora: true, sin_internet: true }]);
		expect(
			await consultar(
				"SELECT piezas_merma, piezas_terminadas FROM lote_tallas WHERE lote_id = $1 AND variante_id = $2",
				[lote.loteId, lote.bultos[0]?.varianteId],
			),
		).toEqual([{ piezas_merma: 2, piezas_terminadas: 0 }]);
		expect(
			await consultar(
				`SELECT sum(e.piezas)::int AS piezas FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id
				 WHERE u.codigo = 'TAL' AND e.variante_id = $1`,
				[lote.bultos[0]?.varianteId],
			),
		).toEqual([{ piezas: 22 }]);
	});

	it("lo mal formado se aparta: la operación de corte, un bulto que no existe, sin piezas; lo que pasa del tope se aplica con su excepción", async () => {
		const lote = await loteCortado(servidor, siembra);
		expect(await registrar(lote, 0, 0, 5)).toMatchObject({ resultado: "apartado" });
		expect(
			await subirDeLaTablet(
				servidor,
				"produccion.registrar_operacion",
				{
					id: uuidv7(),
					bulto_id: uuidv7(),
					flujo_operacion_id: lote.prenda.flujo.operaciones[1]?.flujoOperacionId,
					piezas_buenas: 1,
					piezas_danadas: 0,
					sin_internet: false,
				},
				lote.personaId,
			),
		).toMatchObject({ resultado: "apartado" });
		expect(await registrar(lote, 0, 1, 0, 0)).toMatchObject({ resultado: "apartado" });
		// El bulto trae 24: registrar 30 se aplica y abre pasa_tope_bulto.
		expect(await registrar(lote, 0, 1, 30)).toMatchObject({
			resultado: "excepcion",
			excepciones: [{ codigo: "pasa_tope_bulto" }],
		});
		expect(
			await consultar("SELECT count(*)::int AS n FROM registros_operacion WHERE lote_id = $1 AND origen = 'tablet'", [
				lote.loteId,
			]),
		).toEqual([{ n: 1 }]);
	});

	it("el registro que completa la última operación termina el lote; cancelarlo lo reabre; la siguiente que ya reportó no deja cancelar; el del corte no se cancela", async () => {
		const lote = await loteCortado(servidor, siembra, [3, 0, 0]);
		const [primero] = lote.bultos;
		await registrar(lote, 0, 1, primero?.piezas ?? 0);
		await registrar(lote, 0, 2, primero?.piezas ?? 0);
		expect(await consultar("SELECT estado FROM lotes WHERE id = $1", [lote.loteId])).toEqual([{ estado: "terminado" }]);
		const [deLaPrimera, deLaUltima] = await consultar(
			`SELECT r.id FROM registros_operacion r JOIN flujo_operaciones f ON f.id = r.flujo_operacion_id
			 WHERE r.lote_id = $1 AND r.origen = 'tablet' ORDER BY f.orden`,
			[lote.loteId],
		);
		expect((await cancelar(String(deLaPrimera?.id))).cuerpo).toMatchObject({
			codigo: "operacion_siguiente_ya_reporto",
			mensaje: `La operación siguiente ya reportó 3: primero se cancela lo de ${lote.prenda.flujo.operaciones[2]?.nombre}`,
		});
		const cancelado = await cancelar(String(deLaUltima?.id));
		expect(cancelado.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^Registro cancelado: 3 piezas menos para /),
		});
		expect(await consultar("SELECT estado, terminado_en FROM lotes WHERE id = $1", [lote.loteId])).toEqual([
			{ estado: "en_proceso", terminado_en: null },
		]);
		expect((await cancelar(String(deLaUltima?.id))).cuerpo).toMatchObject({ codigo: "registro_ya_cancelado" });
		const [delCorte] = await consultar("SELECT id FROM registros_operacion WHERE lote_id = $1 AND origen = 'corte'", [
			lote.loteId,
		]);
		expect((await cancelar(String(delCorte?.id))).cuerpo).toMatchObject({ codigo: "registro_de_corte" });
	});

	it("los registros del corte nacen al cerrarlo: uno por bulto, a nombre de quien cortó", async () => {
		const lote = await loteCortado(servidor, siembra, [30, 10, 0]);
		expect(
			await consultar(
				"SELECT r.piezas_buenas, r.persona_id FROM registros_operacion r JOIN bultos b ON b.id = r.bulto_id WHERE r.lote_id = $1 AND r.origen = 'corte' ORDER BY b.numero",
				[lote.loteId],
			),
		).toEqual(lote.bultos.map((bulto) => ({ piezas_buenas: bulto.piezas, persona_id: lote.personaId })));
	});

	it("la tarifa que pone Personal llega a los registros que no la tenían", async () => {
		const lote = await loteCortado(servidor, siembra);
		await registrar(lote, 0, 1, 5);
		const costados = lote.prenda.flujo.operaciones[1]?.flujoOperacionId;
		const puesta = await mandarAccion(
			servidor,
			"personal.poner_tarifa_operacion",
			{ datos: { flujo_operacion_id: costados, tarifa_centavos: 180 } },
			"personal_sueldos",
		);
		expect(puesta.cuerpo.avisos).toEqual(["1 registro sin tarifa ya la tomó"]);
		expect(
			await consultar(
				"SELECT tarifa_centavos::int AS tarifa, tarifa_puesta_en IS NOT NULL AS puesta FROM registros_operacion WHERE flujo_operacion_id = $1",
				[costados],
			),
		).toEqual([{ tarifa: 180, puesta: true }]);
	});

	it("cancelar lo que sobró de una operación anterior no reabre un lote que sigue completo", async () => {
		const lote = await loteCortado(servidor, siembra, [3, 0, 0]);
		await registrar(lote, 0, 1, 3);
		// Dos de más en la primera operación: se aplican con su excepción.
		expect(await registrar(lote, 0, 1, 2)).toMatchObject({ resultado: "excepcion" });
		await registrar(lote, 0, 2, 3);
		expect(await consultar("SELECT estado FROM lotes WHERE id = $1", [lote.loteId])).toEqual([{ estado: "terminado" }]);
		const [sobra] = await consultar(
			"SELECT id FROM registros_operacion WHERE lote_id = $1 AND origen = 'tablet' AND piezas_buenas = 2",
			[lote.loteId],
		);
		expect((await cancelar(String(sobra?.id))).estado).toBe(200);
		expect(await consultar("SELECT estado FROM lotes WHERE id = $1", [lote.loteId])).toEqual([{ estado: "terminado" }]);
	});

	it("con el lote ya revisado: lo que registra la tablet se aplica con su excepción y nada se cancela", async () => {
		const lote = await loteCortado(servidor, siembra, [3, 0, 0]);
		await registrar(lote, 0, 1, 3);
		await registrar(lote, 0, 2, 3);
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("produccion.marcar_lote_revisado", { lote_id: lote.loteId }),
		);
		expect(await registrar(lote, 0, 1, 1)).toMatchObject({
			resultado: "excepcion",
			excepciones: [{ codigo: "lote_no_en_proceso" }],
		});
		const [ultimo] = await consultar(
			"SELECT id FROM registros_operacion WHERE lote_id = $1 AND origen = 'tablet' ORDER BY recibido_en DESC LIMIT 1",
			[lote.loteId],
		);
		expect((await cancelar(String(ultimo?.id))).cuerpo).toMatchObject({
			codigo: "lote_ya_revisado",
			mensaje: `${lote.folio} ya pasó por Calidad: este registro ya no se cancela.`,
		});
	});
});
