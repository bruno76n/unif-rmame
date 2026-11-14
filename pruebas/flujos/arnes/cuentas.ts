/**
 * Una cuenta de la fábrica que llama a la API como la web (o, el sitio, con su credencial): manda acciones, pide
 * consultas y saca hojas y etiquetas en PDF. Cada respuesta pasa por la revisión de lo que esa cuenta no debe ver, y si
 * algo llegó, la llamada falla en ese paso.
 * Fase 21 · docs/fases/21-pruebas-de-punta-a-punta.md (parte 1: «las cuentas de la muestra con "Confirmar con Google"
 * simulado»; criterio «Ninguna cuenta recibió en ningún paso lo que no debe ver»)
 */

import type { QuienLlama } from "../../../apps/api/src/nucleo/acceso/quien.ts";
import { leerPdf } from "../../../apps/api/src/nucleo/pruebas/leer-impresos.ts";
import { conGoogle, nuevaClave } from "../../../apps/api/src/nucleo/pruebas/llamadas.ts";
import { encabezadosDeLaWeb, type ServidorDePrueba } from "../../../apps/api/src/nucleo/pruebas/servidor-de-prueba.ts";
import { loQueNoDebiaVer, loQueNoDebiaVerEnUnPdf } from "./vistas.ts";

/** Lo que regresa una acción o una consulta. */
export interface Respuesta {
	/** El estado HTTP. */
	estado: number;
	/** El cuerpo entero. */
	cuerpo: Record<string, unknown>;
	/** Su `resultado`, si lo trae. */
	resultado: unknown;
	/** La clave con que se mandó, si fue una acción: la bitácora y los reintentos la usan. */
	clave?: string;
}

/** Lo que regresa una hoja o una etiqueta en PDF. */
export interface Pdf {
	estado: number;
	/** El texto de todas sus páginas, en una línea; vacío si no salió. */
	texto: string;
	paginas: number;
}

/** Una cuenta de la fábrica. */
export interface Cuenta {
	/** Su nombre de prueba (`rosa`, `javier`). */
	nombre: string;
	/**
	 * Manda una acción.
	 * @param nombre La acción (`ventas.confirmar_pedido`).
	 * @param datos Sus datos.
	 * @param opciones Su versión, su clave (para repetirla) y si va con «Confirmar con Google» reciente.
	 */
	accion: (
		nombre: string,
		datos: unknown,
		opciones?: { version?: number; clave?: string; google?: true },
	) => Promise<Respuesta>;
	/**
	 * Pide una consulta.
	 * @param nombre La consulta (`ventas.pedido`).
	 * @param parametros Sus parámetros.
	 */
	consulta: (nombre: string, parametros?: Record<string, string>) => Promise<Respuesta>;
	/**
	 * Saca una hoja o etiquetas en PDF (`/v1/etiquetas/{tipo}/{id}`).
	 * @param tipo El tipo (`nota_entrega`, `despacho`).
	 * @param id El documento.
	 */
	pdf: (tipo: string, id: string) => Promise<Pdf>;
}

/**
 * Revisa lo que llegó y falla si la cuenta no debía verlo.
 * @param nombre La cuenta.
 * @param que Qué se pidió.
 * @param encontrado Lo que no debía llegar.
 */
function sinLoQueNoDebe(nombre: string, que: string, encontrado: readonly string[]): void {
	if (encontrado.length > 0) {
		throw new Error(`${nombre} recibió en ${que} lo que no debe ver:\n- ${encontrado.join("\n- ")}`);
	}
}

/**
 * Arma una cuenta.
 * @param servidor La API de la fábrica.
 * @param nombre Su nombre de prueba.
 * @param quien Quién es, para la revisión de lo que ve.
 * @param encabezados Cómo llama: los de la web con `x-prueba-quien`, o la credencial del sitio.
 */
export function crearCuenta(
	servidor: ServidorDePrueba,
	nombre: string,
	quien: QuienLlama,
	encabezados: Record<string, string> = encabezadosDeLaWeb(nombre),
): Cuenta {
	const { camposDeSueldo } = servidor.modulos;
	const revisar = (que: string, cuerpo: unknown) =>
		sinLoQueNoDebe(nombre, que, loQueNoDebiaVer(quien, camposDeSueldo, cuerpo));
	return {
		nombre,
		accion: async (accion, datos, opciones = {}) => {
			const clave = opciones.clave ?? nuevaClave();
			const respuesta = await servidor.app.inject({
				method: "POST",
				url: `/v1/acciones/${accion}`,
				headers: { ...encabezados, ...(opciones.google === true ? conGoogle() : {}) },
				payload: {
					clave_idempotencia: clave,
					datos,
					...(opciones.version === undefined ? {} : { version: opciones.version }),
				},
			});
			const cuerpo: Record<string, unknown> = respuesta.json();
			revisar(accion, cuerpo);
			return { estado: respuesta.statusCode, cuerpo, resultado: cuerpo.resultado, clave };
		},
		consulta: async (consulta, parametros = {}) => {
			const busqueda = new URLSearchParams(parametros).toString();
			const respuesta = await servidor.app.inject({
				method: "GET",
				url: `/v1/consultas/${consulta}${busqueda === "" ? "" : `?${busqueda}`}`,
				headers: encabezados,
			});
			const cuerpo: Record<string, unknown> = respuesta.json();
			revisar(consulta, cuerpo);
			return { estado: respuesta.statusCode, cuerpo, resultado: cuerpo.resultado };
		},
		pdf: async (tipo, id) => {
			const respuesta = await servidor.app.inject({
				method: "GET",
				url: `/v1/etiquetas/${tipo}/${id}?formato=pdf`,
				headers: encabezados,
			});
			if (respuesta.statusCode !== 200) return { estado: respuesta.statusCode, texto: "", paginas: 0 };
			const paginas = leerPdf(respuesta.rawPayload);
			const texto = paginas
				.flatMap((pagina) => pagina.textos)
				.join(" ")
				.replace(/\s+/g, " ");
			sinLoQueNoDebe(nombre, `el PDF ${tipo}`, loQueNoDebiaVerEnUnPdf(quien, texto));
			return { estado: respuesta.statusCode, texto, paginas: paginas.length };
		},
	};
}
