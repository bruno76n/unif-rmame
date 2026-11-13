/**
 * Prueba de las consultas de Dispositivos: `admin.dispositivos` (los registrados sin la credencial de uniformame.mx,
 * con su sincronización, su llave pública, el reloj desfasado y sus apartados; los revocados con lo que llegó después;
 * nunca una llave secreta ni su hash), `admin.codigo_registro` (solo la dueña) y `admin.comandos_apartados`.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** La tablet y el puente de Aduana de prueba. */
const tablet = "01936f2e-0000-7000-8000-000000000021";
const puente = "01936f2e-0000-7000-8000-000000000031";

/** Un aparato registrado, como lo lee la prueba. */
interface Registrado {
	dispositivo_id: string;
	nombre: string;
	tipo_texto: string;
	ubicacion: string | null;
	sincronizacion: { texto: string; tono: string };
	llave_id: string;
	reloj_desfasado: boolean;
	apartados: number;
}

describe("Las consultas de Dispositivos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Un comando que llegó de un aparato y quedó apartado. */
	async function apartar(dispositivoId: string, motivo: string, revocado = false): Promise<string> {
		const id = uuidv7();
		await servidor.base.dueno.query(
			`INSERT INTO comandos_recibidos (id, clave_idempotencia, origen, dispositivo_id, tipo_comando, ocurrido_en, carga_hash,
				carga, resultado, motivo_apartado, dispositivo_revocado)
			 VALUES ($1, $2, 'aparato', $3, 'produccion.reportar_bulto', now() - interval '1 hour', 'hash', '{}'::jsonb, 'apartado', $4, $5)`,
			[id, uuidv7(), dispositivoId, motivo, revocado],
		);
		return id;
	}

	/** Lee Dispositivos como una cuenta. */
	async function dispositivos(quien: string) {
		const respuesta = await pedirConsulta(servidor, "admin.dispositivos", {}, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as {
			es_duena: boolean;
			registrados: Registrado[];
			revocados: { nombre: string; motivo: string; despues_de_revocar: number }[];
			donde_se_usa: { nombre: string; tipo: string; con_impresora: boolean }[];
		};
	}

	it("solo las piden las cuentas de Administración del sistema; el código de registro, solo la dueña", async () => {
		for (const consulta of ["admin.dispositivos"]) {
			expect((await pedirConsulta(servidor, consulta, {}, "ventas")).estado).toBe(403);
		}
		expect(
			(await pedirConsulta(servidor, "admin.comandos_apartados", { dispositivo_id: tablet }, "ventas")).estado,
		).toBe(403);
		const codigo = await mandarAccion(
			servidor,
			"admin.generar_codigo_registro",
			{ datos: { nombre: "Tablet nueva", tipo: "tablet_taller", ubicacion_id: await ubicacionDe("TAL") } },
			"duena",
			{ "x-prueba-google": new Date().toISOString() },
		);
		expect(codigo.estado, JSON.stringify(codigo.cuerpo)).toBe(200);
		const id = (codigo.cuerpo.resultado as { codigo_registro_id: string }).codigo_registro_id;
		expect((await pedirConsulta(servidor, "admin.codigo_registro", { codigo_registro_id: id }, "admin")).estado).toBe(
			403,
		);
		const leido = await pedirConsulta(servidor, "admin.codigo_registro", { codigo_registro_id: id }, "duena");
		expect(leido.cuerpo.resultado).toEqual({ estado: "vigente", nombre: "Tablet nueva", dispositivo_id: null });
		await servidor.base.dueno.query(
			"UPDATE codigos_registro SET vence_en = now() - interval '1 minute' WHERE id = $1",
			[id],
		);
		const vencido = await pedirConsulta(servidor, "admin.codigo_registro", { codigo_registro_id: id }, "duena");
		expect(vencido.cuerpo.resultado).toMatchObject({ estado: "vencido" });
	});

	/** El id de una ubicación por su código. */
	async function ubicacionDe(codigo: string): Promise<string> {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = $1", [codigo]);
		return String(rows[0]?.id);
	}

	it("los registrados: sin la credencial; la sincronización, la llave pública, el reloj desfasado y los apartados", async () => {
		await servidor.base.dueno.query(
			`UPDATE dispositivos_sync SET ultima_sincronizacion_en = now() - interval '5 hours', desfase_reloj_seg = 1200
			 WHERE dispositivo_id = $1`,
			[tablet],
		);
		await apartar(tablet, "falta_documento");
		const leidos = await dispositivos("admin");
		expect(leidos.es_duena).toBe(false);
		expect(leidos.registrados.map((uno) => uno.nombre)).not.toContain("uniformame.mx");
		const deLaTablet = leidos.registrados.find((uno) => uno.dispositivo_id === tablet);
		expect(deLaTablet).toMatchObject({
			tipo_texto: "Tablet del taller",
			ubicacion: "Taller",
			sincronizacion: { texto: "hace 5 h", tono: "rojo" },
			llave_id: "pr·ueba21",
			reloj_desfasado: true,
			apartados: 1,
		});
		const delPuente = leidos.registrados.find((uno) => uno.dispositivo_id === puente);
		expect(delPuente?.tipo_texto).toBe("Programa de impresión");
		expect(delPuente?.sincronizacion.texto).toMatch(/^Último contacto hace \d+ min$/);
		// Nunca viaja una llave secreta ni su hash.
		const crudo = JSON.stringify(leidos);
		const { rows } = await servidor.base.dueno.query("SELECT llave_hash FROM dispositivos WHERE id = $1", [tablet]);
		expect(crudo).not.toContain(String(rows[0]?.llave_hash));
		// Dónde se usa: la tablet en el Taller; el teléfono en Aduana o Bodega.
		expect(leidos.donde_se_usa).toContainEqual(expect.objectContaining({ nombre: "Taller", tipo: "tablet_taller" }));
		expect(leidos.donde_se_usa).toContainEqual(expect.objectContaining({ tipo: "telefono_escanear" }));
	});

	it("los revocados, con su motivo y lo que llegó después de revocar", async () => {
		await servidor.base.dueno.query(
			`UPDATE dispositivos SET baja_en = now(), baja_por = '01936f2e-0000-7000-8000-000000000001',
				motivo_baja = 'Se perdió', baja_confirmado_con_google_en = now() WHERE id = $1`,
			[puente],
		);
		await apartar(puente, "dispositivo_revocado", true);
		const leidos = await dispositivos("duena");
		expect(leidos.es_duena).toBe(true);
		expect(leidos.registrados.some((uno) => uno.dispositivo_id === puente)).toBe(false);
		expect(leidos.revocados).toContainEqual(
			expect.objectContaining({ nombre: "Puente de Aduana", motivo: "Se perdió", despues_de_revocar: 1 }),
		);
	});

	it("los apartados de un aparato, el más nuevo arriba; los descartados solo si se piden", async () => {
		const primero = await apartar(tablet, "falta_documento");
		const descartado = await apartar(tablet, "falta_documento");
		await servidor.base.dueno.query(
			`UPDATE comandos_recibidos SET descartado_en = now(), descartado_por = '01936f2e-0000-7000-8000-000000000001',
				motivo_descarte = 'Ya se capturó a mano' WHERE id = $1`,
			[descartado],
		);
		const sinDescartados = await pedirConsulta(
			servidor,
			"admin.comandos_apartados",
			{ dispositivo_id: tablet },
			"admin",
		);
		expect(sinDescartados.estado, JSON.stringify(sinDescartados.cuerpo)).toBe(200);
		const leidos = sinDescartados.cuerpo.resultado as {
			nombre: string;
			es_duena: boolean;
			renglones: { comando_id: string; accion: string; descartado: string | null }[];
		};
		expect(leidos).toMatchObject({ nombre: "Tablet del taller", es_duena: false });
		expect(leidos.renglones.map((renglon) => renglon.comando_id)).toContain(primero);
		expect(leidos.renglones.map((renglon) => renglon.comando_id)).not.toContain(descartado);
		const conDescartados = await pedirConsulta(
			servidor,
			"admin.comandos_apartados",
			{ dispositivo_id: tablet, incluir_descartados: "si" },
			"admin",
		);
		const todos = (conDescartados.cuerpo.resultado as typeof leidos).renglones;
		expect(todos.find((renglon) => renglon.comando_id === descartado)?.descartado).toBe(
			"Descartado: Ya se capturó a mano",
		);
	});
});
