/**
 * La API: arma el servidor con los módulos y los servicios de verdad, y lo pone a escuchar.
 * Fase 5 · docs/cimientos/ACCESO-Y-PERMISOS.md («Cómo se revisa cada llamada») y
 * docs/cimientos/ARQUITECTURA.md («Cómo corre en local»)
 *
 * Quién llama sale de la sesión de Google (la llave de los aparatos llega en la fase 6); el permiso, de
 * `acceso/permisos.ts`. Con `GOOGLE_*` y `COOKIE_SECRETO` existe la entrada con Google. Escucha en `PORT`
 * (Render) o en el puerto de `DOMINIO_API` (local).
 */

import { join } from "node:path";
import { Temporal } from "temporal-polyfill";
import { llaveDeLaEntrada } from "./nucleo/acceso/cookies.ts";
import { crearAccesoConGoogle } from "./nucleo/acceso/google.ts";
import { identificarConSesion } from "./nucleo/acceso/identificar.ts";
import { revisionDePermisos } from "./nucleo/acceso/permisos.ts";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "./nucleo/acciones/corredor.ts";
import { almacenDeArchivosDelEntorno } from "./nucleo/almacen.ts";
import { abrirConexiones, crearBase } from "./nucleo/base/conexion.ts";
import { type Entorno, leerEntorno } from "./nucleo/entorno.ts";
import { cargarModulos } from "./nucleo/modulos.ts";
import { versionMinimaDeLosParametros } from "./nucleo/parametros.ts";
import { crearAvisosEnVivo } from "./nucleo/sincronizacion/eventos-en-vivo.ts";
import { crearServidor } from "./servidor.ts";

/** Cada cuántos segundos pregunta un aparato si no le llega nada, mientras la fase 6 trae su parámetro. */
const intervaloSinParametro = 30;

/**
 * La entrada con Google según el entorno; sin sus variables, no existe.
 * @param entorno Las variables ya leídas.
 */
function entradaDelEntorno(entorno: Entorno) {
	const emisor = entorno.GOOGLE_EMISOR;
	const clienteId = entorno.GOOGLE_CLIENTE_ID;
	const clienteSecreto = entorno.GOOGLE_CLIENTE_SECRETO;
	const secretoDeLaCookie = entorno.COOKIE_SECRETO;
	if (
		emisor === undefined ||
		clienteId === undefined ||
		clienteSecreto === undefined ||
		secretoDeLaCookie === undefined
	) {
		return {};
	}
	return {
		entradaConGoogle: {
			google: crearAccesoConGoogle({
				emisor,
				clienteId,
				clienteSecreto,
				vuelta: `${entorno.DOMINIO_API}/v1/acceso/google/vuelta`,
				permitirHttp: entorno.ENTORNO === "local",
			}),
			llave: llaveDeLaEntrada(secretoDeLaCookie),
		},
	};
}

if (import.meta.main) {
	const entorno = leerEntorno();
	const conexiones = abrirConexiones(entorno.BASE_DATOS_URL);
	const base = crearBase(conexiones);
	const registro = await cargarModulos(join(import.meta.dirname, "modulos"));
	const reloj = () => Temporal.Now.instant();
	const app = await crearServidor({
		entorno,
		base,
		registro,
		servicios: {
			identificar: identificarConSesion(base, reloj),
			revisarPermiso: revisionDePermisos(base),
			versionMinimaDelParametro: versionMinimaDeLosParametros(base),
			escribirBitacora: escribirBitacoraConAdmin,
			guardarEventos: guardarEventosConAdmin,
		},
		avisosEnVivo: crearAvisosEnVivo({
			conexiones,
			base,
			registro,
			alcanceDelAparato: async () => ({ tablas: [], ubicacionIds: [] }),
			intervaloDeSincronizacion: async () => intervaloSinParametro,
			anotarError: (error) => console.error("aviso en vivo que no se repartió", error),
		}),
		...almacenDeArchivosDelEntorno(entorno),
		...entradaDelEntorno(entorno),
	});
	const puerto = entorno.PORT ?? Number(new URL(entorno.DOMINIO_API).port);
	await app.listen({ port: puerto, host: entorno.PORT === undefined ? "127.0.0.1" : "0.0.0.0" });
}
