/**
 * Prueba de `produccion.pendientes` y de la pastilla de Producción con los datos de la muestra: las cuatro cifras, los
 * renglones de cada grupo con su estado y su botón, el filtro, lo que el cambio de pedido dice antes de aplicarse (y
 * que es lo mismo que hace la acción), una sugerencia de Bodega y una excepción del taller; y que solo Producción la
 * pide, sin dinero.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/produccion.md («Pendientes»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { subirDeLaTablet } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Un renglón de Pendientes, lo que se revisa. */
interface Renglon {
	tipo: string;
	titulo: string;
	detalle: string;
	estado: string;
	color: string;
	cifra: string | null;
	cambio_pedido_id?: string;
	version?: number;
	efectos?: string[];
	sugerencia_ids?: string[];
	excepcion_id?: string;
	lote_id?: string;
	con_receta?: boolean;
}

/** Lo que regresa la consulta. */
interface Pendientes {
	indicadores: {
		lotes: { en_proceso: number; por_cortar: number; atorados: number; en_riesgo: number; en_tiempo: number };
		corte: { dias: number; sin_receta: number };
		produccion: { por_dia: number[] };
	};
	conteos: Record<string, number>;
	hay_rojo: boolean;
	renglones: Renglon[];
}

describe("produccion.pendientes: las cifras y la cola de trabajo de Producción", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Pendientes como Producción. */
	async function pendientes(grupo?: string): Promise<Pendientes> {
		const respuesta = await pedirConsulta(
			servidor,
			"produccion.pendientes",
			grupo === undefined ? {} : { grupo },
			"produccion",
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|tarifa/);
		return respuesta.cuerpo.resultado as Pendientes;
	}

	it("las cifras cuadran con los lotes y cada renglón trae su estado en su forma fija", async () => {
		const leido = await pendientes();
		const { lotes, corte, produccion } = leido.indicadores;
		expect(lotes.atorados + lotes.en_riesgo + lotes.en_tiempo).toBe(lotes.en_proceso);
		expect(lotes.por_cortar).toBe(19);
		expect(corte.dias).toBe(7);
		expect(produccion.por_dia).toHaveLength(12);
		expect(leido.conteos.todos).toBe(leido.renglones.length);
		// Los cortes: todos los de la muestra ya pasaron su fecha; sin receta, «Falta la receta».
		const cortes = leido.renglones.filter((renglon) => renglon.tipo === "corte");
		expect(cortes.length).toBe(19);
		for (const renglon of cortes) {
			expect(renglon.estado).toBe(renglon.con_receta === true ? "Corte hoy" : "Falta la receta");
			expect(renglon.color).toBe("rojo");
			expect(renglon.cifra).toMatch(/^\d+ pz$/);
		}
		expect(cortes.filter((renglon) => renglon.con_receta === false)).toHaveLength(corte.sin_receta);
		// Los lotes en proceso atrasados salen en rojo con su entrega.
		for (const renglon of leido.renglones.filter((uno) => uno.tipo === "lote")) {
			expect(["rojo", "ambar"]).toContain(renglon.color);
			expect(renglon.titulo).toMatch(/^L-\d{4}-\d+ · /);
		}
		expect(leido.hay_rojo).toBe(true);
	});

	it("el filtro deja solo su grupo, con los conteos de todos", async () => {
		const corte = await pendientes("corte");
		expect(corte.renglones.every((renglon) => renglon.tipo === "corte")).toBe(true);
		expect(corte.conteos.corte).toBe(corte.renglones.length);
		expect(corte.conteos.todos).toBeGreaterThan(corte.renglones.length);
	});

	it("el cambio de pedido dice antes de aplicarse lo que va a restar y mandar a Bodega, y la acción hace eso mismo", async () => {
		const [cambio] = (await pendientes("cambios")).renglones;
		expect(cambio).toMatchObject({ tipo: "cambio", estado: "Por aplicar", color: "ambar" });
		expect(cambio?.titulo).toMatch(/^PE-0014 · /);
		expect(cambio?.detalle).toMatch(/^Versión \d+ · .+, talla .+: \d+ de más/);
		expect(cambio?.efectos?.length).toBeGreaterThan(0);
		const aplicado = await mandarAccion(
			servidor,
			"produccion.aplicar_cambio_pedido",
			{ datos: { cambio_pedido_id: cambio?.cambio_pedido_id }, version: cambio?.version ?? 0 },
			"produccion",
		);
		expect(aplicado.estado, JSON.stringify(aplicado.cuerpo)).toBe(200);
		const { rows } = await servidor.base.dueno.query(
			`SELECT l.folio, t.nombre AS talla, c.piezas_restadas, c.piezas_a_bodega, l.estado
			 FROM cambio_pedido_lineas c JOIN lotes l ON l.id = c.lote_id
			 JOIN variantes v ON v.id = c.variante_id JOIN tallas t ON t.id = v.talla_id`,
		);
		const hecho = [
			...rows.map((fila) =>
				Number(fila.piezas_restadas) > 0
					? `${fila.folio} talla ${fila.talla}: −${fila.piezas_restadas}`
					: `${fila.folio} talla ${fila.talla}: ${fila.piezas_a_bodega} a Bodega`,
			),
			...[...new Set(rows.filter((fila) => fila.estado === "cancelado").map((fila) => fila.folio))].map(
				(folio) => `${folio} se quita de su orden`,
			),
		];
		expect([...hecho].sort()).toEqual([...(cambio?.efectos ?? [])].sort());
		expect((await pendientes("cambios")).renglones).toEqual([]);
	});

	it("una sugerencia de Bodega por decidir y una excepción del taller salen con su botón", async () => {
		const { rows: variantes } = await servidor.base.dueno.query(
			`SELECT v.id FROM variantes v JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
			 WHERE p.nombre = 'Pants marino liso' ORDER BY t.orden LIMIT 2`,
		);
		const { rows: tienda } = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'T2'");
		for (const variante of variantes) {
			await servidor.base.dueno.query(
				"INSERT INTO sugerencias_reabasto (id, variante_id, ubicacion_id, piezas, estado) VALUES ($1, $2, $3, 7, 'por_decidir')",
				[uuidv7(), variante.id, tienda[0]?.id],
			);
		}
		// La tablet registra en un bulto más de lo que tiene: la excepción `pasa_tope_bulto`.
		const { rows: bulto } = await servidor.base.dueno.query(
			`SELECT b.id, b.folio, b.piezas, f.id AS operacion, f.persona_base_id AS persona
			 FROM bultos b JOIN lotes l ON l.id = b.lote_id
			 JOIN flujo_operaciones f ON f.flujo_id = l.flujo_id AND f.orden = 2 AND f.baja_en IS NULL
			 WHERE l.folio = 'L-2026-002' ORDER BY b.numero LIMIT 1`,
		);
		const [elBulto] = bulto;
		const subido = await subirDeLaTablet(
			servidor,
			"produccion.registrar_operacion",
			{
				id: uuidv7(),
				bulto_id: elBulto?.id,
				flujo_operacion_id: elBulto?.operacion,
				piezas_buenas: Number(elBulto?.piezas) + 50,
				piezas_danadas: 0,
				sin_internet: false,
			},
			String(elBulto?.persona),
		);
		expect(JSON.stringify(subido)).toMatch(/pasa_tope_bulto/);
		const leido = await pendientes();
		const sugerencia = leido.renglones.find((renglon) => renglon.tipo === "sugerencia");
		expect(sugerencia).toMatchObject({ titulo: "Pants marino liso", estado: "Por decidir", cifra: "14 pz" });
		expect(sugerencia?.detalle).toMatch(/^Para Tienda 2 · .+: 7 · .+: 7$/);
		expect(sugerencia?.sugerencia_ids).toHaveLength(2);
		const excepcion = leido.renglones.find((renglon) => renglon.tipo === "excepcion");
		expect(excepcion).toMatchObject({ titulo: "Pasa del tope del bulto", estado: "Por resolver", color: "rojo" });
		expect(excepcion?.detalle).toContain(String(elBulto?.folio));
	});

	it("la pastilla cuenta los renglones en rojo o ámbar y va en rojo con un lote atrasado", async () => {
		const leido = await pendientes();
		const respuesta = await pedirConsulta(servidor, "admin.armazon", {}, "produccion");
		const { departamentos } = respuesta.cuerpo.resultado as {
			departamentos: { clave: string; conteo: number | null; rojo: boolean }[];
		};
		const produccion = departamentos.find((departamento) => departamento.clave === "produccion");
		expect(produccion?.conteo).toBe(
			leido.renglones.filter((renglon) => renglon.color === "rojo" || renglon.color === "ambar").length,
		);
		expect(produccion?.rojo).toBe(
			leido.renglones.some((renglon) => renglon.tipo === "lote" && renglon.color === "rojo"),
		);
	});

	it("solo Producción la pide", async () => {
		expect((await pedirConsulta(servidor, "produccion.pendientes", {}, "bodega")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "produccion.pendientes", {}, "ventas")).estado).toBe(403);
	});
});
