/**
 * Prueba del trabajo «Alertas de Dirección» con la base de la muestra: dos corridas seguidas, y solo la primera avisa;
 * una alerta que deja de cumplirse desaparece de la memoria sin avisar, y si reaparece avisa otra vez.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «El trabajo avisa una sola vez cada alerta
 * nueva, y otra vez si reaparece»)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo, type DependenciasDelTrabajador } from "../../../nucleo/trabajos/trabajador.ts";
import { alertasDireccion } from "./alertas-direccion.ts";

describe("El trabajo avisa una sola vez cada alerta nueva, y otra vez si reaparece", () => {
	let servidor: ServidorDePrueba;
	let dependencias: DependenciasDelTrabajador;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		dependencias = {
			base: crearBase(servidor.base.app),
			registro: servidor.modulos,
			servicios: { escribirBitacora: escribirBitacoraConAdmin, guardarEventos: guardarEventosConAdmin },
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => Temporal.Now.instant(),
		};
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Corre el trabajo, como una vuelta suelta. */
	async function correr(): Promise<void> {
		await correrTrabajo(dependencias, alertasDireccion, {});
	}

	/** Cuántos avisos de alerta de Dirección hay, por texto. */
	async function avisosPorTexto(): Promise<Record<string, number>> {
		const filas = await consultar(
			"SELECT texto, count(*)::int AS n FROM avisos WHERE tipo = 'alerta_direccion' GROUP BY texto",
		);
		return Object.fromEntries(filas.map((fila) => [String(fila.texto), Number(fila.n)]));
	}

	/** Cuántos eventos «hay cambios» de las alertas hay. */
	async function cambios(): Promise<number> {
		const [fila] = await consultar("SELECT count(*)::int AS n FROM eventos WHERE tipo = 'alertas_direccion.cambiaron'");
		return Number(fila?.n);
	}

	/** Las vueltas de la clave del cuadre en la memoria, en orden. */
	async function memoriaDelCuadre() {
		return consultar(
			`SELECT avisada_en IS NOT NULL AS avisada, desaparecio_en IS NOT NULL AS desaparecio FROM alertas_direccion_vistas
			 WHERE clave = 'cuadre_residuo:2099-12-31' ORDER BY primera_vez_en, id`,
		);
	}

	const titulo = "El cuadre del 31 de diciembre dejó 3 cosas por revisar";
	const cuadre = uuidv7();

	it("dos corridas seguidas: la primera avisa las alertas de la muestra, la segunda no avisa ni cambia nada", async () => {
		await correr();
		const primera = await avisosPorTexto();
		const memoria = await consultar("SELECT count(*)::int AS n FROM alertas_direccion_vistas");
		expect(Number(memoria[0]?.n)).toBeGreaterThan(0);
		// Cada alerta de la memoria se avisó a las cuentas con Dirección.
		const sinAviso = await consultar("SELECT clave FROM alertas_direccion_vistas WHERE avisada_en IS NULL");
		expect(sinAviso).toEqual([]);
		expect(Object.keys(primera).length).toBe(Number(memoria[0]?.n));
		const eventos = await cambios();
		expect(eventos).toBe(1);
		await correr();
		expect(await avisosPorTexto()).toEqual(primera);
		expect(await cambios()).toBe(eventos);
	});

	it("una alerta nueva avisa una vez; al dejar de cumplirse desaparece sin avisar; si reaparece avisa otra vez", async () => {
		// El último cuadre queda con residuo: nace la alerta.
		await consultar(
			`INSERT INTO cuadres (id, fecha, iniciado_en, terminado_en, estado, diferencias_creadas, excepciones_creadas)
			 VALUES ($1, '2099-12-31', now(), now(), 'con_residuo', 2, 1)`,
			[cuadre],
		);
		const antes = await cambios();
		await correr();
		await correr();
		expect((await avisosPorTexto())[titulo]).toBeGreaterThan(0);
		const unaVez = (await avisosPorTexto())[titulo];
		expect(await memoriaDelCuadre()).toEqual([{ avisada: true, desaparecio: false }]);
		expect(await cambios()).toBe(antes + 1);
		// Se revisa lo que dejó: la alerta desaparece de la memoria y no avisa nada.
		await consultar("UPDATE cuadres SET estado = 'cuadro' WHERE id = $1", [cuadre]);
		await correr();
		expect(await memoriaDelCuadre()).toEqual([{ avisada: true, desaparecio: true }]);
		expect((await avisosPorTexto())[titulo]).toBe(unaVez);
		expect(await cambios()).toBe(antes + 2);
		// Dirección ya leyó el aviso (uno sin leer del mismo documento no se repite: ver avisos). Vuelve a quedar con
		// residuo: es nueva y avisa otra vez.
		await consultar("UPDATE avisos SET leido_en = now() WHERE tipo = 'alerta_direccion' AND texto = $1", [titulo]);
		await consultar("UPDATE cuadres SET estado = 'con_residuo' WHERE id = $1", [cuadre]);
		await correr();
		await correr();
		expect(await memoriaDelCuadre()).toEqual([
			{ avisada: true, desaparecio: true },
			{ avisada: true, desaparecio: false },
		]);
		expect((await avisosPorTexto())[titulo]).toBe(2 * Number(unaVez));
	});

	it("cada regla lee a su dueño: un descontinuado con piezas y una tablet sin sincronizar salen con su título", async () => {
		const [producto] = await consultar(
			`SELECT p.id, p.nombre, sum(e.piezas)::int AS piezas FROM productos p
			 JOIN variantes v ON v.producto_id = p.id JOIN existencias e ON e.variante_id = v.id
			 WHERE p.baja_en IS NULL GROUP BY p.id, p.nombre HAVING sum(e.piezas) > 0 ORDER BY p.id LIMIT 1`,
		);
		await consultar("UPDATE productos SET baja_en = now() WHERE id = $1", [producto?.id]);
		const tablet = quienesDePrueba.tablet;
		if (tablet?.tipo !== "aparato") throw new Error("no hay tablet de prueba");
		await consultar(
			"UPDATE dispositivos_sync SET ultima_sincronizacion_en = now() - interval '5 hours 10 minutes' WHERE dispositivo_id = $1",
			[tablet.dispositivoId],
		);
		const [aparato] = await consultar(
			"SELECT d.nombre, u.nombre AS ubicacion FROM dispositivos d LEFT JOIN ubicaciones u ON u.id = d.ubicacion_id WHERE d.id = $1",
			[tablet.dispositivoId],
		);
		await correr();
		const vistas = await consultar(
			"SELECT clave, titulo FROM alertas_direccion_vistas WHERE desaparecio_en IS NULL AND clave = ANY($1) ORDER BY clave",
			[[`descontinuado:${producto?.id}`, `sin_sincronizar:${tablet.dispositivoId}`]],
		);
		expect(vistas).toEqual([
			{
				clave: `descontinuado:${producto?.id}`,
				titulo: `${producto?.nombre} descontinuado con ${producto?.piezas} piezas en existencia`,
			},
			{
				clave: `sin_sincronizar:${tablet.dispositivoId}`,
				titulo: `${aparato?.nombre} de ${aparato?.ubicacion} sin sincronizar desde hace 5 horas`,
			},
		]);
	});
});
