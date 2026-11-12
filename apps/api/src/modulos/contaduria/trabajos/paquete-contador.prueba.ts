/**
 * Prueba de los trabajos y los documentos del contador: el paquete del mes que terminó nace una sola vez con su fecha
 * límite; al mandarlo se arma su ZIP con la relación y los comprobantes de sus gastos; y los documentos del contador
 * se guardan una vez, solo si son PDF, imagen, XML o ZIP.
 * Fase 18 · docs/modulos/contaduria/contador-y-cuadres.md (regla 1, «Trabajos», «`contaduria.adjuntar_documento_contador`»)
 */

import { createHash } from "node:crypto";
import { crearSimuladorDeR2 } from "@uniformame/pruebas/simuladores/r2";
import { setupServer } from "msw/node";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearAlmacen, direccionDeR2 } from "../../../nucleo/almacen.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { paqueteEnviadoDePrueba } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { hoyEnMexico, registrarGastoDePrueba } from "../../../nucleo/pruebas/gastos-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo, type DependenciasDelTrabajador } from "../../../nucleo/trabajos/trabajador.ts";
import { armarArchivoPaquete, crearPaqueteMes } from "./paquete-contador.ts";

const cuenta = "cuentacontador";
const simulador = crearSimuladorDeR2(cuenta);
const red = setupServer(...simulador.manejadores);
const almacen = crearAlmacen({
	direccion: direccionDeR2(cuenta),
	cubo: "uniformame-archivos",
	llaveId: "llave-de-prueba",
	secreto: "secreto-de-prueba",
});

describe("el paquete nace el día 1, al mandarlo se arma su ZIP, y los documentos del contador se guardan una vez", () => {
	let servidor: ServidorDePrueba;
	let dependencias: DependenciasDelTrabajador;
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba({ almacen });
		dependencias = {
			base: crearBase(servidor.base.app),
			registro: servidor.modulos,
			servicios: { escribirBitacora: escribirBitacoraConAdmin, guardarEventos: guardarEventosConAdmin },
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => Temporal.Now.instant(),
			almacen,
		};
	});
	afterAll(async () => {
		red.close();
		await servidor.cerrar();
	});

	/** Espera a que haya al menos tantas conexiones esperando un candado; dice si llegaron. */
	async function esperarQueEsperen(cuantas: number): Promise<boolean> {
		for (let vuelta = 0; vuelta < 200; vuelta++) {
			const { rows } = await servidor.base.dueno.query(
				"SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()",
			);
			if (z.object({ n: z.number() }).parse(rows[0]).n >= cuantas) return true;
			await new Promise((listo) => setTimeout(listo, 50));
		}
		return false;
	}

	/** Sube un archivo como Contaduría, con su propósito y su tipo. */
	async function subir(proposito: string, nombre: string, tipo: string, texto = `contenido ${Math.random()}`) {
		const contenido = new TextEncoder().encode(texto);
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/archivos/subida",
			headers: encabezadosDeLaWeb("contaduria"),
			payload: {
				proposito,
				modulo: "contaduria",
				nombre_original: nombre,
				tipo_mime: tipo,
				tamano_bytes: contenido.byteLength,
				sha256: createHash("sha256").update(contenido).digest("hex"),
			},
		});
		const { resultado } = respuesta.json();
		const subida = await fetch(resultado.url_subida, {
			method: "PUT",
			headers: resultado.encabezados,
			body: contenido,
		});
		expect(subida.status).toBe(200);
		return String(resultado.archivo_id);
	}

	it("Crear el paquete del mes: nace el del mes que terminó, por enviar, con su fecha límite; otra vuelta no hace nada", async () => {
		await correrTrabajo(dependencias, crearPaqueteMes, {});
		await correrTrabajo(dependencias, crearPaqueteMes, {});
		const hoy = Temporal.PlainDate.from(hoyEnMexico());
		const mes = hoy.with({ day: 1 }).subtract({ months: 1 });
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, fecha_limite::text AS limite FROM paquetes_contador WHERE mes = $1",
			[mes.toString()],
		);
		expect(rows).toEqual([{ estado: "por_enviar", limite: mes.add({ months: 1 }).with({ day: 17 }).toString() }]);
	});

	it("al mandarlo se arma su ZIP con la relación y el comprobante de su gasto; otra vuelta no lo vuelve a armar", async () => {
		const comprobante = await subir("comprobante", "recibo de luz.pdf", "application/pdf", "recibo CFE");
		const gasto = await registrarGastoDePrueba(servidor, { comprobante_archivo_id: comprobante, fecha: "2026-05-10" });
		expect(gasto.estado, JSON.stringify(gasto.cuerpo)).toBe(200);
		const { rows: nuevo } = await servidor.base.dueno.query(
			"INSERT INTO paquetes_contador (id, mes, fecha_limite) VALUES (gen_random_uuid(), '2026-05-01', '2026-06-17') RETURNING id",
		);
		const { rows: version } = await servidor.base.dueno.query(
			"SELECT version::int AS v FROM paquetes_contador WHERE id = $1",
			[nuevo[0]?.id],
		);
		const mandado = await mandarAccion(
			servidor,
			"contaduria.marcar_paquete_enviado",
			{ datos: { paquete_contador_id: nuevo[0]?.id }, version: version[0]?.v },
			"contaduria",
		);
		expect(mandado.estado, JSON.stringify(mandado.cuerpo)).toBe(200);
		await correrTrabajo(dependencias, armarArchivoPaquete, {});
		await correrTrabajo(dependencias, armarArchivoPaquete, {});
		const { rows } = await servidor.base.dueno.query(
			`SELECT a.almacen_clave, a.proposito, a.tipo_mime, a.nombre_original FROM paquetes_contador p
			 JOIN archivos a ON a.id = p.archivo_id WHERE p.id = $1`,
			[nuevo[0]?.id],
		);
		expect(rows).toEqual([
			{
				almacen_clave: expect.any(String),
				proposito: "documento_contador",
				tipo_mime: "application/zip",
				nombre_original: "Paquete mayo de 2026.zip",
			},
		]);
		const zip = Buffer.from((await almacen.leer(String(rows[0]?.almacen_clave))) ?? new Uint8Array());
		expect(zip.includes("relacion.csv")).toBe(true);
		expect(zip.includes("recibo de luz.pdf")).toBe(true);
		const { rows: archivos } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM archivos WHERE entidad = 'paquetes_contador' AND entidad_id = $1",
			[nuevo[0]?.id],
		);
		expect(archivos).toEqual([{ n: 1 }]);
	});

	it("un documento del contador se guarda una vez, también si llega dos veces a la vez, y solo si es PDF, imagen, XML o ZIP", async () => {
		const paquete = await paqueteEnviadoDePrueba(servidor, "2026-04-01");
		const acuse = await subir("documento_contador", "acuse abril.pdf", "application/pdf");
		const adjuntar = (archivoId: string) =>
			mandarAccion(
				servidor,
				"contaduria.adjuntar_documento_contador",
				{ datos: { archivo_id: archivoId, tipo: "acuse", mes: "2026-04-01", paquete_contador_id: paquete } },
				"contaduria",
			);
		const guardado = await adjuntar(acuse);
		expect(guardado.cuerpo.resultado).toMatchObject({ mensaje: "Documento guardado" });
		const { documento_contador_id: id } = z
			.object({ documento_contador_id: z.uuid() })
			.parse(guardado.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query(
			"SELECT nombre, tipo, mes::text AS mes, paquete_contador_id AS paquete FROM documentos_contador WHERE id = $1",
			[id],
		);
		expect(rows).toEqual([{ nombre: "acuse abril.pdf", tipo: "acuse", mes: "2026-04-01", paquete }]);
		expect((await adjuntar(acuse)).cuerpo).toMatchObject({
			codigo: "archivo_ya_guardado",
			mensaje: "Ese archivo ya está guardado.",
		});
		// El mismo archivo guardado dos veces a la vez: uno se guarda y el otro responde que ya está. Otra conexión
		// detiene el archivo hasta que los dos esperan, para que se crucen siempre.
		const otro = await subir("documento_contador", "acuse mayo.pdf", "application/pdf");
		const conexion = await servidor.base.dueno.connect();
		await conexion.query("BEGIN");
		await conexion.query("SELECT id FROM archivos WHERE id = $1 FOR UPDATE", [otro]);
		const ambos = Promise.all([adjuntar(otro), adjuntar(otro)]);
		try {
			expect(await esperarQueEsperen(2)).toBe(true);
		} finally {
			await conexion.query("COMMIT");
			conexion.release();
		}
		const aLaVez = await ambos;
		expect(aLaVez.map((respuesta) => respuesta.estado).sort()).toEqual([200, 422]);
		expect(aLaVez.map((respuesta) => respuesta.cuerpo.codigo ?? "ok").sort()).toEqual(["archivo_ya_guardado", "ok"]);
		// La subida ya pide esos tipos; el que se cuela con otro tipo tampoco entra.
		const texto = await subir("documento_contador", "notas.pdf", "application/pdf");
		await servidor.base.dueno.query("UPDATE archivos SET tipo_mime = 'text/plain' WHERE id = $1", [texto]);
		expect((await adjuntar(texto)).cuerpo).toMatchObject({
			codigo: "archivo_invalido",
			mensaje: "El archivo debe ser PDF, imagen, XML o ZIP.",
		});
	});
});
