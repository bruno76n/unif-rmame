/**
 * Prueba del respaldo semanal: sale cifrado, llega con su suma y, descifrado y restaurado en otra base,
 * trae los mismos conteos.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 7)
 *
 * `pg_dump` y `pg_restore` corren dentro del contenedor de Postgres 18 de las pruebas (`docker exec`), con
 * su misma versión; `age` y `age-keygen` son los de la máquina, como en la imagen del worker.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { crearSimuladorDeR2 } from "@uniformame/pruebas/simuladores/r2";
import { setupServer } from "msw/node";
import pg from "pg";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearAlmacen, cubos, direccionDeR2 } from "../../../nucleo/almacen.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { cargarModulos } from "../../../nucleo/modulos.ts";
import { correrTrabajo, type DependenciasDelTrabajador } from "../../../nucleo/trabajos/trabajador.ts";
import { respaldoSemanal } from "./respaldo-semanal.ts";

const simulador = crearSimuladorDeR2("cuentaprueba");
const red = setupServer(...simulador.manejadores);

/** Una llave de age nueva para la prueba: la pública y el archivo con la privada. */
function llaveDePrueba(): { publica: string; archivo: string } {
	const generada = spawnSync("age-keygen", { encoding: "utf8" });
	const publica = /public key: (age1[0-9a-z]+)/.exec(generada.stdout + generada.stderr)?.[1];
	if (publica === undefined) throw new Error("age-keygen no dio una llave");
	const archivo = join(mkdtempSync(join(tmpdir(), "respaldo-")), "llave.txt");
	writeFileSync(archivo, generada.stdout);
	return { publica, archivo };
}

describe("el respaldo semanal sale cifrado, llega con su SHA-256 y, descifrado y restaurado en otra base, trae los mismos conteos; no corre dos veces en la misma semana", () => {
	let prueba: BaseDePrueba;
	let dependencias: DependenciasDelTrabajador;
	const llave = llaveDePrueba();
	let ahora = Temporal.Instant.from("2026-11-15T08:00:00Z");
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		prueba = await crearBaseDePrueba();
		dependencias = {
			base: crearBase(prueba.app),
			registro: await cargarModulos(join(import.meta.dirname, "../..")),
			servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: escribirBitacoraConAdmin },
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => ahora,
			respaldo: {
				almacen: crearAlmacen({
					direccion: direccionDeR2("cuentaprueba"),
					cubo: cubos.respaldos,
					llaveId: "llave-que-solo-escribe",
					secreto: "secreto-de-prueba",
				}),
				llavePublica: llave.publica,
				volcado: [
					"docker",
					"exec",
					prueba.contenedor,
					"pg_dump",
					"-U",
					"uniformame_dueno",
					"--format=custom",
					"-d",
					prueba.nombre,
				],
			},
		};
	});
	afterAll(async () => {
		red.close();
		await prueba.borrar();
	});

	/** Los renglones de cada tabla de `public` (las madres de las partidas cuentan todo lo suyo). */
	async function conteos(grupo: pg.Pool): Promise<Record<string, number>> {
		const { rows } = await grupo.query(
			"SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') AND NOT relispartition ORDER BY relname",
		);
		const resultado: Record<string, number> = {};
		for (const { relname } of rows) {
			resultado[relname] = Number((await grupo.query(`SELECT count(*) AS n FROM "${relname}"`)).rows[0]?.n);
		}
		return resultado;
	}

	it("se vuelca, se cifra y se sube; descifrado y restaurado en otra base, cuadra tabla por tabla", async () => {
		// Lo que había al volcar: el registro del respaldo y su evento se escriben después.
		const originales = await conteos(prueba.dueno);
		await correrTrabajo(dependencias, respaldoSemanal, {});
		const { rows } = await prueba.dueno.query(
			"SELECT estado, tamano_bytes, cifrado, destino, sha256, error FROM respaldos",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			estado: "correcto",
			cifrado: true,
			destino: "r2://uniformame-respaldos/2026/2026-11-15.dump.age",
		});
		const objeto = simulador.objetos.get("uniformame-respaldos/2026/2026-11-15.dump.age");
		if (objeto === undefined) throw new Error("no llegó el respaldo");
		expect(new TextDecoder().decode(objeto.contenido.slice(0, 21))).toBe("age-encryption.org/v1");
		expect(createHash("sha256").update(objeto.contenido).digest("hex")).toBe(rows[0]?.sha256);
		expect(Number(rows[0]?.tamano_bytes)).toBe(objeto.contenido.byteLength);
		// El volcado ya pasa del MB que `spawnSync` acepta de salida por omisión: se le da espacio de sobra.
		const descifrado = spawnSync("age", ["-d", "-i", llave.archivo], {
			input: objeto.contenido,
			maxBuffer: 1024 * 1024 * 1024,
		});
		expect(descifrado.status).toBe(0);
		const restaurada = `restaurada_${prueba.nombre}`.slice(0, 60);
		await prueba.dueno.query(`CREATE DATABASE ${restaurada}`);
		const compartida = inject("baseDePruebas");
		const enLaRestaurada = new pg.Pool({
			host: compartida.host,
			port: compartida.puerto,
			user: compartida.dueno.usuario,
			password: compartida.dueno.clave,
			database: restaurada,
		});
		// Al borrarla con FORCE, Postgres corta lo que quede del grupo (57P01): solo ese error se calla.
		const callarElCorte = (error: Error) => {
			if (!("code" in error && error.code === "57P01")) throw error;
		};
		enLaRestaurada.on("error", callarElCorte);
		enLaRestaurada.on("connect", (conexion) => conexion.on("error", callarElCorte));
		try {
			const restauracion = spawnSync(
				"docker",
				["exec", "-i", prueba.contenedor, "pg_restore", "-U", "uniformame_dueno", "--exit-on-error", "-d", restaurada],
				{ input: descifrado.stdout, maxBuffer: 1024 * 1024 * 1024 },
			);
			expect(restauracion.stderr.toString()).toBe("");
			expect(restauracion.status).toBe(0);
			expect(Object.keys(originales).length).toBeGreaterThan(10);
			expect(await conteos(enLaRestaurada)).toEqual(originales);
		} finally {
			await enLaRestaurada.end();
			await prueba.dueno.query(`DROP DATABASE ${restaurada} WITH (FORCE)`);
		}
	});

	it("en la misma semana no corre otra vez", async () => {
		ahora = Temporal.Instant.from("2026-11-15T09:00:00Z");
		const antes = simulador.objetos.size;
		await correrTrabajo(dependencias, respaldoSemanal, {});
		const { rows } = await prueba.dueno.query("SELECT count(*)::int AS n FROM respaldos");
		expect(rows[0]?.n).toBe(1);
		expect(simulador.objetos.size).toBe(antes);
	});

	it("si falla, queda registrado como fallido y avisa a la dueña y a soporte", async () => {
		ahora = Temporal.Instant.from("2026-11-22T08:00:00Z");
		const { respaldo } = dependencias;
		if (respaldo === undefined) throw new Error("falta el respaldo de prueba");
		const volcado = ["docker", "exec", prueba.contenedor, "pg_dump", "-U", "uniformame_dueno", "-d", "no_existe"];
		await correrTrabajo({ ...dependencias, respaldo: { ...respaldo, volcado } }, respaldoSemanal, {});
		const { rows } = await prueba.dueno.query("SELECT estado, error FROM respaldos ORDER BY hecho_en DESC LIMIT 1");
		expect(rows[0]?.estado).toBe("fallido");
		expect(rows[0]?.error).toContain("pg_dump");
		const avisos = await prueba.dueno.query(
			"SELECT usuario_id, texto FROM avisos WHERE tipo = 'respaldo_fallido' ORDER BY usuario_id",
		);
		expect(avisos.rows.map((aviso) => aviso.usuario_id)).toEqual([
			"01936f2e-0000-7000-8000-000000000001",
			"01936f2e-0000-7000-8000-000000000005",
		]);
		expect(avisos.rows[0]?.texto).toMatch(/^El respaldo semanal no se hizo: pg_dump salió con 1: /);
	});

	it("un volcado que sale mal a medias no deja un objeto en R2", async () => {
		ahora = Temporal.Instant.from("2026-11-29T08:00:00Z");
		const { respaldo } = dependencias;
		if (respaldo === undefined) throw new Error("falta el respaldo de prueba");
		const volcado = ["sh", "-c", "echo parcial; exit 3"];
		await correrTrabajo({ ...dependencias, respaldo: { ...respaldo, volcado } }, respaldoSemanal, {});
		const { rows } = await prueba.dueno.query("SELECT estado, error FROM respaldos ORDER BY hecho_en DESC LIMIT 1");
		expect(rows[0]).toMatchObject({ estado: "fallido", error: "pg_dump salió con 3: sin mensaje" });
		expect(simulador.objetos.has("uniformame-respaldos/2026/2026-11-29.dump.age")).toBe(false);
	});

	/**
	 * Si el volcado de prueba ya no corre. Espera hasta 10 s: con la máquina cargada (la suite completa), el proceso tarda
	 * en terminar después de que el trabajo lo para.
	 */
	async function volcadoParado(): Promise<boolean> {
		for (let intento = 0; intento < 100; intento++) {
			if (spawnSync("pgrep", ["-f", "^yes respaldo$"]).status === 1) return true;
			await new Promise((listo) => setTimeout(listo, 100));
		}
		return false;
	}

	it("si R2 falla desde el principio, el trabajo termina y para el volcado y el cifrado", async () => {
		ahora = Temporal.Instant.from("2026-12-06T08:00:00Z");
		const { respaldo } = dependencias;
		if (respaldo === undefined) throw new Error("falta el respaldo de prueba");
		simulador.ponerAFallar("error_del_servidor");
		try {
			// Un volcado que no termina nunca: si nadie lo para, el trabajo se queda esperando.
			await correrTrabajo(
				{ ...dependencias, respaldo: { ...respaldo, volcado: ["yes", "respaldo"] } },
				respaldoSemanal,
				{},
			);
		} finally {
			simulador.ponerAFallar("ninguna");
		}
		const { rows } = await prueba.dueno.query("SELECT estado FROM respaldos ORDER BY hecho_en DESC LIMIT 1");
		expect(rows[0]?.estado).toBe("fallido");
		expect(await volcadoParado()).toBe(true);
	});

	it("si una parte falla a medio flujo, la subida se cancela, el trabajo termina y para el volcado", async () => {
		ahora = Temporal.Instant.from("2026-12-13T08:00:00Z");
		const { respaldo } = dependencias;
		if (respaldo === undefined) throw new Error("falta el respaldo de prueba");
		// R2 empieza bien: falla ya con la subida abierta, cuando las partes van saliendo.
		const fallar = setTimeout(() => simulador.ponerAFallar("error_del_servidor"), 300);
		try {
			await correrTrabajo(
				{ ...dependencias, respaldo: { ...respaldo, volcado: ["yes", "respaldo"] } },
				respaldoSemanal,
				{},
			);
		} finally {
			clearTimeout(fallar);
			simulador.ponerAFallar("ninguna");
		}
		const { rows } = await prueba.dueno.query("SELECT estado FROM respaldos ORDER BY hecho_en DESC LIMIT 1");
		expect(rows[0]?.estado).toBe("fallido");
		expect(simulador.objetos.has("uniformame-respaldos/2026/2026-12-13.dump.age")).toBe(false);
		expect(await volcadoParado()).toBe(true);
	});
});
