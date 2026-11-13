/**
 * El arnés de las pruebas de pantalla: levanta la API de prueba con los datos de la muestra, la web con Vite (su proxy
 * apunta a esa API) y Chromium, y abre una ruta como una cuenta de prueba, en escritorio o en teléfono. Las capturas
 * van a `.revision/capturas/`, para el revisor de diseño. Lo usan las pruebas de lo común y las de cada departamento.
 * Fase 19 · docs/cimientos/PRUEBAS.md («Los niveles»: pantallas) y docs/fases/19-web-principal.md («Cómo se construye»)
 *
 * Uso:
 * `const pantalla = await levantarPantalla(); const pagina = await pantalla.abrir("/bodega", { quien: "bodega" });`
 * y al final `await pantalla.cerrar()`. La cuenta va en el encabezado `x-prueba-quien`, como en las pruebas de la API.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { levantarAlmacenDePrueba } from "../../../../../pruebas/navegador/almacen-de-prueba.ts";
import { opcionesDeChromium } from "../../../../../pruebas/navegador/chromium.ts";
import { crearAlmacen, direccionDeR2 } from "../../../../api/src/nucleo/almacen.ts";
import {
	crearServidorDePrueba,
	dominios,
	type ServidorDePrueba,
} from "../../../../api/src/nucleo/pruebas/servidor-de-prueba.ts";

/** La carpeta de la web y la de las capturas. */
const web = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const capturas = join(web, "..", "..", ".revision", "capturas");

/** Los tamaños de pantalla de las pruebas y de la muestra. */
export const tamanos = {
	escritorio: { width: 1440, height: 900 },
	telefono: { width: 390, height: 844 },
} as const;

/** Lo que da el arnés. */
export interface PantallaDePrueba {
	/** La API de prueba, con su base. */
	servidor: ServidorDePrueba;
	/**
	 * Abre una ruta de la web como una cuenta de prueba.
	 * @param ruta La ruta (`/bodega`).
	 * @param opciones La cuenta y el tamaño.
	 */
	abrir: (ruta: string, opciones: { quien: string; tamano?: keyof typeof tamanos }) => Promise<Page>;
	/**
	 * Guarda la captura de una página.
	 * @param pagina La página.
	 * @param nombre Su nombre, con su carpeta (`comun/armazon-escritorio`).
	 */
	capturar: (pagina: Page, nombre: string) => Promise<void>;
	cerrar: () => Promise<void>;
}

/** La cuenta de R2 de las pruebas de pantalla que suben archivos. */
const cuentaDelAlmacen = "cuentaprueba";

/**
 * Levanta la API de prueba, la web y el navegador.
 * @param opciones `conArchivos` para las pantallas que suben archivos: la API tiene almacén (el simulador de R2) y el
 * navegador sube a él con la dirección firmada.
 */
export async function levantarPantalla(opciones: { conArchivos?: true } = {}): Promise<PantallaDePrueba> {
	const almacen = opciones.conArchivos === true ? levantarAlmacenDePrueba(cuentaDelAlmacen) : undefined;
	const servidor = await crearServidorDePrueba(
		almacen === undefined
			? {}
			: {
					almacen: crearAlmacen({
						direccion: direccionDeR2(cuentaDelAlmacen),
						cubo: "uniformame-archivos",
						llaveId: "llave-de-prueba",
						secreto: "secreto-de-prueba",
					}),
				},
	);
	const direccionApi = await servidor.app.listen({ host: "127.0.0.1", port: 0 });
	// La configuración de la web lee estas dos al cargarse: el proxy apunta a esta API con el origen que espera.
	process.env.UNIFORMAME_API = direccionApi;
	process.env.UNIFORMAME_ORIGEN_WEB = dominios.DOMINIO_WEB;
	const vite: ViteDevServer = await createServer({
		root: web,
		configFile: join(web, "vite.config.ts"),
		logLevel: "error",
		server: { host: "127.0.0.1", port: 0 },
	});
	await vite.listen();
	const direccionWeb = vite.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? "";
	const navegador: Browser = await chromium.launch(opcionesDeChromium());
	return {
		servidor,
		abrir: async (ruta, { quien, tamano = "escritorio" }) => {
			const contexto = await navegador.newContext({
				viewport: tamanos[tamano],
				extraHTTPHeaders: { "x-prueba-quien": quien },
			});
			// Lo que el navegador sube al almacén lo atiende el simulador.
			if (almacen !== undefined) {
				await contexto.route(`${direccionDeR2(cuentaDelAlmacen)}/**`, async (ruta) => {
					const pedido = ruta.request();
					const cuerpo = pedido.postDataBuffer();
					const {
						estado,
						encabezados,
						cuerpo: devuelto,
					} = await almacen.responder(
						new Request(pedido.url(), {
							method: pedido.method(),
							headers: await pedido.allHeaders(),
							...(cuerpo === null ? {} : { body: new Uint8Array(cuerpo) }),
						}),
					);
					await ruta.fulfill({ status: estado, headers: encabezados, body: devuelto });
				});
			}
			const pagina = await contexto.newPage();
			await pagina.goto(`${direccionWeb}${ruta}`);
			return pagina;
		},
		capturar: async (pagina, nombre) => {
			const archivo = join(capturas, `${nombre}.png`);
			mkdirSync(dirname(archivo), { recursive: true });
			await pagina.screenshot({ path: archivo });
		},
		cerrar: async () => {
			await navegador.close();
			await vite.close();
			await servidor.cerrar();
			almacen?.cerrar();
		},
	};
}
