/**
 * Prueba de las pantallas de la tablet, con Playwright en un Chrome de tablet Android contra la API real con la muestra:
 * registrarla con su código, «¿Quién eres?» y el PIN, el inicio con «Bultos para ti», registrar una operación, escanear un
 * bulto, sin internet, falla de máquina, tomar consumible, salir y las pantallas del aparato. Cada botón guarda su acción
 * en la cola y el aviso dice lo que dice la guía. Las capturas van a `.revision/capturas/tablet/` para el revisor de
 * diseño.
 * Fase 20 · docs/interfaz/tablet.md y docs/fases/20-tablet-puente-de-impresion-e-impresos.md (parte 5)
 */

import type { Page } from "@playwright/test";
import { expect as enPantalla } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { conGoogle, mandarAccion } from "../../../api/src/nucleo/pruebas/llamadas.ts";
import { capturar, levantarTablet, personaDeBaseConPin, type TabletDePrueba } from "../pruebas/tablet-de-prueba.ts";

/** Lo que tarda una pantalla en llegar: la foto completa baja al registrar. */
const espera = { timeout: 30_000 };

describe("las pantallas de la Puerta del taller", () => {
	let prueba: TabletDePrueba;
	beforeAll(async () => {
		prueba = await levantarTablet();
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	/**
	 * Registra la tablet desde su pantalla, con un código que no sirve y luego con el bueno.
	 * @param pagina La tablet.
	 */
	async function registrarDesdeLaPantalla(pagina: Page): Promise<void> {
		await enPantalla(pagina.getByRole("heading", { name: "Registrar esta tablet" })).toBeVisible(espera);
		await capturar(pagina, "registrar-tablet");
		const casilla = pagina.getByLabel("Escribe el código que te dio la dueña");
		await casilla.fill("ZZZ-999");
		await pagina.getByRole("button", { name: "Registrar" }).click();
		await enPantalla(pagina.getByText("Ese código no existe o ya venció. Pide otro a la dueña.")).toBeVisible();
		await casilla.fill(await prueba.codigo());
		await pagina.getByRole("button", { name: "Registrar" }).click();
	}

	it("la tablet se registra, la persona entra con su PIN y registra una operación de «Bultos para ti»", async () => {
		const { pin, nombre } = await personaDeBaseConPin(prueba);
		const pila = nombre.split(" ")[0] ?? nombre;
		const { pagina, contexto } = await prueba.abrir("/");
		await registrarDesdeLaPantalla(pagina);
		await enPantalla(pagina.getByRole("heading", { name: "¿Quién eres?" })).toBeVisible(espera);
		await capturar(pagina, "quien-eres");
		await pagina.getByRole("button", { name: nombre }).click();
		await enPantalla(pagina.getByRole("heading", { name: `${pila}, tu PIN` })).toBeVisible();
		const otro = pin === "0000" ? "1111" : "0000";
		for (const cifra of otro) await pagina.getByRole("button", { name: cifra, exact: true }).click();
		await enPantalla(pagina.getByText("PIN equivocado · 4 intentos más")).toBeVisible();
		await capturar(pagina, "pin-equivocado");
		for (const cifra of pin) await pagina.getByRole("button", { name: cifra, exact: true }).click();
		await enPantalla(pagina.getByText("Hoy llevas")).toBeVisible();
		await enPantalla(pagina.getByRole("heading", { name: "Bultos para ti" })).toBeVisible();
		await capturar(pagina, "inicio");
		// El primer bulto que le espera: abre su operación con «Buenas» igual a las listas.
		const tarjeta = pagina.getByRole("button", { name: /^B-\d{4}-/ }).first();
		const folio = z.string().parse((await tarjeta.innerText()).split("\n")[0]);
		await tarjeta.click();
		await enPantalla(pagina.getByText("Tope")).toBeVisible();
		await capturar(pagina, "registrar-operacion");
		const registrar = pagina.getByRole("button", { name: /^Registrar \d+ piezas?$/ });
		await pagina.getByRole("button", { name: "Más buenas" }).click();
		await enPantalla(
			pagina.getByText(/^No puede pasar de \d+: es lo que salió de la operación anterior$/),
		).toBeVisible();
		await enPantalla(registrar).toBeDisabled();
		await pagina.getByRole("button", { name: "Menos buenas" }).click();
		await pagina.getByRole("button", { name: "Menos buenas" }).click();
		await pagina.getByRole("button", { name: "Más dañadas" }).click();
		await registrar.click();
		await enPantalla(
			pagina.getByRole("status").filter({ hasText: new RegExp(`registradas en ${folio}, 1 dañadas$`) }),
		).toBeVisible();
		await enPantalla(pagina.getByText("Hoy llevas")).toBeVisible();
		await contexto.close();
	});

	/**
	 * Abre la tablet, la registra y entra con el PIN de una persona de base.
	 * @returns La tablet, su contexto y la persona.
	 */
	async function adentro() {
		const persona = await personaDeBaseConPin(prueba);
		const { pagina, contexto } = await prueba.abrir("/");
		await pagina.getByLabel("Escribe el código que te dio la dueña").fill(await prueba.codigo(), espera);
		await pagina.getByRole("button", { name: "Registrar" }).click();
		await pagina.getByRole("button", { name: persona.nombre }).click(espera);
		for (const cifra of persona.pin) await pagina.getByRole("button", { name: cifra, exact: true }).click();
		await enPantalla(pagina.getByText("Hoy llevas")).toBeVisible();
		return { pagina, contexto, ...persona };
	}

	/** El aviso de abajo con un texto. */
	const aviso = (pagina: Page, texto: string | RegExp) => pagina.getByRole("status").filter({ hasText: texto });

	it("sin internet escanea un bulto y lo registra: se guarda en la tablet y al volver la red se envía", async () => {
		const { pagina, contexto } = await adentro();
		const [bulto] = await prueba.consultar(
			"SELECT b.folio FROM bultos b JOIN lotes l ON l.id = b.lote_id WHERE l.estado = 'en_proceso' ORDER BY b.numero DESC LIMIT 1",
		);
		await contexto.setOffline(true);
		await enPantalla(pagina.getByText("Sin internet", { exact: true })).toBeVisible(espera);
		await pagina.getByRole("button", { name: "Escanear bulto" }).click();
		await enPantalla(pagina.getByText("Sin cámara: escribe el código o usa el lector")).toBeVisible();
		const casilla = pagina.getByLabel("Código del bulto");
		await casilla.fill("A-2026-0001");
		await casilla.press("Enter");
		await enPantalla(pagina.getByText("Esa etiqueta no es de un bulto")).toBeVisible();
		await casilla.fill("B-2026-999-99");
		await casilla.press("Enter");
		await enPantalla(pagina.getByText("No hay un bulto con ese código")).toBeVisible();
		await capturar(pagina, "escanear");
		await casilla.fill(String(bulto?.folio).toLowerCase());
		await casilla.press("Enter");
		await enPantalla(pagina.getByText("Tope")).toBeVisible();
		await pagina.getByRole("button", { name: /^Registrar \d+ piezas?$/ }).click();
		await enPantalla(aviso(pagina, /guardadas en la tablet\. Se envían al volver el internet$/)).toBeVisible();
		await enPantalla(pagina.getByText("Sin internet · 1 captura guardada aquí")).toBeVisible();
		await enPantalla(pagina.getByText("guardada aquí", { exact: false }).last()).toBeVisible();
		await capturar(pagina, "sin-internet");
		await contexto.setOffline(false);
		await enPantalla(aviso(pagina, "1 captura enviada al volver el internet")).toBeVisible(espera);
		await enPantalla(pagina.getByText("Conectada")).toBeVisible();
		await contexto.close();
	});

	it("falla de máquina: escoge la máquina y lo que le pasa; ya reportada, no muestra los motivos", async () => {
		const { pagina, contexto } = await adentro();
		await pagina.getByRole("button", { name: "Falla de máquina" }).click();
		await enPantalla(pagina.getByRole("heading", { name: "¿Qué máquina?" })).toBeVisible();
		await capturar(pagina, "que-maquina");
		const [maquina] = await prueba.consultar(
			`SELECT m.nombre FROM maquinas m WHERE m.baja_en IS NULL
			 AND NOT EXISTS (SELECT 1 FROM fallas f WHERE f.maquina_id = m.id AND f.estado <> 'resuelta') ORDER BY m.nombre LIMIT 1`,
		);
		const nombre = String(maquina?.nombre);
		await pagina
			.getByRole("button", { name: new RegExp(`^${nombre}`) })
			.first()
			.click();
		await enPantalla(pagina.getByRole("heading", { name: `${nombre}: ¿qué le pasa?` })).toBeVisible();
		await capturar(pagina, "que-le-pasa");
		const [motivo] = await prueba.consultar("SELECT nombre FROM motivos_falla ORDER BY orden LIMIT 1");
		await pagina.getByRole("button", { name: String(motivo?.nombre), exact: true }).click();
		await enPantalla(
			aviso(pagina, `Falla de ${nombre} enviada a Mantenimiento: ${String(motivo?.nombre).toLowerCase()}`),
		).toBeVisible();
		await pagina.getByRole("button", { name: "Falla de máquina" }).click();
		await enPantalla(
			pagina.getByRole("button", { name: new RegExp(`^${nombre}.*Reportada desde hoy`) }).first(),
		).toBeVisible();
		await pagina
			.getByRole("button", { name: new RegExp(`^${nombre}`) })
			.first()
			.click();
		await enPantalla(pagina.getByText(/^Ya está reportada: /)).toBeVisible();
		await pagina.getByRole("button", { name: "Otra máquina" }).click();
		await enPantalla(pagina.getByRole("heading", { name: "¿Qué máquina?" })).toBeVisible();
		await contexto.close();
	});

	it("tomar consumible: «Tomar» se enciende con algo arriba de cero y el aviso dice lo que tomó", async () => {
		const { pagina, contexto } = await adentro();
		await pagina.getByRole("button", { name: "Tomar consumible" }).click();
		await enPantalla(pagina.getByRole("heading", { name: "¿Qué tomas?" })).toBeVisible();
		const tomar = pagina.getByRole("button", { name: "Tomar", exact: true });
		await enPantalla(tomar).toBeDisabled();
		const [material] = await prueba.consultar(
			"SELECT nombre, coalesce(unidad_tablet, unidad) AS unidad_tablet FROM materiales WHERE tipo = 'consumible' AND baja_en IS NULL ORDER BY nombre LIMIT 1",
		);
		const mas = pagina.getByRole("button", { name: `Más ${String(material?.nombre).toLowerCase()}` });
		await mas.click();
		await mas.click();
		await capturar(pagina, "que-tomas");
		await tomar.click();
		await enPantalla(
			aviso(pagina, `Tomaste 2 ${String(material?.unidad_tablet)}. Se descuenta del taller`),
		).toBeVisible();
		await contexto.close();
	});

	it("«Salir» regresa a «¿Quién eres?»; a los cinco PIN equivocados queda «Bloqueado»", async () => {
		const { pagina, contexto, nombre, pin } = await adentro();
		await pagina.getByRole("button", { name: "Salir" }).click();
		await enPantalla(pagina.getByRole("heading", { name: "¿Quién eres?" })).toBeVisible();
		await pagina.getByRole("button", { name: nombre }).click();
		const otro = pin === "0000" ? "1111" : "0000";
		for (let vez = 0; vez < 5; vez++) {
			for (const cifra of otro) await pagina.getByRole("button", { name: cifra, exact: true }).click();
		}
		await enPantalla(pagina.getByText("Bloqueado: pide al encargado que lo desbloquee en Personal")).toBeVisible();
		await pagina.getByRole("button", { name: /^No soy / }).click();
		await enPantalla(pagina.getByRole("button", { name: new RegExp(`^.*${nombre}.*Bloqueado`) })).toBeDisabled();
		await capturar(pagina, "quien-eres-bloqueado");
		await contexto.close();
	});

	it("las pantallas del aparato: revocada y por actualizar", async () => {
		const { pagina, contexto } = await adentro();
		prueba.servidor.parametros.versionMinima = "2.0.0";
		try {
			await contexto.setOffline(true);
			await contexto.setOffline(false);
			await enPantalla(
				pagina.getByRole("heading", { name: "Hay una versión nueva. Actualiza para seguir." }),
			).toBeVisible(espera);
			await capturar(pagina, "actualizar");
		} finally {
			prueba.servidor.parametros.versionMinima = "1.0.0";
		}
		await pagina.getByRole("button", { name: "Actualizar" }).click();
		await enPantalla(pagina.getByRole("heading", { name: "¿Quién eres?" })).toBeVisible(espera);
		const [aparato] = await prueba.consultar(
			"SELECT id, version FROM dispositivos WHERE tipo = 'tablet_taller' ORDER BY creado_en DESC LIMIT 1",
		);
		const revocado = await mandarAccion(
			prueba.servidor,
			"admin.revocar_dispositivo",
			{
				datos: { dispositivo_id: z.uuid().parse(aparato?.id), motivo: "Se cambió la tablet", anular_pines: false },
				version: Number(aparato?.version),
			},
			"duena",
			conGoogle(),
		);
		expect(revocado.estado).toBe(200);
		await contexto.setOffline(true);
		await contexto.setOffline(false);
		await enPantalla(pagina.getByRole("heading", { name: "Este aparato fue revocado: ya no entra." })).toBeVisible(
			espera,
		);
		await capturar(pagina, "revocada");
		await contexto.close();
	});
});
