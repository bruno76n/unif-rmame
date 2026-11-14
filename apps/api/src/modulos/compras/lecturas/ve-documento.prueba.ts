/**
 * Prueba de `compras.ve_documento`: quién abre por `GET /v1/archivos/{id}` el PDF de una orden de compra, que lleva sus
 * precios.
 * Fase 19 · docs/modulos/admin/archivos.md (regla 7: «Ver un archivo pide poder ver su documento») y
 * docs/interfaz/fabrica/compras.md (el cajón de la orden: «Ver PDF»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearAlmacen, direccionDeR2 } from "../../../nucleo/almacen.ts";
import { quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { veDocumento } from "./ve-documento.ts";

/** El almacén de las pruebas: abrir un archivo solo firma su dirección, no la visita. */
const almacen = crearAlmacen({
	direccion: direccionDeR2("cuentaprueba"),
	cubo: "uniformame-archivos",
	llaveId: "llave-de-prueba",
	secreto: "secreto-de-prueba",
});

describe("el PDF de una orden de compra lo abre quien ve sus precios", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ almacen });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/**
	 * Un archivo de `compras` ya subido y ligado a un documento.
	 * @param entidad La tabla del documento.
	 * @param proposito Su propósito.
	 * @returns Su id.
	 */
	async function archivoDe(entidad: string, proposito: string): Promise<string> {
		const id = uuidv7();
		await servidor.base.dueno.query(
			`INSERT INTO archivos (id, proposito, modulo, entidad, entidad_id, nombre_original, tipo_mime, tamano_bytes, sha256, almacen_clave, subido_en)
			 VALUES ($1, $2, 'compras', $3, $4, 'documento.pdf', 'application/pdf', 1000, repeat('c', 64), $5, now())`,
			[id, proposito, entidad, uuidv7(), `compras/prueba/${id}`],
		);
		return id;
	}

	/**
	 * Lo que responde abrir un archivo.
	 * @param archivoId El archivo.
	 * @param quien La cuenta de prueba.
	 */
	async function abrir(archivoId: string, quien: string): Promise<number> {
		const respuesta = await servidor.app.inject({
			method: "GET",
			url: `/v1/archivos/${archivoId}`,
			headers: encabezadosDeLaWeb(quien),
		});
		return respuesta.statusCode;
	}

	it("el PDF de una orden lo abren Compras y Contaduría; Aduana, que recibe la orden sin precios, y Ventas no (404)", async () => {
		const pdf = await archivoDe("ordenes_compra", "pdf_documento");
		expect(await abrir(pdf, "compras")).toBe(302);
		expect(await abrir(pdf, "contaduria")).toBe(302);
		expect(await abrir(pdf, "aduana")).toBe(404);
		expect(await abrir(pdf, "ventas")).toBe(404);
	});

	it("un archivo de otro documento de Compras no lo abre nadie (404)", async () => {
		const otro = await archivoDe("proveedores", "pdf_documento");
		expect(await abrir(otro, "compras")).toBe(404);
	});
});

describe("la cuenta de soporte nunca abre el PDF de una orden, aunque tenga Compras", () => {
	it("con Compras, soporte no lo ve: el PDF lleva precios e importes, y soporte nunca recibe un monto", async () => {
		const soporte = quienesDePrueba.soporte;
		if (soporte?.tipo !== "cuenta") throw new Error("falta la cuenta de soporte de prueba");
		const conCompras = { ...soporte, departamentos: [...soporte.departamentos, "compras"] };
		const ordenes = { entidad: "ordenes_compra", entidad_id: uuidv7() };
		expect(await veDocumento({ quien: conCompras }, ordenes)).toBe(false);
		const compras = quienesDePrueba.compras;
		if (compras === undefined) throw new Error("falta la cuenta de Compras de prueba");
		expect(await veDocumento({ quien: compras }, ordenes)).toBe(true);
	});
});
