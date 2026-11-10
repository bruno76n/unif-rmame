/**
 * Prueba del recordatorio de la prueba de restauración y de `admin.registrar_restauracion`.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 7)
 */

import { createHash } from "node:crypto";
import { crearSimuladorDeR2 } from "@uniformame/pruebas/simuladores/r2";
import { setupServer } from "msw/node";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearAlmacen, direccionDeR2 } from "../../../nucleo/almacen.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo, type DependenciasDelTrabajador } from "../../../nucleo/trabajos/trabajador.ts";
import { recordatorioRestauracion } from "./recordatorio-restauracion.ts";

const simulador = crearSimuladorDeR2("cuentaprueba");
const red = setupServer(...simulador.manejadores);
const almacen = crearAlmacen({
	direccion: direccionDeR2("cuentaprueba"),
	cubo: "uniformame-archivos",
	llaveId: "llave-de-prueba",
	secreto: "secreto-de-prueba",
});

describe("el recordatorio avisa a su tiempo y no antes", () => {
	let servidor: ServidorDePrueba;
	let dependencias: DependenciasDelTrabajador;
	let ahora = Temporal.Instant.from("2026-11-10T15:00:00Z");
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba({ almacen });
		dependencias = {
			base: crearBase(servidor.base.app),
			registro: servidor.modulos,
			servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: escribirBitacoraConAdmin },
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => ahora,
		};
	});
	afterAll(async () => {
		red.close();
		await servidor.cerrar();
	});

	/** Anota un respaldo como lo deja el trabajo semanal. */
	async function respaldo(hechoEn: string, estado = "correcto", error: string | null = null): Promise<string> {
		const { rows } = await servidor.base.dueno.query(
			`INSERT INTO respaldos (id, hecho_en, estado, cifrado, destino, error)
			 VALUES (gen_random_uuid(), $1, $2, true, 'r2://uniformame-respaldos/x', $3) RETURNING id`,
			[hechoEn, estado, error],
		);
		return rows[0]?.id;
	}

	/** Los avisos de un tipo, por cuenta. */
	async function avisos(tipo: string): Promise<{ usuario_id: string; texto: string }[]> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT usuario_id, texto FROM avisos WHERE tipo = $1 ORDER BY creado_en, usuario_id",
			[tipo],
		);
		return rows;
	}

	/** Una vuelta del recordatorio a la hora `ahora`. */
	const recordar = () => correrTrabajo(dependencias, recordatorioRestauracion, {});

	it("sin pruebas, cuenta desde el primer respaldo: a los 80 días no avisa; a los 81, sí, y no repite antes de 7 días", async () => {
		await respaldo("2026-08-21T08:00:00Z");
		ahora = Temporal.Instant.from("2026-11-09T15:00:00Z");
		await recordar();
		expect(await avisos("restauracion_por_probar")).toEqual([]);
		ahora = Temporal.Instant.from("2026-11-10T15:00:00Z");
		await recordar();
		expect(await avisos("restauracion_por_probar")).toEqual([
			{
				usuario_id: "01936f2e-0000-7000-8000-000000000001",
				texto: "Prueba de restauración: la última fue hace 81 días. La siguiente toca el 2026-11-21.",
			},
		]);
		await servidor.base.dueno.query("UPDATE avisos SET leido_en = now()");
		ahora = Temporal.Instant.from("2026-11-16T15:00:00Z");
		await recordar();
		expect(await avisos("restauracion_por_probar")).toHaveLength(1);
		ahora = Temporal.Instant.from("2026-11-17T15:00:01Z");
		await recordar();
		expect(await avisos("restauracion_por_probar")).toHaveLength(2);
	});

	it("sin un respaldo correcto en 8 días avisa respaldo_fallido a la dueña y a soporte; si el último falló, con su error", async () => {
		// Dos vueltas del recordatorio con siete días entre ellas: dos avisos cada una, a la dueña y a soporte.
		expect(await avisos("respaldo_fallido")).toHaveLength(4);
		expect((await avisos("respaldo_fallido"))[0]?.texto).toBe(
			"El respaldo semanal no se hizo: no hay uno correcto en los últimos 8 días.",
		);
		await servidor.base.dueno.query("DELETE FROM avisos");
		await respaldo("2026-11-17T08:00:00Z", "fallido", "pg_dump salió con 1");
		await recordar();
		expect((await avisos("respaldo_fallido")).map((aviso) => aviso.texto)).toEqual([
			"El respaldo semanal no se hizo: pg_dump salió con 1.",
			"El respaldo semanal no se hizo: pg_dump salió con 1.",
		]);
	});

	it("registrar una restauración que cuadró, con su evidencia, reinicia la cuenta; sin evidencia, futura o de un respaldo fallido, no se registra", async () => {
		const evidencia = new TextEncoder().encode("conteos: todo igual");
		const pedida = await servidor.app.inject({
			method: "POST",
			url: "/v1/archivos/subida",
			headers: encabezadosDeLaWeb("duena"),
			payload: {
				proposito: "evidencia_restauracion",
				modulo: "admin",
				nombre_original: "prueba.txt",
				tipo_mime: "text/plain",
				tamano_bytes: evidencia.byteLength,
				sha256: createHash("sha256").update(evidencia).digest("hex"),
			},
		});
		const { resultado } = pedida.json();
		await fetch(resultado.url_subida, { method: "PUT", headers: resultado.encabezados, body: evidencia });
		const correcto = await respaldo("2026-11-15T08:00:00Z");
		const registrar = (cambios: Record<string, unknown>) =>
			mandarAccion(
				servidor,
				"admin.registrar_restauracion",
				{
					datos: {
						tipo: "semanal_externo",
						respaldo_id: correcto,
						probada_en: "2026-11-09T18:00:00Z",
						conteos_cuadraron: true,
						evidencia_archivo_id: resultado.archivo_id,
						...cambios,
					},
				},
				"duena",
			);
		expect((await registrar({ evidencia_archivo_id: undefined })).cuerpo).toMatchObject({
			campos: { evidencia_archivo_id: "Sube la evidencia de la prueba." },
		});
		expect((await registrar({ probada_en: "2099-01-01T00:00:00Z" })).cuerpo).toMatchObject({
			campos: { probada_en: "La prueba no puede ser de una fecha futura." },
		});
		const fallido = await respaldo("2026-11-16T08:00:00Z", "fallido", "sin red");
		expect((await registrar({ respaldo_id: fallido })).cuerpo).toMatchObject({ codigo: "respaldo_fallido" });
		const registrada = await registrar({});
		expect(registrada.cuerpo.resultado).toMatchObject({
			mensaje: "Restauración registrada. La siguiente toca el 2027-02-09",
		});
		await servidor.base.dueno.query("DELETE FROM avisos");
		ahora = Temporal.Instant.from("2026-11-30T15:00:00Z");
		await recordar();
		expect(await avisos("restauracion_por_probar")).toEqual([]);
	});
});
