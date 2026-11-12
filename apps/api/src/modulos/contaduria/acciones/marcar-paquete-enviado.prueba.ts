/**
 * Prueba de mandar el paquete del contador con los datos de las fases 15 a 17: suma cada concepto con sus documentos;
 * al mandarlo se congela y liga sus gastos; un gasto que llega tarde avisa y sale en el siguiente, como de meses
 * anteriores; la nómina sale en el mes en que se pagó y su monto va como sueldo en la bitácora.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «El paquete de un mes suma cada concepto
 * con sus documentos; al mandarlo se congela, y un gasto que llega tarde sale en el siguiente como de meses
 * anteriores»)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { hoyEnMexico, registrarGastoDePrueba } from "../../../nucleo/pruebas/gastos-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { pagarNominaDePrueba, semanaConNomina } from "../../../nucleo/pruebas/nomina-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El paquete de un mes suma cada concepto con sus documentos; al mandarlo se congela", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Un paquete por enviar de un mes, directo en la base, como lo deja el trabajo del día 1. */
	async function paqueteDe(mes: string): Promise<string> {
		const id = uuidv7();
		const limite = Temporal.PlainDate.from(mes).add({ months: 1 }).with({ day: 17 }).toString();
		await consultar("INSERT INTO paquetes_contador (id, mes, fecha_limite) VALUES ($1, $2, $3)", [id, mes, limite]);
		return id;
	}

	/** Contaduría manda un paquete con su versión de ahora. */
	async function mandar(id: string, quien = "contaduria") {
		const [{ v } = { v: 0 }] = await consultar("SELECT version::int AS v FROM paquetes_contador WHERE id = $1", [id]);
		return mandarAccion(
			servidor,
			"contaduria.marcar_paquete_enviado",
			{ datos: { paquete_contador_id: id }, version: v },
			quien,
		);
	}

	/** Los renglones congelados de un paquete, como `concepto/categoría/anteriores → monto · documentos`. */
	async function congelados(id: string) {
		const filas = await consultar(
			`SELECT r.concepto, coalesce(v.nombre, '') AS categoria, r.de_meses_anteriores AS anteriores,
				r.monto_centavos::bigint AS monto, r.documentos
			 FROM paquete_contador_renglones r LEFT JOIN lista_valores v ON v.id = r.categoria_id
			 WHERE r.paquete_contador_id = $1`,
			[id],
		);
		return Object.fromEntries(
			filas.map((fila) => [
				`${fila.concepto}${fila.categoria === "" ? "" : `/${fila.categoria}`}${fila.anteriores ? "/anteriores" : ""}`,
				[Number(fila.monto), fila.documentos],
			]),
		);
	}

	/** Lo que el paquete de un mes debe sumar, leído aparte con SQL. */
	async function esperadoDe(mes: string) {
		const [esperado] = await consultar(
			`WITH rango AS (SELECT $1::date AS desde, ($1::date + interval '1 month')::date AS hasta)
			 SELECT
				(SELECT json_build_array(coalesce(sum(monto_centavos), 0), count(*)) FROM pagos, rango
					WHERE estado = 'registrado' AND direccion = 'recibido' AND concepto = 'nota' AND fecha >= desde AND fecha < hasta) AS cobranza,
				(SELECT json_build_array(coalesce(sum(monto_centavos), 0), count(*)) FROM pagos, rango
					WHERE estado = 'registrado' AND direccion = 'recibido' AND concepto = 'pedido' AND fecha >= desde AND fecha < hasta) AS anticipos,
				(SELECT json_build_array(coalesce(sum(monto_centavos), 0), count(*)) FROM anticipos, rango
					WHERE estado = 'vigente' AND tipo = 'aplicado' AND fecha >= desde AND fecha < hasta) AS aplicados,
				(SELECT json_build_array(coalesce(sum(monto_centavos), 0), count(*)) FROM aplicaciones_pago, rango
					WHERE estado = 'vigente' AND cuenta_por_pagar_id IS NOT NULL AND fecha >= desde AND fecha < hasta) AS abonos`,
			[mes],
		);
		return esperado;
	}

	it("octubre de la muestra: cada concepto con sus documentos, los de tiendas y en línea en cero, y sus gastos ligados", async () => {
		const octubre = await paqueteDe("2026-10-01");
		const esperado = await esperadoDe("2026-10-01");
		const respuesta = await mandar(octubre);
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: "Paquete de octubre de 2026 enviado al contador" });
		const renglones = await congelados(octubre);
		expect(renglones).toMatchObject({
			cobranza_clientes: esperado?.cobranza,
			anticipos_recibidos: esperado?.anticipos,
			anticipos_aplicados: esperado?.aplicados,
			pagos_proveedores_acreedores: esperado?.abonos,
			ventas_tiendas: [0, 0],
			anticipos_tiendas: [0, 0],
			ventas_en_linea: [0, 0],
			comisiones_pasarela: [0, 0],
			reembolsos_en_linea: [0, 0],
		});
		expect(esperado?.cobranza[1]).toBeGreaterThan(0);
		const [gastos] = await consultar(
			`SELECT count(*)::int AS n, coalesce(sum(monto_centavos), 0)::bigint AS monto FROM gastos
			 WHERE paquete_contador_id = $1`,
			[octubre],
		);
		const deGastos = Object.entries(renglones).filter(([llave]) => llave.startsWith("gasto/"));
		expect(deGastos.reduce((suma, [, [monto]]) => suma + Number(monto), 0)).toBe(Number(gastos?.monto));
		expect(deGastos.reduce((suma, [, [, documentos]]) => suma + Number(documentos), 0)).toBe(gastos?.n);
		// Ya mandado, no se vuelve a mandar.
		expect((await mandar(octubre)).cuerpo).toMatchObject({
			codigo: "paquete_ya_enviado",
			mensaje: expect.stringMatching(/^El paquete de octubre de 2026 ya se mandó el \d+ de \w+\.$/),
		});
		// Lo congelado no cambia aunque llegue otro gasto de octubre: ese avisa y sale en el siguiente.
		const tarde = await registrarGastoDePrueba(servidor, { fecha: "2026-10-20", monto_centavos: 33_300 });
		expect(tarde.cuerpo.avisos).toEqual(["El paquete de octubre de 2026 ya se mandó: este gasto sale en el siguiente"]);
		expect(await congelados(octubre)).toEqual(renglones);
	});

	it("noviembre lleva el gasto que llegó tarde como de meses anteriores y la nómina pagada en el mes, con su sueldo tapado en la bitácora", async () => {
		const mes = `${hoyEnMexico().slice(0, 7)}-01`;
		const semana = await semanaConNomina(servidor, "2025-03-03");
		expect((await pagarNominaDePrueba(servidor, semana.nominaId)).estado).toBe(200);
		const [tarde] = await consultar(
			"SELECT id FROM gastos WHERE fecha = '2026-10-20' AND monto_centavos = 33300 AND paquete_contador_id IS NULL",
		);
		const noviembre = await paqueteDe(mes);
		const respuesta = await mandar(noviembre);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const renglones = await congelados(noviembre);
		expect(renglones["gasto/Luz/anteriores"]).toEqual([33_300, 1]);
		expect(Number(renglones.nomina?.[1])).toBeGreaterThanOrEqual(1);
		expect(await consultar("SELECT paquete_contador_id AS p FROM gastos WHERE id = $1", [tarde?.id])).toEqual([
			{ p: noviembre },
		]);
		const [renglon] = await consultar(
			"SELECT sensible_sueldos, despues ? 'total_nomina_centavos' AS con_nomina FROM bitacora WHERE entidad_id = $1",
			[noviembre],
		);
		expect(renglon).toEqual({ sensible_sueldos: true, con_nomina: true });
		const eventos = await consultar("SELECT tipo FROM eventos WHERE entidad_id = $1", [noviembre]);
		expect(eventos.map((evento) => evento.tipo)).toContain("paquete_contador.enviado");
	});

	it("solo Contaduría lo manda", async () => {
		const paquete = await paqueteDe("2026-08-01");
		expect((await mandar(paquete, "ventas")).cuerpo).toMatchObject({ codigo: "sin_departamento" });
	});

	/** Espera a que haya al menos tantas conexiones esperando un candado; dice si llegaron. */
	async function esperarQueEsperen(cuantas: number): Promise<boolean> {
		for (let vuelta = 0; vuelta < 200; vuelta++) {
			const [fila] = await consultar(
				"SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()",
			);
			if (z.object({ n: z.number() }).parse(fila).n >= cuantas) return true;
			await new Promise((listo) => setTimeout(listo, 50));
		}
		return false;
	}

	/**
	 * Detiene un gasto con otra conexión mientras corre `mientras`, y al final hace `alSoltar` en esa conexión y la
	 * confirma.
	 */
	async function conElGastoDetenido<T>(gasto: string, esperan: number, mientras: () => Promise<T>, alSoltar = "") {
		const conexion = await servidor.base.dueno.connect();
		await conexion.query("BEGIN");
		await conexion.query("SELECT id FROM gastos WHERE id = $1 FOR UPDATE", [gasto]);
		if (alSoltar !== "") await conexion.query(alSoltar, [gasto]);
		const resultado = mientras();
		try {
			expect(await esperarQueEsperen(esperan)).toBe(true);
		} finally {
			await conexion.query("COMMIT");
			conexion.release();
		}
		return resultado;
	}

	it("un gasto que se cancela mientras se manda el paquete no sale en él ni queda ligado", async () => {
		const gasto = await registrarGastoDePrueba(servidor, { fecha: "2024-02-10", monto_centavos: 77_700 });
		const { gasto_id: id } = z.object({ gasto_id: z.uuid() }).parse(gasto.cuerpo.resultado);
		const febrero = await paqueteDe("2024-02-01");
		// La cancelación tiene el gasto mientras el envío lo quiere contar: el envío la espera.
		const envio = await conElGastoDetenido(
			id,
			1,
			() => mandar(febrero),
			"UPDATE gastos SET estado = 'cancelado', cancelado_en = now(), motivo_cancelacion = 'Cancelado a la vez' WHERE id = $1",
		);
		expect(envio.estado, JSON.stringify(envio.cuerpo)).toBe(200);
		expect(await consultar("SELECT estado, paquete_contador_id AS p FROM gastos WHERE id = $1", [id])).toEqual([
			{ estado: "cancelado", p: null },
		]);
		expect(Object.keys(await congelados(febrero)).filter((llave) => llave.startsWith("gasto/"))).toEqual([]);
	});

	it("dos paquetes mandados a la vez no se llevan el mismo gasto de meses anteriores", async () => {
		expect((await mandar(await paqueteDe("2024-03-01"))).estado).toBe(200);
		const tarde = await registrarGastoDePrueba(servidor, { fecha: "2024-03-15", monto_centavos: 55_500 });
		const { gasto_id: id } = z.object({ gasto_id: z.uuid() }).parse(tarde.cuerpo.resultado);
		const abril = await paqueteDe("2024-04-01");
		const mayo = await paqueteDe("2024-05-01");
		// Los dos envíos llegan al gasto mientras otra conexión lo tiene; al soltarlo, uno espera al otro.
		const envios = await conElGastoDetenido(id, 2, () => Promise.all([mandar(abril), mandar(mayo)]));
		expect(envios.map((envio) => envio.estado)).toEqual([200, 200]);
		const conElGasto = [];
		for (const paquete of [abril, mayo]) {
			if ((await congelados(paquete))["gasto/Luz/anteriores"] !== undefined) conElGasto.push(paquete);
		}
		expect(conElGasto).toHaveLength(1);
		expect(await consultar("SELECT paquete_contador_id AS p FROM gastos WHERE id = $1", [id])).toEqual([
			{ p: conElGasto[0] },
		]);
	});
});
