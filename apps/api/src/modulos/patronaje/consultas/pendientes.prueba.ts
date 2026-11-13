/**
 * Prueba de `patronaje.pendientes` y de la pastilla de Patronaje con los datos de la muestra: las tres cifras, los
 * renglones de cada grupo con su estado y su botón, el filtro y el orden; y que solo Patronaje la pide, sin dinero.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/patronaje.md («Pendientes» y «Quién
 * entra»: la pastilla)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Un renglón de Pendientes, lo que se revisa. */
interface Renglon {
	tipo: string;
	titulo: string;
	detalle: string;
	fecha: string | null;
	estado: string;
	color: string;
	boton?: string;
	producto_id?: string;
	desarrollo_id?: string;
}

/** Lo que regresa la consulta. */
interface Pendientes {
	indicadores: {
		recetas: {
			prendas: number;
			sin_receta_pronto: number;
			verificadas: number;
			sin_verificar: number;
			sin_receta: number;
		};
		rendimiento: { altos: number; pct_alto: number; medidas: number };
		desarrollo: { en_proceso: number; en_aprobacion: number };
	};
	conteos: Record<string, number>;
	hay_rojo: boolean;
	renglones: Renglon[];
}

describe("patronaje.pendientes: las cifras y la cola de trabajo de Patronaje", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Pendientes como Patronaje. */
	async function pendientes(grupo?: string): Promise<Pendientes> {
		const respuesta = await pedirConsulta(
			servidor,
			"patronaje.pendientes",
			grupo === undefined ? {} : { grupo },
			"patronaje",
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|costo/);
		return respuesta.cuerpo.resultado as Pendientes;
	}

	/** Cuántas recetas hay en cada estado, de las prendas que llevan receta. */
	async function recetasPorEstado(): Promise<Record<string, number>> {
		const { rows } = await servidor.base.dueno.query(
			`SELECT r.estado, count(*)::int AS n FROM recetas r JOIN productos p ON p.id = r.producto_id
			 JOIN secciones s ON s.id = p.seccion_id
			 WHERE s.lleva_receta AND NOT p.es_servicio AND p.baja_en IS NULL GROUP BY r.estado`,
		);
		return Object.fromEntries(rows.map((fila) => [String(fila.estado), Number(fila.n)]));
	}

	it("las cifras cuadran con las recetas y los desarrollos de la muestra", async () => {
		const { indicadores } = await pendientes();
		const estados = await recetasPorEstado();
		const { recetas, rendimiento, desarrollo } = indicadores;
		expect(recetas.sin_receta).toBe(estados.sin_receta ?? 0);
		expect(recetas.sin_verificar).toBe(estados.sin_verificar ?? 0);
		expect(recetas.verificadas).toBe(estados.verificada ?? 0);
		expect(recetas.prendas).toBe(recetas.sin_receta + recetas.sin_verificar + recetas.verificadas);
		// La chamarra azul cielo y la polo blanca con escudo no tienen receta y ya tienen su corte encima.
		expect(recetas.sin_receta_pronto).toBe(2);
		expect(rendimiento.pct_alto).toBe(10);
		expect(rendimiento.medidas).toBe(2);
		expect(desarrollo).toEqual({ en_proceso: 4, en_aprobacion: 1 });
	});

	it("la cola: las prendas sin receta o sin verificar con su estado y su botón, y la muestra en aprobación", async () => {
		const leido = await pendientes();
		const recetas = leido.renglones.filter((renglon) => renglon.tipo === "receta");
		const estados = await recetasPorEstado();
		expect(recetas).toHaveLength((estados.sin_receta ?? 0) + (estados.sin_verificar ?? 0));
		const chamarra = recetas.find((renglon) => renglon.titulo === "Chamarra azul cielo con escudo");
		expect(chamarra).toMatchObject({ estado: "Sin receta · corte próximo", color: "rojo", boton: "capturar" });
		expect(chamarra?.detalle).toMatch(/^.+ · corte L-\d{4}-\d+$/);
		expect(chamarra?.fecha).toMatch(/^Corte \d{1,2} [a-z]{3}$/);
		const bata = recetas.find((renglon) => renglon.titulo === "Bata blanca de laboratorio con escudo");
		expect(bata).toMatchObject({ estado: "Sin receta", color: "ambar", boton: "capturar", fecha: null });
		for (const renglon of recetas.filter((uno) => uno.boton === "verificar")) {
			expect(renglon).toMatchObject({ estado: "Sin verificar", color: "ambar" });
		}
		const [muestra] = leido.renglones.filter((renglon) => renglon.tipo === "muestra");
		expect(muestra).toMatchObject({
			titulo: "DS-004 · Chamarra azul cielo con escudo",
			estado: "Esperando aprobación del cliente",
			color: "azul",
		});
		expect(muestra?.desarrollo_id).toMatch(/^[0-9a-f-]{36}$/);
		expect(leido.hay_rojo).toBe(true);
		// Primero lo rojo, luego lo ámbar y al final lo azul.
		const orden = { rojo: 0, ambar: 1, azul: 2 } as Record<string, number>;
		const colores = leido.renglones.map((renglon) => orden[renglon.color] ?? 9);
		expect(colores).toEqual([...colores].sort((uno, otro) => uno - otro));
	});

	it("el filtro deja solo su grupo, con los conteos de todos", async () => {
		const muestra = await pendientes("muestra");
		expect(muestra.renglones.every((renglon) => renglon.tipo === "muestra")).toBe(true);
		expect(muestra.conteos.muestra).toBe(muestra.renglones.length);
		expect(muestra.conteos.todos).toBe((muestra.conteos.muestra ?? 0) + (muestra.conteos.recetas ?? 0));
	});

	it("la pastilla cuenta las sin receta con corte próximo y las sin verificar con corte, en rojo", async () => {
		const respuesta = await pedirConsulta(servidor, "admin.armazon", {}, "patronaje");
		const { departamentos } = respuesta.cuerpo.resultado as {
			departamentos: { clave: string; conteo: number | null; rojo: boolean }[];
		};
		const { rows } = await servidor.base.dueno.query(
			`SELECT count(DISTINCT r.producto_id)::int AS n FROM recetas r JOIN lotes l ON l.producto_id = r.producto_id
			 WHERE l.estado = 'por_cortar' AND r.estado <> 'verificada'`,
		);
		expect(departamentos.find((uno) => uno.clave === "patronaje")).toMatchObject({
			conteo: Number(rows[0]?.n),
			rojo: true,
		});
	});

	it("solo Patronaje la pide", async () => {
		expect((await pedirConsulta(servidor, "patronaje.pendientes", {}, "ventas")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "patronaje.pendientes", {}, "duena")).estado).toBe(200);
	});
});
