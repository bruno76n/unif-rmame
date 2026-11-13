/**
 * Prueba de `direccion.indicadores` con la muestra: las ventas de la semana por canal contra la semana que se escoge,
 * las ocho semanas contra el año pasado, las prendas terminadas de 12 días de trabajo y la existencia por ubicación;
 * solo para Dirección y sin sueldos ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta, para leerlo en la prueba. */
interface Resultado {
	semana: {
		desde: string;
		total_centavos: number;
		comparado_centavos: number;
		variacion: string | null;
		contra: string;
		canales: { clave: string; vendido_centavos: number; comparado_centavos: number; vende_desde: string | null }[];
	};
	por_semana: { desde: string; este_anio_centavos: number; anio_pasado_centavos: number }[];
	terminadas: { dias: { fecha: string; piezas: number }[]; esta_semana: number; lotes: string };
	existencias: { total: number; ubicaciones: { codigo: string; piezas: number }[] };
}

describe("Indicadores de Dirección: ventas, prendas terminadas y existencias, solo para Dirección", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		// Las notas de la muestra se entregaron hace años: cada caso pone en su semana solo las que usa.
		await consultar("UPDATE notas_entrega SET fecha_entrega = '2020-01-06' WHERE estado = 'entregada'");
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Pide los indicadores como Dirección. */
	async function leer(parametros: Record<string, string> = {}): Promise<Resultado> {
		const respuesta = await pedirConsulta(servidor, "direccion.indicadores", parametros, "direccion");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Resultado;
	}

	/** Pone la fecha de entrega de una nota entregada a tantos días antes de hoy. */
	async function entregarHaceDias(folio: string, dias: number): Promise<number> {
		const [nota] = await consultar(
			`UPDATE notas_entrega SET fecha_entrega = (now() AT TIME ZONE 'America/Mexico_City')::date - $2::int
			 WHERE folio = $1 RETURNING subtotal_centavos::int AS centavos`,
			[folio, dias],
		);
		return Number(nota?.centavos);
	}

	it("solo Dirección los ve: otra cuenta recibe 403", async () => {
		for (const quien of ["ventas", "contaduria", "produccion"]) {
			expect((await pedirConsulta(servidor, "direccion.indicadores", {}, quien)).estado).toBe(403);
		}
	});

	it("la semana suma por canal y se compara con la anterior; las tiendas, sin POS, salen en cero sin ventas", async () => {
		const [hoy, antes] = [await entregarHaceDias("NV-0001", 0), await entregarHaceDias("NV-0002", 7)];
		const { semana } = await leer();
		expect(semana).toMatchObject({ total_centavos: hoy, comparado_centavos: antes, contra: "contra semana anterior" });
		const porciento = Math.round((hoy / antes - 1) * 100);
		expect(semana.variacion).toBe(`${porciento >= 0 ? "▲" : "▼"} ${Math.abs(porciento)}%`);
		expect(semana.canales.map((canal) => canal.clave)).toEqual(["tienda_1", "tienda_2", "externos", "en_linea"]);
		expect(semana.canales[0]).toMatchObject({ vendido_centavos: 0, vende_desde: null });
		expect(semana.canales[2]).toMatchObject({ vendido_centavos: hoy, comparado_centavos: antes });
		const [primera] = await consultar(
			"SELECT min(fecha_entrega)::text AS dia FROM notas_entrega WHERE estado = 'entregada'",
		);
		expect(semana.canales[2]?.vende_desde).toBe(primera?.dia);
	});

	it("«Hace un mes» compara con la semana de hace cuatro, y «Temporada pasada» con la misma del año pasado", async () => {
		const unMes = await entregarHaceDias("NV-0003", 28);
		expect((await leer({ comparar: "hace_un_mes" })).semana).toMatchObject({
			comparado_centavos: unMes,
			contra: "contra hace un mes",
		});
		const anioPasado = await entregarHaceDias("NV-0004", 364);
		const temporada = await leer({ comparar: "temporada_pasada" });
		expect(temporada.semana).toMatchObject({
			comparado_centavos: anioPasado,
			contra: "contra misma semana del año pasado",
		});
		// Las ocho semanas: la última es esta, y su año pasado es la misma semana de hace 52.
		expect(temporada.por_semana).toHaveLength(8);
		expect(temporada.por_semana.at(-1)).toMatchObject({
			desde: temporada.semana.desde,
			anio_pasado_centavos: anioPasado,
		});
	});

	it("las prendas terminadas son de los últimos 12 días de trabajo, con los lotes en proceso y por cortar", async () => {
		const { terminadas } = await leer();
		expect(terminadas.dias).toHaveLength(12);
		const [lotes] = await consultar(
			`SELECT count(*) FILTER (WHERE estado = 'en_proceso')::int AS en_proceso,
			 count(*) FILTER (WHERE estado = 'por_cortar')::int AS por_cortar FROM lotes`,
		);
		expect(terminadas.lotes).toMatch(
			new RegExp(`^\\d+ lotes? atorados?, ${lotes?.en_proceso} en proceso, ${lotes?.por_cortar} por cortar$`),
		);
		expect(terminadas.esta_semana).toBe(terminadas.dias.slice(-6).reduce((suma, dia) => suma + dia.piezas, 0));
	});

	it("la existencia sale por cada una de las siete ubicaciones, con su total; nunca sueldos ni costos", async () => {
		const resultado = await leer();
		expect(resultado.existencias.ubicaciones.map((ubicacion) => ubicacion.codigo)).toEqual([
			"ADU",
			"BOD",
			"T1",
			"T2",
			"TAL",
			"TRA",
			"ECA",
		]);
		const [total] = await consultar("SELECT coalesce(sum(piezas), 0)::int AS piezas FROM existencias");
		expect(resultado.existencias.total).toBe(Number(total?.piezas));
		expect(JSON.stringify(resultado)).not.toMatch(/sueldo|tarifa|costo/i);
	});
});
