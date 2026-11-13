/**
 * Prueba de la foto de un producto: se guarda en el momento, con su formato y su peso, y regresa la versión
 * nueva del producto.
 * Fase 8 · docs/fases/08-catalogo.md (parte 3)
 */

import { createHash } from "node:crypto";
import { crearSimuladorDeR2 } from "@uniformame/pruebas/simuladores/r2";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearAlmacen, direccionDeR2 } from "../../../nucleo/almacen.ts";
import {
	nuevoProducto,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
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

describe("la foto se guarda en el momento y regresa la versión nueva del producto", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba({ almacen });
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		red.close();
		await servidor.cerrar();
	});

	/** Sube una foto como Catálogo. */
	async function subirFoto(tipoMime = "image/jpeg", bytes = 2_000): Promise<string> {
		const contenido = new Uint8Array(bytes).fill(7);
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/archivos/subida",
			headers: encabezadosDeLaWeb("catalogo"),
			payload: {
				proposito: "foto",
				modulo: "catalogo",
				nombre_original: "foto.jpg",
				tipo_mime: tipoMime,
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
		return resultado.archivo_id;
	}

	/** Guarda la foto del producto. */
	async function guardar(productoId: string, archivoId: string) {
		return mandarAccion(
			servidor,
			"catalogo.subir_foto_producto",
			{
				datos: { producto_id: productoId, archivo_id: archivoId },
				version: await versionDelProducto(servidor, productoId),
			},
			"catalogo",
		);
	}

	it("guarda la foto y regresa la versión nueva; la anterior queda ligada como historial; en línea dice que ya se puede publicar", async () => {
		const producto = await nuevoProducto(servidor, siembra, { canales: ["mostrador", "en_linea"] });
		const antes = await versionDelProducto(servidor, producto.producto_id);
		const primera = await subirFoto();
		const guardada = await guardar(producto.producto_id, primera);
		expect(guardada.cuerpo).toMatchObject({
			resultado: { mensaje: expect.stringMatching(/^Foto guardada\. .+ ya se puede publicar en línea$/) },
		});
		const { version } = guardada.cuerpo.resultado as { version: number };
		expect(version).toBeGreaterThan(antes);
		expect(version).toBe(await versionDelProducto(servidor, producto.producto_id));
		const segunda = await subirFoto("image/png");
		expect((await guardar(producto.producto_id, segunda)).estado).toBe(200);
		const { rows } = await servidor.base.dueno.query(
			"SELECT (SELECT foto_archivo_id FROM productos WHERE id = $1) AS foto, (SELECT count(*)::int FROM archivos WHERE entidad_id = $1) AS ligadas",
			[producto.producto_id],
		);
		expect(rows[0]).toEqual({ foto: segunda, ligadas: 2 });
		// La foto la abre quien lee los productos (`catalogo.ve_documento`); Personal no los lee.
		const abrir = (quien: string) =>
			servidor.app.inject({ method: "GET", url: `/v1/archivos/${segunda}`, headers: encabezadosDeLaWeb(quien) });
		expect((await abrir("bodega")).statusCode).toBe(302);
		expect((await abrir("personal")).statusCode).toBe(404);
		// Un `<img>` o un enlace del navegador no manda la versión de la app: la foto abre igual.
		const { "x-app-version": _version, ...sinVersion } = encabezadosDeLaWeb("bodega");
		const desdeUnEnlace = await servidor.app.inject({
			method: "GET",
			url: `/v1/archivos/${segunda}`,
			headers: sinVersion,
		});
		expect(desdeUnEnlace.statusCode).toBe(302);
	});

	it("HEIC no se acepta (foto_formato); una más pesada que catalogo.foto_max_mb tampoco (foto_pesada)", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		expect((await guardar(producto.producto_id, await subirFoto("image/heic"))).cuerpo).toMatchObject({
			codigo: "foto_formato",
			mensaje: "La foto debe ser JPG, PNG o WebP.",
		});
		await servidor.base.dueno.query("UPDATE parametros SET valor_entero = 1 WHERE clave = 'catalogo.foto_max_mb'");
		try {
			expect((await guardar(producto.producto_id, await subirFoto("image/jpeg", 1_200_000))).cuerpo).toMatchObject({
				codigo: "foto_pesada",
				mensaje: "La foto pesa más de 1 MB. Súbela más ligera.",
			});
		} finally {
			await servidor.base.dueno.query("UPDATE parametros SET valor_entero = 5 WHERE clave = 'catalogo.foto_max_mb'");
		}
	});
});
