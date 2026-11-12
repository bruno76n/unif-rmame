/**
 * Prueba de `ventas.crear_cliente`: el cliente nace con su tercero (o ligado al que ya había), su crédito sin límite,
 * su lista vacía y, si es escuela, su escuela; uno repetido se rechaza.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { llamarInterna } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { darDeAltaClienteDePrueba, nombreDeClienteNuevo } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Un cliente nace con su tercero, su crédito sin límite, su lista vacía y, si es escuela, su escuela", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Ventas da de alta un cliente con la ficha de ejemplo y lo que cambie. */
	function crear(datos: Record<string, unknown>, quien = "ventas") {
		return mandarAccion(
			servidor,
			"ventas.crear_cliente",
			{
				datos: {
					tipo: "mayorista",
					municipio: "León",
					direccion_entrega: "Blvd. López Mateos 1200, León",
					telefono: "477 123 4567",
					...datos,
				},
			},
			quien,
		);
	}

	/** Lo que nació con el cliente: su tercero, su crédito y su lista. */
	async function loQueNacio(clienteId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT c.tipo, c.telefono, t.nombre, t.es_cliente, cr.limite_centavos::int AS limite, cr.dias_credito,
				l.nombre AS lista, (SELECT count(*)::int FROM precios p WHERE p.lista_id = l.id) AS precios
			 FROM clientes c JOIN terceros t ON t.id = c.tercero_id JOIN credito_clientes cr ON cr.cliente_id = c.id
			 JOIN listas_precios l ON l.cliente_id = c.id WHERE c.id = $1`,
			[clienteId],
		);
		return rows[0];
	}

	it("Zamora, mayorista de León: su tercero, «Sin crédito» con 15 días, su lista vacía y su bitácora", async () => {
		const nombre = nombreDeClienteNuevo("Distribuidora Escolar Zamora");
		const respuesta = await crear({ nombre, rfc: "DEZ010101AB1" });
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: `${nombre} dado de alta. Compra con precios de mayoreo hasta que Catálogo le ponga su lista`,
			escuela_id: null,
		});
		const { cliente_id: id } = z.object({ cliente_id: z.uuid() }).parse(respuesta.cuerpo.resultado);
		expect(await loQueNacio(id)).toEqual({
			tipo: "mayorista",
			telefono: "4771234567",
			nombre,
			es_cliente: true,
			limite: 0,
			dias_credito: 15,
			lista: nombre,
			precios: 0,
		});
		const { rows } = await servidor.base.dueno.query("SELECT descripcion FROM bitacora WHERE entidad_id = $1", [id]);
		expect(rows).toEqual([{ descripcion: `Cliente nuevo: ${nombre}, mayorista en León; sin crédito, 15 días` }]);
	});

	it("una escuela nace con su escuela; otra con una escuela que ya existe la liga; una escuela es cliente una sola vez", async () => {
		const nombre = nombreDeClienteNuevo("Colegio");
		const escuela = await crear({ nombre, tipo: "escuela" });
		const { escuela_id: escuelaId } = z.object({ escuela_id: z.uuid() }).parse(escuela.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query("SELECT nombre, municipio FROM escuelas WHERE id = $1", [
			escuelaId,
		]);
		expect(rows).toEqual([{ nombre, municipio: "León" }]);
		const { escuela_id: otraEscuela } = z.object({ escuela_id: z.uuid() }).parse(
			await llamarInterna(servidor, "catalogo.crear_escuela_para_cliente", {
				nombre: nombreDeClienteNuevo("Instituto"),
				municipio: "Silao",
			}),
		);
		const ligada = await crear({
			nombre: nombreDeClienteNuevo("Instituto ligado"),
			tipo: "escuela",
			escuela_id: otraEscuela,
		});
		expect(ligada.cuerpo.resultado).toMatchObject({ escuela_id: otraEscuela });
		expect(
			(await crear({ nombre: nombreDeClienteNuevo(), tipo: "escuela", escuela_id: escuelaId })).cuerpo,
		).toMatchObject({
			codigo: "escuela_ya_es_cliente",
			mensaje: `${nombre} ya es cliente: ${nombre}.`,
		});
		expect((await crear({ nombre: nombreDeClienteNuevo(), escuela_id: escuelaId })).cuerpo).toMatchObject({
			campos: { escuela_id: "Solo un cliente escuela lleva escuela." },
		});
	});

	it("un nombre que ya es proveedor se liga y avisa; uno que ya es cliente es repetido, sin importar acentos", async () => {
		const nombre = nombreDeClienteNuevo("Textiles Alborada");
		await llamarInterna(servidor, "contaduria.crear_tercero", { nombre, rol: "proveedor" });
		const ligado = await crear({ nombre });
		expect(ligado.cuerpo.avisos).toEqual([`Se ligó a la ficha de ${nombre} que ya existía en Contaduría.`]);
		expect((await crear({ nombre: `  ${nombre.toUpperCase()} ` })).cuerpo).toMatchObject({
			codigo: "cliente_repetido",
			mensaje: "Ya hay un cliente con ese nombre.",
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM clientes c JOIN terceros t ON t.id = c.tercero_id WHERE t.nombre = $1",
			[nombre],
		);
		expect(rows).toEqual([{ n: 1 }]);
	});

	it("los 400 de la ficha; desde un pedido, su mensaje; Contaduría no da de alta clientes", async () => {
		expect((await crear({ nombre: "Zo" })).cuerpo).toMatchObject({
			campos: { nombre: "Escribe el nombre del cliente." },
		});
		expect((await crear({ nombre: nombreDeClienteNuevo(), telefono: "477 12" })).cuerpo).toMatchObject({
			campos: { telefono: "Teléfono a 10 dígitos." },
		});
		expect((await crear({ nombre: nombreDeClienteNuevo(), correo: "no es correo" })).cuerpo).toMatchObject({
			campos: { correo: "Revisa el correo." },
		});
		expect((await crear({ nombre: nombreDeClienteNuevo(), direccion_entrega: "Centro" })).cuerpo).toMatchObject({
			campos: { direccion_entrega: "Escribe la dirección de entrega: Aduana la necesita para despachar." },
		});
		const nombre = nombreDeClienteNuevo();
		expect((await crear({ nombre, desde_pedido: true })).cuerpo.resultado).toMatchObject({
			mensaje: `${nombre} dado de alta y escogido para el pedido`,
		});
		expect((await crear({ nombre: nombreDeClienteNuevo() }, "contaduria")).estado).toBe(403);
		const alta = await darDeAltaClienteDePrueba(servidor, { tipo: "empresa_otro" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT dias_credito FROM credito_clientes WHERE cliente_id = $1",
			[alta.cliente_id],
		);
		expect(rows).toEqual([{ dias_credito: 30 }]);
	});
});
