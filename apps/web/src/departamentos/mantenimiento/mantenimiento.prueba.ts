/**
 * Prueba de las pantallas de Mantenimiento en el navegador, con la API de prueba y los datos de la muestra: cada
 * pestaña en escritorio y en teléfono con su captura, los cajones Falla y Máquina por su dirección, cada botón con su
 * acción y el aviso de abajo con el texto que regresa (reportar, mandar a reparación, nota, reparación, servicio suelto,
 * máquina nueva, quién la trae y baja), la casilla del costo de la hora que solo recalcula su pestaña, el choque de
 * versión y que una cuenta sin Mantenimiento no la abre.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono…», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el
 * texto que regresa» y «Cada pantalla tiene sus estados: … sin permiso … choque de versión»)
 */

import { expect as enPantalla, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../../api/src/nucleo/pruebas/llamadas.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Cuánto espera cada caso: abre el navegador y lee la API. */
const espera = { timeout: 180_000 };

/** Las pestañas de Mantenimiento con su ruta y algo que se ve en cada una. */
const pestanas = [
	{ ruta: "/mantenimiento", nombre: "pendientes", seVe: "Atender" },
	{ ruta: "/mantenimiento/maquinas", nombre: "maquinas", seVe: "Costura" },
	{ ruta: "/mantenimiento/fallas", nombre: "fallas", seVe: "Abiertas" },
	{ ruta: "/mantenimiento/servicios", nombre: "servicios", seVe: "Servicios de técnicos externos" },
	{ ruta: "/mantenimiento/costo", nombre: "costo", seVe: "Lo gastado contra lo parado" },
] as const;

describe("Las pantallas de Mantenimiento: pestañas, cajones, botones y estados", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/** Un valor de la base de prueba. */
	async function valorDe(consulta: string, ...parametros: string[]): Promise<string> {
		const { rows } = await pantalla.servidor.base.dueno.query(consulta, parametros);
		return String(Object.values(rows[0] ?? {})[0]);
	}

	/**
	 * Aprieta un botón que llama a una acción y revisa que el aviso de abajo diga el mensaje que regresó.
	 * @param pagina La página.
	 * @param accion El nombre de la acción.
	 * @param apretar Lo que la llama.
	 * @returns El mensaje.
	 */
	async function avisaLoQueRegresa(pagina: Page, accion: string, apretar: () => Promise<void>): Promise<string> {
		const respuesta = pagina.waitForResponse((suya) => suya.url().includes(`/v1/acciones/${accion}`));
		await apretar();
		const cuerpo = (await (await respuesta).json()) as { ok: boolean; resultado?: { mensaje: string } };
		expect(cuerpo.ok, JSON.stringify(cuerpo)).toBe(true);
		const mensaje = cuerpo.resultado?.mensaje ?? "";
		await enPantalla(pagina.locator("[role=status]", { hasText: mensaje })).toBeVisible();
		return mensaje;
	}

	it("cada pestaña se ve en escritorio y en teléfono, con su captura", espera, async () => {
		for (const tamano of ["escritorio", "telefono"] as const) {
			for (const pestana of pestanas) {
				const pagina = await pantalla.abrir(pestana.ruta, { quien: "mantenimiento", tamano });
				await enPantalla(pagina.locator("h1")).toHaveText("Mantenimiento");
				await enPantalla(pagina.getByText(pestana.seVe, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
				await enPantalla(pagina.locator("[aria-busy='true']")).toHaveCount(0);
				await pantalla.capturar(pagina, `mantenimiento/${pestana.nombre}-${tamano}`);
				await pagina.close();
			}
		}
	});

	it(
		"Pendientes: la pestaña cuenta las fallas abiertas en rojo y «Atender» abre el cajón Falla por su dirección",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/mantenimiento", { quien: "mantenimiento" });
			await enPantalla(pagina.getByRole("tab", { name: /Pendientes/ })).toContainText("2");
			const fila = pagina.getByRole("row").filter({ hasText: "Collareta 3" });
			await enPantalla(fila.getByText("Parada")).toBeVisible();
			await fila.getByRole("button", { name: "Atender" }).click();
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByRole("heading", { name: "Collareta 3: no prende" })).toBeVisible();
			await enPantalla(
				cajon.getByText("Revisaron el motor el 9 oct; esperan la refacción para el 13 oct"),
			).toBeVisible();
			await enPantalla(cajon.getByText("Servicio Industrial del Bajío")).toBeVisible();
			expect(new URL(pagina.url()).searchParams.get("cajon")).toBe("falla");
			await pantalla.capturar(pagina, "mantenimiento/cajon-falla");
			// El mismo enlace abre el mismo cajón en otra página.
			const otra = await pantalla.abrir(`/mantenimiento/fallas${new URL(pagina.url()).search}`, {
				quien: "mantenimiento",
			});
			await enPantalla(otra.getByRole("dialog").getByRole("heading", { name: "Collareta 3: no prende" })).toBeVisible();
			await otra.close();
			await pagina.close();
		},
	);

	it(
		"el cajón Máquina: sus cifras y su historial; con una falla abierta, «Dar de baja» va apagado y lo dice",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/mantenimiento/maquinas", { quien: "mantenimiento" });
			await pagina.getByRole("row").filter({ hasText: "Collareta 3" }).first().click();
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByRole("heading", { name: "Collareta 3" })).toBeVisible();
			await enPantalla(cajon.getByText("Historial")).toBeVisible();
			await enPantalla(
				cajon.getByText(/^Cambio de looper · Servicio Industrial del Bajío · \$900, 11 h de paro$/),
			).toBeVisible();
			await enPantalla(cajon.getByRole("button", { name: "Dar de baja" })).toBeDisabled();
			await enPantalla(
				cajon.getByText("Collareta 3 tiene una falla abierta: resuélvela antes de darla de baja"),
			).toBeVisible();
			await pantalla.capturar(pagina, "mantenimiento/cajon-maquina");
			const busqueda = new URL(pagina.url()).search;
			await pagina.close();
			const telefono = await pantalla.abrir(`/mantenimiento/maquinas${busqueda}`, {
				quien: "mantenimiento",
				tamano: "telefono",
			});
			await enPantalla(telefono.getByRole("dialog").getByRole("heading", { name: "Collareta 3" })).toBeVisible();
			await pantalla.capturar(telefono, "mantenimiento/cajon-maquina-telefono");
			await telefono.close();
		},
	);

	it(
		"una falla de principio a fin: reportar, mandar a reparación, nota de seguimiento y registrar la reparación",
		espera,
		async () => {
			const folio = await valorDe("SELECT folio FROM maquinas WHERE nombre = 'Recta 5'");
			const pagina = await pantalla.abrir("/mantenimiento", { quien: "mantenimiento" });
			await pagina.getByRole("button", { name: "Reportar falla" }).click();
			const reportar = pagina.getByRole("dialog", { name: "Reportar falla" });
			await reportar.getByLabel("Máquina").selectOption({ label: `${folio} · Recta 5` });
			await reportar.getByLabel("Qué tiene").selectOption({ label: "No prende" });
			await enPantalla(reportar.getByText("La máquina queda parada.")).toBeVisible();
			await reportar.getByLabel("Qué tiene").selectOption({ label: "Hace ruido" });
			await enPantalla(reportar.getByText("La máquina queda parada.")).toHaveCount(0);
			await pantalla.capturar(pagina, "mantenimiento/ventana-reportar-falla");
			const reportada = await avisaLoQueRegresa(pagina, "mantenimiento.reportar_falla", () =>
				reportar.getByRole("button", { name: "Reportar falla" }).click(),
			);
			expect(reportada).toMatch(/^FM-\d+: Recta 5 trabaja con falla$/);
			const fm = reportada.split(":")[0] ?? "";
			const fallaId = await valorDe("SELECT id FROM fallas WHERE folio = $1", fm);
			await pagina.goto(`${new URL(pagina.url()).origin}/mantenimiento/fallas?cajon=falla&id=${fallaId}`);
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByText("Sin asignar")).toBeVisible();
			// Mandar a reparación: el cajón se queda abierto con lo nuevo.
			await cajon.getByRole("button", { name: "Mandar a reparación" }).click();
			const mandar = pagina.getByRole("dialog", { name: "Mandar Recta 5 a reparación" });
			await mandar.getByLabel("Técnico", { exact: true }).selectOption({ label: "Técnica de Costura Juárez" });
			await enPantalla(mandar.getByText("¿La máquina se queda parada?")).toBeVisible();
			await pantalla.capturar(pagina, "mantenimiento/ventana-mandar-a-reparacion");
			const mandada = await avisaLoQueRegresa(pagina, "mantenimiento.mandar_a_reparacion", () =>
				mandar.getByRole("button", { name: "Mandar a reparación" }).click(),
			);
			expect(mandada).toBe(`${fm} en reparación con Técnica de Costura Juárez`);
			await enPantalla(cajon.getByText("En reparación").first()).toBeVisible();
			// La nota de seguimiento.
			await cajon.getByRole("button", { name: "Nota de seguimiento" }).click();
			const nota = pagina.getByRole("dialog", { name: `Nota de seguimiento de ${fm}` });
			await nota.getByLabel("Nota").fill("Esperan la banda nueva");
			const guardada = await avisaLoQueRegresa(pagina, "mantenimiento.guardar_nota_seguimiento", () =>
				nota.getByRole("button", { name: "Guardar nota" }).click(),
			);
			expect(guardada).toBe(`Nota guardada en ${fm}`);
			await enPantalla(cajon.getByText("Esperan la banda nueva")).toBeVisible();
			// La reparación: resuelve la falla y cierra el cajón.
			await cajon.getByRole("button", { name: "Registrar reparación" }).click();
			const reparacion = pagina.getByRole("dialog", { name: "Reparación de Recta 5" });
			await enPantalla(reparacion.getByLabel("Técnico")).toHaveValue(
				await valorDe("SELECT id FROM tecnicos WHERE nombre = 'Técnica de Costura Juárez'"),
			);
			await enPantalla(reparacion.getByLabel("Horas de paro")).toHaveValue("0");
			await reparacion.getByRole("button", { name: "Marcar resuelta" }).click();
			await enPantalla(reparacion.getByText("Escribe qué se hizo")).toBeVisible();
			await reparacion.getByLabel("Qué se hizo").fill("Cambio de banda");
			await reparacion.getByLabel("Costo").fill("650");
			await reparacion.getByLabel("Horas de paro").fill("3");
			await pantalla.capturar(pagina, "mantenimiento/ventana-reparacion");
			const resuelta = await avisaLoQueRegresa(pagina, "mantenimiento.registrar_servicio", () =>
				reparacion.getByRole("button", { name: "Marcar resuelta" }).click(),
			);
			expect(resuelta).toBe("Recta 5 vuelve a trabajar. 3 horas de paro quedan registradas");
			await enPantalla(pagina.getByRole("dialog")).toHaveCount(0);
			expect(await valorDe("SELECT estado FROM fallas WHERE id = $1", fallaId)).toBe("resuelta");
			await pagina.close();
		},
	);

	it("«Registrar servicio», la acción principal, registra un servicio suelto y lo avisa", espera, async () => {
		const pagina = await pantalla.abrir("/mantenimiento/servicios", { quien: "mantenimiento" });
		await pagina.getByRole("button", { name: "Registrar servicio" }).first().click();
		const ventana = pagina.getByRole("dialog", { name: "Registrar servicio" });
		const folio = await valorDe("SELECT folio FROM maquinas WHERE nombre = 'Overlock 2'");
		await ventana.getByLabel("Máquina").selectOption({ label: `Overlock 2 · ${folio}` });
		await ventana.getByLabel("Técnico").selectOption({ label: "Refacciones Ochoa (taller)" });
		await ventana.getByLabel("Qué se hizo").fill("Lubricación general");
		await ventana.getByLabel("Costo").fill("0");
		await pantalla.capturar(pagina, "mantenimiento/ventana-registrar-servicio");
		const registrado = await avisaLoQueRegresa(pagina, "mantenimiento.registrar_servicio", () =>
			ventana.getByRole("button", { name: "Registrar servicio" }).click(),
		);
		expect(registrado).toMatch(/^SM-\d+ registrado$/);
		await enPantalla(pagina.getByRole("row").filter({ hasText: "Lubricación general" })).toBeVisible();
		await pagina.close();
	});

	it("«Nueva máquina» la da de alta; luego cambia quién la trae y se da de baja con su motivo", espera, async () => {
		const pagina = await pantalla.abrir("/mantenimiento/maquinas", { quien: "mantenimiento" });
		await pagina.getByRole("button", { name: "Nueva máquina" }).click();
		const nueva = pagina.getByRole("dialog", { name: "Máquina nueva" });
		await nueva.getByLabel("Nombre").fill("Recta 9");
		await nueva.getByLabel("Tipo").selectOption({ label: "Otro tipo" });
		await nueva.getByLabel("¿Qué tipo?").fill("Pegadora de bies");
		await nueva.getByLabel("Área").selectOption({ label: "Costura" });
		await nueva.getByLabel("La trae").selectOption({ index: 1 });
		await pantalla.capturar(pagina, "mantenimiento/ventana-maquina-nueva");
		const alta = await avisaLoQueRegresa(pagina, "mantenimiento.alta_maquina", () =>
			nueva.getByRole("button", { name: "Dar de alta" }).click(),
		);
		expect(alta).toMatch(/^Recta 9 \([A-Z]+-\d+\) dada de alta en Costura$/);
		await pagina.getByRole("row").filter({ hasText: "Recta 9" }).first().click();
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText("Sin fallas ni servicios")).toBeVisible();
		// Cambiar quién la trae.
		await cajon.getByRole("button", { name: "Cambiar quién la trae" }).click();
		const quien = pagina.getByRole("dialog", { name: "Recta 9: ¿quién la trae?" });
		await enPantalla(quien.getByText("Una falla abierta guarda quién la traía al fallar.")).toBeVisible();
		await quien.getByLabel("La trae").selectOption({ index: 2 });
		const persona = await quien.getByLabel("La trae").locator("option:checked").textContent();
		const cambiada = await avisaLoQueRegresa(pagina, "mantenimiento.cambiar_asignacion_maquina", () =>
			quien.getByRole("button", { name: "Guardar" }).click(),
		);
		expect(cambiada).toBe(`Recta 9 ahora la trae ${persona}`);
		// Darla de baja con su motivo.
		await cajon.getByRole("button", { name: "Dar de baja" }).click();
		const baja = pagina.getByRole("dialog", { name: "Dar de baja Recta 9" });
		await enPantalla(
			baja.getByText("Sale de la tablet y de la lista de máquinas. Sus fallas, servicios y costos se conservan."),
		).toBeVisible();
		await enPantalla(baja.getByRole("button", { name: "Dar de baja" })).toBeDisabled();
		await baja.getByLabel("Motivo").fill("Se vendió a otro taller");
		const dada = await avisaLoQueRegresa(pagina, "mantenimiento.baja_maquina", () =>
			baja.getByRole("button", { name: "Dar de baja" }).click(),
		);
		expect(dada).toBe("Recta 9 dada de baja");
		await enPantalla(pagina.getByText("Dadas de baja")).toBeVisible();
		await pagina.close();
	});

	it(
		"la casilla del costo de la hora recalcula solo esta pestaña, y vacía regresa al de Configuración",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/mantenimiento/costo", { quien: "mantenimiento" });
			const casilla = pagina.getByLabel("Una hora de máquina parada cuesta");
			await enPantalla(casilla).toHaveValue("450");
			const conOtro = await pedirConsulta(
				pantalla.servidor,
				"mantenimiento.costo_por_maquina",
				{ costo_hora_centavos: "60000" },
				"mantenimiento",
			);
			const { paro_centavos } = conOtro.cuerpo.resultado as { paro_centavos: number };
			await casilla.fill("600");
			await enPantalla(casilla).toBeFocused();
			await enPantalla(pagina.getByText(`≈ $${(paro_centavos / 100).toLocaleString("es-MX")}`)).toBeVisible();
			expect(new URL(pagina.url()).searchParams.get("hora")).toBe("600");
			await casilla.fill("6a");
			await enPantalla(casilla).toHaveValue("6");
			await casilla.fill("");
			await enPantalla(pagina).not.toHaveURL(/hora=/);
			expect(await valorDe("SELECT valor_entero FROM parametros WHERE clave = 'mantenimiento.costo_hora_paro'")).toBe(
				"45000",
			);
			await pagina.close();
		},
	);

	it("un choque de versión lo avisa en la ventana sin perder lo capturado", espera, async () => {
		const fallaId = await valorDe(
			"SELECT f.id FROM fallas f JOIN maquinas m ON m.id = f.maquina_id WHERE m.nombre = 'Recta 7' AND f.estado <> 'resuelta'",
		);
		const fm = await valorDe("SELECT folio FROM fallas WHERE id = $1", fallaId);
		const pagina = await pantalla.abrir(`/mantenimiento/fallas?cajon=falla&id=${fallaId}`, { quien: "mantenimiento" });
		const cajon = pagina.getByRole("dialog");
		await cajon.getByRole("button", { name: "Nota de seguimiento" }).click();
		const nota = pagina.getByRole("dialog", { name: `Nota de seguimiento de ${fm}` });
		await nota.getByLabel("Nota").fill("Revisar el tensor");
		// Otra cuenta la cambia mientras se ve.
		await pantalla.servidor.base.dueno.query("UPDATE fallas SET nota_seguimiento = 'Otra nota' WHERE id = $1", [
			fallaId,
		]);
		await nota.getByRole("button", { name: "Guardar nota" }).click();
		await enPantalla(
			nota.getByText(`${fm} cambió mientras lo veías. Revisa los cambios y vuelve a guardar`),
		).toBeVisible();
		await enPantalla(nota.getByLabel("Nota")).toHaveValue("Revisar el tensor");
		await pagina.close();
	});

	it("sin Mantenimiento, sus pantallas dicen «No tienes acceso a esta pantalla»", espera, async () => {
		const pagina = await pantalla.abrir("/mantenimiento/maquinas", { quien: "aduana" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await pagina.close();
	});
});
