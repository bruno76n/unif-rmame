/**
 * Prueba de `patronaje.rendimiento` y `patronaje.rendimiento_prenda` con los datos de la muestra: las prendas medidas
 * en los cortes cerrados (patrón contra real, con el desperdicio que da `patronaje.desperdicio_prenda`), las que no se
 * han medido con su motivo, y el cajón por talla. Solo Patronaje las pide, sin dinero.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/patronaje.md («Rendimiento»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una prenda medida. */
interface Medida {
	producto_id: string;
	prenda: string;
	detalle: string;
	patron: string;
	real: string;
	desperdicio: string;
	alto: boolean;
	lotes: number;
	flojo: boolean;
	ultimo_corte: string | null;
}

/** Lo que regresa `patronaje.rendimiento`. */
interface Rendimiento {
	pct_alto: number;
	altos: Medida[];
	normales: Medida[];
	sin_medir: { producto_id: string; prenda: string; motivo: string }[];
}

describe("patronaje.rendimiento: patrón contra lo que se gasta en el tendido", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Rendimiento como Patronaje. */
	async function rendimiento(): Promise<Rendimiento> {
		const respuesta = await pedirConsulta(servidor, "patronaje.rendimiento", {}, "patronaje");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|costo/);
		return respuesta.cuerpo.resultado as Rendimiento;
	}

	it("las medidas salen de los cortes cerrados, el real nunca abajo del patrón, de mayor a menor desperdicio", async () => {
		const leido = await rendimiento();
		const medidas = [...leido.altos, ...leido.normales];
		const { rows } = await servidor.base.dueno.query(
			`SELECT DISTINCT p.nombre FROM cortes c JOIN lotes l ON l.id = c.lote_id JOIN productos p ON p.id = l.producto_id`,
		);
		expect(medidas.map((medida) => medida.prenda).sort()).toEqual(rows.map((fila) => String(fila.nombre)).sort());
		for (const medida of medidas) {
			expect(Number(medida.real)).toBeGreaterThanOrEqual(Number(medida.patron));
			expect(medida.desperdicio).toMatch(/^\+\d+%$/);
			expect(medida.lotes).toBe(1);
			expect(medida.flojo).toBe(true);
			expect(medida.ultimo_corte).toMatch(/^\d{1,2} [a-z]{3}$/);
			expect(medida.alto).toBe(Number(medida.desperdicio.slice(1, -1)) > leido.pct_alto);
		}
		expect(leido.altos.every((medida) => medida.alto)).toBe(true);
		const sinReceta = leido.sin_medir.find((uno) => uno.prenda === "Bata blanca de laboratorio con escudo");
		expect(sinReceta?.motivo).toBe("Sin receta: no hay patrón contra qué medir");
		const sinCorte = leido.sin_medir.find((uno) => uno.prenda === "Pantalón azul marino");
		expect(sinCorte?.motivo).toBe("Todavía no se corta con esta receta");
	});

	it("el cajón de una prenda medida: las tres cifras, el dato flojo y el desglose por talla", async () => {
		const [medida] = [...(await rendimiento()).altos, ...(await rendimiento()).normales];
		const respuesta = await pedirConsulta(
			servidor,
			"patronaje.rendimiento_prenda",
			{ producto_id: medida?.producto_id ?? "" },
			"patronaje",
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const { medido } = respuesta.cuerpo.resultado as {
			medido: {
				patron: string;
				real: string;
				desperdicio: string;
				flojo: string | null;
				tallas: { patron: string | null; lotes: number }[];
			};
		};
		expect(medido.patron).toMatch(/^\d+\.\d{2} m · dice el patrón, talla .+$/);
		expect(medido.real).toMatch(/^\d+\.\d{2} m · se gasta en el tendido$/);
		expect(medido.desperdicio).toMatch(/^\+\d+% · desperdicio, 1 lote$/);
		expect(medido.flojo).toBe("Con 1 lote el dato todavía es flojo.");
		expect(medido.tallas.some((talla) => talla.lotes === 1)).toBe(true);
		const sinMedir = (await rendimiento()).sin_medir[0]?.producto_id ?? "";
		const nada = await pedirConsulta(servidor, "patronaje.rendimiento_prenda", { producto_id: sinMedir }, "patronaje");
		expect((nada.cuerpo.resultado as { medido: unknown }).medido).toBeNull();
	});

	it("solo Patronaje las pide", async () => {
		expect((await pedirConsulta(servidor, "patronaje.rendimiento", {}, "compras")).estado).toBe(403);
	});
});
