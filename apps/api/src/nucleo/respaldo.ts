/**
 * El volcado cifrado de la base: `pg_dump` en formato propio, pasado por `age` con la llave pública.
 * Fase 4 · docs/modulos/admin/respaldos.md (reglas 2, 3 y 5) y docs/cimientos/INFRAESTRUCTURA.md
 *
 * Nada pasa por disco: la salida de `pg_dump` entra directo a `age -r`, y lo cifrado sale como flujo para
 * subirlo mientras sale. La imagen del worker trae `pg_dump` 18 y `age`. La llave privada nunca está aquí:
 * la guarda Bruno (`age -d`).
 */

import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import type { Almacen } from "./almacen.ts";

/** Lo que necesita el respaldo semanal. */
export interface MediosDeRespaldo {
	/** El cubo de respaldos, con su credencial que solo escribe. */
	almacen: Almacen;
	/** La llave pública de age (`RESPALDO_LLAVE_PUBLICA`). */
	llavePublica: string;
	/** El comando que vuelca la base en formato propio, con sus argumentos. */
	volcado: readonly string[];
	/** Las variables de entorno del volcado (la conexión, con su clave fuera de los argumentos). */
	entornoDelVolcado?: Record<string, string>;
}

/** Lo que sale del volcado cifrado: el flujo y cuándo terminaron los dos programas. */
export interface VolcadoCifrado {
	flujo: Readable;
	/** Termina bien si `pg_dump` y `age` salieron con 0; si no, falla con lo que dijeron. */
	termino: Promise<void>;
}

/** Junta lo que un programa escribe en su salida de errores, para decirlo si falla. */
function errores(flujo: Readable): () => string {
	let texto = "";
	flujo.on("data", (pedazo: Buffer) => {
		texto = (texto + pedazo.toString("utf8")).slice(-500);
	});
	return () => texto.trim();
}

/**
 * Espera a que un programa termine.
 * @throws Error con su nombre y lo que dijo, si no salió con 0.
 */
function esperarSalida(programa: ReturnType<typeof spawn>, nombre: string, dijo: () => string): Promise<void> {
	return new Promise((listo, falla) => {
		programa.on("error", (error) => falla(new Error(`${nombre} no arrancó: ${error.message}`)));
		programa.on("close", (codigo) =>
			codigo === 0 ? listo() : falla(new Error(`${nombre} salió con ${codigo}: ${dijo() || "sin mensaje"}`)),
		);
	});
}

/**
 * Arranca el volcado y su cifrado.
 * @param medios El comando del volcado y la llave pública.
 */
export function volcarYCifrar(
	medios: Pick<MediosDeRespaldo, "llavePublica" | "volcado" | "entornoDelVolcado">,
): VolcadoCifrado {
	const [comando = "pg_dump", ...argumentos] = medios.volcado;
	const volcado = spawn(comando, argumentos, {
		env: { ...process.env, ...medios.entornoDelVolcado },
		stdio: ["ignore", "pipe", "pipe"],
	});
	const cifrado = spawn("age", ["-r", medios.llavePublica], { stdio: ["pipe", "pipe", "pipe"] });
	volcado.stdout.pipe(cifrado.stdin);
	const termino = Promise.all([
		esperarSalida(volcado, "pg_dump", errores(volcado.stderr)),
		esperarSalida(cifrado, "age", errores(cifrado.stderr)),
	]).then(() => undefined);
	return { flujo: cifrado.stdout, termino };
}

/**
 * El volcado de producción: `pg_dump` en formato propio con el rol dueño, que es el único que lee todo
 * (las particiones, las tablas de Graphile Worker con su seguridad por renglón y el registro de las
 * migraciones). La clave va en `PGPASSWORD`, no en los argumentos.
 * @param direccionDueno `BASE_DATOS_URL_DUENO`.
 */
export function volcadoDeLaBase(direccionDueno: string): Pick<MediosDeRespaldo, "volcado" | "entornoDelVolcado"> {
	const direccion = new URL(direccionDueno);
	const entorno: Record<string, string> = {
		PGHOST: direccion.hostname,
		PGPORT: direccion.port === "" ? "5432" : direccion.port,
		PGUSER: decodeURIComponent(direccion.username),
		PGPASSWORD: decodeURIComponent(direccion.password),
		PGDATABASE: direccion.pathname.slice(1),
	};
	const modoSsl = direccion.searchParams.get("sslmode");
	if (modoSsl !== null) entorno.PGSSLMODE = modoSsl;
	return { volcado: ["pg_dump", "--format=custom"], entornoDelVolcado: entorno };
}
