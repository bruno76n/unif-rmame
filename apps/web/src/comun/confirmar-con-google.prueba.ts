/**
 * Prueba de «Confirmar con Google», sobre «Autorizar» de Dirección: la acción responde `401 reautenticar`, la web abre la
 * ventana de Google aparte y, cuando vuelve por `/acceso/confirmado`, repite la acción con su misma clave; si la persona
 * cierra la ventana sin confirmar, la acción no se repite.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «"Confirmar con Google" abre la ventana de Google y, al volver,
 * repite la acción con su misma clave»), decisión 748
 *
 * En las pruebas, Google no existe: la ida a `/v1/acceso/google` se contesta con la vuelta a `/acceso/confirmado`, y la
 * sesión de prueba queda confirmada con el encabezado `x-prueba-google`, como en las pruebas de la API.
 */

import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enPantalla } from "../../../../pruebas/navegador/en-pantalla.ts";
import { pedirAjusteDePrueba } from "./pruebas/autorizaciones-de-prueba.ts";
import { levantarPantalla, type PantallaDePrueba } from "./pruebas/pantalla-de-prueba.ts";

/** La acción delicada de la prueba. */
const decidir = "/v1/acciones/direccion.decidir_autorizacion";

describe("«Confirmar con Google» abre la ventana de Google y, al volver, repite la acción con su misma clave", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/** Si una autorización sigue esperando. */
	async function sigueEsperando(id: string): Promise<boolean> {
		const { rows } = await pantalla.servidor.base.dueno.query("SELECT estado FROM autorizaciones WHERE id = $1", [id]);
		return rows[0]?.estado === "por_autorizar";
	}

	/**
	 * Abre Autorizaciones como la dueña, sin haber confirmado con Google, y apunta cada intento de decidir.
	 * @returns La página y las claves de cada intento, con lo que contestó la API.
	 */
	async function abrir(): Promise<{ pagina: Page; intentos: { clave: string; estado: number }[] }> {
		const pagina = await pantalla.abrir("/direccion/autorizaciones", { quien: "duena" });
		const intentos: { clave: string; estado: number }[] = [];
		pagina.on("response", async (respuesta) => {
			if (!respuesta.url().endsWith(decidir)) return;
			const cuerpo: unknown = respuesta.request().postDataJSON();
			const clave =
				typeof cuerpo === "object" && cuerpo !== null && "clave_idempotencia" in cuerpo
					? String(cuerpo.clave_idempotencia)
					: "";
			intentos.push({ clave, estado: respuesta.status() });
		});
		await enPantalla(pagina.locator("h1")).toHaveText("Dirección");
		return { pagina, intentos };
	}

	it("confirma en la ventana aparte y la acción se repite una vez, con la misma clave", {
		timeout: 90_000,
	}, async () => {
		const { id, resumen } = await pedirAjusteDePrueba(pantalla, 2);
		const { pagina, intentos } = await abrir();
		// La ida a Google vuelve en seguida a /acceso/confirmado, ya con la sesión confirmada.
		const ida: string[] = [];
		await pagina.context().route("**/v1/acceso/google**", async (ruta) => {
			ida.push(ruta.request().url());
			await pagina.setExtraHTTPHeaders({ "x-prueba-quien": "duena", "x-prueba-google": new Date().toISOString() });
			await ruta.fulfill({ status: 302, headers: { location: "/acceso/confirmado" } });
		});
		const ventana = pagina.waitForEvent("popup");
		await pagina.getByRole("article", { name: resumen }).getByRole("button", { name: "Autorizar" }).click();
		await ventana;
		expect(ida).toHaveLength(1);
		expect(ida[0]).toContain("proposito=confirmar");
		await enPantalla(pagina.getByRole("article", { name: resumen })).toHaveCount(0);
		await expect.poll(() => intentos.length).toBe(2);
		expect(intentos[0]?.estado).toBe(401);
		expect(intentos[1]?.estado).toBe(200);
		expect(intentos[1]?.clave).toBe(intentos[0]?.clave);
		expect(await sigueEsperando(id)).toBe(false);
		await pagina.close();
	});

	it("si cierra la ventana sin confirmar, la acción no se repite y la autorización sigue esperando", {
		timeout: 90_000,
	}, async () => {
		const { id, resumen } = await pedirAjusteDePrueba(pantalla, 3);
		const { pagina, intentos } = await abrir();
		// La ventana de Google se queda abierta, sin volver; la persona la cierra.
		await pagina
			.context()
			.route("**/v1/acceso/google**", (ruta) =>
				ruta.fulfill({ status: 200, contentType: "text/html", body: "<title>Google</title>" }),
			);
		const ventana = pagina.waitForEvent("popup");
		await pagina.getByRole("article", { name: resumen }).getByRole("button", { name: "Autorizar" }).click();
		await (await ventana).close();
		await enPantalla(pagina.getByRole("article", { name: resumen })).toBeVisible();
		expect(intentos.map((intento) => intento.estado)).toEqual([401]);
		expect(await sigueEsperando(id)).toBe(true);
		await pagina.close();
	});
});
