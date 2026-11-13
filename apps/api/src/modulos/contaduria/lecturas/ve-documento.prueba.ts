/**
 * Prueba de `contaduria.ve_documento`: quién abre los archivos de los documentos de Contaduría por
 * `GET /v1/archivos/{id}` (el comprobante de un gasto, el XML y el PDF de una factura de proveedor y su nota de crédito,
 * los documentos del contador y el ZIP del paquete del mes).
 * Fase 19 · docs/modulos/admin/archivos.md (regla 7: «Ver un archivo pide poder ver su documento») y
 * docs/interfaz/fabrica/contaduria.md («Gastos»: «Adjunto, que lo abre»; «Contador externo»: «Documento (lo abre)»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearAlmacen, direccionDeR2 } from "../../../nucleo/almacen.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** El almacén de las pruebas: abrir un archivo solo firma su dirección, no la visita. */
const almacen = crearAlmacen({
	direccion: direccionDeR2("cuentaprueba"),
	cubo: "uniformame-archivos",
	llaveId: "llave-de-prueba",
	secreto: "secreto-de-prueba",
});

describe("los archivos de Contaduría los abre quien ve su documento", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ almacen });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/**
	 * Un archivo de `contaduria` ya subido y ligado a un documento.
	 * @param entidad La tabla del documento.
	 * @param proposito Su propósito.
	 * @returns Su id.
	 */
	async function archivoDe(entidad: string, proposito: string): Promise<string> {
		const id = uuidv7();
		await servidor.base.dueno.query(
			`INSERT INTO archivos (id, proposito, modulo, entidad, entidad_id, nombre_original, tipo_mime, tamano_bytes, sha256, almacen_clave, subido_en)
			 VALUES ($1, $2, 'contaduria', $3, $4, 'documento.pdf', 'application/pdf', 1000, repeat('c', 64), $5, now())`,
			[id, proposito, entidad, uuidv7(), `contaduria/prueba/${id}`],
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

	it("el comprobante, la factura y el documento del contador los abre Contaduría; Compras y Ventas no (404)", async () => {
		for (const [entidad, proposito] of [
			["gastos", "comprobante"],
			["facturas_proveedor", "factura_proveedor"],
			["documentos_contador", "documento_contador"],
		] as const) {
			const archivo = await archivoDe(entidad, proposito);
			expect(await abrir(archivo, "contaduria"), entidad).toBe(302);
			expect(await abrir(archivo, "compras"), entidad).toBe(404);
			expect(await abrir(archivo, "ventas"), entidad).toBe(404);
		}
	});

	it("el ZIP del paquete lleva la nómina: solo lo abre Contaduría con «ven sueldos y tarifas»", async () => {
		const zip = await archivoDe("paquetes_contador", "documento_contador");
		expect(await abrir(zip, "contaduria_sueldos")).toBe(302);
		expect(await abrir(zip, "contaduria")).toBe(404);
	});

	it("un archivo de otro documento de Contaduría no lo abre nadie (404)", async () => {
		const otro = await archivoDe("pagos", "comprobante");
		expect(await abrir(otro, "contaduria_sueldos")).toBe(404);
	});
});
