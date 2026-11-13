/**
 * Prueba de las pantallas de Contaduría en el navegador, con la API de prueba y la muestra: cada pestaña y cada cajón se
 * ven como la muestra (con sus capturas en escritorio y en teléfono), cada botón llama a su acción y el aviso de abajo
 * dice el texto que regresa, la nómina sin permiso muestra su candado, y un choque de versión lo avisa.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono…», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el
 * texto que regresa» y «Cada pantalla tiene sus estados: … sin permiso … choque de versión»)
 */

import { expect as enPantalla, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Cuánto espera cada caso: abre el navegador y lee la API. */
const espera = { timeout: 120_000 };

describe("Las pantallas de Contaduría: pestañas, cajones, botones y avisos", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/** Un valor de la base de prueba. */
	async function valor(consulta: string, parametros: unknown[] = []): Promise<string> {
		const { rows } = await pantalla.servidor.base.dueno.query(consulta, parametros);
		return String(Object.values(rows[0] ?? {})[0]);
	}

	/**
	 * Abre una pantalla como Contaduría, ya confirmada con Google (las acciones delicadas no piden la ventana aparte).
	 * @param ruta La ruta.
	 * @param tamano El tamaño.
	 */
	async function abrir(ruta: string, tamano: "escritorio" | "telefono" = "escritorio"): Promise<Page> {
		const pagina = await pantalla.abrir(ruta, { quien: "contaduria", tamano });
		await pagina.setExtraHTTPHeaders({ "x-prueba-quien": "contaduria", "x-prueba-google": new Date().toISOString() });
		return pagina;
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

	it(
		"Pendientes: las cuatro cifras, los pendientes por grupo y el flujo, en escritorio y en teléfono",
		espera,
		async () => {
			const pagina = await abrir("/contaduria");
			await enPantalla(pagina.locator("h1")).toHaveText("Contaduría");
			for (const cifra of ["Saldo por cobrar", "Saldo por pagar", "Flujo neto · 7 días", "Pagos detenidos"]) {
				await enPantalla(pagina.getByRole("button", { name: new RegExp(cifra) }).first()).toBeVisible();
			}
			const tabla = pagina.getByRole("table", { name: "Pendientes" });
			await enPantalla(tabla.getByText("Detenido · no cuadra").first()).toBeVisible();
			await enPantalla(tabla.getByText("Por aplicar").first()).toBeVisible();
			await enPantalla(pagina.getByText("Flujo de los próximos 7 días")).toBeVisible();
			await pantalla.capturar(pagina, "contaduria/pendientes-escritorio");
			await pagina
				.getByRole("toolbar", { name: "Filtrar pendientes" })
				.getByRole("button", { name: /Cobranza/ })
				.click();
			await enPantalla(pagina).toHaveURL(/grupo=cobranza/);
			await enPantalla(tabla.getByText("Detenido · no cuadra")).toHaveCount(0);
			await pagina.close();
			const telefono = await abrir("/contaduria", "telefono");
			await enPantalla(telefono.getByRole("table", { name: "Pendientes" })).toBeVisible();
			await pantalla.capturar(telefono, "contaduria/pendientes-telefono");
			await telefono.close();
		},
	);

	it("Pendientes: «Pagar lo recibido» pide a Dirección pagar lo recibido y lo avisa", espera, async () => {
		const pagina = await abrir("/contaduria");
		const mensaje = await avisaLoQueRegresa(pagina, "contaduria.pedir_pago_lo_recibido", () =>
			pagina.getByRole("table", { name: "Pendientes" }).getByRole("button", { name: "Pagar lo recibido" }).click(),
		);
		expect(mensaje).toBe("Solicitud enviada a Dirección: pago por lo recibido");
		await pagina.close();
	});

	it(
		"Cuentas por cobrar: el semáforo cambia sin abrir el cajón y el depósito a un tercero se aplica",
		espera,
		async () => {
			const pagina = await abrir("/contaduria/cuentas-por-cobrar");
			const antiguedad = pagina.getByRole("table", { name: "Antigüedad de saldos por cliente" });
			await enPantalla(antiguedad.getByText("Distribuidora Escolar Zamora", { exact: true })).toBeVisible();
			await pantalla.capturar(pagina, "contaduria/cuentas-por-cobrar-escritorio");
			const semaforo = await avisaLoQueRegresa(pagina, "contaduria.cambiar_semaforo_credito", async () => {
				await antiguedad
					.getByRole("row", { name: /Distribuidora Escolar Zamora/ })
					.getByLabel("Semáforo")
					.selectOption("cerca_del_limite");
			});
			expect(semaforo).toMatch(/^Semáforo de crédito de Distribuidora Escolar Zamora: /);
			await enPantalla(pagina.getByRole("dialog")).toHaveCount(0);
			const depositos = pagina.getByRole("table", { name: "Depósitos a terceros por aplicar" });
			const aplicado = await avisaLoQueRegresa(pagina, "contaduria.aplicar_deposito_a_tercero", () =>
				depositos.getByRole("button", { name: "Aplicar" }).first().click(),
			);
			expect(aplicado).toMatch(/^PG-\d+ aplicado a /);
			await pagina.close();
			const telefono = await abrir("/contaduria/cuentas-por-cobrar", "telefono");
			await enPantalla(telefono.getByRole("table", { name: "Pagos recibidos" })).toBeVisible();
			await pantalla.capturar(telefono, "contaduria/cuentas-por-cobrar-telefono");
			await telefono.close();
		},
	);

	it("el cajón del cliente: sus notas y su crédito; «Cambiar límite» guarda y lo avisa", espera, async () => {
		const pagina = await abrir("/contaduria/cuentas-por-cobrar");
		await pagina
			.getByRole("table", { name: "Antigüedad de saldos por cliente" })
			.getByText("Distribuidora Escolar Zamora", { exact: true })
			.click();
		await enPantalla(pagina).toHaveURL(/cajon=cliente/);
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText("Consultas de este saldo quedan en la bitácora")).toBeVisible();
		await enPantalla(cajon.getByText("le debemos")).toBeVisible();
		await pantalla.capturar(pagina, "contaduria/cajon-cliente");
		await cajon.getByRole("button", { name: "Cambiar límite" }).click();
		const ventana = pagina.getByRole("dialog", { name: /Límite de crédito de/ });
		await ventana.getByLabel("Límite nuevo, en pesos").fill("95000");
		const mensaje = await avisaLoQueRegresa(pagina, "contaduria.cambiar_limite_credito", () =>
			ventana.getByRole("button", { name: "Guardar" }).click(),
		);
		expect(mensaje).toMatch(/^Límite de crédito de Distribuidora Escolar Zamora: \$95,000/);
		await pagina.close();
	});

	it("un choque de versión al cambiar el límite lo avisa sin perder lo capturado", espera, async () => {
		const pagina = await abrir("/contaduria/cuentas-por-cobrar");
		await pagina
			.getByRole("table", { name: "Antigüedad de saldos por cliente" })
			.getByText("Uniformes El Bajío")
			.click();
		await pagina.getByRole("dialog").getByRole("button", { name: "Cambiar límite" }).click();
		const ventana = pagina.getByRole("dialog", { name: /Límite de crédito de/ });
		await ventana.getByLabel("Límite nuevo, en pesos").fill("12000");
		await pantalla.servidor.base.dueno.query(
			`UPDATE credito_clientes SET version = version + 1 WHERE cliente_id =
				(SELECT c.id FROM clientes c JOIN terceros t ON t.id = c.tercero_id WHERE t.nombre = 'Uniformes El Bajío')`,
		);
		await ventana.getByRole("button", { name: "Guardar" }).click();
		await enPantalla(ventana.getByText(/cambió mientras lo veías/)).toBeVisible();
		await enPantalla(ventana.getByLabel("Límite nuevo, en pesos")).toHaveValue("12000");
		await pagina.close();
	});

	it(
		"«Registrar pago», la acción principal: abre el cajón con el primer cliente y registra el pago",
		espera,
		async () => {
			const pagina = await abrir("/contaduria");
			await pagina.getByRole("button", { name: "Registrar pago" }).first().click();
			const cajon = pagina.getByRole("dialog", { name: "Registrar pago" });
			await enPantalla(cajon.getByLabel("Nota o pedido")).toBeVisible();
			await pantalla.capturar(pagina, "contaduria/cajon-registrar-pago");
			await cajon.getByLabel("Monto").fill("100");
			await cajon.getByLabel("Dónde se recibió").selectOption({ label: "Efectivo" });
			const mensaje = await avisaLoQueRegresa(pagina, "contaduria.registrar_pago_recibido", () =>
				cajon.getByRole("button", { name: "Registrar pago" }).click(),
			);
			expect(mensaje).toMatch(/^PG-\d+: \$100 de /);
			await pagina.close();
		},
	);

	it("Cuentas por pagar: los pagos detenidos con sus tres puntas, el calendario y «Pagar»", espera, async () => {
		const pagina = await abrir("/contaduria/cuentas-por-pagar");
		await enPantalla(pagina.getByText("Orden, recepción y factura no coinciden")).toBeVisible();
		await enPantalla(pagina.getByText("Responsable: Aduana")).toBeVisible();
		await enPantalla(pagina.getByRole("table", { name: "Facturas de proveedor" })).toBeVisible();
		await pantalla.capturar(pagina, "contaduria/cuentas-por-pagar-escritorio");
		await pagina.getByRole("table", { name: "Vencidos" }).getByRole("button", { name: "Pagar" }).first().click();
		const ventana = pagina.getByRole("dialog", { name: /^Pagar a / });
		await ventana.getByLabel("Referencia").fill("SPEI 4471");
		const mensaje = await avisaLoQueRegresa(pagina, "contaduria.pagar_cuenta_por_pagar", () =>
			ventana.getByRole("button", { name: "Confirmar con Google y pagar" }).click(),
		);
		expect(mensaje).toMatch(/pagados a /);
		await pagina.close();
		const telefono = await abrir("/contaduria/cuentas-por-pagar", "telefono");
		await enPantalla(telefono.getByRole("table", { name: "Vencidos" })).toBeVisible();
		await pantalla.capturar(telefono, "contaduria/cuentas-por-pagar-telefono");
		await telefono.close();
	});

	it("Compras abre «Capturar nota o factura» con su orden puesta, por la dirección", espera, async () => {
		const orden = await valor("SELECT id FROM ordenes_compra WHERE estado IN ('enviada', 'recibida') ORDER BY folio");
		const folio = await valor("SELECT folio FROM ordenes_compra WHERE id = $1", [orden]);
		const pagina = await abrir(`/contaduria/cuentas-por-pagar?ventana=capturar_factura&orden_compra_id=${orden}`);
		const ventana = pagina.getByRole("dialog", { name: "Capturar nota o factura" });
		await enPantalla(ventana.getByRole("checkbox", { name: new RegExp(`^${folio}`) })).toBeChecked();
		await pantalla.capturar(pagina, "contaduria/ventana-capturar-factura");
		await pagina.close();
	});

	it("Terceros: el filtro en la dirección, el cajón del tercero y «Compensar»", espera, async () => {
		const pagina = await abrir("/contaduria/terceros");
		const tabla = pagina.getByRole("table", { name: "Terceros" });
		await enPantalla(tabla.getByText("Distribuidora Escolar Zamora")).toBeVisible();
		await pantalla.capturar(pagina, "contaduria/terceros-escritorio");
		await pagina
			.getByRole("toolbar", { name: "Filtrar por relación" })
			.getByRole("button", { name: "Acreedores" })
			.click();
		await enPantalla(pagina).toHaveURL(/rol=acreedor/);
		await tabla.getByText("Distribuidora Escolar Zamora").click();
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText("Consultas de esta ficha quedan en la bitácora")).toBeVisible();
		await pantalla.capturar(pagina, "contaduria/cajon-tercero");
		await cajon.getByRole("button", { name: "Compensar" }).click();
		const ventana = pagina.getByRole("dialog", { name: /^Compensar con / });
		await ventana.getByLabel("Monto").fill("1000");
		const mensaje = await avisaLoQueRegresa(pagina, "contaduria.compensar", () =>
			ventana.getByRole("button", { name: "Compensar" }).click(),
		);
		expect(mensaje).toBe("Compensación registrada: $1,000 con Distribuidora Escolar Zamora");
		await pagina.close();
	});

	it("Gastos: «Registrar gasto» lo registra y sale en el registro", espera, async () => {
		const pagina = await abrir("/contaduria/gastos");
		await pagina.getByRole("button", { name: "Registrar gasto" }).click();
		const ventana = pagina.getByRole("dialog", { name: "Registrar gasto" });
		await ventana.getByLabel("Categoría").selectOption({ label: "Luz" });
		await ventana.getByLabel("Monto").fill("3840");
		const mensaje = await avisaLoQueRegresa(pagina, "contaduria.registrar_gasto", () =>
			ventana.getByRole("button", { name: "Registrar gasto" }).click(),
		);
		expect(mensaje).toMatch(/^G-\d+ registrado$/);
		await enPantalla(pagina.getByRole("table", { name: /^Registro de gastos/ }).getByText("Luz")).toBeVisible();
		await pantalla.capturar(pagina, "contaduria/gastos-escritorio");
		await pagina.close();
	});

	it(
		"Contador externo: «Preparar paquete» muestra la cuenta del mes y «Marcar como enviado» lo manda",
		espera,
		async () => {
			await pantalla.servidor.base.dueno.query(
				"INSERT INTO paquetes_contador (id, mes, fecha_limite) VALUES (gen_random_uuid(), '2026-09-01', '2026-10-17')",
			);
			const pagina = await abrir("/contaduria/contador-externo");
			await enPantalla(pagina.getByText("septiembre 2026").first()).toBeVisible();
			await pantalla.capturar(pagina, "contaduria/contador-externo-escritorio");
			await pagina.getByRole("button", { name: "Preparar paquete" }).click();
			const ventana = pagina.getByRole("dialog", { name: /^Paquete de / });
			await enPantalla(ventana.getByText("Cobranza a clientes")).toBeVisible();
			// Sin «ven sueldos y tarifas», la nómina del paquete no viaja.
			await enPantalla(ventana.getByText("••••")).toBeVisible();
			const mensaje = await avisaLoQueRegresa(pagina, "contaduria.marcar_paquete_enviado", () =>
				ventana.getByRole("button", { name: "Marcar como enviado" }).click(),
			);
			expect(mensaje).toMatch(/^Paquete de .+ enviado al contador$/);
			await pagina.close();
		},
	);

	it("Nómina sin «ven sueldos y tarifas»: solo el candado, sin pedir la nómina", espera, async () => {
		const pagina = await abrir("/contaduria/nomina");
		const pedidas: string[] = [];
		pagina.on("request", (pedida) => pedidas.push(pedida.url()));
		await enPantalla(
			pagina.getByText("Esta cuenta no tiene acceso a sueldos. Lo decide la dueña en Administración del sistema."),
		).toBeVisible();
		expect(pedidas.some((url) => url.includes("contaduria.nomina_semana"))).toBe(false);
		await pantalla.capturar(pagina, "contaduria/nomina-sin-permiso");
		await pagina.close();
	});
});
