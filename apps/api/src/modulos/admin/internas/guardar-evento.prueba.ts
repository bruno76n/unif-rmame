/**
 * Prueba de `admin.guardar_evento`: el evento y su tarea quedan en la transacción de la acción.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("una acción que confirma deja sus eventos y la tarea encolada; una que falla, ninguno de los dos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Los eventos del módulo de prueba: los de la muestra ya estaban. */
	async function eventosDePrueba(): Promise<number> {
		const { rows } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM eventos WHERE modulo = 'prueba'");
		return Number(rows[0]?.n);
	}

	/** Las tareas `procesar_eventos` pendientes en Graphile Worker. */
	async function tareasPendientes(): Promise<number> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM graphile_worker.jobs WHERE task_identifier = 'procesar_eventos'",
		);
		return Number(rows[0]?.n);
	}

	it.each([
		["un error de regla", "con_regla", 422],
		["un error después de su interna", "despues_de_la_interna", 500],
		["un evento con un monto, que es un error del programa", "evento_con_monto", 500],
	])("una acción que falla por %s no deja eventos ni tarea", async (_caso, fallar, estado) => {
		const respuesta = await mandarAccion(servidor, "prueba.crear_nota", {
			datos: { texto: `falla ${fallar}`, monto_centavos: 1, fallar },
		});
		expect(respuesta.estado).toBe(estado);
		expect(await eventosDePrueba()).toBe(0);
		expect(await tareasPendientes()).toBe(0);
	});

	it("una acción que confirma deja su evento con quién y su comando, y una sola tarea pendiente aunque sean dos", async () => {
		const primera = await mandarAccion(servidor, "prueba.crear_nota", { datos: { texto: "uno", monto_centavos: 1 } });
		expect(primera.estado).toBe(200);
		await mandarAccion(servidor, "prueba.crear_nota", { datos: { texto: "dos", monto_centavos: 1 } });
		const { rows } = await servidor.base.dueno.query(
			`SELECT e.tipo, e.modulo, e.entidad, e.entidad_id, e.tablas, e.usuario_id, e.datos, c.id AS comando
			 FROM eventos e JOIN comandos_recibidos c ON c.id = e.comando_id WHERE e.modulo = 'prueba' ORDER BY e.creado_en`,
		);
		const id = String((primera.cuerpo.resultado as { id: string }).id);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			tipo: "nota.creada",
			modulo: "prueba",
			entidad: "prueba_notas",
			entidad_id: id,
			tablas: ["prueba_notas"],
			usuario_id: "01936f2e-0000-7000-8000-000000000002",
			datos: { nota_id: id },
		});
		expect(await tareasPendientes()).toBe(1);
	});

	it("la app no puede cambiar de un evento más que las columnas del proceso", async () => {
		await expect(servidor.base.app.query("UPDATE eventos SET tipo = 'otro.tipo'")).rejects.toMatchObject({
			code: "42501",
		});
		await expect(servidor.base.app.query("DELETE FROM eventos")).rejects.toMatchObject({ code: "42501" });
	});
});
