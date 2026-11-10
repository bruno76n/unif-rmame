/**
 * Prueba de `admin.ligar_archivo` y `admin.guardar_archivo`, con el simulador de R2.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 5)
 */

import { createHash } from "node:crypto";
import { crearSimuladorDeR2 } from "@uniformame/pruebas/simuladores/r2";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearAlmacen, direccionDeR2 } from "../../../nucleo/almacen.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

const cuenta = "cuentaprueba";
const simulador = crearSimuladorDeR2(cuenta);
const red = setupServer(...simulador.manejadores);
const almacen = crearAlmacen({
	direccion: direccionDeR2(cuenta),
	cubo: "uniformame-archivos",
	llaveId: "llave-de-prueba",
	secreto: "secreto-de-prueba",
});

describe("uno que no llegó, de otra cuenta o ya ligado no se liga", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba({ almacen });
	});
	afterAll(async () => {
		red.close();
		await servidor.cerrar();
	});

	/** Pide la subida de un comprobante como `quien` y, si `subirlo`, lo sube. */
	async function nuevoArchivo(quien = "ventas", subirlo = true, proposito = "comprobante"): Promise<string> {
		const contenido = new TextEncoder().encode(`comprobante ${Math.random()}`);
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/archivos/subida",
			headers: encabezadosDeLaWeb(quien),
			payload: {
				proposito,
				modulo: "ventas",
				nombre_original: "ticket.pdf",
				tipo_mime: "application/pdf",
				tamano_bytes: contenido.byteLength,
				sha256: createHash("sha256").update(contenido).digest("hex"),
			},
		});
		const { resultado } = respuesta.json();
		if (subirlo) {
			const subida = await fetch(resultado.url_subida, {
				method: "PUT",
				headers: resultado.encabezados,
				body: contenido,
			});
			expect(subida.status).toBe(200);
		}
		return resultado.archivo_id;
	}

	/** Una nota nueva de Ventas. */
	async function nuevaNota(): Promise<string> {
		const nota = await mandarAccion(servidor, "prueba.crear_nota", {
			datos: { texto: "con archivo", monto_centavos: 1 },
		});
		return String((nota.cuerpo.resultado as { id: string }).id);
	}

	/** Adjunta un archivo a una nota. */
	function adjuntar(notaId: string, archivoId: string, quien = "ventas") {
		return mandarAccion(servidor, "prueba.adjuntar", { datos: { nota_id: notaId, archivo_id: archivoId } }, quien);
	}

	it("se liga al documento, con su subida comprobada; otra vez al mismo documento no hace nada", async () => {
		const archivo = await nuevoArchivo();
		const nota = await nuevaNota();
		expect((await adjuntar(nota, archivo)).estado).toBe(200);
		expect((await adjuntar(nota, archivo)).estado).toBe(200);
		const { rows } = await servidor.base.dueno.query(
			"SELECT modulo, entidad, entidad_id, subido_en IS NOT NULL AS subido FROM archivos WHERE id = $1",
			[archivo],
		);
		expect(rows[0]).toEqual({ modulo: "prueba", entidad: "prueba_notas", entidad_id: nota, subido: true });
	});

	it("uno que no llegó a R2 responde archivo_no_subido; uno cuya suma no es la declarada, también", async () => {
		const sinSubir = await nuevoArchivo("ventas", false);
		expect((await adjuntar(await nuevaNota(), sinSubir)).cuerpo).toMatchObject({
			codigo: "archivo_no_subido",
			mensaje: "El archivo no terminó de subir. Vuelve a subirlo.",
		});
		const cambiado = await nuevoArchivo();
		await servidor.base.dueno.query("UPDATE archivos SET sha256 = repeat('0', 64) WHERE id = $1", [cambiado]);
		expect((await adjuntar(await nuevaNota(), cambiado)).cuerpo).toMatchObject({ codigo: "archivo_no_subido" });
	});

	it("uno de otra cuenta, ya ligado a otro documento, de otro propósito o que no existe no se liga", async () => {
		const deLaDuena = await nuevoArchivo("duena");
		expect((await adjuntar(await nuevaNota(), deLaDuena)).cuerpo).toMatchObject({ codigo: "archivo_ajeno" });
		const archivo = await nuevoArchivo();
		await adjuntar(await nuevaNota(), archivo);
		expect((await adjuntar(await nuevaNota(), archivo)).cuerpo).toMatchObject({ codigo: "archivo_ya_ligado" });
		const foto = await nuevoArchivo("ventas", true, "factura_proveedor");
		expect((await adjuntar(await nuevaNota(), foto)).cuerpo).toMatchObject({
			codigo: "proposito_distinto",
			mensaje: "Ese archivo no es comprobante.",
		});
		const noExiste = await adjuntar(await nuevaNota(), "01936f2e-0000-7000-8000-00000000ffff");
		expect(noExiste.estado).toBe(404);
		expect(noExiste.cuerpo).toMatchObject({ codigo: "archivo_no_existe" });
	});

	it("guardar_archivo sube lo que genera el servidor con su suma y deja el archivo ya subido", async () => {
		const contenido = new TextEncoder().encode("%PDF etiquetas");
		const guardado = (await enAccionDePrueba(
			crearBase(servidor.base.app),
			servidor.modulos,
			(contexto) =>
				contexto.interna("admin.guardar_archivo", {
					contenido,
					proposito: "etiqueta",
					modulo: "prueba",
					nombre_original: "etiquetas.pdf",
					tipo_mime: "application/pdf",
				}),
			{ almacen },
		)) as { archivo_id: string; url: string };
		const { rows } = await servidor.base.dueno.query(
			"SELECT sha256, tamano_bytes, subido_en IS NOT NULL AS subido FROM archivos WHERE id = $1",
			[guardado.archivo_id],
		);
		expect(rows[0]).toEqual({
			sha256: createHash("sha256").update(contenido).digest("hex"),
			tamano_bytes: String(contenido.byteLength),
			subido: true,
		});
		expect(await (await fetch(guardado.url)).text()).toBe("%PDF etiquetas");
	});
});
