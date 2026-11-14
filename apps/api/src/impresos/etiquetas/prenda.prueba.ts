/**
 * Prueba del dibujo de la etiqueta de prenda: el ZPL contra su foto guardada (la que se revisa en la Zebra), con
 * nombres largos, acentos, ñ, un `^` y un `~`; el PDF con una página de 2 × 1 pulgadas por etiqueta, su texto y sus
 * barras, que se leen otra vez con un lector de códigos.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterios «Cada etiqueta lleva lo que dice su
 * archivo, en ZPL y en PDF, con acentos, ñ, nombres largos y un `^` o un `~` en los datos» y «Ninguna etiqueta trae un
 * costo, y el precio de mostrador solo con `catalogo.etiqueta_lleva_precio`») y docs/impresos/etiquetas.md
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerBarras, leerPdf } from "../../nucleo/pruebas/leer-impresos.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../nucleo/pruebas/servidor-de-prueba.ts";
import { barrasEnPng } from "../pdf.ts";
import { dibujarPrendas, type EtiquetaDePrenda } from "./prenda.ts";

/** Una playera de la muestra, sin precio. */
const playera: EtiquetaDePrenda = {
	varianteId: "01936f2e-0000-7000-8000-00000000a001",
	prenda: "Playera polo blanca con escudo",
	escuela: "Instituto Juan Pablo II",
	talla: "Talla 8",
	codigo: "100269",
	precio: null,
	pedidoEspecial: false,
};

/** Un nombre y una escuela que no caben, con acentos, ñ, un `^`, un `~` y un `_`. */
const rara: EtiquetaDePrenda = {
	varianteId: "01936f2e-0000-7000-8000-00000000a002",
	prenda: "Suéter de piqué con cuello ^alto^ y puños ~tejidos~ para niña pequeña_bordado",
	escuela: "Colegio Bilingüe Montaña de Peñuelas Ñuñoa",
	talla: "Talla 10",
	codigo: "100270",
	precio: "$1,250",
	pedidoEspecial: true,
};

describe("la etiqueta de prenda en ZPL", () => {
	it("cada etiqueta lleva lo que dice su archivo en ZPL: su foto guardada, con acentos, ñ, nombres largos, `^` y `~`", async () => {
		const zpl = await dibujarPrendas([playera, playera, rara], "zpl", 1);
		await expect(zpl).toMatchFileSnapshot("./fotos/prenda.zpl");
	});

	it("la escuela que no cabe se corta con «…» y la talla siempre queda completa", async () => {
		const zpl = String(await dibujarPrendas([rara], "zpl", 1));
		expect(zpl).toMatch(/… · Talla 10\^FS/);
	});

	it("con UTF-8 y la medida de 2 × 1 pulgadas; los datos van por `^FH` y nunca rompen la etiqueta", async () => {
		const zpl = String(await dibujarPrendas([rara], "zpl", 1));
		expect(zpl.startsWith("^XA^CI28^PW406^LL203")).toBe(true);
		expect(zpl.endsWith("^XZ")).toBe(true);
		// Fuera de los comandos, ningún `^` ni `~` de los datos: van en hexadecimal.
		const datos = [...zpl.matchAll(/\^FD(.*?)\^FS/g)].map((campo) => campo[1] ?? "");
		expect(datos.join("")).not.toMatch(/[\^~]/);
		expect(datos.some((dato) => dato.includes("_5Ealto_5E") && dato.includes("_7Etejidos_7E"))).toBe(true);
		expect(datos).toContain("Colegio Bilingüe Monta… · Talla 10");
		// El nombre largo se corta con «…» para caber en sus dos renglones.
		expect(datos.some((dato) => dato.endsWith("…"))).toBe(true);
	});

	it("las piezas iguales seguidas van en una etiqueta con sus copias en `^PQ`, no repetidas", async () => {
		const zpl = String(await dibujarPrendas([playera, playera, playera, rara], "zpl", 2));
		expect(zpl.match(/\^XA/g)).toHaveLength(2);
		expect(zpl).toContain("^PQ6^XZ");
		expect(zpl).toContain("^PQ2^XZ");
	});
});

describe("la etiqueta de prenda en PDF", () => {
	it("una página de 2 × 1 pulgadas por etiqueta y por copia, con su texto, su código y, si va, su precio", async () => {
		const paginas = leerPdf(await pdfDe([playera, rara], 2));
		expect(paginas).toHaveLength(4);
		for (const pagina of paginas) expect([pagina.ancho, pagina.alto]).toEqual([144, 72]);
		const [primera, , tercera] = paginas;
		expect(primera?.textos).toEqual(["Playera polo blanca con escudo", "Instituto Juan Pablo II · Talla 8", "100269"]);
		// Un renglón que no cabe sigue en el de abajo: el texto se lee junto.
		const textos = (tercera?.textos ?? []).join("");
		expect(textos).toContain("Colegio Bilingüe Monta… · Talla 10");
		expect(textos).toContain("$1,250 · Pedido especial");
		expect(textos).toContain("^alto^");
		expect(textos).toContain("100270");
	});

	it("sin precio, la etiqueta no trae ningún peso", async () => {
		const [pagina] = leerPdf(await pdfDe([playera], 1));
		expect((pagina?.textos ?? []).join(" ")).not.toContain("$");
	});

	it("sus barras se leen otra vez con un lector de códigos", async () => {
		expect(await leerBarras(await barrasEnPng(playera.codigo))).toEqual(["100269"]);
		expect(await leerBarras(await barrasEnPng("B-2026-121-03"))).toEqual(["B-2026-121-03"]);
	});
});

/**
 * El PDF de unas etiquetas.
 * @param etiquetas Las etiquetas.
 * @param copias Sus copias.
 */
async function pdfDe(etiquetas: EtiquetaDePrenda[], copias: number): Promise<Uint8Array> {
	const pdf = await dibujarPrendas(etiquetas, "pdf", copias);
	if (typeof pdf === "string") throw new Error("el PDF salió como texto");
	return pdf;
}

describe("la etiqueta de prenda con los datos de Catálogo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Las variantes de las tallas 4 y 18 (de pedido especial) del Pants marino liso de la muestra. */
	async function delPants(): Promise<{ cuatro: string; especial: string; recargo: number }> {
		const { rows } = await servidor.base.dueno.query(
			`SELECT t.nombre AS talla, v.id, p.recargo_pedido_especial_centavos::int AS recargo FROM variantes v
			 JOIN tallas t ON t.id = v.talla_id JOIN productos p ON p.id = v.producto_id
			 WHERE p.nombre = 'Pants marino liso' AND t.nombre IN ('4', '18')`,
		);
		const de = (talla: string) => String(rows.find((fila) => fila.talla === talla)?.id);
		return { cuatro: de("4"), especial: de("18"), recargo: Number(rows[0]?.recargo) };
	}

	/** El ZPL de unas variantes, como lo pide Catálogo. */
	async function zplDe(ids: string[]): Promise<string> {
		const [primera] = ids;
		const respuesta = await servidor.app.inject({
			method: "GET",
			url: `/v1/etiquetas/prenda/${primera}?formato=zpl&ids=${ids.join(",")}`,
			headers: encabezadosDeLaWeb("catalogo"),
		});
		expect(respuesta.statusCode, respuesta.body).toBe(200);
		return respuesta.body;
	}

	it("ninguna etiqueta trae un costo, y el precio de mostrador solo con `catalogo.etiqueta_lleva_precio`, la pida quien la pida", async () => {
		const { cuatro, especial, recargo } = await delPants();
		// Sin el parámetro (así empieza), ningún peso.
		const sinPrecio = await zplDe([cuatro, especial]);
		expect(sinPrecio).not.toContain("$");
		expect(sinPrecio).toContain("Básico · Talla 4");
		expect(sinPrecio).toContain("Pedido especial");
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_booleano = true WHERE clave = 'catalogo.etiqueta_lleva_precio'",
		);
		try {
			// Con él, el de Mostrador; en la de pedido especial, con su recargo.
			const conPrecio = await zplDe([cuatro, especial]);
			expect(conPrecio).toContain("^FD$410^FS");
			expect(conPrecio).toContain(`^FD${enPesos(41_000 + recargo)} · Pedido especial^FS`);
			// Ningún costo: solo los dos precios de mostrador llevan un peso.
			expect(conPrecio.match(/\$/g)).toHaveLength(2);
		} finally {
			await servidor.base.dueno.query(
				"UPDATE parametros SET valor_booleano = false WHERE clave = 'catalogo.etiqueta_lleva_precio'",
			);
		}
	});

	it("solo Catálogo la pide; las demás la imprimen con su A- (Aduana) y no por su cuenta", async () => {
		const { cuatro } = await delPants();
		for (const quien of ["aduana", "ventas"]) {
			const respuesta = await servidor.app.inject({
				method: "GET",
				url: `/v1/etiquetas/prenda/${cuatro}?formato=pdf`,
				headers: encabezadosDeLaWeb(quien),
			});
			expect(respuesta.statusCode, quien).toBe(403);
		}
	});
});
