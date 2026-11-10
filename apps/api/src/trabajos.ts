/**
 * El worker: corre Graphile Worker con las tareas del núcleo y los trabajos de los módulos.
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («El worker»)
 *
 * Es un proceso aparte de la API, con el rol de la app, sobre la misma base. En Render corre como servicio
 * en segundo plano; en local lo levanta `pnpm local`. El esquema de Graphile Worker ya lo instaló
 * `base:migrar` con el rol dueño: al arrancar, el worker solo revisa que esté al día.
 */

import { join } from "node:path";
import { run } from "graphile-worker";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "./nucleo/acciones/corredor.ts";
import { almacenDeArchivosDelEntorno, crearAlmacen, cubos, direccionDelAlmacen } from "./nucleo/almacen.ts";
import { abrirConexiones, crearBase } from "./nucleo/base/conexion.ts";
import { crearEnvioAlRegistro, crearEnvioConResend, type EnviarCorreo } from "./nucleo/correo.ts";
import { type Entorno, leerEntorno } from "./nucleo/entorno.ts";
import { cargarModulos } from "./nucleo/modulos.ts";
import { type MediosDeRespaldo, volcadoDeLaBase } from "./nucleo/respaldo.ts";
import { esquemaDelWorker } from "./nucleo/trabajos/esquema.ts";
import { crontabDelTrabajador, type DependenciasDelTrabajador, listaDeTareas } from "./nucleo/trabajos/trabajador.ts";

/**
 * Arranca el worker y espera hasta que se detenga (Graphile Worker atiende `SIGINT` y `SIGTERM`).
 * @param dependencias Lo que necesita el worker, con su grupo de conexiones.
 */
export async function arrancarTrabajador(
	dependencias: DependenciasDelTrabajador & { conexiones: Parameters<typeof crearBase>[0] },
): Promise<void> {
	const corredor = await run({
		pgPool: dependencias.conexiones,
		schema: esquemaDelWorker,
		taskList: listaDeTareas(dependencias),
		crontab: crontabDelTrabajador,
		concurrency: 4,
	});
	await corredor.promise;
}

/**
 * Cómo sale el correo según el entorno: en local no sale y queda en el registro del worker; fuera de local
 * va por Resend y sin su llave el worker no arranca.
 * @param entorno Las variables de entorno.
 */
function envioDelEntorno(entorno: Entorno): EnviarCorreo {
	if (entorno.ENTORNO === "local") return crearEnvioAlRegistro((linea) => process.stdout.write(`${linea}\n`));
	if (entorno.RESEND_LLAVE === undefined)
		throw new Error("Falta RESEND_LLAVE: el worker manda los correos con Resend.");
	return crearEnvioConResend(entorno.RESEND_LLAVE);
}

/**
 * Lo que necesita el respaldo semanal según el entorno: el cubo de respaldos con su credencial que solo
 * escribe, la llave pública y el volcado con el rol dueño. Sin todo eso no hay respaldo, y el trabajo lo
 * registra como fallido y avisa.
 */
function respaldoDelEntorno(entorno: Entorno): { respaldo?: MediosDeRespaldo } {
	const direccion = direccionDelAlmacen(entorno);
	const llaveId = entorno.R2_RESPALDOS_LLAVE_ID;
	const secreto = entorno.R2_RESPALDOS_SECRETO;
	const llavePublica = entorno.RESPALDO_LLAVE_PUBLICA;
	const dueno = entorno.BASE_DATOS_URL_DUENO;
	if (
		direccion === undefined ||
		llaveId === undefined ||
		secreto === undefined ||
		llavePublica === undefined ||
		dueno === undefined
	) {
		return {};
	}
	return {
		respaldo: {
			almacen: crearAlmacen({ direccion, cubo: cubos.respaldos, llaveId, secreto }),
			llavePublica,
			...volcadoDeLaBase(dueno),
		},
	};
}

if (import.meta.main) {
	const entorno = leerEntorno();
	const conexiones = abrirConexiones(entorno.BASE_DATOS_URL);
	await arrancarTrabajador({
		conexiones,
		base: crearBase(conexiones),
		registro: await cargarModulos(join(import.meta.dirname, "modulos")),
		servicios: {
			guardarEventos: guardarEventosConAdmin,
			escribirBitacora: escribirBitacoraConAdmin,
		},
		enviarCorreo: envioDelEntorno(entorno),
		...almacenDeArchivosDelEntorno(entorno),
		...respaldoDelEntorno(entorno),
		dominioWeb: entorno.DOMINIO_WEB,
	});
}
