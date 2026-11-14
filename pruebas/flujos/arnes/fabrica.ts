/**
 * El arnés de los flujos de punta a punta: la fábrica entera para una prueba. Levanta la API real con los datos de la
 * muestra (Postgres de Testcontainers, avisos en vivo), el worker con su reloj, los simuladores de Resend y R2, y, cuando
 * el flujo los pide, la tablet en un Chrome emulado, los puentes de Aduana y del Taller con su Zebra de mentira y la web.
 * Da las cuentas de la muestra, la credencial del sitio y las revisiones de lo que tiene que cuadrar.
 * Fase 21 · docs/fases/21-pruebas-de-punta-a-punta.md (parte 1) y docs/cimientos/PRUEBAS.md («Flujos de punta a punta y
 * temporada simulada»)
 *
 * Un flujo usa lo que usaría la gente: la API con las cuentas, la tablet y el puente. Para revisar lo que quedó, `leer`
 * consulta la base en una transacción de solo lectura: ningún flujo escribe por su lado.
 *
 * Uso: `const fabrica = await levantarFabrica()`; `fabrica.como("rosa").accion("ventas.confirmar_pedido", datos)`; al
 * final, `await fabrica.revisar.todo()` y `await fabrica.cerrar()`.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { setupServer } from "msw/node";
import { crearAlmacen, cubos, direccionDeR2 } from "../../../apps/api/src/nucleo/almacen.ts";
import { crearEnvioConResend } from "../../../apps/api/src/nucleo/correo.ts";
import { llaveDePrueba, quienesDePrueba } from "../../../apps/api/src/nucleo/pruebas/cuentas-de-prueba.ts";
import {
	crearServidorDePrueba,
	dominios,
	type ServidorDePrueba,
} from "../../../apps/api/src/nucleo/pruebas/servidor-de-prueba.ts";
import {
	type CuadreDeLaNoche,
	crearTrabajadorDePrueba,
	type TrabajadorDePrueba,
} from "../../../apps/api/src/nucleo/pruebas/trabajador-de-prueba.ts";
import { armarPuente, type PuenteArmado } from "../../../apps/puente/src/de-prueba.ts";
import { atenderTrabajos } from "../../../apps/puente/src/trabajos.ts";
import { levantarTablet, type TabletDePrueba, tabletLista } from "../../../apps/tablet/src/pruebas/tablet-de-prueba.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../../apps/web/src/comun/pruebas/pantalla-de-prueba.ts";
import { crearSimuladorDeR2 } from "../../simuladores/r2.ts";
import { type CorreoEnviado, crearSimuladorDeResend } from "../../simuladores/resend.ts";
import { levantarZebraDeMentira, type ZebraDeMentira } from "../../simuladores/zebra.ts";
import { type Cuenta, crearCuenta } from "./cuentas.ts";
import { type Consultar, crearRevisiones, type Revisiones } from "./revisiones.ts";

/** La cuenta de R2 del almacén de la fábrica. */
const cuentaDelAlmacen = "fabricaprueba";

/** Un puente de la fábrica: el de Aduana o el del Taller, con su Zebra de mentira. */
export interface PuenteDeLaFabrica {
	zebra: ZebraDeMentira;
	/** Sus piezas, su configuración, sus llamadas y cómo cortarle la red. */
	armado: PuenteArmado;
	/** El id de su impresora. */
	impresoraId: string;
	/** Una vuelta del puente: termina su diario, pide sus trabajos, los imprime y los confirma. */
	atender: () => Promise<void>;
}

/** La tablet de la fábrica. */
export interface TabletDeLaFabrica {
	/** El arnés de la tablet sobre la API de la fábrica: abrir, códigos, PIN. */
	prueba: TabletDePrueba;
	/** Una tablet nueva, registrada con el código de la dueña y con su foto completa. */
	lista: () => Promise<{ pagina: Page; contexto: BrowserContext }>;
}

/** La fábrica de una prueba. */
export interface Fabrica {
	servidor: ServidorDePrueba;
	/** La dirección donde escucha la API. */
	api: string;
	/**
	 * Una cuenta de la muestra o de prueba: `duena` (Carmen), `rosa` (la oficina), `javier` (Aduana y Bodega), `tomas`
	 * (el taller), `soporte`, o una de un solo departamento (`ventas`, `aduana`…).
	 */
	como: (nombre: string) => Cuenta;
	/** uniformame.mx, con su credencial. */
	sitio: Cuenta;
	/** El worker, con su reloj. */
	trabajador: TrabajadorDePrueba;
	/** Los correos que salieron por Resend. */
	correos: CorreoEnviado[];
	/** Lee la base en una transacción de solo lectura. */
	leer: Consultar;
	/** Lo que tiene que cuadrar. */
	revisar: Revisiones;
	/** El cuadre de la primera noche, la de los datos de la muestra, antes del flujo. */
	cuadreDeLaMuestra: CuadreDeLaNoche;
	/** La tablet del taller (se levanta la primera vez que se pide). */
	tablet: () => Promise<TabletDeLaFabrica>;
	/** El puente de Aduana o el del Taller (se levanta la primera vez que se pide). */
	puente: (cual: "aduana" | "taller") => Promise<PuenteDeLaFabrica>;
	/** La web (se levanta la primera vez que se pide). */
	web: () => Promise<PantallaDePrueba>;
	cerrar: () => Promise<void>;
}

/** Cada puente de prueba: su aparato, su ubicación y el nombre de su Zebra. */
const puentes = {
	aduana: { aparato: "puente", ubicacion: "ADU", impresora: "Zebra Aduana" },
	taller: { aparato: "otro_puente", ubicacion: "TAL", impresora: "Zebra Taller" },
} as const;

/** Levanta la fábrica: la API, el worker y los simuladores; la primera noche asienta los datos de la muestra. */
export async function levantarFabrica(): Promise<Fabrica> {
	const resend = crearSimuladorDeResend();
	const r2 = crearSimuladorDeR2(cuentaDelAlmacen);
	const red = setupServer(...resend.manejadores, ...r2.manejadores);
	red.listen({ onUnhandledFrame: "bypass" });
	const almacen = crearAlmacen({
		direccion: direccionDeR2(cuentaDelAlmacen),
		cubo: cubos.archivos,
		llaveId: "llave-de-la-fabrica",
		secreto: "secreto-de-la-fabrica",
	});
	const servidor = await crearServidorDePrueba({ avisosEnVivo: { latidoMs: 60_000, alcanceReal: true }, almacen });
	const api = await servidor.app.listen({ host: "127.0.0.1", port: 0 });
	const trabajador = crearTrabajadorDePrueba(servidor, {
		enviarCorreo: crearEnvioConResend("re_de_la_fabrica"),
		almacen,
		dominioWeb: dominios.DOMINIO_WEB,
	});
	const leer: Consultar = async (texto, valores = []) => {
		const cliente = await servidor.base.dueno.connect();
		try {
			await cliente.query("BEGIN TRANSACTION READ ONLY");
			const { rows } = await cliente.query(texto, valores);
			return rows;
		} finally {
			await cliente.query("ROLLBACK");
			cliente.release();
		}
	};
	const como = (nombre: string): Cuenta => {
		const quien = quienesDePrueba[nombre];
		if (quien === undefined) throw new Error(`no hay cuenta de prueba ${nombre}`);
		return crearCuenta(servidor, nombre, quien);
	};
	const sitioQuien = quienesDePrueba.sitio;
	if (sitioQuien === undefined) throw new Error("no hay credencial del sitio");
	const sitio = crearCuenta(servidor, "sitio", sitioQuien, { authorization: llaveDePrueba("sitio") });
	const revisar = crearRevisiones(leer, trabajador);
	// La primera noche: lo que la muestra tenga a medias amanece en su cuadre, y el flujo empieza desde ahí.
	const cuadreDeLaMuestra = await trabajador.noche();

	let tablet: Promise<TabletDeLaFabrica> | undefined;
	let web: Promise<PantallaDePrueba> | undefined;
	const deLosPuentes = new Map<"aduana" | "taller", Promise<PuenteDeLaFabrica & { carpeta: string }>>();
	const levantarPuente = async (cual: "aduana" | "taller"): Promise<PuenteDeLaFabrica & { carpeta: string }> => {
		const datos = puentes[cual];
		const aparato = quienesDePrueba[datos.aparato];
		if (aparato?.tipo !== "aparato") throw new Error(`no hay aparato ${datos.aparato}`);
		const [ubicacion] = await leer("SELECT id FROM ubicaciones WHERE codigo = $1", [datos.ubicacion]);
		const alta = await como("duena").accion("admin.guardar_impresora", {
			nombre: datos.impresora,
			modelo: "ZD421",
			ubicacion_id: ubicacion?.id,
			dispositivo_id: aparato.dispositivoId,
		});
		if (alta.estado !== 200) throw new Error(`no se dio de alta ${datos.impresora}: ${JSON.stringify(alta.cuerpo)}`);
		const [impresora] = await leer("SELECT id FROM impresoras WHERE nombre = $1", [datos.impresora]);
		const zebra = await levantarZebraDeMentira();
		const carpeta = await mkdtemp(join(tmpdir(), `puente-${cual}-`));
		const armado = await armarPuente({ api, aparato: datos.aparato, zebra: zebra.direccion, carpeta });
		return {
			zebra,
			armado,
			impresoraId: String(impresora?.id),
			atender: () => atenderTrabajos(armado.piezas),
			carpeta,
		};
	};

	return {
		servidor,
		api,
		como,
		sitio,
		trabajador,
		correos: resend.correos,
		leer,
		revisar,
		cuadreDeLaMuestra,
		tablet: () => {
			tablet ??= levantarTablet({ servidor: { servidor, api } }).then((prueba) => ({
				prueba,
				lista: () => tabletLista(prueba),
			}));
			return tablet;
		},
		puente: (cual) => {
			const ya = deLosPuentes.get(cual) ?? levantarPuente(cual);
			deLosPuentes.set(cual, ya);
			return ya;
		},
		web: () => {
			web ??= levantarPantalla({ servidor: { servidor, api } });
			return web;
		},
		cerrar: async () => {
			for (const puente of deLosPuentes.values()) {
				const { zebra, carpeta } = await puente;
				await zebra.cerrar();
				await rm(carpeta, { recursive: true, force: true });
			}
			if (tablet !== undefined) await (await tablet).prueba.cerrar();
			if (web !== undefined) await (await web).cerrar();
			await servidor.cerrar();
			red.close();
		},
	};
}
