/**
 * Prueba de las pantallas de Administración del sistema en el navegador, con la API de prueba y la muestra, en
 * escritorio y en teléfono: Pendientes (las cifras, el panel y su filtro en la dirección), el cajón Alta de usuario
 * («Dar de alta» con «Confirmar con Google»), Usuarios y accesos («Cerrar», el borrador de departamentos y su ventana),
 * Dispositivos («Registrar dispositivo» y «Revocar»), Configuración (un parámetro al salir de la casilla, y el que no
 * se acepta regresa), Bitácora (el buscador y las alertas en la dirección, «Marcar revisada»), Respaldos y Pantalla de
 * acceso. Guarda las capturas de cada pestaña en `.revision/capturas/admin/`.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el
 * texto que regresa» y «Cada pantalla tiene sus estados»)
 */

import type { Page } from "@playwright/test";
import { esEstadoConocido } from "@uniformame/interfaz/estados/colores";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enPantalla } from "../../../../../pruebas/navegador/en-pantalla.ts";
import {
	escribirAlertaDePrueba,
	pedirAltaDePrueba,
	registrarRespaldoDePrueba,
	registrarRestauracionDePrueba,
} from "../../../../api/src/modulos/admin/consultas/de-prueba.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

describe("Las pantallas de Administración del sistema: se ven como la muestra y cada botón llama a su acción", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
		const respaldo = await registrarRespaldoDePrueba(pantalla.servidor, 3);
		await registrarRestauracionDePrueba(pantalla.servidor, respaldo, 84);
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await pantalla.servidor.base.dueno.query(texto, valores)).rows;
	}

	/**
	 * Abre una ruta como una cuenta; la dueña, con «Confirmar con Google» reciente (sus acciones delicadas lo piden).
	 * @param ruta La ruta.
	 * @param quien La cuenta de prueba.
	 * @param tamano Escritorio o teléfono.
	 */
	async function abrir(ruta: string, quien = "duena", tamano: "escritorio" | "telefono" = "escritorio"): Promise<Page> {
		const pagina = await pantalla.abrir(ruta, { quien, tamano });
		if (quien === "duena") {
			await pagina.setExtraHTTPHeaders({ "x-prueba-quien": "duena", "x-prueba-google": new Date().toISOString() });
			await pagina.reload();
		}
		await enPantalla(pagina.locator("h1")).toHaveText("Administración del sistema");
		return pagina;
	}

	/**
	 * Espera la respuesta de una acción y el aviso de abajo con su texto.
	 * @param pagina La página.
	 * @param accion El nombre de la acción.
	 * @param texto El texto del aviso.
	 * @param tocar Lo que la manda.
	 */
	async function avisaAlResponder(pagina: Page, accion: string, texto: string | RegExp, tocar: () => Promise<void>) {
		const respuesta = pagina.waitForResponse((una) => una.url().includes(`/v1/acciones/${accion}`));
		await tocar();
		await respuesta;
		await enPantalla(pagina.getByRole("status").getByText(texto)).toBeVisible();
	}

	it("Pendientes: las cifras, el alta por confirmar y la alerta, sus estados de la guía y el filtro en la dirección", {
		timeout: 120_000,
	}, async () => {
		const alta = await pedirAltaDePrueba(pantalla.servidor, 0);
		await escribirAlertaDePrueba(pantalla.servidor, "intruso@gmail.invalid");
		const pagina = await abrir("/admin");
		for (const cifra of ["Usuarios y accesos", "Dispositivos", "Bitácora", "Respaldos"]) {
			await enPantalla(pagina.getByRole("button", { name: new RegExp(cifra) }).first()).toBeVisible();
		}
		const panel = pagina.getByRole("table", { name: "Pendientes" });
		await enPantalla(panel.getByText(alta.persona, { exact: false })).toBeVisible();
		await enPantalla(panel.getByText("Por confirmar", { exact: true })).toBeVisible();
		await enPantalla(panel.getByText("Por probar", { exact: true })).toBeVisible();
		await enPantalla(
			panel.getByText("Intentó entrar una cuenta de Google sin acceso: intruso@gmail.invalid"),
		).toBeVisible();
		// Cada estado del panel es uno de la guía de textos, con su color.
		for (const estado of await panel.locator("[data-color]").allInnerTexts()) {
			const texto = estado.split("\n")[0] ?? "";
			expect(esEstadoConocido(texto), estado).toBe(true);
		}
		await enPantalla(panel.locator('[data-color="ambar"]').getByText("Por confirmar", { exact: true })).toBeVisible();
		await pantalla.capturar(pagina, "admin/pendientes-escritorio");
		await pagina
			.getByRole("toolbar", { name: "Filtrar pendientes" })
			.getByRole("button", { name: /Seguridad/ })
			.click();
		await enPantalla(pagina).toHaveURL(/grupo=seguridad/);
		await enPantalla(panel.getByText("Por confirmar", { exact: true })).toHaveCount(0);
		// «Marcar revisada» la marca, con el aviso que regresa la acción.
		await avisaAlResponder(pagina, "admin.marcar_alerta_revisada", "Alerta revisada", () =>
			panel.getByRole("button", { name: "Marcar revisada" }).first().click(),
		);
		await pagina.close();
		const telefono = await abrir("/admin", "duena", "telefono");
		await enPantalla(telefono.getByRole("table", { name: "Pendientes" })).toBeVisible();
		await pantalla.capturar(telefono, "admin/pendientes-telefono");
		await telefono.close();
	});

	it("«Revisar» abre el cajón Alta de usuario; «Dar de alta» la decide y abre Usuarios y accesos con su cuenta", {
		timeout: 120_000,
	}, async () => {
		const alta = await pedirAltaDePrueba(pantalla.servidor, 1);
		const pagina = await abrir(`/admin?cajon=alta_usuario&id=${alta.autorizacionId}`);
		const cajon = pagina.getByRole("dialog", { name: "Alta de usuario" });
		await enPantalla(cajon.getByText(`${alta.folio} · Pidió Prueba admin`)).toBeVisible();
		await enPantalla(cajon.getByText(alta.correo, { exact: true })).toBeVisible();
		await enPantalla(cajon.getByText(new RegExp(`^Se liga a E-\\d+ · ${alta.persona}`))).toBeVisible();
		await pantalla.capturar(pagina, "admin/cajon-alta-usuario");
		await avisaAlResponder(
			pagina,
			"direccion.decidir_autorizacion",
			`${alta.persona} dada de alta: ya puede entrar con su cuenta de Google`,
			() => cajon.getByRole("button", { name: "Dar de alta" }).click(),
		);
		await enPantalla(pagina).toHaveURL(/\/admin\/usuarios-y-accesos\?resaltar=/);
		const [cuenta] = await consultar("SELECT estado FROM usuarios WHERE id = $1", [alta.usuarioId]);
		expect(cuenta?.estado).toBe("activa");
		await pagina.close();
	});

	it("Usuarios y accesos: «Cerrar» las sesiones y el borrador de departamentos con su ventana", {
		timeout: 120_000,
	}, async () => {
		const pagina = await abrir("/admin/usuarios-y-accesos");
		const usuarios = pagina.getByRole("table", { name: "Usuarios" });
		await enPantalla(usuarios.getByText("Administradora principal")).toBeVisible();
		await enPantalla(usuarios.getByText("Todo lo que hace queda registrado")).toBeVisible();
		await pantalla.capturar(pagina, "admin/usuarios-escritorio");
		const renglonDeCalidad = usuarios.getByRole("row").filter({ hasText: "calidad@alameda.invalid" });
		await avisaAlResponder(pagina, "admin.cerrar_sesiones", "Sesiones de Prueba calidad cerradas", () =>
			renglonDeCalidad.getByRole("button", { name: "Cerrar" }).click(),
		);
		// El borrador: tocar una casilla dice cuántos cambios hay, y su ventana los guarda.
		await pagina.getByRole("checkbox", { name: "Compras para Prueba calidad" }).click();
		await enPantalla(pagina.getByText("1 cambio sin guardar")).toBeVisible();
		await pantalla.capturar(pagina, "admin/usuarios-borrador");
		await pagina.getByRole("button", { name: "Guardar cambios" }).click();
		const ventana = pagina.getByRole("dialog", { name: "Cambiar departamentos" });
		await enPantalla(ventana.getByText("Prueba calidad recibe Compras")).toBeVisible();
		await avisaAlResponder(
			pagina,
			"admin.cambiar_departamentos",
			"Departamentos guardados. Los menús ya cambiaron",
			() => ventana.getByRole("button", { name: "Confirmar con Google" }).click(),
		);
		await enPantalla(pagina.getByText("1 cambio sin guardar")).toHaveCount(0);
		const [compras] = await consultar(
			`SELECT count(*)::int AS cuantos FROM usuario_departamentos ud JOIN departamentos d ON d.id = ud.departamento_id
			 WHERE ud.usuario_id = '01936f2e-0000-7000-8000-000000000060' AND d.clave = 'compras' AND ud.baja_en IS NULL`,
		);
		expect(compras?.cuantos).toBe(1);
		await pagina.close();
		// Las demás cuentas piden la cuenta y no cambian departamentos.
		const oficina = await abrir("/admin/usuarios-y-accesos", "admin");
		await enPantalla(oficina.getByRole("button", { name: "Pedir cuenta nueva" })).toBeVisible();
		await enPantalla(oficina.getByText("Solo la dueña los cambia")).toBeVisible();
		await oficina.close();
		const telefono = await abrir("/admin/usuarios-y-accesos", "duena", "telefono");
		await enPantalla(telefono.getByRole("table", { name: "Usuarios" })).toBeVisible();
		await pantalla.capturar(telefono, "admin/usuarios-telefono");
		await telefono.close();
	});

	it("Dispositivos: «Registrar dispositivo» da el código; «Revocar» pide el motivo y lo revoca", {
		timeout: 120_000,
	}, async () => {
		const pagina = await abrir("/admin/dispositivos");
		const registrados = pagina.getByRole("table", { name: "Registrados" });
		await enPantalla(registrados.getByText("Tablet del taller").first()).toBeVisible();
		await pantalla.capturar(pagina, "admin/dispositivos-escritorio");
		await pagina.getByRole("button", { name: "Registrar dispositivo" }).click();
		const registrar = pagina.getByRole("dialog", { name: "Registrar dispositivo" });
		await registrar.getByLabel("Nombre").fill("Tablet de calidad");
		await registrar.getByLabel("Dónde se usa").selectOption({ label: "Taller" });
		const codigo = pagina.waitForResponse((una) => una.url().includes("/v1/acciones/admin.generar_codigo_registro"));
		await registrar.getByRole("button", { name: "Dar código" }).click();
		await codigo;
		await enPantalla(registrar.getByText(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/)).toBeVisible();
		await pantalla.capturar(pagina, "admin/ventana-registrar-dispositivo");
		await registrar.getByRole("button", { name: "Volver" }).click();
		await enPantalla(registrar).toHaveCount(0);
		const [cancelado] = await consultar("SELECT estado FROM codigos_registro ORDER BY creado_en DESC LIMIT 1");
		expect(cancelado?.estado).toBe("cancelado");
		// Revocar el puente del Taller.
		await registrados
			.getByRole("row")
			.filter({ hasText: "Puente del Taller" })
			.getByRole("button", { name: "Revocar" })
			.click();
		const revocar = pagina.getByRole("dialog", { name: "Revocar Puente del Taller" });
		await revocar.getByLabel("Motivo").fill("Se cambió de computadora");
		await avisaAlResponder(pagina, "admin.revocar_dispositivo", "Puente del Taller revocado: ya no entra", () =>
			revocar.getByRole("button", { name: "Confirmar con Google" }).click(),
		);
		await enPantalla(
			pagina.getByRole("table", { name: "Revocados" }).getByText("Se cambió de computadora"),
		).toBeVisible();
		await pagina.close();
		const telefono = await abrir("/admin/dispositivos", "duena", "telefono");
		await enPantalla(telefono.getByRole("table", { name: "Registrados" })).toBeVisible();
		await pantalla.capturar(telefono, "admin/dispositivos-telefono");
		await telefono.close();
	});

	it("Configuración: un parámetro se guarda al salir de la casilla; vacío no se acepta y regresa al anterior", {
		timeout: 120_000,
	}, async () => {
		const pagina = await abrir("/admin/configuracion");
		const casilla = pagina.getByLabel("Días para un lote atorado (días de trabajo)");
		await enPantalla(casilla).toHaveValue("2");
		await pantalla.capturar(pagina, "admin/configuracion-escritorio");
		await casilla.fill("3");
		await avisaAlResponder(pagina, "admin.cambiar_parametro", "Días para un lote atorado: 3 días de trabajo", () =>
			casilla.blur(),
		);
		await casilla.fill("");
		await avisaAlResponder(pagina, "admin.cambiar_parametro", "Escribe un número mayor que cero", () => casilla.blur());
		await enPantalla(pagina.getByLabel("Días para un lote atorado (días de trabajo)")).toHaveValue("3");
		const [guardado] = await consultar(
			"SELECT valor_entero FROM parametros WHERE clave = 'produccion.lote_atorado_dias'",
		);
		expect(Number(guardado?.valor_entero)).toBe(3);
		await pagina.close();
		// Las demás cuentas la ven apagada.
		const oficina = await abrir("/admin/configuracion", "admin");
		await enPantalla(oficina.getByLabel("Días para un lote atorado (días de trabajo)")).toBeDisabled();
		await enPantalla(oficina.getByText("Solo la dueña puede cambiarlas").first()).toBeVisible();
		await oficina.close();
		const telefono = await abrir("/admin/configuracion", "duena", "telefono");
		await enPantalla(telefono.getByText("Decisiones de operación")).toBeVisible();
		await pantalla.capturar(telefono, "admin/configuracion-telefono");
		await telefono.close();
	});

	it("Bitácora: el buscador y las alertas van en la dirección; lo que no se encuentra lo dice", {
		timeout: 120_000,
	}, async () => {
		const pagina = await abrir("/admin/bitacora");
		await enPantalla(pagina.getByRole("table", { name: "Bitácora" })).toBeVisible();
		await pantalla.capturar(pagina, "admin/bitacora-escritorio");
		await pagina.getByLabel("Buscar en la bitácora").fill("zzzz-nada");
		await enPantalla(pagina).toHaveURL(/buscar=zzzz-nada/);
		await enPantalla(pagina.getByText("Nada con «zzzz-nada»")).toBeVisible();
		await pagina.goto(pagina.url().replace(/\?.*$/, "?alertas=si"));
		await enPantalla(
			pagina
				.getByRole("table", { name: "Bitácora" })
				.getByText(/alerta/)
				.first(),
		).toBeVisible();
		await pagina.close();
		const telefono = await abrir("/admin/bitacora", "duena", "telefono");
		await enPantalla(telefono.getByRole("table", { name: "Bitácora" })).toBeVisible();
		await pantalla.capturar(telefono, "admin/bitacora-telefono");
		await telefono.close();
	});

	it("Respaldos y Pantalla de acceso: lo que llega de su consulta, en escritorio y en teléfono", {
		timeout: 120_000,
	}, async () => {
		const respaldos = await abrir("/admin/respaldos");
		await enPantalla(respaldos.getByText(/ · hace 84 días$/)).toBeVisible();
		await enPantalla(respaldos.getByText("Un respaldo que nunca se restauró no es un respaldo")).toBeVisible();
		await pantalla.capturar(respaldos, "admin/respaldos-escritorio");
		await respaldos.close();
		const acceso = await abrir("/admin/pantalla-de-acceso");
		await enPantalla(acceso.getByRole("button", { name: "Entrar con Google" })).toBeVisible();
		await enPantalla(acceso.getByText(/^Hola, /)).toBeVisible();
		await enPantalla(
			acceso.getByRole("table", { name: "Cuentas con acceso" }).getByText("carmen@uniformesalameda.mx"),
		).toBeVisible();
		await pantalla.capturar(acceso, "admin/pantalla-de-acceso-escritorio");
		await acceso.close();
		for (const [ruta, nombre] of [
			["/admin/respaldos", "respaldos"],
			["/admin/pantalla-de-acceso", "pantalla-de-acceso"],
		] as const) {
			const telefono = await abrir(ruta, "duena", "telefono");
			await enPantalla(
				telefono.getByText(nombre === "respaldos" ? "Pruebas" : "Cuentas con acceso").first(),
			).toBeVisible();
			await pantalla.capturar(telefono, `admin/${nombre}-telefono`);
			await telefono.close();
		}
	});

	it("una cuenta sin Administración del sistema no entra: «No tienes acceso a esta pantalla»", {
		timeout: 60_000,
	}, async () => {
		const pagina = await pantalla.abrir("/admin/usuarios-y-accesos", { quien: "ventas" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await pagina.close();
	});
});
