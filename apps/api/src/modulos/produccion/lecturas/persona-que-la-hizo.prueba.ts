/**
 * Prueba de `produccion.persona_que_la_hizo`: la persona propuesta de un rechazo o de un reclamo es la de más piezas
 * buenas vigentes de esa operación y talla, o la de base.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { loteCortado, subirDeLaTablet } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("La persona propuesta de un rechazo o de un reclamo es la de más piezas buenas de esa operación y talla, o la de base", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("gana quien hizo más buenas vigentes en los bultos de esa talla; sin registros, la de base", async () => {
		const lote = await loteCortado(servidor, await siembraDelCatalogo(servidor), [5, 3, 0]);
		const [mucho, poco] = [
			await nuevaPersona(servidor.base.dueno, "taller"),
			await nuevaPersona(servidor.base.dueno, "taller"),
		];
		const costados = lote.prenda.flujo.operaciones[1]?.flujoOperacionId ?? "";
		const talla4 = lote.bultos.find((bulto) => bulto.varianteId === lote.prenda.variantes["4"]);
		/** La tablet registra buenas en el bulto de la talla 4. */
		const registrar = (personaId: string, buenas: number) =>
			subirDeLaTablet(
				servidor,
				"produccion.registrar_operacion",
				{
					id: uuidv7(),
					bulto_id: talla4?.id,
					flujo_operacion_id: costados,
					piezas_buenas: buenas,
					piezas_danadas: 0,
					sin_internet: false,
				},
				personaId,
			);
		await registrar(poco, 2);
		await registrar(mucho, 3);
		/** La persona que propone la lectura para una talla. */
		const leer = (varianteId: string | undefined) =>
			enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
				contexto.lectura("produccion.persona_que_la_hizo", {
					lote_id: lote.loteId,
					flujo_operacion_id: costados,
					variante_id: varianteId,
				}),
			);
		expect(await leer(lote.prenda.variantes["4"])).toMatchObject({ persona_id: mucho });
		// En la talla 6 nadie registró: la de base.
		expect(await leer(lote.prenda.variantes["6"])).toMatchObject({ persona_id: lote.personaId });
		// Una cancelada no cuenta: si se cancelan las 3, gana quien hizo 2.
		await servidor.base.dueno.query(
			"UPDATE registros_operacion SET estado = 'cancelado', cancelado_en = now() WHERE persona_id = $1",
			[mucho],
		);
		expect(await leer(lote.prenda.variantes["4"])).toMatchObject({ persona_id: poco });
	});
});
