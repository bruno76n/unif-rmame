/**
 * Prueba de marcar enviada una orden: congela cantidades y precios, copia la condición, guarda el PDF antes de
 * confirmar (si falla, la orden sigue en borrador) y deja a un proveedor nuevo entre los que surten el material; el
 * historial de precios trae su anterior y su cambio.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 4)
 */

import { crearSimuladorDeR2 } from "@uniformame/pruebas/simuladores/r2";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearAlmacen, direccionDeR2 } from "../../../nucleo/almacen.ts";
import {
	altaDeMaterial,
	altaDeProveedor,
	cajonDeLaOrden,
	enviarDePrueba,
	levantarDePrueba,
	versionDe,
} from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { leerPdf } from "../../../nucleo/pruebas/leer-impresos.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

const cuenta = "cuentaprueba";
const simulador = crearSimuladorDeR2(cuenta);
const red = setupServer(...simulador.manejadores);
const almacen = crearAlmacen({
	direccion: direccionDeR2(cuenta),
	cubo: "uniformame-archivos",
	llaveId: "llave-de-prueba",
	secreto: "secreto-de-prueba",
});

describe("Enviar congela cantidades y precios, copia la condición, guarda el PDF antes de confirmar (si falla, la orden sigue en borrador) y deja a un proveedor nuevo entre los que surten el material", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba({ almacen });
	});
	afterAll(async () => {
		red.close();
		await servidor.cerrar();
	});

	it("enviada: congelada, con la condición del proveedor, su PDF, el precio nuevo en el historial y el proveedor entre los que surten", async () => {
		const aurora = await altaDeProveedor(servidor, { nombre: "Textiles Alborada", dias_credito: 30 });
		const otro = await altaDeProveedor(servidor, { nombre: "Telas del Bajío", dias_credito: 15 });
		const gabardina = await altaDeMaterial(servidor, aurora, {
			nombre: "Gabardina azul noche",
			tipo: "tela",
			unidad: "m",
			multiplo_compra: 50,
			costo_centavos: 7_800,
		});
		// Se le compra a uno que nunca la ha surtido.
		const orden = await levantarDePrueba(servidor, [
			{ material_id: gabardina, proveedor_id: otro, cantidad: 100, precio_centavos: 8_400 },
		]);
		const hoy = (await servidor.base.dueno.query("SELECT (now() AT TIME ZONE 'America/Mexico_City')::date + 10 AS dia"))
			.rows[0]?.dia;
		const fecha = new Date(hoy).toISOString().slice(0, 10);
		const versionDelMaterial = await versionDe(servidor, "materiales", gabardina);
		const enviada = await enviarDePrueba(servidor, orden.id, { fecha_prometida: fecha });
		expect(enviada.estado).toBe(200);
		expect(enviada.cuerpo.resultado).toMatchObject({
			precios_nuevos: [{ material: "Gabardina azul noche", precio_centavos: 8_400 }],
			pdf_url: expect.any(String),
			mensaje: expect.stringMatching(
				new RegExp(
					`^${orden.folio} enviada a Telas del Bajío\\. Promete llegar el \\d+ de \\w+\\. Precio nuevo: Gabardina azul noche a \\$84$`,
				),
			),
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, dias_credito, fecha_prometida::text AS fecha, pdf_archivo_id IS NOT NULL AS con_pdf, enviada_por IS NOT NULL AS con_quien FROM ordenes_compra WHERE id = $1",
			[orden.id],
		);
		expect(rows).toEqual([{ estado: "enviada", dias_credito: 15, fecha, con_pdf: true, con_quien: true }]);
		// El PDF quedó en el almacén, ligado a la orden.
		const { rows: pdf } = await servidor.base.dueno.query(
			"SELECT a.almacen_clave, a.proposito, a.entidad_id FROM archivos a JOIN ordenes_compra o ON o.pdf_archivo_id = a.id WHERE o.id = $1",
			[orden.id],
		);
		expect(pdf).toMatchObject([{ proposito: "pdf_documento", entidad_id: orden.id }]);
		expect(simulador.objetos.has(`uniformame-archivos/${pdf[0]?.almacen_clave}`)).toBe(true);
		const { rows: par } = await servidor.base.dueno.query(
			"SELECT ultimo_precio_centavos::int AS precio, baja_en FROM material_proveedores WHERE material_id = $1 AND proveedor_id = $2",
			[gabardina, otro],
		);
		expect(par).toEqual([{ precio: 8_400, baja_en: null }]);
		// Sus proveedores son parte del material: quien lo tenía abierto ve que cambió.
		expect(await versionDe(servidor, "materiales", gabardina)).toBeGreaterThan(versionDelMaterial);
		const { rows: historial } = await servidor.base.dueno.query(
			"SELECT origen, orden_compra_id, precio_anterior_centavos AS anterior FROM precios_compra WHERE material_id = $1 AND proveedor_id = $2",
			[gabardina, otro],
		);
		expect(historial).toEqual([{ origen: "orden", orden_compra_id: orden.id, anterior: null }]);
		// Ya enviada no cambia.
		expect((await enviarDePrueba(servidor, orden.id)).cuerpo).toMatchObject({
			codigo: "orden_no_es_borrador",
			mensaje: `${orden.folio} ya se envió: después de enviada no cambia.`,
		});
	});

	it("un precio igual al último no entra al historial; uno distinto, con su anterior y su cambio, y su renglón de bitácora", async () => {
		const proveedor = await altaDeProveedor(servidor, { nombre: "Botones Reyes" });
		const boton = await altaDeMaterial(servidor, proveedor, { nombre: "Botón blanco", costo_centavos: 38 });
		const cierre = await altaDeMaterial(servidor, proveedor, { nombre: "Cierre 14 cm", costo_centavos: 600 });
		const orden = await levantarDePrueba(servidor, [
			{ material_id: boton, proveedor_id: proveedor, cantidad: 500, precio_centavos: 38 },
			{ material_id: cierre, proveedor_id: proveedor, cantidad: 200, precio_centavos: 690 },
		]);
		expect((await enviarDePrueba(servidor, orden.id)).cuerpo.resultado).toMatchObject({
			precios_nuevos: [{ material: "Cierre 14 cm", precio_centavos: 690 }],
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT origen, precio_anterior_centavos::int AS anterior, cambio_porcentaje FROM precios_compra WHERE material_id = $1 ORDER BY creado_en",
			[cierre],
		);
		expect(rows).toEqual([
			{ origen: "alta", anterior: null, cambio_porcentaje: null },
			{ origen: "orden", anterior: 600, cambio_porcentaje: "15.000" },
		]);
		const { rows: bitacora } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE entidad_id = $1",
			[orden.id],
		);
		expect(bitacora.map((renglon) => renglon.descripcion)).toContain(
			`Precio de Cierre 14 cm con Botones Reyes: $6 → $6.90 (${orden.folio})`,
		);
	});

	it("si el PDF no se guarda, la orden sigue en borrador y nada del historial cambia", async () => {
		const proveedor = await altaDeProveedor(servidor);
		const material = await altaDeMaterial(servidor, proveedor);
		const orden = await levantarDePrueba(servidor, [
			{ material_id: material, proveedor_id: proveedor, cantidad: 10, precio_centavos: 99 },
		]);
		// El almacén no responde: el PDF de la hoja no se puede guardar.
		simulador.ponerAFallar("error_del_servidor");
		try {
			expect((await enviarDePrueba(servidor, orden.id)).estado).toBeGreaterThanOrEqual(500);
		} finally {
			simulador.ponerAFallar("ninguna");
		}
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, pdf_archivo_id FROM ordenes_compra WHERE id = $1",
			[orden.id],
		);
		expect(rows).toEqual([{ estado: "borrador", pdf_archivo_id: null }]);
		const { rows: historial } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM precios_compra WHERE material_id = $1 AND origen = 'orden'",
			[material],
		);
		expect(historial[0]?.n).toBe(0);
	});

	it("el PDF de la orden de compra se guarda al enviarla y no cambia después, aunque cambien el proveedor o el precio de la nota", async () => {
		const proveedor = await altaDeProveedor(servidor, { nombre: "Hilos de Peñuelas", dias_credito: 30 });
		const material = await altaDeMaterial(servidor, proveedor, { nombre: "Hilo poliéster negro" });
		const orden = await levantarDePrueba(servidor, [
			{ material_id: material, proveedor_id: proveedor, cantidad: 12, precio_centavos: 4_550 },
		]);
		expect((await enviarDePrueba(servidor, orden.id)).estado).toBe(200);
		const guardado = async () => {
			const { rows } = await servidor.base.dueno.query(
				"SELECT a.almacen_clave FROM archivos a JOIN ordenes_compra o ON o.pdf_archivo_id = a.id WHERE o.id = $1",
				[orden.id],
			);
			const objeto = simulador.objetos.get(`uniformame-archivos/${rows[0]?.almacen_clave}`);
			if (objeto === undefined) throw new Error("no se guardó el PDF");
			return objeto.contenido;
		};
		const antes = await guardado();
		const [pagina] = leerPdf(antes);
		const texto = (pagina?.textos ?? []).join(" ");
		for (const dice of [
			orden.folio,
			"Hilos de Peñuelas",
			"Hilo poliéster negro",
			"$45.50",
			"Precios sin IVA",
			"Crédito 30 días",
		]) {
			expect(texto).toContain(dice);
		}
		// Cambian el proveedor y el precio de la nota: el PDF guardado es el mismo.
		await servidor.base.dueno.query(
			"UPDATE terceros SET nombre = 'Hilos de Peñuelas SA' WHERE id = (SELECT tercero_id FROM proveedores WHERE id = $1)",
			[proveedor],
		);
		await servidor.base.dueno.query(
			`UPDATE orden_compra_lineas SET precio_nota_centavos = 5000, precio_nota_en = now(),
				precio_nota_por = (SELECT creado_por FROM ordenes_compra WHERE id = $1) WHERE orden_compra_id = $1`,
			[orden.id],
		);
		expect(Buffer.from(await guardado()).equals(Buffer.from(antes))).toBe(true);
	});

	it("guardar el borrador: la fecha entre hoy y el máximo, la versión vieja da 409, y no deja bitácora", async () => {
		const proveedor = await altaDeProveedor(servidor);
		const material = await altaDeMaterial(servidor, proveedor);
		const orden = await levantarDePrueba(servidor, [
			{ material_id: material, proveedor_id: proveedor, cantidad: 10, precio_centavos: 38 },
		]);
		const cajon = await cajonDeLaOrden(servidor, orden.id);
		const guardar = (cambios: Record<string, unknown>, version = cajon.version) =>
			mandarAccion(
				servidor,
				"compras.guardar_borrador_orden",
				{ datos: { ...cajon.datos, ...cambios }, version },
				"compras",
			);
		expect((await guardar({ fecha_prometida: "2020-01-01" })).cuerpo).toMatchObject({
			campos: { fecha_prometida: "La fecha no puede ser anterior a hoy" },
		});
		expect((await guardar({ fecha_prometida: "2099-01-01" })).cuerpo).toMatchObject({
			campos: { fecha_prometida: "Es muy lejana: máximo 120 días" },
		});
		const [linea] = cajon.datos.renglones as { orden_compra_linea_id: string }[];
		const guardado = await guardar({ renglones: [{ ...linea, cantidad: 20, precio_centavos: 40 }] });
		expect(guardado.cuerpo.resultado).toMatchObject({ mensaje: `Borrador ${orden.folio} guardado` });
		expect((await guardar({})).estado).toBe(409);
		const { rows } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE entidad_id = $1", [
			orden.id,
		]);
		// Solo el renglón de cuando se levantó.
		expect(rows[0]?.n).toBe(1);
	});
});
