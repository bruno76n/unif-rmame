/**
 * El service worker de la tablet, armado por un plugin chico de Vite: al construir, escribe `sw.js` con la lista de
 * todo lo que armó (el HTML, el JavaScript, el CSS, el wasm del lector) y lo de `public/`, y con su versión, que es la
 * huella de esa lista. El service worker guarda todo al instalarse, abre la tablet sin internet desde lo guardado y
 * nunca guarda nada de `/v1`: los datos viven en la copia local.
 * Fase 20 · docs/apps/tablet.md (regla 1 y «Cómo se actualiza») · decisión 813
 *
 * La versión nueva se instala en segundo plano y espera: la tablet le dice `actualizar` cuando no hay nadie adentro y
 * su cola está vacía (`service-worker/registrar.ts`).
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

/**
 * El código del service worker, con su lista y su versión.
 * @param archivos Lo que guarda, con rutas desde la raíz.
 * @param version La huella de la lista.
 */
export function codigoDelServiceWorker(archivos: readonly string[], version: string): string {
	return `// Unifórmame · el service worker de la Puerta del taller (lo arma vite.config.ts; no se edita).
const nombre = "puerta-del-taller-${version}";
const archivos = ${JSON.stringify(archivos)};
self.addEventListener("install", (evento) => {
	evento.waitUntil(caches.open(nombre).then((cache) => cache.addAll(archivos)));
});
self.addEventListener("activate", (evento) => {
	evento.waitUntil(
		caches.keys().then((nombres) => Promise.all(nombres.filter((otro) => otro !== nombre).map((otro) => caches.delete(otro)))),
	);
});
self.addEventListener("message", (evento) => {
	if (evento.data === "actualizar") self.skipWaiting();
});
self.addEventListener("fetch", (evento) => {
	const url = new URL(evento.request.url);
	if (evento.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/v1/")) return;
	if (evento.request.mode === "navigate") {
		evento.respondWith(caches.match("/index.html").then((guardado) => guardado ?? fetch(evento.request)));
		return;
	}
	evento.respondWith(caches.match(evento.request).then((guardado) => guardado ?? fetch(evento.request)));
});
`;
}

/**
 * Los archivos de una carpeta, con sus subcarpetas, con rutas desde ella.
 * @param carpeta La carpeta.
 */
function archivosDe(carpeta: string): string[] {
	if (!existsSync(carpeta)) return [];
	return readdirSync(carpeta, { recursive: true, withFileTypes: true })
		.filter((entrada) => entrada.isFile())
		.map((entrada) => relative(carpeta, join(entrada.parentPath, entrada.name)).split(sep).join("/"));
}

/** El plugin: en la construcción, escribe `sw.js` con lo que armó Vite y lo de `public/`. */
export function serviceWorker(): Plugin {
	let publica = "";
	return {
		name: "uniformame-service-worker",
		apply: "build",
		configResolved(configuracion) {
			publica = configuracion.publicDir;
		},
		generateBundle(_opciones, paquete) {
			const armados = [...Object.keys(paquete), ...archivosDe(publica)];
			const archivos = ["/index.html", ...armados.map((archivo) => `/${archivo}`)]
				.filter((archivo, i, todos) => todos.indexOf(archivo) === i)
				.sort();
			const version = createHash("sha256").update(archivos.join("\n")).digest("hex").slice(0, 12);
			this.emitFile({ type: "asset", fileName: "sw.js", source: codigoDelServiceWorker(archivos, version) });
		},
	};
}
