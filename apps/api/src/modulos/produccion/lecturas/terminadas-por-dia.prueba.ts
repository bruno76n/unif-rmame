/**
 * Prueba de `produccion.terminadas_por_dia`: las prendas terminadas de cada día de trabajo son las piezas buenas
 * vigentes de la última operación del flujo de su lote; es la cuenta que ven Producción y Dirección.
 * Fase 19 · docs/fases/19-web-principal.md («Criterios de terminado»: ninguna regla del negocio en la pantalla) y
 * docs/interfaz/fabrica/produccion.md («Pendientes»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { loteCortado, subirDeLaTablet } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la lectura. */
const terminadas = z.object({ dias: z.array(z.object({ fecha: z.string(), piezas: z.number() })) });

describe("Las prendas terminadas por día salen de una sola lectura de Producción: las buenas de la última operación del flujo del lote", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Las terminadas de los últimos días de trabajo. */
	const leer = async (dias: number) =>
		terminadas.parse(
			await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
				contexto.lectura("produccion.terminadas_por_dia", { dias }),
			),
		).dias;

	/** Cambia `general.dias_de_trabajo`. */
	const diasDeTrabajo = (valor: string) =>
		servidor.base.dueno.query("UPDATE parametros SET valor_texto = $1 WHERE clave = 'general.dias_de_trabajo'", [
			valor,
		]);

	it("son los últimos días de trabajo hasta hoy, del más viejo al más nuevo, sin los que no se trabajan", async () => {
		await diasDeTrabajo("1,2,3,4,5,6,7");
		const seguidos = await leer(8);
		expect(seguidos).toHaveLength(8);
		expect(new Set(seguidos.map((dia) => dia.fecha)).size).toBe(8);
		expect(seguidos.map((dia) => dia.fecha)).toEqual([...seguidos.map((dia) => dia.fecha)].sort());
		// Con un solo día de trabajo a la semana, ocho días de trabajo son ocho semanas.
		await diasDeTrabajo("3");
		const miercoles = await leer(8);
		expect(miercoles).toHaveLength(8);
		for (const dia of miercoles) expect(new Date(`${dia.fecha}T12:00:00Z`).getUTCDay()).toBe(3);
		await diasDeTrabajo("1,2,3,4,5,6");
	});

	it("cuentan las buenas vigentes de la última operación, no las de las demás ni las canceladas", async () => {
		await diasDeTrabajo("1,2,3,4,5,6,7");
		const lote = await loteCortado(servidor, await siembraDelCatalogo(servidor), [6, 0, 0]);
		const bulto = lote.bultos[0];
		const operaciones = lote.prenda.flujo.operaciones;
		const primera = operaciones[0]?.flujoOperacionId;
		const ultima = operaciones.at(-1)?.flujoOperacionId;
		const hoy = async () => (await leer(1))[0]?.piezas ?? 0;
		const antes = await hoy();
		/** La tablet registra buenas de una operación en el bulto. */
		const registrar = (flujoOperacionId: string | undefined, buenas: number) =>
			subirDeLaTablet(
				servidor,
				"produccion.registrar_operacion",
				{
					id: uuidv7(),
					bulto_id: bulto?.id,
					flujo_operacion_id: flujoOperacionId,
					piezas_buenas: buenas,
					piezas_danadas: 0,
					sin_internet: false,
				},
				lote.personaId,
			);
		await registrar(primera, 6);
		expect(await hoy()).toBe(antes);
		await registrar(ultima, 4);
		expect(await hoy()).toBe(antes + 4);
		await servidor.base.dueno.query(
			"UPDATE registros_operacion SET estado = 'cancelado', cancelado_en = now() WHERE lote_id = $1 AND flujo_operacion_id = $2",
			[lote.loteId, ultima],
		);
		expect(await hoy()).toBe(antes);
		await diasDeTrabajo("1,2,3,4,5,6");
	});
});
