/**
 * Prueba de la captura del corte en el navegador: lo que la pantalla calcula mientras se escribe (lo que pide la
 * receta, los rollos automáticos, lo que se usa de cada rollo y lo que queda según la receta) sale del paquete
 * compartido y es lo mismo que `produccion.cerrar_corte` guarda al cerrar; y lo que quedó, escrito a mano, llega tal
 * cual con su destino.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Lo que la pantalla calcula mientras se escribe (la tela del
 * corte…) sale del paquete compartido y da lo mismo que la acción al guardar») y docs/interfaz/fabrica/produccion.md
 * («Corte»)
 */

import type { Page } from "@playwright/test";
import { aMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enPantalla } from "../../../../../pruebas/navegador/en-pantalla.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Lo que tarda cada caso, con el navegador. */
const tiempo = { timeout: 120_000 };

/**
 * El texto del aviso de abajo.
 * @param pagina La página.
 */
function avisoDeAbajo(pagina: Page) {
	return pagina.locator('[role="status"][aria-live="polite"] > span:last-child');
}

/**
 * Los metros exactos que la pantalla calculó, de un atributo («213.484»), en milésimos: el texto los dice redondeados.
 * @param valor El valor del atributo.
 */
function metrosDe(valor: string | null): bigint {
	if (valor === null) throw new Error("no encontré los metros exactos");
	return aMilesimos(valor);
}

/**
 * Los metros de un texto como se leen: un decimal a lo más («213.5 m»).
 * @param milesimos Los milésimos.
 */
function metrosComoSeLeen(milesimos: bigint): string {
	return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(Number(milesimos) / 1000)} m`;
}

describe("La captura del corte: lo que se calcula al escribir es lo que se guarda al cerrar", () => {
	let pantalla: PantallaDePrueba;
	/** Los ids de los lotes de la muestra, por folio. */
	const lotes: Record<string, string> = {};
	beforeAll(async () => {
		pantalla = await levantarPantalla();
		const { rows } = await pantalla.servidor.base.dueno.query("SELECT id, folio FROM lotes");
		for (const fila of rows) lotes[String(fila.folio)] = String(fila.id);
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/**
	 * Lo que guardó el corte de un lote: cada tela con lo que pide la receta, lo que quedó, si se cambió y su destino, y
	 * sus rollos con lo que se usó.
	 * @param loteId El lote.
	 */
	async function corteGuardado(loteId: string) {
		const { rows } = await pantalla.servidor.base.dueno.query(
			`SELECT ct.metros_receta::text AS receta, ct.metros_quedaron::text AS quedaron, ct.quedaron_cambiado,
				ct.destino_sobrante, array_agg(cr.metros_usados::text ORDER BY cr.orden) AS usados
			 FROM cortes c JOIN corte_telas ct ON ct.corte_id = c.id JOIN corte_rollos cr ON cr.corte_tela_id = ct.id
			 WHERE c.lote_id = $1 GROUP BY ct.id`,
			[loteId],
		);
		return rows as {
			receta: string;
			quedaron: string;
			quedaron_cambiado: boolean;
			destino_sobrante: string;
			usados: string[];
		}[];
	}

	it(
		"con menos piezas, la tela según la receta, cada rollo y lo que queda se guardan como los mostró la pantalla",
		tiempo,
		async () => {
			const loteId = lotes["L-2026-019"] ?? "";
			const pagina = await pantalla.abrir(`/produccion/corte?cortar=${loteId}`, { quien: "produccion" });
			await enPantalla(pagina.getByRole("heading", { name: "Pantalón azul marino" })).toBeVisible();
			// Se cortaron 3 piezas menos de la primera talla: la cuenta corre al escribir.
			const primera = pagina.getByLabel(/^Talla /).first();
			const planeadas = Number(await primera.inputValue());
			await primera.fill(String(planeadas - 3));
			// Los metros se leen con un decimal a lo más: «213.5 m», nunca «213.484 m».
			const linea = pagina.getByText(/^La tela alcanza · 187 piezas llevan [\d,]+(\.\d)? m según la receta/);
			await enPantalla(linea).toBeVisible();
			const pide = metrosDe(await pagina.locator("[data-metros-pide]").first().getAttribute("data-metros-pide"));
			await enPantalla(linea).toContainText(`llevan ${metrosComoSeLeen(pide)} según la receta`);
			// Lo que se usa de cada rollo y lo que queda del último, como lo calculó la pantalla.
			const rollos = pagina.locator("[data-metros-usados]");
			const usadosEnPantalla = await Promise.all(
				(await rollos.all()).map(async (rollo) => metrosDe(await rollo.getAttribute("data-metros-usados"))),
			);
			const ultimo = rollos.last();
			const quedan = metrosDe(await ultimo.getAttribute("data-metros-quedan"));
			await enPantalla(ultimo).toHaveText(
				`Se usan ${metrosComoSeLeen(usadosEnPantalla.at(-1) ?? 0n)} · quedan ${metrosComoSeLeen(quedan)} según la receta`,
			);
			// «Quedó del rollo» viene lleno con lo que queda, como se lee.
			await enPantalla(pagina.getByLabel(/^Quedó del rollo /).first()).toHaveValue(
				metrosComoSeLeen(quedan).replace(" m", "").replace(",", ""),
			);
			expect(usadosEnPantalla.reduce((suma, uno) => suma + uno, 0n)).toBe(pide);
			await pantalla.capturar(pagina, "produccion/corte-capturando");
			await pagina.getByRole("button", { name: "Cerrar corte" }).click();
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(
				"L-2026-019 cortado. La receta de Pantalón azul marino queda verificada",
			);
			await enPantalla(pagina).toHaveURL(new RegExp(`/produccion/lotes\\?marcado=${loteId}`));
			const [tela] = await corteGuardado(loteId);
			expect(aMilesimos(tela?.receta ?? "")).toBe(pide);
			expect(aMilesimos(tela?.quedaron ?? "")).toBe(quedan);
			expect(tela?.quedaron_cambiado).toBe(false);
			expect(tela?.usados.map((uno) => aMilesimos(uno))).toEqual(usadosEnPantalla);
			await pagina.close();
		},
	);

	it(
		"quitar un rollo dice lo que falta; «Agregar» lo regresa; lo que quedó, escrito y «Ya no sirve», llega tal cual",
		tiempo,
		async () => {
			const loteId = lotes["L-2026-013"] ?? "";
			const pagina = await pantalla.abrir(`/produccion/corte?cortar=${loteId}`, { quien: "produccion" });
			await enPantalla(pagina.getByRole("heading", { name: "Sudadera marino lisa" })).toBeVisible();
			await enPantalla(pagina.getByText(/^La tela alcanza · 250 piezas llevan/)).toBeVisible();
			// Sin el último rollo, falta tela y ofrece agregarlo.
			await pagina
				.getByRole("button", { name: /^Quitar R-/ })
				.last()
				.click();
			await enPantalla(pagina.getByText(/^Faltan [\d.,]+ m de Felpa marino · 250 piezas llevan/)).toBeVisible();
			await pagina.getByRole("button", { name: /^Agregar R-\d+ · [\d.,]+ m$/ }).click();
			await enPantalla(pagina.getByText(/^La tela alcanza · 250 piezas llevan/)).toBeVisible();
			// Quedaron 10 m del último, que ya no sirven: merma.
			await pagina.getByLabel(/^Quedó del rollo /).fill("10");
			await enPantalla(pagina.getByText(/^Cambiado · según la receta, [\d.]+ m/)).toBeVisible();
			await enPantalla(pagina.getByText("Retazo de 10 m a la bodega de tela")).toBeVisible();
			await pagina.getByRole("button", { name: "Ya no sirve" }).click();
			await enPantalla(pagina.getByText("10 m se registran como merma de tela")).toBeVisible();
			const llamada = pagina.waitForRequest((peticion) =>
				peticion.url().includes("/v1/acciones/produccion.cerrar_corte"),
			);
			await pagina.getByRole("button", { name: "Cerrar corte" }).click();
			const datos = (await llamada).postDataJSON() as {
				datos: { telas: { metros_quedaron?: string; ya_no_sirve?: boolean }[] };
			};
			expect(datos.datos.telas[0]).toMatchObject({ metros_quedaron: "10", ya_no_sirve: true });
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^L-2026-013 cortado/);
			const [tela] = await corteGuardado(loteId);
			expect(tela).toMatchObject({ quedaron: "10.000", quedaron_cambiado: true, destino_sobrante: "merma" });
			await pagina.close();
		},
	);
});
