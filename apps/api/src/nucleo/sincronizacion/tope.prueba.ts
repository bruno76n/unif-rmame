/**
 * Prueba del tope seguro con dos conexiones a la base: la transacción que tomó su número antes y confirmó
 * después que otra no se salta.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md («Criterios de terminado»)
 *
 * Con un cursor por versión, el renglón de la primera quedaría detrás del cursor y nunca bajaría. Con el
 * número de transacción y el tope (`pg_snapshot_xmin`), mientras la primera siga abierta la ventana se
 * cierra antes de su número, y su renglón baja en la ventana siguiente.
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bajarHastaTener, bajarTodo, fotoCompleta } from "../pruebas/bajada-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

describe("una transacción que tomó su número antes y confirmó después que otra no se salta", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("su renglón baja en la siguiente ventana; el de la otra, una sola vez", async () => {
		const { cursor } = await fotoCompleta(servidor);
		const primera = await servidor.base.dueno.connect();
		const segunda = await servidor.base.dueno.connect();
		const temprano = uuidv7();
		const tarde = uuidv7();
		const insertar =
			"INSERT INTO prueba_lotes (id, nombre, ubicacion_id) SELECT $1, $2, id FROM ubicaciones WHERE codigo = 'TAL'";
		try {
			// La primera toma su número y se queda abierta; la segunda toma uno mayor y confirma antes.
			await primera.query("BEGIN");
			await primera.query(insertar, [temprano, "L-temprano"]);
			await segunda.query("BEGIN");
			await segunda.query(insertar, [tarde, "L-tarde"]);
			const numeros = await Promise.all(
				[primera, segunda].map(
					async (conexion) => (await conexion.query("SELECT pg_current_xact_id()::text AS n")).rows[0]?.n,
				),
			);
			expect(BigInt(numeros[0]) < BigInt(numeros[1])).toBe(true);
			await segunda.query("COMMIT");
			// Mientras la primera siga abierta, la ventana se cierra antes de su número: no baja ninguna.
			const mientras = await bajarTodo(servidor, cursor);
			const nuestros = (cambios: { id: string }[]) =>
				cambios.map((cambio) => cambio.id).filter((id) => id === temprano || id === tarde);
			expect(nuestros(mientras.cambios)).toEqual([]);
			await primera.query("COMMIT");
			const despues = await bajarHastaTener(servidor, mientras.cursor, [temprano, tarde]);
			expect(nuestros(despues.cambios).sort()).toEqual([temprano, tarde].sort());
			// Y ya no vuelven a bajar.
			expect(nuestros((await bajarTodo(servidor, despues.cursor)).cambios)).toEqual([]);
		} finally {
			await primera.query("ROLLBACK").catch(() => {});
			await segunda.query("ROLLBACK").catch(() => {});
			primera.release();
			segunda.release();
		}
	});
});
