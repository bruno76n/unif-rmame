/**
 * Prueba de `contaduria.contador_externo` y `contaduria.paquete_mes`: el paquete por enviar con su fecha límite, los
 * paquetes con su estado, la cuenta del mes en vivo (con la nómina solo con «ven sueldos y tarifas») y congelada al
 * mandarlo, el ZIP del paquete solo para quien ve sueldos y tarifas, y solo Contaduría las pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: … sueldos y tarifas sin su permiso») y
 * docs/interfaz/fabrica/contaduria.md («Contador externo», «Paquete de {mes}»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de Contador externo. */
const contador = z.object({
	por_enviar: z.object({ paquete_contador_id: z.string(), mes_texto: z.string(), fecha_limite: z.string() }).nullable(),
	paquetes: z.array(
		z.object({ mes_texto: z.string(), estado: z.object({ texto: z.string() }), archivo_id: z.string().nullable() }),
	),
});

/** Lo que se lee del paquete. */
const paquete = z.object({
	version: z.number(),
	enviado: z.boolean(),
	renglones: z.array(
		z.object({
			concepto: z.string(),
			es_nomina: z.boolean(),
			monto_centavos: z.number().optional(),
			total_nomina_centavos: z.number().optional(),
		}),
	),
});

describe("Contador externo y el paquete del mes", () => {
	let servidor: ServidorDePrueba;
	let paqueteId: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const { rows } = await servidor.base.dueno.query(
			`INSERT INTO paquetes_contador (id, mes, fecha_limite) VALUES (gen_random_uuid(), '2026-10-01', '2026-11-17')
			 RETURNING id`,
		);
		paqueteId = String(rows[0]?.id);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("el paquete por enviar con su fecha límite y la lista de paquetes", async () => {
		const pedida = await pedirConsulta(servidor, "contaduria.contador_externo", {}, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		const datos = contador.parse(pedida.cuerpo.resultado);
		expect(datos.por_enviar).toMatchObject({ paquete_contador_id: paqueteId, mes_texto: "octubre 2026" });
		expect(datos.por_enviar?.fecha_limite).toBe("17 de noviembre");
		expect(datos.paquetes.map((uno) => uno.estado.texto)).toEqual(["Por enviar"]);
	});

	it("la cuenta del mes, en vivo: la cobranza cuadra con los pagos de octubre; la nómina, solo con el permiso", async () => {
		const conPermiso = paquete.parse(
			(
				await pedirConsulta(
					servidor,
					"contaduria.paquete_mes",
					{ paquete_contador_id: paqueteId },
					"contaduria_sueldos",
				)
			).cuerpo.resultado,
		);
		expect(conPermiso.enviado).toBe(false);
		const { rows } = await servidor.base.dueno.query(
			`SELECT coalesce(sum(monto_centavos), 0) AS suma FROM pagos WHERE direccion = 'recibido' AND concepto = 'nota'
			 AND estado = 'registrado' AND fecha >= '2026-10-01' AND fecha < '2026-11-01'`,
		);
		expect(conPermiso.renglones.find((renglon) => renglon.concepto === "Cobranza a clientes")?.monto_centavos).toBe(
			Number(rows[0]?.suma),
		);
		expect(conPermiso.renglones.find((renglon) => renglon.es_nomina)?.total_nomina_centavos).toBe(0);
		const sinPermiso = await pedirConsulta(
			servidor,
			"contaduria.paquete_mes",
			{ paquete_contador_id: paqueteId },
			"contaduria",
		);
		const nomina = paquete.parse(sinPermiso.cuerpo.resultado).renglones.find((renglon) => renglon.es_nomina);
		expect(nomina?.total_nomina_centavos).toBeUndefined();
		expect(sinPermiso.cuerpo.recortado).toContain("total_nomina_centavos");
	});

	it("mandado, la cuenta queda congelada y el paquete dice «Enviado»", async () => {
		const antes = paquete.parse(
			(await pedirConsulta(servidor, "contaduria.paquete_mes", { paquete_contador_id: paqueteId }, "contaduria")).cuerpo
				.resultado,
		);
		const enviado = await mandarAccion(
			servidor,
			"contaduria.marcar_paquete_enviado",
			{ datos: { paquete_contador_id: paqueteId }, version: antes.version },
			"contaduria",
		);
		expect(enviado.estado, JSON.stringify(enviado.cuerpo)).toBe(200);
		const despues = paquete.parse(
			(await pedirConsulta(servidor, "contaduria.paquete_mes", { paquete_contador_id: paqueteId }, "contaduria")).cuerpo
				.resultado,
		);
		expect(despues.enviado).toBe(true);
		expect(despues.renglones.map((renglon) => [renglon.concepto, renglon.monto_centavos])).toEqual(
			antes.renglones.map((renglon) => [renglon.concepto, renglon.monto_centavos]),
		);
		const lista = contador.parse(
			(await pedirConsulta(servidor, "contaduria.contador_externo", {}, "contaduria")).cuerpo.resultado,
		);
		expect(lista.por_enviar).toBeNull();
		expect(lista.paquetes[0]?.estado.texto).toBe("Enviado");
	});

	it("no manda lo que la cuenta no debe ver: el ZIP del paquete lleva la nómina y sin «ven sueldos y tarifas» va sin su archivo", async () => {
		const archivoId = uuidv7();
		await servidor.base.dueno.query(
			`INSERT INTO archivos (id, proposito, modulo, entidad, entidad_id, nombre_original, tipo_mime, tamano_bytes, sha256, almacen_clave, subido_en)
			 VALUES ($1, 'documento_contador', 'contaduria', 'paquetes_contador', $2, 'paquete.zip', 'application/zip', 1000, repeat('c', 64), $3, now())`,
			[archivoId, paqueteId, `contaduria/prueba/${archivoId}`],
		);
		await servidor.base.dueno.query("UPDATE paquetes_contador SET archivo_id = $1 WHERE id = $2", [
			archivoId,
			paqueteId,
		]);
		const delPaquete = async (quien: string) =>
			contador
				.parse((await pedirConsulta(servidor, "contaduria.contador_externo", {}, quien)).cuerpo.resultado)
				.paquetes.find((uno) => uno.mes_texto === "octubre 2026")?.archivo_id;
		expect(await delPaquete("contaduria_sueldos")).toBe(archivoId);
		expect(await delPaquete("contaduria")).toBeNull();
		await servidor.base.dueno.query("UPDATE paquetes_contador SET archivo_id = NULL WHERE id = $1", [paqueteId]);
		await servidor.base.dueno.query("DELETE FROM archivos WHERE id = $1", [archivoId]);
	});

	it("solo Contaduría los pide: Dirección recibe 403", async () => {
		expect((await pedirConsulta(servidor, "contaduria.contador_externo", {}, "direccion")).estado).toBe(403);
		expect(
			(await pedirConsulta(servidor, "contaduria.paquete_mes", { paquete_contador_id: paqueteId }, "direccion")).estado,
		).toBe(403);
	});
});
