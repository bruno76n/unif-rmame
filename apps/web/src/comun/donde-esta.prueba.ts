/**
 * Prueba de «¿Dónde está?» en el navegador: con la tecla / se escribe el código de una variante de la muestra y salen
 * sus piezas en cada ubicación con el total, lo comprometido y lo libre; sin resultados, «No encontré «{texto}»»; sin
 * Aduana, Bodega ni Dirección, la búsqueda no sale.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «"¿Dónde está?" encuentra por código o por prenda y talla, con
 * las piezas de cada ubicación»)
 */

import { afterAll, beforeAll, describe, it } from "vitest";
import { enPantalla } from "../../../../pruebas/navegador/en-pantalla.ts";
import { levantarPantalla, type PantallaDePrueba } from "./pruebas/pantalla-de-prueba.ts";

describe("«¿Dónde está?» encuentra por código o por prenda y talla, con las piezas de cada ubicación", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	it("por código y por prenda y talla, con sus piezas; sin resultados lo dice", { timeout: 90_000 }, async () => {
		const { rows } = await pantalla.servidor.base.dueno.query(
			`SELECT v.codigo, p.nombre AS prenda, t.nombre AS talla, e.piezas FROM existencias e
			 JOIN ubicaciones u ON u.id = e.ubicacion_id AND u.codigo = 'BOD' JOIN variantes v ON v.id = e.variante_id
			 JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
			 WHERE e.piezas > 0 AND v.codigo IS NOT NULL ORDER BY e.piezas DESC LIMIT 1`,
		);
		const [{ codigo, prenda, talla, piezas }] = rows as [
			{ codigo: string; prenda: string; talla: string; piezas: number },
		];
		const pagina = await pantalla.abrir("/aduana", { quien: "aduana" });
		await enPantalla(pagina.locator("h1")).toHaveText("Aduana");
		await pagina.keyboard.press("/");
		await pagina.keyboard.type(codigo);
		const resultados = pagina.getByRole("region", { name: "Resultados de ¿Dónde está?" });
		await enPantalla(resultados).toContainText(`${prenda}, talla ${talla}`);
		await enPantalla(resultados.locator("article").first()).toContainText("Bodega");
		await enPantalla(resultados.locator("article").first()).toContainText(String(piezas));
		await enPantalla(resultados.locator("article").first()).toContainText("Libres");
		await pantalla.capturar(pagina, "comun/donde-esta");
		// Por prenda y talla.
		await pagina.getByPlaceholder("¿Dónde está? Prenda y talla, o código").fill(`${prenda.split(" ")[0]} ${talla}`);
		await enPantalla(resultados).toContainText(`talla ${talla}`);
		// Sin resultados.
		await pagina.getByPlaceholder("¿Dónde está? Prenda y talla, o código").fill("zzzz inexistente");
		await enPantalla(resultados).toContainText("No encontré «zzzz inexistente»");
		await pagina.close();
	});

	it("quien no tiene Aduana, Bodega ni Dirección no ve la búsqueda", { timeout: 90_000 }, async () => {
		const pagina = await pantalla.abrir("/ventas", { quien: "ventas" });
		await enPantalla(pagina.locator("h1")).toHaveText("Ventas a externos");
		await enPantalla(pagina.getByPlaceholder("¿Dónde está? Prenda y talla, o código")).toHaveCount(0);
		await pagina.close();
	});
});
