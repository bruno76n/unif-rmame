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
import { guardarEventosConAdmin } from "./nucleo/acciones/corredor.ts";
import { abrirConexiones, crearBase } from "./nucleo/base/conexion.ts";
import { leerEntorno } from "./nucleo/entorno.ts";
import { cargarModulos } from "./nucleo/modulos.ts";
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

if (import.meta.main) {
	const entorno = leerEntorno();
	const conexiones = abrirConexiones(entorno.BASE_DATOS_URL);
	await arrancarTrabajador({
		conexiones,
		base: crearBase(conexiones),
		registro: await cargarModulos(join(import.meta.dirname, "modulos")),
		servicios: {
			guardarEventos: guardarEventosConAdmin,
			// La bitácora de los trabajos llega con `admin.escribir_bitacora` (parte 3 de la fase 4).
			escribirBitacora: async (_contexto, renglones) => {
				if (renglones.length > 0) throw new Error("la bitácora de los trabajos todavía no existe");
			},
		},
		// El aviso `trabajo_fallido` a soporte llega con `admin.crear_aviso` (parte 4 de la fase 4).
		avisarFalla: async (texto) => {
			process.stderr.write(`${texto}\n`);
		},
	});
}
