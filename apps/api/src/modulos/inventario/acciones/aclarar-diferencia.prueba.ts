/**
 * Prueba de `inventario.aclarar_diferencia`: cada aclaración mueve lo pendiente adonde dice su tabla y deja el tramo
 * en cero en el libro; lo que entra a Aduana entra en un A- nuevo; la que no aplica da `aclaracion_no_aplica`;
 * `venia_en_otro` resuelve juntas las dos DF- espejo sin cambiar el lugar que recibió, una sola vez aunque lleguen dos
 * a la vez; `perdida` pide su AJ-; la de material se aclara sin ajuste solo cuando ya no está en negativo.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { materialesDePrueba } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import {
	aclararDePrueba,
	diferenciaEnCamino,
	diferenciaEnTransito,
	libroPorUbicacion,
	motivoDeAjuste,
	salidaDe,
} from "../../../nucleo/pruebas/diferencias-de-prueba.ts";
import { ubicacionesPorCodigo, variantesLibres } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { abrirDiferencia } from "../dominio/diferencias.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";

describe("Cada aclaración mueve lo pendiente adonde dice su tabla y deja el tramo en cero; nada entra a Aduana sin su A-", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Lo que quedó en el libro en los tramos de un traspaso, por tramo. */
	function enSusTramos(traspasoId: string) {
		return consultar(
			`WITH t AS (
				SELECT destino_ubicacion_id AS u, piezas AS p FROM movimiento_lineas WHERE traspaso_id = $1
				UNION ALL SELECT origen_ubicacion_id, -piezas FROM movimiento_lineas WHERE traspaso_id = $1
			)
			SELECT u.codigo, sum(p)::int AS piezas FROM t JOIN ubicaciones u ON u.id = t.u
			WHERE u.tipo IN ('transito', 'en_camino_aduana') GROUP BY u.codigo HAVING sum(p) <> 0`,
			[traspasoId],
		);
	}

	/** Cómo quedó una DF-. */
	async function comoQuedo(diferenciaId: string) {
		const [fila] = await consultar(
			`SELECT estado, resolucion, aclaracion, motivo_resolucion, traspaso_nuevo_id, aclarada_con_diferencia_id,
				ajuste_id, resuelta_en IS NOT NULL AS con_hora FROM diferencias WHERE id = $1`,
			[diferenciaId],
		);
		return fila;
	}

	it("`llego` en camino a aduana: lo que faltó pasa a Aduana en un A- nuevo, con su origen y su destino, y el tramo queda en cero", async () => {
		const { diferencia, variante, traspasoId } = await diferenciaEnCamino(servidor, 3, 2);
		expect(await enSusTramos(traspasoId)).toEqual([{ codigo: "ECA", piezas: 1 }]);
		const respuesta = await aclararDePrueba(servidor, diferencia, { aclaracion: "llego" });
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^DF-\d+ aclarada: 1 piezas en aduana en A-\d+$/),
		});
		expect(await enSusTramos(traspasoId)).toEqual([]);
		expect(await libroPorUbicacion(servidor, [variante])).toEqual([{ codigo: "ADU", piezas: 3 }]);
		const nuevo = await consultar(
			`SELECT t.tipo, t.estado, o.codigo AS origen, d.codigo AS destino, l.piezas_recibidas_aduana AS piezas
			 FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id JOIN ubicaciones o ON o.id = t.origen_ubicacion_id
			 JOIN ubicaciones d ON d.id = t.destino_ubicacion_id WHERE t.id = $1`,
			[salidaDe(respuesta).traspaso_id],
		);
		expect(nuevo).toEqual([{ tipo: "solicitud_tienda", estado: "en_aduana", origen: "BOD", destino: "T1", piezas: 1 }]);
		// Aduana lo ve como cualquier otra partida.
		expect(
			await consultar("SELECT piezas FROM partidas_aduana WHERE traspaso_id = $1", [salidaDe(respuesta).traspaso_id]),
		).toEqual([{ piezas: 1 }]);
		expect(await comoQuedo(diferencia)).toEqual({
			estado: "resuelta",
			resolucion: "aclarada",
			aclaracion: "llego",
			motivo_resolucion: "Se aclaró al revisar",
			traspaso_nuevo_id: salidaDe(respuesta).traspaso_id,
			aclarada_con_diferencia_id: null,
			ajuste_id: null,
			con_hora: true,
		});
		// Ya no está por aclarar.
		expect((await aclararDePrueba(servidor, diferencia, { aclaracion: "llego" })).cuerpo).toMatchObject({
			codigo: "no_por_aclarar",
		});
	});

	it("`no_salio` en camino: lo que faltó regresa a Bodega; lo que sobró sale de Bodega. `llego` con lo que sobró en Aduana no aplica", async () => {
		const falto = await diferenciaEnCamino(servidor, 3, 2);
		await aclararDePrueba(servidor, falto.diferencia, { aclaracion: "no_salio" });
		expect(await enSusTramos(falto.traspasoId)).toEqual([]);
		expect(await libroPorUbicacion(servidor, [falto.variante])).toEqual([
			{ codigo: "ADU", piezas: 2 },
			{ codigo: "BOD", piezas: 1 },
		]);
		const sobro = await diferenciaEnCamino(servidor, 3, 4);
		expect((await aclararDePrueba(servidor, sobro.diferencia, { aclaracion: "llego" })).cuerpo).toMatchObject({
			codigo: "aclaracion_no_aplica",
			mensaje: expect.stringMatching(/^Esa aclaración no aplica a DF-\d+\.$/),
		});
		// Una aclaración de material tampoco aplica a una de recepción.
		expect((await aclararDePrueba(servidor, sobro.diferencia, { aclaracion: "aclarada" })).cuerpo).toMatchObject({
			codigo: "aclaracion_no_aplica",
		});
		await aclararDePrueba(servidor, sobro.diferencia, { aclaracion: "no_salio" });
		expect(await enSusTramos(sobro.traspasoId)).toEqual([]);
		expect(await libroPorUbicacion(servidor, [sobro.variante])).toEqual([
			{ codigo: "ADU", piezas: 4 },
			{ codigo: "BOD", piezas: -1 },
		]);
	});

	it("en tránsito: `llego` pasa lo que faltó a Bodega sin A-; `no_salio` lo regresa a Aduana en un A- nuevo; lo de más no sale de Aduana", async () => {
		const llego = await diferenciaEnTransito(servidor, 4);
		const respuesta = await aclararDePrueba(servidor, llego.diferencia, { aclaracion: "llego" });
		expect(respuesta.cuerpo.resultado).not.toHaveProperty("traspaso_id");
		expect(await enSusTramos(llego.traspasoId)).toEqual([]);
		expect(await libroPorUbicacion(servidor, [llego.variante])).toEqual([{ codigo: "BOD", piezas: 5 }]);
		const noSalio = await diferenciaEnTransito(servidor, 4);
		const regreso = await aclararDePrueba(servidor, noSalio.diferencia, { aclaracion: "no_salio" });
		expect(regreso.cuerpo.resultado).toMatchObject({ traspaso_id: expect.any(String) });
		expect(await libroPorUbicacion(servidor, [noSalio.variante])).toEqual([
			{ codigo: "ADU", piezas: 1 },
			{ codigo: "BOD", piezas: 4 },
		]);
		const sobro = await diferenciaEnTransito(servidor, 6);
		expect((await aclararDePrueba(servidor, sobro.diferencia, { aclaracion: "no_salio" })).cuerpo).toMatchObject({
			codigo: "aclaracion_no_aplica",
		});
		await aclararDePrueba(servidor, sobro.diferencia, { aclaracion: "llego" });
		expect(await enSusTramos(sobro.traspasoId)).toEqual([]);
		expect(await libroPorUbicacion(servidor, [sobro.variante])).toEqual([{ codigo: "BOD", piezas: 5 }]);
		// Un traspaso que tuvo DF- queda `con_diferencia` aunque se aclaren todas.
		expect(await consultar("SELECT estado FROM traspasos WHERE id = $1", [sobro.traspasoId])).toEqual([
			{ estado: "con_diferencia" },
		]);
	});

	it("`venia_en_otro` resuelve juntas las dos DF- espejo sin cambiar el lugar que recibió; dos a la vez no la resuelven dos veces", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		const falta = await diferenciaEnCamino(servidor, 5, 3, variante);
		const sobra = await diferenciaEnCamino(servidor, 5, 7, variante);
		const otra = await diferenciaEnCamino(servidor, 5, 6, variante);
		expect((await aclararDePrueba(servidor, falta.diferencia, { aclaracion: "venia_en_otro" })).cuerpo).toMatchObject({
			error: "validacion",
			campos: { otra_diferencia_id: "Escoge con qué diferencia se cruzó." },
		});
		// La de +1 no es su espejo: no tiene las mismas piezas al revés.
		expect(
			(
				await aclararDePrueba(servidor, falta.diferencia, {
					aclaracion: "venia_en_otro",
					otra_diferencia_id: otra.diferencia,
				})
			).cuerpo,
		).toMatchObject({ codigo: "espejo_no_corresponde" });
		const aduanaAntes = await libroPorUbicacion(servidor, [variante]);
		const respuestas = await Promise.all([
			aclararDePrueba(servidor, falta.diferencia, {
				aclaracion: "venia_en_otro",
				otra_diferencia_id: sobra.diferencia,
			}),
			aclararDePrueba(servidor, sobra.diferencia, {
				aclaracion: "venia_en_otro",
				otra_diferencia_id: falta.diferencia,
			}),
		]);
		expect(respuestas.map((respuesta) => respuesta.estado).filter((estado) => estado === 200)).toEqual([200]);
		expect(await enSusTramos(falta.traspasoId)).toEqual([]);
		expect(await enSusTramos(sobra.traspasoId)).toEqual([]);
		// Aduana no cambió: los dos renglones cruzan por ella.
		const sinOtra = (await libroPorUbicacion(servidor, [variante])).filter((fila) => fila.codigo !== "ECA");
		expect(sinOtra).toEqual(aduanaAntes.filter((fila) => fila.codigo !== "ECA"));
		expect([await comoQuedo(falta.diferencia), await comoQuedo(sobra.diferencia)]).toEqual([
			expect.objectContaining({
				estado: "resuelta",
				aclaracion: "venia_en_otro",
				aclarada_con_diferencia_id: sobra.diferencia,
			}),
			expect.objectContaining({
				estado: "resuelta",
				aclaracion: "venia_en_otro",
				aclarada_con_diferencia_id: falta.diferencia,
			}),
		]);
		expect(
			await consultar(
				"SELECT count(*)::int AS n FROM movimientos WHERE documento_id = ANY($1::uuid[]) AND tipo = 'aclaracion_recepcion'",
				[[falta.diferencia, sobra.diferencia]],
			),
		).toEqual([{ n: 1 }]);
	});

	it("`perdida` pide un AJ- con su motivo de la lista y la DF- espera autorización con él; sin motivo, no", async () => {
		const { diferencia } = await diferenciaEnCamino(servidor, 3, 1);
		expect((await aclararDePrueba(servidor, diferencia, { aclaracion: "perdida" })).cuerpo).toMatchObject({
			error: "validacion",
			campos: { motivo_id: "Escoge el motivo del ajuste." },
		});
		expect((await aclararDePrueba(servidor, diferencia, { aclaracion: "perdida", motivo: "no" })).cuerpo).toMatchObject(
			{ error: "validacion", campos: { motivo: expect.stringMatching(/^Escribe al menos \d+ letras\.$/) } },
		);
		const respuesta = await aclararDePrueba(servidor, diferencia, {
			aclaracion: "perdida",
			motivo_id: await motivoDeAjuste(servidor),
		});
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^AJ-\d{4}: 1 diferencia espera autorización de Dirección$/),
		});
		const ajusteId = salidaDe(respuesta).ajuste_id;
		expect(await comoQuedo(diferencia)).toMatchObject({ estado: "esperando_autorizacion", ajuste_id: ajusteId });
		expect(
			await consultar(
				`SELECT a.estado, a.origen, u.codigo, l.piezas_diferencia, l.traspaso_id IS NOT NULL AS con_traspaso, au.tipo, au.resumen
				 FROM ajustes a JOIN ajuste_lineas l ON l.ajuste_id = a.id JOIN ubicaciones u ON u.id = a.ubicacion_id
				 JOIN autorizaciones au ON au.id = a.autorizacion_id WHERE a.id = $1`,
				[ajusteId],
			),
		).toEqual([
			{
				estado: "esperando_autorizacion",
				origen: "diferencia_recepcion",
				codigo: "ECA",
				piezas_diferencia: -2,
				con_traspaso: true,
				tipo: "ajuste_inventario",
				resumen: expect.stringMatching(/^Ajuste AJ-\d{4} en En camino a aduana: 1 diferencia$/),
			},
		]);
	});

	it("una de material se aclara sin ajuste solo cuando ya no está en negativo; con ajuste, pide lo que faltaba", async () => {
		const [material = ""] = await materialesDePrueba(servidor, 1, "avio");
		const bodega = ubicacion.BOD ?? "";
		const enBodega = (cantidad: string, entra: boolean) =>
			enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
				escribirMovimiento(contexto, {
					tipo: "ajuste",
					documento: { tipo: "ajuste", id: uuidv7() },
					renglones: [
						{ origen: entra ? null : bodega, destino: entra ? bodega : null, materialId: material, cantidad },
					],
					clave: uuidv7(),
				}),
			);
		const abrir = () =>
			enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
				abrirDiferencia(contexto, {
					origen: "material_corte",
					ubicacionId: bodega,
					aCargoUbicacionId: bodega,
					hueco: { materialId: material, cantidad: "-3" },
					descripcion: "Se entregaron 3 pza a un lote sin existencia en Bodega",
				}),
			);
		await enBodega("3", false);
		const { diferenciaId } = await abrir();
		expect((await aclararDePrueba(servidor, diferenciaId, { aclaracion: "llego" })).cuerpo).toMatchObject({
			codigo: "aclaracion_no_aplica",
		});
		expect((await aclararDePrueba(servidor, diferenciaId, { aclaracion: "aclarada" })).cuerpo).toMatchObject({
			codigo: "sigue_en_negativo",
			mensaje: expect.stringMatching(/ sigue en negativo en Bodega: aclárala con ajuste\.$/),
		});
		await enBodega("5", true);
		const respuesta = await aclararDePrueba(servidor, diferenciaId, { aclaracion: "aclarada" });
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: expect.stringMatching(/^DF-\d+ aclarada$/) });
		expect(await comoQuedo(diferenciaId)).toMatchObject({ estado: "resuelta", aclaracion: "aclarada" });
		// Con ajuste: el AJ- mete lo que faltaba.
		await enBodega("5", false);
		const otra = await abrir();
		const conAjuste = await aclararDePrueba(servidor, otra.diferenciaId, {
			aclaracion: "ajuste",
			motivo_id: await motivoDeAjuste(servidor),
		});
		expect(
			await consultar(
				"SELECT origen, cantidad_diferencia FROM ajuste_lineas l JOIN ajustes a ON a.id = l.ajuste_id WHERE a.id = $1",
				[salidaDe(conAjuste).ajuste_id],
			),
		).toEqual([{ origen: "diferencia_material", cantidad_diferencia: "3.000" }]);
	});

	it("una DF- por contar no se aclara: se cuenta", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		const { diferenciaId } = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			abrirDiferencia(contexto, {
				origen: "cuadre",
				ubicacionId: ubicacion.BOD ?? "",
				aCargoUbicacionId: ubicacion.BOD ?? "",
				hueco: { varianteId: variante, piezas: -2 },
				descripcion: "El cuadre halló −2 en Bodega",
			}),
		);
		expect((await aclararDePrueba(servidor, diferenciaId, { aclaracion: "llego" })).cuerpo).toMatchObject({
			codigo: "no_por_aclarar",
		});
	});
});
