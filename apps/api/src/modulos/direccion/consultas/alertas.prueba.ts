/**
 * Prueba de `direccion.alertas` con la muestra: las mismas alertas que calcula el trabajo, cada una con el detalle de
 * su tarjeta y los nombres de los departamentos que cruza; «Ver» solo si la cuenta tiene ese departamento; y solo la
 * ve Dirección.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una alerta como la regresa la consulta. */
interface Alerta {
	clave: string;
	regla: string;
	titulo: string;
	detalle: string;
	cruza: string[];
	color: string;
	ver: string | null;
}

describe("Las alertas cruzadas: con su detalle, su «Ver» según la cuenta, y solo para Dirección", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Pide las alertas como una cuenta. */
	async function leer(quien = "direccion"): Promise<Alerta[]> {
		const respuesta = await pedirConsulta(servidor, "direccion.alertas", {}, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return (respuesta.cuerpo.resultado as { alertas: Alerta[] }).alertas;
	}

	it("solo Dirección las ve: otra cuenta recibe 403", async () => {
		for (const quien of ["bodega", "produccion", "contaduria"]) {
			expect((await pedirConsulta(servidor, "direccion.alertas", {}, quien)).estado).toBe(403);
		}
	});

	it("las alertas de la muestra llevan su detalle y los nombres de los departamentos que cruzan", async () => {
		const alertas = await leer("duena");
		for (const alerta of alertas) {
			expect(alerta.detalle.length, alerta.clave).toBeGreaterThan(0);
			expect(alerta.cruza.length).toBeGreaterThan(0);
			expect(alerta.cruza.every((nombre) => /^[A-ZÁÉÍÓÚ]/.test(nombre))).toBe(true);
			expect(alerta.ver).not.toBeNull();
		}
	});

	it("un cuadre con residuo dice sus diferencias, sus excepciones y la hora en que terminó; «Ver» lleva a Bodega", async () => {
		await consultar(
			`INSERT INTO cuadres (id, fecha, iniciado_en, terminado_en, estado, diferencias_creadas, excepciones_creadas)
			 VALUES ($1, '2099-12-31', '2099-12-31T08:00:00Z', '2099-12-31T08:15:00Z', 'con_residuo', 2, 1)`,
			[uuidv7()],
		);
		const deLaDuena = (await leer("duena")).find((alerta) => alerta.regla === "cuadre_residuo");
		expect(deLaDuena).toMatchObject({
			titulo: "El cuadre del 31 de diciembre dejó 3 cosas por revisar",
			detalle: "2 diferencias y 1 excepción en Bodega. Terminó a las 02:15.",
			cruza: ["Bodega"],
			color: "rojo",
			ver: "bodega/diferencias",
		});
		// Quien solo tiene Dirección no ve «Ver»: no tiene Bodega.
		expect((await leer("direccion")).find((alerta) => alerta.regla === "cuadre_residuo")?.ver).toBeNull();
	});

	it("un descontinuado con piezas dice cuántas hay en bodega; una tablet sin sincronizar, lo que no se recibe", async () => {
		const [producto] = await consultar(
			`SELECT p.id, sum(e.piezas) FILTER (WHERE u.tipo = 'bodega')::int AS en_bodega FROM productos p
			 JOIN variantes v ON v.producto_id = p.id JOIN existencias e ON e.variante_id = v.id
			 JOIN ubicaciones u ON u.id = e.ubicacion_id
			 WHERE p.baja_en IS NULL GROUP BY p.id HAVING sum(e.piezas) > 0 ORDER BY p.id LIMIT 1`,
		);
		await consultar("UPDATE productos SET baja_en = now() WHERE id = $1", [producto?.id]);
		const tablet = quienesDePrueba.tablet;
		if (tablet?.tipo !== "aparato") throw new Error("no hay tablet de prueba");
		await consultar(
			"UPDATE dispositivos_sync SET ultima_sincronizacion_en = now() - interval '5 hours' WHERE dispositivo_id = $1",
			[tablet.dispositivoId],
		);
		const alertas = await leer("duena");
		expect(alertas.find((alerta) => alerta.clave === `descontinuado:${producto?.id}`)).toMatchObject({
			detalle: `${new Intl.NumberFormat("es-MX").format(Number(producto?.en_bodega ?? 0))} en bodega y el resto en tiendas.`,
			cruza: ["Catálogo", "Bodega"],
			color: "ambar",
			ver: "bodega/existencias",
		});
		expect(alertas.find((alerta) => alerta.clave === `sin_sincronizar:${tablet.dispositivoId}`)).toMatchObject({
			detalle: "Ventas y corte sin recibir; su existencia no se ofrece en línea.",
			cruza: ["Administración del sistema"],
			ver: "admin/dispositivos",
		});
	});

	it("salen en el orden de su tabla, igual que las memoriza el trabajo", async () => {
		const reglas = [
			"lote_detenido",
			"consumo_tela",
			"concentracion",
			"descontinuado",
			"sin_reposicion",
			"sin_sincronizar",
			"cuadre_residuo",
		];
		const orden = (await leer()).map((alerta) => reglas.indexOf(alerta.regla));
		expect(orden).toEqual([...orden].sort((una, otra) => una - otra));
	});
});
