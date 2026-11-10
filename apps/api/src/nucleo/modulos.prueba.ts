/**
 * Prueba del registro de módulos por carpeta.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 2)
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { moduloDe } from "./acciones/corredor.ts";
import { cargarModulos } from "./modulos.ts";

describe("una carpeta nueva en modulos/ registra sus acciones, consultas, internas y lecturas sin tocar ningún otro archivo", () => {
	let carpeta = "";
	beforeAll(() => {
		// Dentro de apps/api, para que el módulo nuevo encuentre los paquetes del workspace; git lo ignora.
		carpeta = mkdtempSync(join(import.meta.dirname, "../../.modulos-de-prueba-"));
	});
	afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

	/** Escribe un módulo nuevo en su carpeta, como lo haría una fase, sin tocar nada más. */
	function escribirModulo(nombre: string, cuerpo: string): void {
		mkdirSync(join(carpeta, nombre));
		const desde = (archivo: string) => pathToFileURL(join(import.meta.dirname, archivo)).href;
		writeFileSync(
			join(carpeta, nombre, "index.ts"),
			`import { definirModulo, implementarAccion, implementarConsulta } from "${desde("modulos.ts")}";
import { definirAccion, definirConsulta } from "@uniformame/compartido/contratos/definir";
import { z } from "zod";
${cuerpo}`,
		);
	}

	it("registra lo de cada carpeta por su nombre completo", async () => {
		escribirModulo(
			"almacen",
			`const guardar = definirAccion({ nombre: "almacen.guardar", descripcion: "x", entrada: z.object({}), salida: z.object({}), permiso: {} });
const ver = definirConsulta({ nombre: "almacen.ver", descripcion: "x", entrada: z.object({}), salida: z.object({}), permiso: {} });
export default definirModulo({
	nombre: "almacen",
	acciones: [implementarAccion(guardar, async () => ({ resultado: { mensaje: "ok" } }))],
	consultas: [implementarConsulta(ver, async () => ({ resultado: {} }))],
	internas: { apartar: async () => undefined },
	lecturas: { libres: async () => 0 },
});`,
		);
		const registro = await cargarModulos(carpeta);
		expect([...registro.acciones.keys()]).toEqual(["almacen.guardar"]);
		expect([...registro.consultas.keys()]).toEqual(["almacen.ver"]);
		expect([...registro.internas.keys()]).toEqual(["almacen.apartar"]);
		expect([...registro.lecturas.keys()]).toEqual(["almacen.libres"]);
	});

	it("otra carpeta se suma sin tocar la primera", async () => {
		escribirModulo(
			"taller",
			`export default definirModulo({ nombre: "taller", internas: { contar: async () => 1 } });`,
		);
		const registro = await cargarModulos(carpeta);
		expect(registro.modulos.map((modulo) => modulo.nombre)).toEqual(["almacen", "taller"]);
		expect(registro.internas.has("taller.contar")).toBe(true);
	});

	it("rechaza un módulo cuyo nombre no es el de su carpeta, o una acción con el nombre de otro módulo", async () => {
		escribirModulo("mal", `export default definirModulo({ nombre: "otro" });`);
		await expect(cargarModulos(carpeta)).rejects.toThrow("no exporta el módulo mal");
		rmSync(join(carpeta, "mal"), { recursive: true });
		escribirModulo(
			"ajeno",
			`const x = definirAccion({ nombre: "almacen.robar", descripcion: "x", entrada: z.object({}), salida: z.object({}), permiso: {} });
export default definirModulo({ nombre: "ajeno", acciones: [implementarAccion(x, async () => ({ resultado: { mensaje: "x" } }))] });`,
		);
		await expect(cargarModulos(carpeta)).rejects.toThrow("no es del módulo ajeno");
	});
});

describe("el módulo de una acción o de un trabajo sale de su nombre", () => {
	it("lo de antes del punto; sin punto, el nombre entero", () => {
		expect(moduloDe("ventas.confirmar_pedido")).toBe("ventas");
		expect(moduloDe("reloj")).toBe("reloj");
	});
});
