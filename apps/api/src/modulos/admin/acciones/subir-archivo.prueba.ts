/**
 * Prueba de `POST /v1/archivos/subida` y `GET /v1/archivos/{id}`, con el simulador de R2.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 5)
 */

import { createHash } from "node:crypto";
import { crearSimuladorDeR2 } from "@uniformame/pruebas/simuladores/r2";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearAlmacen, direccionDeR2 } from "../../../nucleo/almacen.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

const cuenta = "cuentaprueba";
let reloj = Date.now();
const simulador = crearSimuladorDeR2(cuenta, () => reloj);
const red = setupServer(...simulador.manejadores);

/** Un comprobante de prueba. */
const contenido = new TextEncoder().encode("ticket G-0412 · papelería");
const sha256 = createHash("sha256").update(contenido).digest("hex");

describe("un archivo de otro tipo o más grande no se acepta; la dirección firmada vence; quien no ve el documento recibe 404", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba({
			almacen: crearAlmacen({
				direccion: direccionDeR2(cuenta),
				cubo: "uniformame-archivos",
				llaveId: "llave-de-prueba",
				secreto: "secreto-de-prueba",
			}),
		});
	});
	afterAll(async () => {
		red.close();
		await servidor.cerrar();
	});

	/** Pide la subida de un comprobante. */
	async function pedirSubida(cambios: Record<string, unknown> = {}, quien = "ventas") {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/archivos/subida",
			headers: encabezadosDeLaWeb(quien),
			payload: {
				proposito: "comprobante",
				modulo: "ventas",
				nombre_original: "ticket.pdf",
				tipo_mime: "application/pdf",
				tamano_bytes: contenido.byteLength,
				sha256,
				...cambios,
			},
		});
		return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
	}

	/** Sube el contenido con la dirección y los encabezados que dio la API. */
	async function subir(resultado: { url_subida: string; encabezados: Record<string, string> }, cuerpo = contenido) {
		return fetch(resultado.url_subida, { method: "PUT", headers: resultado.encabezados, body: cuerpo });
	}

	it("da el archivo, la dirección firmada y los encabezados; con ellos R2 lo recibe, y con otro contenido no", async () => {
		const { estado, cuerpo } = await pedirSubida();
		expect(estado).toBe(200);
		expect(cuerpo.resultado.encabezados).toEqual({
			"content-type": "application/pdf",
			"content-length": String(contenido.byteLength),
			"x-amz-checksum-sha256": Buffer.from(sha256, "hex").toString("base64"),
		});
		expect(cuerpo.resultado.url_subida).toContain(`/uniformame-archivos/ventas/`);
		const otro = new TextEncoder().encode("ticket G-0413 · papelería");
		expect((await subir(cuerpo.resultado, otro)).status).toBe(400);
		expect((await subir(cuerpo.resultado)).status).toBe(200);
	});

	it("otro tipo, más grande, sin el departamento del módulo o de un módulo que no existe no se acepta", async () => {
		expect((await pedirSubida({ tipo_mime: "application/zip" })).cuerpo).toMatchObject({
			error: "regla",
			codigo: "tipo_no_aceptado",
			mensaje: "Ese tipo de archivo no se acepta aquí. Sube una imagen, un PDF o un XML.",
		});
		expect((await pedirSubida({ tamano_bytes: 21 * 1024 * 1024 })).cuerpo).toMatchObject({
			codigo: "archivo_muy_grande",
			mensaje: "El archivo pesa más de 20 MB.",
		});
		expect((await pedirSubida({}, "aduana")).cuerpo).toMatchObject({
			error: "sin_permiso",
			codigo: "sin_departamento",
		});
		expect((await pedirSubida({ sha256: "no-es-una-suma" })).estado).toBe(400);
		expect((await pedirSubida({ modulo: "no_existe" }, "duena")).cuerpo).toMatchObject({
			campos: { modulo: "Ese módulo no existe." },
		});
		for (const deJavaScript of ["constructor", "toString", "__proto__"]) {
			for (const quien of ["ventas", "duena"]) {
				expect((await pedirSubida({ modulo: deJavaScript }, quien)).cuerpo).toMatchObject({
					campos: { modulo: "Ese módulo no existe." },
				});
			}
		}
	});

	it("la dirección firmada vence a los 5 minutos", async () => {
		const { cuerpo } = await pedirSubida();
		reloj += 6 * 60 * 1000;
		try {
			expect((await subir(cuerpo.resultado)).status).toBe(403);
		} finally {
			reloj = Date.now();
		}
	});

	it("uno sin ligar solo lo abre quien lo subió; ligado, solo quien ve su documento; a los demás, 404", async () => {
		const { cuerpo } = await pedirSubida();
		await subir(cuerpo.resultado);
		const id = cuerpo.resultado.archivo_id;
		const abrir = (quien: string) =>
			servidor.app.inject({
				method: "GET",
				url: `/v1/archivos/${id}?descarga=true`,
				headers: encabezadosDeLaWeb(quien),
			});
		const propio = await abrir("ventas");
		expect(propio.statusCode).toBe(302);
		expect(propio.headers.location).toContain("X-Amz-Signature=");
		expect((await fetch(String(propio.headers.location))).status).toBe(200);
		expect((await abrir("duena")).statusCode).toBe(404);
		// Se liga a una nota privada de la dueña: Ventas ya no la ve; la dueña sí.
		const nota = await mandarAccion(servidor, "prueba.crear_nota", {
			datos: { texto: "privada con ticket", monto_centavos: 1 },
		});
		const notaId = String((nota.cuerpo.resultado as { id: string }).id);
		expect(
			(await mandarAccion(servidor, "prueba.adjuntar", { datos: { nota_id: notaId, archivo_id: id } })).estado,
		).toBe(200);
		expect((await abrir("ventas")).statusCode).toBe(404);
		expect((await abrir("duena")).statusCode).toBe(302);
		expect((await abrir("aduana")).statusCode).toBe(404);
		const otraCosa = await servidor.app.inject({
			method: "GET",
			url: "/v1/archivos/no-es-un-id",
			headers: encabezadosDeLaWeb("duena"),
		});
		expect(otraCosa.statusCode).toBe(404);
	});
});
