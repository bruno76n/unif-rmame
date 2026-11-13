/**
 * Prueba de la cuenta de la receta en el navegador: lo que la página dice que lleva el próximo corte mientras se escribe
 * sale de la cuenta de material del paquete compartido, se recalcula con cada cajita (y dice «—» mientras falta un
 * dato), y es lo mismo que da `patronaje.calcular_material` con la versión que guardó `patronaje.guardar_receta`.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Lo que la pantalla calcula mientras se escribe (la tela del
 * corte, la cuenta de la receta) sale del paquete compartido y da lo mismo que la acción al guardar») y
 * docs/interfaz/fabrica/patronaje.md («La página de la receta»)
 */

import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enPantalla } from "../../../../../pruebas/navegador/en-pantalla.ts";
import { crearBase } from "../../../../api/src/nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../../api/src/nucleo/pruebas/accion-de-prueba.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Lo que tarda cada caso, con el navegador. */
const tiempo = { timeout: 120_000 };

/**
 * Lo que la página dice que lleva el corte: por material, su número entero, o nada si dice «—».
 * @param pagina La página.
 */
async function loQueDiceLaPagina(pagina: Page): Promise<Record<string, number | null>> {
	const renglones = pagina.getByRole("region", { name: "Lo que lleva el corte" }).getByRole("listitem");
	const dice: Record<string, number | null> = {};
	for (const renglon of await renglones.all()) {
		// Cada material: arriba lo que lleva («214 m» o «—») y abajo su nombre.
		const cuanto = (await renglon.locator("b").textContent()) ?? "";
		const material = (await renglon.locator("span").textContent()) ?? "";
		dice[material.trim()] = cuanto.trim() === "—" ? null : Number(cuanto.replace(/[^\d]/g, ""));
	}
	return dice;
}

describe("La cuenta de la receta: lo que se ve mientras se escribe es lo que cuenta la API con lo guardado", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	it(
		"al cambiar la tela la cuenta se recalcula; guardada, `patronaje.calcular_material` da lo mismo",
		tiempo,
		async () => {
			const { rows: prenda } = await pantalla.servidor.base.dueno.query(
				"SELECT id FROM productos WHERE nombre = 'Pantalón gris oxford' LIMIT 1",
			);
			const productoId = String(prenda[0]?.id);
			const pagina = await pantalla.abrir(`/patronaje/recetas?cajon=receta&id=${productoId}`, { quien: "patronaje" });
			const titulo = pagina.getByText(/^Con esta receta, el corte L-\d{4}-\d+ de \d+ piezas lleva$/);
			await enPantalla(titulo).toBeVisible();
			const folio = /el corte (L-\d{4}-\d+) de/.exec((await titulo.textContent()) ?? "")?.[1] ?? "";
			const antes = await loQueDiceLaPagina(pagina);
			// Una talla de la tela vacía: esa tela dice «—» y los demás materiales siguen contando.
			const cajitas = pagina.getByLabel(/^Gabardina gris oxford en metros, talla /);
			await cajitas.nth(1).fill("");
			const sinTalla = await loQueDiceLaPagina(pagina);
			expect(sinTalla["Gabardina gris oxford"]).toBeNull();
			expect(Object.values(sinTalla).filter((cuanto) => cuanto !== null).length).toBe(Object.keys(antes).length - 1);
			// Más tela en todas las tallas: la cuenta sube mientras se escribe.
			const cuantas = await cajitas.count();
			for (let numero = 0; numero < cuantas; numero++) await cajitas.nth(numero).fill("1.37");
			await enPantalla
				.poll(async () => (await loQueDiceLaPagina(pagina))["Gabardina gris oxford"] ?? 0)
				.toBeGreaterThan(antes["Gabardina gris oxford"] ?? 0);
			const escrito = await loQueDiceLaPagina(pagina);
			await pagina.getByLabel("Motivo del cambio").fill("Más tela en todas las tallas");
			await pagina.getByRole("button", { name: "Guardar como versión 2" }).click();
			await enPantalla(pagina.locator('[role="status"][aria-live="polite"] > span:last-child')).toHaveText(
				"Versión 2 guardada. Los lotes ya cortados conservan la versión 1",
			);
			// Lo que cuenta la API con la versión guardada y las piezas del lote.
			const { rows: tallas } = await pantalla.servidor.base.dueno.query(
				`SELECT v.talla_id, t.piezas_planeadas AS piezas FROM lotes l JOIN lote_tallas t ON t.lote_id = l.id
				 JOIN variantes v ON v.id = t.variante_id WHERE l.folio = $1`,
				[folio],
			);
			const cuenta = (await enAccionDePrueba(
				crearBase(pantalla.servidor.base.app),
				pantalla.servidor.modulos,
				(contexto) =>
					contexto.lectura("patronaje.calcular_material", {
						producto_id: productoId,
						piezas_por_talla: tallas.map((talla) => ({
							talla_id: String(talla.talla_id),
							piezas: Number(talla.piezas),
						})),
					}),
			)) as { materiales: { material_id: string; cantidad: number | null }[] };
			const { rows: nombres } = await pantalla.servidor.base.dueno.query("SELECT id, nombre FROM materiales");
			const nombreDe = new Map(nombres.map((fila) => [String(fila.id), String(fila.nombre)]));
			expect(
				Object.fromEntries(
					cuenta.materiales.map((material) => [nombreDe.get(material.material_id), material.cantidad]),
				),
			).toEqual(escrito);
			await pagina.close();
		},
	);
});
