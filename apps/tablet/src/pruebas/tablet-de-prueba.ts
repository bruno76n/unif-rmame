/**
 * El arnés de las pruebas de la tablet: la API de prueba con los datos de la muestra, la tablet con Vite (su proxy
 * apunta a esa API) y un Chrome que emula una tablet Android en horizontal. Abre la página de las pruebas por dentro
 * (`src/pruebas/vacia.html`) o la tablet entera, y da lo que las pruebas piden al servidor: un código de registro, una
 * persona del Taller con su PIN, lo de un bulto en proceso, una máquina, un consumible.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md («La tablet se prueba con Playwright en un Chrome que
 * emula una tablet Android, contra la API real con los datos de la muestra, quitándole la red a media captura»)
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContext, chromium, devices, type Page } from "@playwright/test";
import { v7 as uuidv7 } from "uuid";
import { createServer, type ViteDevServer } from "vite";
import { z } from "zod";
import { opcionesDeChromium } from "../../../../pruebas/navegador/chromium.ts";
import { conGoogle, mandarAccion } from "../../../api/src/nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../api/src/nucleo/pruebas/servidor-de-prueba.ts";

/** La carpeta de la tablet. */
const tablet = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Lo que da el arnés. */
export interface TabletDePrueba {
	servidor: ServidorDePrueba;
	/** Abre la tablet en un contexto nuevo (su base vacía): la página de las pruebas por dentro, o la tablet entera. */
	abrir: (ruta?: string) => Promise<{ pagina: Page; contexto: BrowserContext }>;
	/** Un código de registro de la dueña para una tablet del Taller. */
	codigo: () => Promise<string>;
	/** Una consulta con el rol dueño. */
	consultar: (texto: string, valores?: unknown[]) => Promise<Record<string, unknown>[]>;
	cerrar: () => Promise<void>;
}

/**
 * Levanta la API, la tablet y el navegador.
 * @param opciones Los avisos en vivo, para las pruebas que los usan.
 */
export async function levantarTablet(opciones: { avisosEnVivo?: boolean } = {}): Promise<TabletDePrueba> {
	const servidor = await crearServidorDePrueba(
		opciones.avisosEnVivo === true ? { avisosEnVivo: { latidoMs: 60_000, alcanceReal: true } } : {},
	);
	process.env.UNIFORMAME_API = await servidor.app.listen({ host: "127.0.0.1", port: 0 });
	const vite: ViteDevServer = await createServer({
		root: tablet,
		configFile: join(tablet, "vite.config.ts"),
		logLevel: "error",
		server: { host: "127.0.0.1", port: 0 },
	});
	await vite.listen();
	const direccion = vite.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? "";
	const navegador: Browser = await chromium.launch(opcionesDeChromium());
	const consultar = async (texto: string, valores: unknown[] = []) =>
		(await servidor.base.dueno.query(texto, valores)).rows;
	return {
		servidor,
		abrir: async (ruta = "/src/pruebas/vacia.html") => {
			const contexto = await navegador.newContext({
				...devices["Galaxy Tab S4 landscape"],
				locale: "es-MX",
				timezoneId: "America/Mexico_City",
			});
			const pagina = await contexto.newPage();
			await pagina.goto(`${direccion}${ruta}`);
			if (ruta.endsWith("vacia.html")) await pagina.waitForFunction(() => "porDentro" in window);
			return { pagina, contexto };
		},
		codigo: async () => {
			const [taller] = await consultar("SELECT id FROM ubicaciones WHERE codigo = 'TAL'");
			const generado = await mandarAccion(
				servidor,
				"admin.generar_codigo_registro",
				{ datos: { nombre: "Tablet de prueba", tipo: "tablet_taller", ubicacion_id: taller?.id } },
				"duena",
				conGoogle(),
			);
			if (generado.estado !== 200) throw new Error(JSON.stringify(generado.cuerpo));
			return z.object({ codigo: z.string() }).parse(generado.cuerpo.resultado).codigo;
		},
		consultar,
		cerrar: async () => {
			await navegador.close();
			await vite.close();
			await servidor.cerrar();
		},
	};
}

/**
 * Una persona del Taller sin PIN, a la que Personal le da uno: su id y el PIN en claro.
 * @param prueba El arnés.
 */
export async function personaConPin(prueba: TabletDePrueba): Promise<{ personaId: string; pin: string }> {
	const [persona] = await prueba.consultar(
		`SELECT p.id FROM personas p WHERE p.area = 'taller' AND p.baja_en IS NULL
		   AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.persona_id = p.id)
		   AND NOT EXISTS (SELECT 1 FROM pines x WHERE x.persona_id = p.id)
		 ORDER BY p.nombre LIMIT 1`,
	);
	const personaId = z.uuid().parse(persona?.id);
	const asignado = await mandarAccion(
		prueba.servidor,
		"personal.asignar_pin",
		{ datos: { persona_id: personaId } },
		"personal",
	);
	if (asignado.estado !== 200) throw new Error(JSON.stringify(asignado.cuerpo));
	return { personaId, pin: z.object({ pin: z.string() }).parse(asignado.cuerpo.resultado).pin };
}

/**
 * Lo de un bulto del lote en proceso de la muestra: el bulto y una operación de su flujo que no es el corte.
 * @param prueba El arnés.
 * @param cual Cuál de sus bultos (0 el primero).
 */
export async function bultoEnProceso(
	prueba: TabletDePrueba,
	cual = 0,
): Promise<{ bultoId: string; folio: string; flujoOperacionId: string }> {
	const filas = await prueba.consultar(
		`SELECT b.id AS bulto_id, b.folio, fo.id AS flujo_operacion_id
		 FROM bultos b JOIN lotes l ON l.id = b.lote_id
		 JOIN flujo_operaciones fo ON fo.flujo_id = l.flujo_id JOIN operaciones o ON o.id = fo.operacion_id
		 WHERE l.estado = 'en_proceso' AND NOT o.es_corte
		 ORDER BY b.numero, fo.orden LIMIT 1 OFFSET $1`,
		[cual],
	);
	const fila = z.object({ bulto_id: z.uuid(), folio: z.string(), flujo_operacion_id: z.uuid() }).parse(filas[0]);
	return { bultoId: fila.bulto_id, folio: fila.folio, flujoOperacionId: fila.flujo_operacion_id };
}

/**
 * Una máquina activa sin falla abierta y un motivo que no la detiene.
 * @param prueba El arnés.
 */
export async function maquinaYMotivo(prueba: TabletDePrueba): Promise<{ maquinaId: string; motivoId: string }> {
	const [maquina] = await prueba.consultar(
		`SELECT m.id FROM maquinas m WHERE m.baja_en IS NULL
		 AND NOT EXISTS (SELECT 1 FROM fallas f WHERE f.maquina_id = m.id AND f.estado <> 'resuelta') ORDER BY m.folio LIMIT 1`,
	);
	const [motivo] = await prueba.consultar(
		"SELECT id FROM motivos_falla WHERE NOT detiene_maquina ORDER BY orden LIMIT 1",
	);
	return { maquinaId: z.uuid().parse(maquina?.id), motivoId: z.uuid().parse(motivo?.id) };
}

/**
 * Un consumible activo.
 * @param prueba El arnés.
 */
export async function consumible(prueba: TabletDePrueba): Promise<string> {
	const [material] = await prueba.consultar(
		"SELECT id FROM materiales WHERE tipo = 'consumible' AND baja_en IS NULL ORDER BY nombre LIMIT 1",
	);
	return z.uuid().parse(material?.id);
}

/**
 * Una tablet nueva, registrada con su código y con su foto completa.
 * @param prueba El arnés.
 */
export async function tabletLista(prueba: TabletDePrueba): Promise<{ pagina: Page; contexto: BrowserContext }> {
	const abierta = await prueba.abrir();
	const registro = await abierta.pagina.evaluate((codigo) => window.porDentro.registrar(codigo), await prueba.codigo());
	if (!registro.registrada) throw new Error(registro.mensaje);
	const foto = await abierta.pagina.evaluate(() => window.porDentro.bajarFoto());
	if (!foto.ok) throw new Error(foto.error);
	return abierta;
}

/**
 * Un registro de operación como lo guarda la tablet: el comando de su cola y el renglón que nace con él en la copia.
 * @param datos El bulto, la operación, la persona y las piezas buenas.
 */
export function registroDeOperacion(datos: {
	id: string;
	bultoId: string;
	flujoOperacionId: string;
	personaId: string;
	buenas: number;
}) {
	const registro = {
		id: datos.id,
		bulto_id: datos.bultoId,
		flujo_operacion_id: datos.flujoOperacionId,
		piezas_buenas: datos.buenas,
		piezas_danadas: 0,
	};
	return {
		accion: "produccion.registrar_operacion",
		datos: { ...registro, sin_internet: false },
		persona_id: datos.personaId,
		renglones: [
			{
				tabla: "registros_operacion" as const,
				renglon: {
					...registro,
					persona_id: datos.personaId,
					hecho_en: new Date().toISOString(),
					estado: "vigente",
					origen: "tablet",
				},
			},
		],
	};
}

/**
 * Lo que captura una persona sin internet: un registro de operación, una falla de máquina y un consumible tomado, con
 * los renglones que nacen en la copia.
 * @param prueba El arnés.
 * @param personaId Quien estaba adentro.
 * @param cual Cuál bulto del lote en proceso.
 */
export async function capturasDePrueba(prueba: TabletDePrueba, personaId: string, cual: number) {
	const bulto = await bultoEnProceso(prueba, cual);
	const { maquinaId, motivoId } = await maquinaYMotivo(prueba);
	const material = await consumible(prueba);
	const ids = { registro: uuidv7(), falla: uuidv7(), toma: uuidv7() };
	return {
		ids,
		material,
		encolados: [
			registroDeOperacion({
				id: ids.registro,
				bultoId: bulto.bultoId,
				flujoOperacionId: bulto.flujoOperacionId,
				personaId,
				buenas: 4,
			}),
			{
				accion: "produccion.tomar_consumible",
				datos: { id: ids.toma, renglones: [{ material_id: material, cantidad: 2 }] },
				persona_id: personaId,
			},
			{
				accion: "mantenimiento.reportar_falla",
				datos: { id: ids.falla, maquina_id: maquinaId, motivo_falla_id: motivoId, sin_internet: true },
				persona_id: personaId,
				renglones: [
					{
						tabla: "fallas" as const,
						renglon: {
							id: ids.falla,
							maquina_id: maquinaId,
							motivo_falla_id: motivoId,
							estado: "reportada",
							hecho_en: new Date().toISOString(),
						},
					},
				],
			},
		],
	};
}

/**
 * Baja hasta que llegue lo que se espera. Lo escrito en el servidor baja cuando el tope seguro lo pasa, y el tope espera a
 * las transacciones abiertas de todo el Postgres: con muchas pruebas a la vez puede tardar unas vueltas.
 * @param pagina La tablet.
 * @param llego Si ya llegó lo que se espera.
 */
export async function bajarHasta(pagina: Page, llego: () => Promise<boolean>): Promise<void> {
	for (let vuelta = 0; vuelta < 80; vuelta++) {
		const bajada = await pagina.evaluate(() => window.porDentro.bajar());
		if (!bajada.ok) throw new Error(bajada.error);
		if (await llego()) return;
		await new Promise((listo) => setTimeout(listo, 250));
	}
	throw new Error("lo que se esperaba nunca bajó");
}
