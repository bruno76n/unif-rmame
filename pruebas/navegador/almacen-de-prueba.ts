/**
 * El almacén de archivos de las pruebas de pantalla: el simulador de R2 atiende lo que pide la API (con MSW, en su
 * proceso) y también lo que sube el navegador directo con la dirección firmada (con la ruta de Playwright, que le
 * pasa la petición al mismo simulador). Así una pantalla sube un archivo como en producción, sin salir de la máquina.
 * Fase 19 · docs/modulos/admin/archivos.md (regla 1) y docs/cimientos/PRUEBAS.md («Los niveles»: pantallas)
 */

import { getResponse } from "msw";
import { setupServer } from "msw/node";
import { crearSimuladorDeR2 } from "../simuladores/r2.ts";

/** Los encabezados que deja pasar el almacén a la web (en R2 son la regla CORS del cubo). */
const cors = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "PUT, GET, HEAD",
	"access-control-allow-headers": "*",
	"access-control-expose-headers": "etag",
};

/**
 * Levanta el almacén de prueba.
 * @param cuenta La cuenta de R2 de prueba: la dirección del almacén sale de ella.
 * @returns `responder`, que contesta una petición del navegador como el almacén, y `cerrar`.
 */
export function levantarAlmacenDePrueba(cuenta: string) {
	const simulador = crearSimuladorDeR2(cuenta);
	const red = setupServer(...simulador.manejadores);
	red.listen({ onUnhandledFrame: "bypass" });
	return {
		/**
		 * Contesta lo que el navegador le pide al almacén (la subida firmada, y la consulta previa de CORS).
		 * @param peticion La petición del navegador.
		 */
		responder: async (
			peticion: Request,
		): Promise<{ estado: number; encabezados: Record<string, string>; cuerpo: Buffer }> => {
			if (peticion.method === "OPTIONS") return { estado: 204, encabezados: cors, cuerpo: Buffer.alloc(0) };
			const respuesta = (await getResponse(simulador.manejadores, peticion)) ?? new Response(null, { status: 404 });
			return {
				estado: respuesta.status,
				encabezados: { ...Object.fromEntries(respuesta.headers), ...cors },
				cuerpo: Buffer.from(await respuesta.arrayBuffer()),
			};
		},
		cerrar: () => red.close(),
	};
}
