/**
 * Prueba de las pantallas de Personal en el navegador, con la API de prueba y los datos de la muestra: cada pestaña en
 * escritorio y en teléfono con su captura; la cuadrícula de asistencia (cada toque con su acción, el foco que se queda
 * y «Cerrar semana» con días por capturar); los pendientes (asignar PIN con su ventana, cerrar una semana completa,
 * poner tarifa); el PIN del taller (restablecer y desbloquear); Personas con «Ver tarifas»; el cajón de la persona
 * (alta, edición, baja, cambios sin guardar y choque de versión); Tarifas; «Reabrir semana» de la dueña; y que sin
 * Personal o sin el permiso de sueldos no se abre lo que no toca.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono…», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el
 * texto que regresa», «Cada pantalla tiene sus estados: … sin permiso … choque de versión» y «Un cajón con cambios sin
 * guardar pregunta antes de cerrarse…»)
 */

import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { enPantalla } from "../../../../../pruebas/navegador/en-pantalla.ts";
import { mandarAccion } from "../../../../api/src/nucleo/pruebas/llamadas.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Cuánto espera cada caso: abre el navegador y lee la API. */
const espera = { timeout: 180_000 };

/** Las pestañas de Personal con su ruta y algo que se ve en cada una. */
const pestanas = [
	{ ruta: "/personal", nombre: "asistencia", seVe: "Semanas cerradas" },
	{ ruta: "/personal/personas", nombre: "personas", seVe: "Una persona no necesita cuenta" },
	{ ruta: "/personal/pin", nombre: "pin", seVe: "El PIN solo sirve en la tablet registrada del taller" },
	{ ruta: "/personal/tarifas", nombre: "tarifas", seVe: "Playera polo" },
] as const;

describe("Las pantallas de Personal: pestañas, cuadrícula, cajones, botones y estados", () => {
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
	 * Una semana de lunes a sábado de hace unas semanas, en hora de México.
	 * @param semanas Cuántas semanas antes de la que corre.
	 */
	async function semanaDeHace(semanas: number): Promise<{ inicio: string; fin: string }> {
		const inicio = await valorDe(
			`SELECT (date_trunc('week', now() AT TIME ZONE 'America/Mexico_City') - make_interval(weeks => $1::int))::date::text`,
			String(semanas),
		);
		return { inicio, fin: await valorDe("SELECT ($1::date + 5)::text", inicio) };
	}

	/** El id de una persona de la muestra por su nombre. */
	async function idDe(nombre: string): Promise<string> {
		return z.uuid().parse(await valorDe("SELECT id FROM personas WHERE nombre = $1", nombre));
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
		await enPantalla(pagina.locator("[role=status]", { hasText: mensaje }).first()).toBeVisible();
		return mensaje;
	}

	it("cada pestaña se ve en escritorio y en teléfono, con su captura", espera, async () => {
		for (const tamano of ["escritorio", "telefono"] as const) {
			for (const pestana of pestanas) {
				const pagina = await pantalla.abrir(pestana.ruta, { quien: "personal_sueldos", tamano });
				await enPantalla(pagina.locator("h1")).toHaveText("Personal");
				await enPantalla(pagina.getByText(pestana.seVe, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
				await enPantalla(pagina.locator("[aria-busy='true']")).toHaveCount(0);
				await pantalla.capturar(pagina, `personal/${pestana.nombre}-${tamano}`);
				await pagina.close();
			}
		}
	});

	it(
		"Asistencia: cada toque de un día manda su acción con el valor que queda y el foco se queda en ese día",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/personal", { quien: "personal" });
			const lunes = pagina.getByRole("button", { name: /^Diana Vega lun \d+: / });
			await enPantalla(lunes).toHaveAccessibleName(/Sin capturar$/);
			const pedido = pagina.waitForRequest((suya) =>
				suya.url().includes("/v1/acciones/personal.cambiar_dia_asistencia"),
			);
			const mensaje = await avisaLoQueRegresa(pagina, "personal.cambiar_dia_asistencia", () => lunes.click());
			expect(mensaje).toBe("Asistencia de Diana Vega guardada");
			expect((await pedido).postDataJSON()).toMatchObject({ datos: { valor: "completo" } });
			await enPantalla(lunes).toHaveAccessibleName(/Día completo$/);
			await enPantalla(lunes).toBeFocused();
			// ✓ → ½, con la versión del día.
			const segundo = pagina.waitForRequest((suya) =>
				suya.url().includes("/v1/acciones/personal.cambiar_dia_asistencia"),
			);
			await lunes.click();
			expect((await segundo).postDataJSON()).toMatchObject({ datos: { valor: "medio", version: expect.any(Number) } });
			await enPantalla(lunes).toHaveAccessibleName(/Medio día$/);
			await enPantalla(lunes).toBeFocused();
			await pantalla.capturar(pagina, "personal/cuadricula");
			await pagina.close();
		},
	);

	it(
		"«Cerrar semana» con días por capturar no cierra: pone el foco en el primero y avisa cuántos faltan",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/personal", { quien: "personal" });
			let llamo = false;
			pagina.on("request", (pedido) => {
				if (pedido.url().includes("/v1/acciones/personal.cerrar_semana_asistencia")) llamo = true;
			});
			await pagina.getByRole("button", { name: "Cerrar semana" }).click();
			await enPantalla(pagina.locator("[role=status]", { hasText: /Faltan \d+ días por capturar/ })).toBeVisible();
			await enPantalla(pagina.locator(":focus")).toHaveAttribute("data-dia", /\|/);
			await enPantalla(pagina.locator(":focus")).toHaveAccessibleName(/Sin capturar$/);
			expect(llamo).toBe(false);
			await pagina.close();
		},
	);

	it(
		"Pendientes: «Asignar PIN» llama su acción y abre «PIN de {persona}» con el PIN cifra por cifra, una sola vez",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/personal?grupo=pin", { quien: "personal" });
			const renglon = pagina.getByRole("row").filter({ hasText: "Elena Soto" });
			await enPantalla(renglon.getByText("Sin PIN")).toBeVisible();
			await avisaLoQueRegresa(pagina, "personal.asignar_pin", () =>
				renglon.getByRole("button", { name: "Asignar PIN" }).click(),
			);
			const ventana = pagina.getByRole("dialog", { name: "PIN de Elena Soto" });
			await enPantalla(ventana.getByText(/^\d \d \d \d$/)).toBeVisible();
			await enPantalla(ventana.getByText("Se muestra una sola vez: dáselo en persona.")).toBeVisible();
			await pantalla.capturar(pagina, "personal/ventana-pin");
			await ventana.getByRole("button", { name: "Listo" }).click();
			await enPantalla(ventana).toHaveCount(0);
			await enPantalla(pagina.getByRole("row").filter({ hasText: "Elena Soto" })).toHaveCount(0);
			await pagina.close();
		},
	);

	it(
		"PIN del taller: «Restablecer» dice que el anterior ya no entra, y «Desbloquear» avisa que ya puede entrar",
		espera,
		async () => {
			const blanca = await idDe("Blanca Ruiz");
			const asignado = await mandarAccion(
				pantalla.servidor,
				"personal.asignar_pin",
				{ datos: { persona_id: blanca } },
				"personal",
			);
			expect(asignado.estado).toBe(200);
			await pantalla.servidor.base.dueno.query(
				"UPDATE pines SET estado = 'bloqueado', bloqueado_en = now(), intentos_fallidos = 5 WHERE persona_id = $1 AND estado = 'activo'",
				[blanca],
			);
			const pagina = await pantalla.abrir("/personal/pin", { quien: "personal" });
			const renglon = pagina.getByRole("row").filter({ hasText: "Blanca Ruiz" });
			await enPantalla(renglon.getByText("Bloqueado")).toBeVisible();
			// La pestaña y la pastilla cuentan al bloqueado.
			await enPantalla(pagina.getByRole("tab", { name: /PIN del taller/ })).toBeVisible();
			const mensaje = await avisaLoQueRegresa(pagina, "personal.desbloquear_pin", () =>
				renglon.getByRole("button", { name: "Desbloquear" }).click(),
			);
			expect(mensaje).toBe("Blanca Ruiz ya puede entrar con su PIN");
			await enPantalla(renglon.getByText("Bloqueado")).toHaveCount(0);
			await avisaLoQueRegresa(pagina, "personal.restablecer_pin", () =>
				renglon.getByRole("button", { name: "Restablecer" }).click(),
			);
			const ventana = pagina.getByRole("dialog", { name: "PIN de Blanca Ruiz" });
			await enPantalla(ventana.getByText(/El anterior ya no entra\. Se muestra una sola vez/)).toBeVisible();
			await ventana.getByRole("button", { name: "Listo" }).click();
			await pagina.close();
		},
	);

	it(
		"Personas: «Ver tarifas» pide el permiso y lo dice; sin el permiso no sale; el renglón abre el cajón por su dirección",
		espera,
		async () => {
			const sinPermiso = await pantalla.abrir("/personal/personas", { quien: "personal" });
			await enPantalla(sinPermiso.getByText("Sergio Gómez")).toBeVisible();
			await enPantalla(sinPermiso.getByRole("button", { name: "Ver tarifas" })).toHaveCount(0);
			await enPantalla(sinPermiso.getByRole("tab", { name: /Tarifas/ })).toHaveCount(0);
			await sinPermiso.close();
			const pagina = await pantalla.abrir("/personal/personas", { quien: "personal_sueldos" });
			await pagina.getByRole("button", { name: "Ver tarifas" }).click();
			await enPantalla(pagina.getByText("Quedó registrado en la bitácora que consultaste las tarifas")).toBeVisible();
			await enPantalla(
				pagina.getByRole("row").filter({ hasText: "Sergio Gómez" }).getByText("$220 al día + piezas"),
			).toBeVisible();
			await enPantalla(
				pagina
					.getByRole("row")
					.filter({ hasText: "Lupita Ramos" })
					.getByText(/^Por operación · \$/),
			).toBeVisible();
			await enPantalla(pagina.getByRole("button", { name: "Ocultar tarifas" })).toBeVisible();
			expect(new URL(pagina.url()).searchParams.get("ver")).toBe("si");
			await pantalla.capturar(pagina, "personal/personas-con-tarifas");
			await pagina.getByRole("row").filter({ hasText: "Sergio Gómez" }).click();
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByRole("heading", { name: "Sergio Gómez" })).toBeVisible();
			await enPantalla(cajon.getByText(/^E-\d+ · Taller$/)).toBeVisible();
			await enPantalla(cajon.getByLabel("Base por día")).toHaveValue("220");
			await enPantalla(cajon.getByText("Ver tarifas y sueldos queda en la bitácora")).toBeVisible();
			expect(new URL(pagina.url()).searchParams.get("cajon")).toBe("persona");
			await pantalla.capturar(pagina, "personal/cajon-persona");
			const busqueda = new URL(pagina.url()).search;
			await pagina.close();
			const telefono = await pantalla.abrir(`/personal/personas${busqueda}`, { quien: "personal", tamano: "telefono" });
			await enPantalla(telefono.getByRole("dialog").getByRole("heading", { name: "Sergio Gómez" })).toBeVisible();
			// Sin el permiso, el pago por día no está.
			await enPantalla(telefono.getByLabel("Base por día")).toHaveCount(0);
			await pantalla.capturar(telefono, "personal/cajon-persona-telefono");
			await telefono.close();
		},
	);

	it(
		"«Nueva persona» da de alta con su acción y abre Personas con ella; cerrar con cambios pregunta antes",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/personal", { quien: "personal" });
			await pagina.getByRole("button", { name: "Nueva persona" }).first().click();
			const cajon = pagina.getByRole("dialog", { name: "Nueva persona" });
			await enPantalla(cajon.getByLabel("Área")).toHaveValue("taller");
			await enPantalla(cajon.getByLabel("Forma de pago")).toHaveValue("pieza");
			await cajon.getByLabel("Nombre completo").fill("Nadia Ochoa");
			// Cerrar con lo capturado pregunta antes; «Volver» deja todo como estaba.
			await cajon.getByRole("button", { name: "Cerrar" }).first().click();
			const pregunta = pagina.getByRole("dialog", { name: "Tienes cambios sin guardar. ¿Salir sin guardar?" });
			await enPantalla(pregunta).toBeVisible();
			await pregunta.getByRole("button", { name: "Volver" }).click();
			await enPantalla(cajon.getByLabel("Nombre completo")).toHaveValue("Nadia Ochoa");
			await cajon.getByLabel("Puesto").fill("Costura");
			const mensaje = await avisaLoQueRegresa(pagina, "personal.dar_alta_persona", () =>
				cajon.getByRole("button", { name: "Dar de alta" }).click(),
			);
			expect(mensaje).toBe("Nadia Ochoa dada de alta. Falta asignarle PIN del taller");
			await enPantalla(pagina).toHaveURL(/\/personal\/personas\?.*resaltar=/);
			await enPantalla(pagina.getByRole("row").filter({ hasText: "Nadia Ochoa" })).toBeVisible();
			await pagina.close();
		},
	);

	it(
		"el cajón de una persona: «Guardar» y «Dar de baja» con su ventana llaman sus acciones y avisan",
		espera,
		async () => {
			const rocio = await idDe("Rocío Medina");
			const pagina = await pantalla.abrir(`/personal/personas?cajon=persona&id=${rocio}`, { quien: "personal" });
			const cajon = pagina.getByRole("dialog", { name: "Rocío Medina" });
			await cajon.getByLabel("Puesto").fill("Costura fina");
			const guardado = await avisaLoQueRegresa(pagina, "personal.editar_persona", () =>
				cajon.getByRole("button", { name: "Guardar" }).click(),
			);
			expect(guardado).toBe("Rocío Medina actualizada");
			await cajon.getByRole("button", { name: "Dar de baja" }).click();
			const ventana = pagina.getByRole("dialog", { name: "Dar de baja a Rocío Medina" });
			await enPantalla(ventana.getByText("No se borra: su producción y sus pagos se conservan.")).toBeVisible();
			await ventana.getByLabel("Motivo").fill("Se cambió de ciudad");
			const dada = await avisaLoQueRegresa(pagina, "personal.dar_baja_persona", () =>
				ventana.getByRole("button", { name: "Dar de baja" }).click(),
			);
			expect(dada).toBe("Rocío Medina dada de baja");
			await enPantalla(cajon.getByText(/^Dada de baja el \d+ [a-z]+: Se cambió de ciudad$/)).toBeVisible();
			await enPantalla(cajon.getByRole("button", { name: "Reactivar" })).toBeVisible();
			await pagina.close();
		},
	);

	it("un choque de versión en el cajón lo avisa sin perder lo capturado", espera, async () => {
		const ana = await idDe("Ana Torres");
		const pagina = await pantalla.abrir(`/personal/personas?cajon=persona&id=${ana}`, { quien: "personal" });
		const cajon = pagina.getByRole("dialog", { name: "Ana Torres" });
		await cajon.getByLabel("Puesto").fill("Costura y remate");
		// Otra cuenta la cambia mientras se ve.
		await pantalla.servidor.base.dueno.query("UPDATE personas SET version = version + 1 WHERE id = $1", [ana]);
		await cajon.getByRole("button", { name: "Guardar" }).click();
		await enPantalla(
			cajon.getByText("Ana Torres cambió mientras lo veías. Revisa los cambios y vuelve a guardar"),
		).toBeVisible();
		await enPantalla(cajon.getByLabel("Puesto")).toHaveValue("Costura y remate");
		await pagina.close();
	});

	it(
		"«Poner tarifa» lleva a Tarifas con la casilla de la operación; al salir de ella llama su acción, y cero no se acepta",
		espera,
		async () => {
			const creado = await mandarAccion(
				pantalla.servidor,
				"produccion.crear_flujo",
				{
					datos: {
						nombre: "Flujo de la pantalla de Personal",
						parte_de: "una_sola_operacion",
						persona_corte_id: await idDe("Beto Aguilar"),
						persona_base_id: await idDe("Ana Torres"),
					},
				},
				"produccion",
			);
			expect(creado.estado, JSON.stringify(creado.cuerpo)).toBe(200);
			const pagina = await pantalla.abrir("/personal?grupo=tarifas", { quien: "personal_sueldos" });
			const renglones = pagina.getByRole("row").filter({ hasText: "Flujo de la pantalla de Personal" });
			await enPantalla(renglones.first().getByText("Sin tarifa")).toBeVisible();
			await renglones.first().getByRole("button", { name: "Poner tarifa" }).click();
			await enPantalla(pagina).toHaveURL(/\/personal\/tarifas\?.*operacion=/);
			const casilla = pagina.locator("input:focus");
			await enPantalla(casilla).toHaveCount(1);
			await casilla.fill("0");
			await casilla.press("Tab");
			await enPantalla(
				pagina.locator("[role=status]", { hasText: "Escribe la tarifa en pesos, por ejemplo 1.50" }),
			).toBeVisible();
			const tarjeta = pagina.getByRole("article", { name: "Flujo de la pantalla de Personal" });
			const primera = tarjeta.getByRole("textbox").first();
			await primera.fill("1.50");
			const mensaje = await avisaLoQueRegresa(pagina, "personal.poner_tarifa_operacion", () => primera.press("Tab"));
			expect(mensaje).toMatch(/: \$1\.50 por pieza desde ahora$/);
			await enPantalla(primera).toHaveValue("1.50");
			await tarjeta.getByRole("button", { name: "Ver historial" }).click();
			await enPantalla(tarjeta.getByText("Sin tarifas anteriores")).toBeVisible();
			await pagina.close();
		},
	);

	it(
		"Pendientes: una semana pasada completa sale «Por cerrar» con «Cerrar asistencia» en negro, que la cierra",
		espera,
		async () => {
			const { inicio, fin } = await semanaDeHace(1);
			const semana = await valorDe(
				"INSERT INTO asistencia_semanas (id, fecha_inicio, fecha_fin) VALUES (gen_random_uuid(), $1, $2) RETURNING id",
				inicio,
				fin,
			);
			// Cada día exigido de quien lleva asistencia, capturado como completo.
			await pantalla.servidor.base.dueno.query(
				`INSERT INTO asistencia_dias (id, asistencia_semana_id, persona_id, fecha, valor, origen)
			SELECT gen_random_uuid(), $1, p.id, d::date, 'completo', 'personal'
			FROM personas p, generate_series($2::date, $3::date, interval '1 day') d
			WHERE p.forma_pago IN ('tiempo', 'mixta') AND p.fecha_ingreso <= d::date
				AND (p.baja_en IS NULL OR (p.baja_en AT TIME ZONE 'America/Mexico_City')::date >= d::date)`,
				[semana, inicio, fin],
			);
			const pagina = await pantalla.abrir("/personal?grupo=asistencia", { quien: "personal" });
			const renglon = pagina.getByRole("row").filter({ hasText: "Por cerrar" });
			await enPantalla(renglon).toBeVisible();
			const mensaje = await avisaLoQueRegresa(pagina, "personal.cerrar_semana_asistencia", () =>
				renglon.getByRole("button", { name: "Cerrar asistencia" }).click(),
			);
			expect(mensaje).toBe("Semana cerrada: contaduría ya puede pagar la nómina");
			await enPantalla(pagina.getByRole("row").filter({ hasText: "Cerrada" }).first()).toBeVisible();
			await pagina.close();
		},
	);

	it("«Reabrir semana» es solo de la dueña: su ventana pide el motivo y llama su acción", espera, async () => {
		const { inicio, fin } = await semanaDeHace(3);
		await valorDe(
			`INSERT INTO asistencia_semanas (id, fecha_inicio, fecha_fin, estado, cerrada_en, cerrada_por)
			VALUES (gen_random_uuid(), $1, $2, 'cerrada', now(), '01936f2e-0000-7000-8000-00000000000a') RETURNING id`,
			inicio,
			fin,
		);
		const dePersonal = await pantalla.abrir("/personal", { quien: "personal" });
		await enPantalla(dePersonal.getByText("Semanas cerradas")).toBeVisible();
		await enPantalla(dePersonal.getByRole("button", { name: "Reabrir semana" })).toHaveCount(0);
		await dePersonal.close();
		const pagina = await pantalla.abrir("/personal", { quien: "duena" });
		await pagina.getByRole("button", { name: "Reabrir semana" }).first().click();
		const ventana = pagina.getByRole("dialog", { name: /^Reabrir la semana del / });
		await enPantalla(ventana.getByText("Contaduría no la puede pagar mientras esté abierta.")).toBeVisible();
		await ventana.getByLabel("Motivo").fill("Faltó corregir una falta");
		const mensaje = await avisaLoQueRegresa(pagina, "personal.reabrir_semana_asistencia", () =>
			ventana.getByRole("button", { name: "Reabrir semana" }).click(),
		);
		expect(mensaje).toMatch(/^Semana del .+ reabierta$/);
		await pagina.close();
	});

	it(
		"sin Personal, sus pantallas dicen «No tienes acceso a esta pantalla»; sin el permiso, tampoco Tarifas",
		espera,
		async () => {
			const ajena = await pantalla.abrir("/personal/personas", { quien: "ventas" });
			await enPantalla(ajena.getByText("No tienes acceso a esta pantalla")).toBeVisible();
			await ajena.close();
			const sinSueldos = await pantalla.abrir("/personal/tarifas", { quien: "personal" });
			await enPantalla(sinSueldos.getByText("No tienes acceso a esta pantalla")).toBeVisible();
			await sinSueldos.close();
		},
	);
});
