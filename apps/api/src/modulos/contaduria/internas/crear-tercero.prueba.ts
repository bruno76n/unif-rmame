/**
 * Prueba de `contaduria.crear_tercero` y `contaduria.renombrar_tercero`: la ficha nace o se liga, nunca se
 * duplica, sin importar acentos, mayúsculas ni espacios dobles.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { ErrorDeApi } from "../../../nucleo/http/errores.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un proveedor nuevo con el nombre de un cliente se liga a su tercero en lugar de crear otro", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Llama una interna de Contaduría en su propia transacción; regresa lo que regresó o el cuerpo de su error. */
	function interna(nombre: string, datos: unknown) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna(`contaduria.${nombre}`, datos),
		).catch((error: unknown) => (error instanceof ErrorDeApi ? error.cuerpo() : Promise.reject(error)));
	}

	/** Los roles de un tercero, como quedaron en la base. */
	async function roles(id: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT es_cliente, es_proveedor, es_acreedor FROM terceros WHERE id = $1",
			[id],
		);
		return rows[0];
	}

	it("nace con su rol; con otro rol y `ligar_si_existe` se liga sin importar acentos, mayúsculas ni espacios; con el mismo rol, rol_ya_existe", async () => {
		const cliente = (await interna("crear_tercero", { nombre: "Textiles Alborada", rol: "cliente" })) as {
			tercero_id: string;
			ya_existia: boolean;
		};
		expect(cliente).toMatchObject({ ya_existia: false });
		const ligado = await interna("crear_tercero", {
			nombre: "  TEXTILES   alboradá ",
			rol: "proveedor",
			ligar_si_existe: true,
		});
		expect(ligado).toEqual({ tercero_id: cliente.tercero_id, ya_existia: true, avisos: [] });
		expect(await roles(cliente.tercero_id)).toEqual({ es_cliente: true, es_proveedor: true, es_acreedor: false });
		expect(
			await interna("crear_tercero", { nombre: "Textiles Alborada", rol: "proveedor", ligar_si_existe: true }),
		).toMatchObject({
			codigo: "rol_ya_existe",
			mensaje: "Ya está en la lista.",
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM terceros WHERE nombre_busqueda = 'textiles alborada'",
		);
		expect(rows[0]?.n).toBe(1);
	});

	it("sin `ligar_si_existe`, tercero_ya_existe con su id, su nombre y sus roles; con «Es el mismo», se liga a ese", async () => {
		const banco = (await interna("crear_tercero", { nombre: "Banco del Bajío", rol: "cliente" })) as {
			tercero_id: string;
		};
		expect(
			await interna("crear_tercero", { nombre: "banco del bajio", rol: "acreedor", clase: "banco" }),
		).toMatchObject({
			codigo: "tercero_ya_existe",
			mensaje: "Ya hay un tercero con ese nombre: Banco del Bajío (cliente). ¿Es el mismo?",
			datos: { tercero_id: banco.tercero_id, nombre: "Banco del Bajío", roles: ["cliente"] },
		});
		expect(
			await interna("crear_tercero", {
				nombre: "banco del bajio",
				rol: "acreedor",
				ligar_a_tercero_id: banco.tercero_id,
			}),
		).toEqual({ tercero_id: banco.tercero_id, ya_existia: true, avisos: [] });
		expect(await roles(banco.tercero_id)).toEqual({ es_cliente: true, es_proveedor: false, es_acreedor: true });
	});

	it("el RFC: 12 o 13 letras y números, en mayúsculas; uno que ya tiene otro avisa sin detener", async () => {
		expect(await interna("crear_tercero", { nombre: "Hilos del Norte", rol: "proveedor", rfc: "ABC" })).toMatchObject({
			error: "validacion",
			campos: { rfc: "El RFC lleva 12 o 13 letras y números" },
		});
		await interna("crear_tercero", { nombre: "Hilos del Norte", rol: "proveedor", rfc: "hce010101ab1" });
		const { rows } = await servidor.base.dueno.query("SELECT rfc FROM terceros WHERE nombre = 'Hilos del Norte'");
		expect(rows).toEqual([{ rfc: "HCE010101AB1" }]);
		expect(
			await interna("crear_tercero", { nombre: "Botones Reyes", rol: "proveedor", rfc: "HCE010101AB1" }),
		).toMatchObject({
			ya_existia: false,
			avisos: ["Ese RFC ya lo tiene Hilos del Norte"],
		});
	});

	it("renombrar cambia el nombre y su búsqueda; el de otro tercero es nombre_repetido", async () => {
		const uno = (await interna("crear_tercero", { nombre: "Cierres Uno", rol: "proveedor" })) as { tercero_id: string };
		await interna("crear_tercero", { nombre: "Cierres Dos", rol: "proveedor" });
		expect(await interna("renombrar_tercero", { tercero_id: uno.tercero_id, nombre: "CIERRES DOS" })).toMatchObject({
			codigo: "nombre_repetido",
			mensaje: "Ya está en la lista.",
		});
		expect(await interna("renombrar_tercero", { tercero_id: uno.tercero_id, nombre: "Cierres Únicos" })).toMatchObject({
			antes: { nombre: "Cierres Uno", rfc: null },
		});
		const { rows } = await servidor.base.dueno.query("SELECT nombre, nombre_busqueda FROM terceros WHERE id = $1", [
			uno.tercero_id,
		]);
		expect(rows).toEqual([{ nombre: "Cierres Únicos", nombre_busqueda: "cierres unicos" }]);
	});

	it("dos altas del mismo nombre a la vez: una crea y la otra se liga (o es repetida), nunca dos fichas", async () => {
		for (let ronda = 0; ronda < 5; ronda++) {
			const nombre = `Mercería a la vez ${ronda}`;
			const resultados = await Promise.all([
				interna("crear_tercero", { nombre, rol: "cliente", ligar_si_existe: true }),
				interna("crear_tercero", { nombre, rol: "proveedor", ligar_si_existe: true }),
			]);
			expect(resultados.map((resultado) => (resultado as { ya_existia: boolean }).ya_existia).sort()).toEqual([
				false,
				true,
			]);
			const { rows } = await servidor.base.dueno.query(
				"SELECT es_cliente, es_proveedor FROM terceros WHERE nombre = $1",
				[nombre],
			);
			expect(rows).toEqual([{ es_cliente: true, es_proveedor: true }]);
		}
	});
});
