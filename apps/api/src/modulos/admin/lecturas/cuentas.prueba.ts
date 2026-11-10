/**
 * Prueba de las lecturas de las cuentas: `admin.permisos_de`, `admin.cuentas_por_regla` y
 * `admin.correo_de_cuenta`.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (partes 1 y 3)
 */

import { clavesDeDepartamento } from "@uniformame/compartido/contratos/admin/cuentas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { conGoogle, darDeAltaCuenta, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("los departamentos efectivos: la dueña, todos; las demás, los suyos sin baja y solo si la cuenta está activa; las reglas de destinatarios solo dan cuentas activas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una lectura de `admin`, dentro de una acción de prueba. */
	function leer(nombre: string, datos: Record<string, unknown>): Promise<unknown> {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura(nombre, datos),
		);
	}

	it("la dueña tiene los 15 departamentos en todas las ubicaciones y los dos permisos finos, sin renglones", async () => {
		expect(await leer("admin.permisos_de", { usuario_id: cuentaDePrueba("duena") })).toEqual({
			activa: true,
			es_duena: true,
			es_soporte: false,
			departamentos: clavesDeDepartamento.map((clave) => ({ clave, ubicacion_id: null })),
			permisos_finos: ["ven_sueldos_y_tarifas", "imprime_guias"],
		});
	});

	it("una cuenta tiene sus departamentos y permisos vigentes; sin acceso, ninguno; una que no existe, nada", async () => {
		const nueva = await darDeAltaCuenta(servidor, "lupita@gmail.com", ["compras", "bodega"]);
		expect(await leer("admin.permisos_de", { usuario_id: nueva })).toEqual({
			activa: true,
			es_duena: false,
			es_soporte: false,
			departamentos: [
				{ clave: "compras", ubicacion_id: null },
				{ clave: "bodega", ubicacion_id: null },
			],
			permisos_finos: [],
		});
		const { rows } = await servidor.base.dueno.query("SELECT version FROM usuarios WHERE id = $1", [nueva]);
		const quitado = await mandarAccion(
			servidor,
			"admin.quitar_acceso",
			{ datos: { usuario_id: nueva }, version: Number(rows[0]?.version) },
			"duena",
			conGoogle(),
		);
		expect(quitado.estado).toBe(200);
		expect(await leer("admin.permisos_de", { usuario_id: nueva })).toMatchObject({
			activa: false,
			departamentos: [],
			permisos_finos: [],
		});
		expect(await leer("admin.permisos_de", { usuario_id: "01936f2e-0000-7000-8000-0000000000ff" })).toBeUndefined();
		expect(await leer("admin.cuentas_por_regla", { regla: "departamento:compras" })).not.toContain(nueva);
	});

	it("las reglas dan la dueña, soporte o las cuentas con el departamento; el correo es el de la cuenta", async () => {
		expect(await leer("admin.cuentas_por_regla", { regla: "duena" })).toEqual([cuentaDePrueba("duena")]);
		expect(await leer("admin.cuentas_por_regla", { regla: "soporte" })).toEqual([cuentaDePrueba("soporte")]);
		expect(await leer("admin.cuentas_por_regla", { regla: "departamento:aduana" })).toEqual([
			cuentaDePrueba("aduana"),
			"01936f2e-0000-7000-8000-000000000007",
		]);
		expect(await leer("admin.correo_de_cuenta", { usuario_id: cuentaDePrueba("duena") })).toBe(
			"carmen@uniformesalameda.mx",
		);
	});
});
