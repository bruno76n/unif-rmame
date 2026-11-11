/**
 * Prueba de lo que cuida la base en los precios: nunca hay dos vigentes, y el rol de la app no puede cambiar un
 * precio más que para cerrarlo.
 * Fase 8 · docs/fases/08-catalogo.md (parte 4)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nuevoProducto, siembraDelCatalogo } from "../../nucleo/pruebas/catalogo-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";

describe("nunca hay dos precios vigentes; el rol de la app no puede cambiar un precio más que para cerrarlo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("un segundo vigente en la misma lista y talla choca; la app no cambia el precio, solo lo cierra, y cerrado ya no cambia", async () => {
		const siembra = await siembraDelCatalogo(servidor);
		const producto = await nuevoProducto(servidor, siembra);
		const otro = servidor.base.dueno.query(
			"INSERT INTO precios (id, lista_id, producto_id, precio_centavos, origen) VALUES ($1, $2, $3, 30000, 'ficha')",
			[uuidv7(), siembra.listas.mostrador, producto.producto_id],
		);
		await expect(otro).rejects.toMatchObject({ constraint: "precios_vigente" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT id FROM precios WHERE producto_id = $1 AND vigente_hasta IS NULL",
			[producto.producto_id],
		);
		const id = rows[0]?.id;
		const app = servidor.base.app;
		await expect(app.query("UPDATE precios SET precio_centavos = 1000 WHERE id = $1", [id])).rejects.toMatchObject({
			code: "42501",
		});
		await expect(app.query("UPDATE precios SET origen = 'migracion' WHERE id = $1", [id])).rejects.toMatchObject({
			code: "42501",
		});
		await app.query("UPDATE precios SET vigente_hasta = now(), fin_motivo = 'quitado' WHERE id = $1", [id]);
		await expect(
			app.query("UPDATE precios SET vigente_hasta = NULL, fin_motivo = NULL WHERE id = $1", [id]),
		).rejects.toMatchObject({ message: "un precio cerrado no cambia" });
	});
});
