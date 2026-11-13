/**
 * Prueba de las pantallas de Ventas a externos en el navegador, con la API de prueba y la muestra: cada pestaña y cada
 * cajón se ven como la muestra (con sus capturas en escritorio y en teléfono), cada botón llama a su acción y el aviso
 * de abajo dice el texto que regresa, un cajón con captura pregunta antes de cerrarse, y un choque de versión lo avisa.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono…», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el
 * texto que regresa» y «Cada pantalla tiene sus estados: … choque de versión»)
 */

import { expect as enPantalla, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listoEnAduanaDePrueba } from "../../../../api/src/nucleo/pruebas/inventario-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	pedidoConfirmadoDePrueba,
	prendaParaVender,
} from "../../../../api/src/nucleo/pruebas/ventas-de-prueba.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Cuánto espera cada caso: abre el navegador y lee la API. */
const espera = { timeout: 120_000 };

describe("Las pantallas de Ventas a externos: pestañas, cajones, botones y avisos", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/** El id de un renglón de la muestra. */
	async function idDe(consulta: string, valor: string): Promise<string> {
		const { rows } = await pantalla.servidor.base.dueno.query(consulta, [valor]);
		return String(rows[0]?.id);
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
		const cuerpo = (await (await respuesta).json()) as {
			ok: boolean;
			resultado?: { mensaje: string };
			mensaje?: string;
		};
		expect(cuerpo.ok, JSON.stringify(cuerpo)).toBe(true);
		const mensaje = cuerpo.resultado?.mensaje ?? "";
		// El aviso vive fuera del cajón (que deja lo de atrás fuera del lector de pantalla): se busca por su papel en el HTML.
		await enPantalla(pagina.locator("[role=status]", { hasText: mensaje })).toBeVisible();
		return mensaje;
	}

	it("Pendientes: los cinco indicadores y los renglones por grupo, en escritorio y en teléfono", espera, async () => {
		const pagina = await pantalla.abrir("/ventas", { quien: "ventas" });
		await enPantalla(pagina.locator("h1")).toHaveText("Ventas a externos");
		for (const cifra of [
			"Pedidos abiertos",
			"Piezas por entregar",
			"Entregas en 7 días",
			"Notas de entrega",
			"Clientes",
		]) {
			await enPantalla(pagina.getByRole("button", { name: new RegExp(cifra) }).first()).toBeVisible();
		}
		const tabla = pagina.getByRole("table", { name: "Pendientes" });
		await enPantalla(tabla.getByText("Detenido por crédito")).toBeVisible();
		await enPantalla(tabla.getByText("Borrador", { exact: true }).first()).toBeVisible();
		await pantalla.capturar(pagina, "ventas/pendientes-escritorio");
		// El grupo va en la dirección.
		await pagina
			.getByRole("toolbar", { name: "Filtrar pendientes" })
			.getByRole("button", { name: /Clientes/ })
			.click();
		await enPantalla(pagina).toHaveURL(/grupo=clientes/);
		await enPantalla(tabla.getByRole("row")).toHaveCount(2);
		// «Ver cliente» lleva a Pedidos, a su grupo.
		await tabla.getByRole("button", { name: "Ver cliente" }).click();
		await enPantalla(pagina).toHaveURL(/\/ventas\/pedidos\?de_cliente=/);
		await enPantalla(pagina.getByRole("region", { name: "Uniformes El Bajío" })).toBeVisible();
		await pagina.close();
		const telefono = await pantalla.abrir("/ventas", { quien: "ventas", tamano: "telefono" });
		await enPantalla(telefono.getByRole("table", { name: "Pendientes" })).toBeVisible();
		await pantalla.capturar(telefono, "ventas/pendientes-telefono");
		await telefono.close();
	});

	it(
		"Pedidos: por cliente con su crédito, por estado, el filtro por etapa y el buscador en la dirección",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/ventas/pedidos", { quien: "ventas" });
			await enPantalla(pagina.getByRole("region", { name: "Colegio Morelos" })).toBeVisible();
			const bajio = pagina.getByRole("region", { name: "Uniformes El Bajío" });
			await enPantalla(bajio.getByText("No se le pueden levantar pedidos nuevos")).toBeVisible();
			await enPantalla(bajio.getByText("Sin pedidos abiertos")).toBeVisible();
			await pantalla.capturar(pagina, "ventas/pedidos-escritorio");
			await pagina
				.getByRole("toolbar", { name: "Filtrar por etapa" })
				.getByRole("button", { name: /Borrador/ })
				.click();
			await enPantalla(pagina).toHaveURL(/etapa=borrador/);
			await enPantalla(pagina.getByRole("table", { name: "Pedidos" }).getByText("Sin confirmar")).toHaveCount(2);
			await pagina.getByRole("toolbar", { name: "Ver pedidos" }).getByRole("button", { name: "Por estado" }).click();
			await enPantalla(pagina.getByRole("region", { name: "Borrador" })).toBeVisible();
			await pantalla.capturar(pagina, "ventas/pedidos-por-estado");
			await pagina.getByLabel("Buscar pedidos").fill("zzzz");
			await enPantalla(pagina.getByText("No hay pedidos con esos filtros")).toBeVisible();
			await pagina.getByRole("button", { name: "Quitar filtros" }).click();
			await enPantalla(pagina).not.toHaveURL(/buscar=/);
			await pagina.close();
			const telefono = await pantalla.abrir("/ventas/pedidos", { quien: "ventas", tamano: "telefono" });
			await enPantalla(telefono.getByRole("region", { name: "Colegio Morelos" })).toBeVisible();
			await pantalla.capturar(telefono, "ventas/pedidos-telefono");
			await telefono.close();
		},
	);

	it(
		"el cajón del pedido: avance, prendas por talla, su nota, su historial; Notas de entrega con su pago",
		espera,
		async () => {
			const pedido = await idDe("SELECT id FROM pedidos WHERE folio = $1", "PE-0013");
			const pagina = await pantalla.abrir(`/ventas/pedidos?cajon=pedido&id=${pedido}`, { quien: "ventas" });
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByText("70 de 200 piezas entregadas")).toBeVisible();
			await enPantalla(cajon.getByText("NV-0010")).toBeVisible();
			await enPantalla(cajon.getByRole("button", { name: "PDF" })).toBeVisible();
			await enPantalla(cajon.getByRole("button", { name: "Modificar pedido" })).toBeVisible();
			await pantalla.capturar(pagina, "ventas/cajon-pedido");
			// «1 nota de entrega» lleva a Notas de entrega filtradas por el pedido.
			await cajon
				.getByRole("button", { name: /nota de entrega/ })
				.first()
				.click();
			await enPantalla(pagina).toHaveURL(/\/ventas\/notas\?del_pedido=/);
			await enPantalla(pagina.getByRole("button", { name: "Pedido PE-0013" })).toBeVisible();
			const tabla = pagina.getByRole("table", { name: "Notas de entrega" });
			await enPantalla(tabla.getByText("Sin pagar")).toBeVisible();
			await pantalla.capturar(pagina, "ventas/notas-escritorio");
			await tabla.getByText("NV-0010").click();
			await enPantalla(pagina.getByRole("dialog").getByText("Nota de crédito")).toBeVisible();
			await pantalla.capturar(pagina, "ventas/cajon-nota");
			await pagina.close();
		},
	);

	it("un borrador se confirma desde su cajón y el aviso dice lo que regresa la acción", espera, async () => {
		const pedido = await idDe("SELECT id FROM pedidos WHERE folio = $1", "PE-0017");
		const pagina = await pantalla.abrir(`/ventas/pedidos?cajon=pedido&id=${pedido}`, { quien: "ventas" });
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByRole("button", { name: "Confirmar pedido" })).toBeVisible();
		const mensaje = await avisaLoQueRegresa(pagina, "ventas.confirmar_pedido", () =>
			cajon.getByRole("button", { name: "Confirmar pedido" }).click(),
		);
		expect(mensaje).toMatch(/^PE-0017 confirmado para Jardín de Niños Gabriela Mistral\. El precio quedó congelado/);
		await enPantalla(cajon.getByRole("button", { name: "Modificar pedido" })).toBeVisible();
		await pagina.close();
	});

	it("un choque de versión lo avisa sin perder lo que se veía", espera, async () => {
		const pedido = await idDe("SELECT id FROM pedidos WHERE folio = $1", "PE-0015");
		const pagina = await pantalla.abrir(`/ventas/pedidos?cajon=pedido&id=${pedido}`, { quien: "ventas" });
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByRole("button", { name: "Confirmar pedido" })).toBeVisible();
		// Otra cuenta lo cambia mientras se ve.
		await pantalla.servidor.base.dueno.query("UPDATE pedidos SET fecha_entrega = fecha_entrega + 1 WHERE id = $1", [
			pedido,
		]);
		await cajon.getByRole("button", { name: "Confirmar pedido" }).click();
		await enPantalla(
			cajon.getByText("PE-0015 cambió mientras lo veías. Revisa los cambios y vuelve a guardar"),
		).toBeVisible();
		await pagina.close();
	});

	it(
		"el pedido nuevo: cliente, entrega, prenda por talla, «Guardar borrador»; con cambios pregunta antes de cerrar",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/ventas", { quien: "ventas" });
			await pagina.getByRole("button", { name: "Nuevo pedido" }).first().click();
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByText("¿Para qué cliente?")).toBeVisible();
			await cajon.getByLabel("Cliente").selectOption({ label: "Colegio Morelos" });
			await cajon.getByLabel("Entrega").fill("2027-01-15");
			await cajon.getByRole("button", { name: "Agregar prenda" }).click();
			await enPantalla(cajon.getByText("Modelos de Colegio Morelos")).toBeVisible();
			await pantalla.capturar(pagina, "ventas/cajon-pedido-nuevo-buscador");
			await cajon.getByRole("button", { name: "Agregar", exact: true }).first().click();
			await cajon.getByRole("button", { name: "Listo" }).click();
			const prenda = cajon.getByRole("article").first();
			await prenda.getByRole("textbox").nth(1).fill("12");
			await pantalla.capturar(pagina, "ventas/cajon-pedido-nuevo");
			// Cerrar con cambios pregunta antes.
			await cajon.getByRole("button", { name: "Cerrar" }).click();
			await enPantalla(pagina.getByText("Tienes cambios sin guardar. ¿Salir sin guardar?")).toBeVisible();
			await pagina.getByRole("button", { name: "Volver" }).click();
			const mensaje = await avisaLoQueRegresa(pagina, "ventas.guardar_borrador_pedido", () =>
				cajon.getByRole("button", { name: "Guardar borrador" }).click(),
			);
			expect(mensaje).toMatch(/guardado como borrador para Colegio Morelos$/);
			await enPantalla(pagina.getByRole("dialog")).toHaveCount(0);
			await pagina.close();
		},
	);

	it("mandar a producción desde la revisión, armar una nota con lo listo y cancelarla con motivo", espera, async () => {
		const prenda = await prendaParaVender(pantalla.servidor);
		const cliente = await darDeAltaClienteDePrueba(pantalla.servidor);
		const nuevo = await pedidoConfirmadoDePrueba(pantalla.servidor, {
			cliente_id: cliente.cliente_id,
			renglones: [
				{ variante_id: prenda.variantes["4"], cantidad: 30 },
				{ variante_id: prenda.variantes["6"], cantidad: 10 },
			],
		});
		const pagina = await pantalla.abrir(`/ventas/pedidos?cajon=mandar&id=${nuevo.pedido_id}`, { quien: "ventas" });
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText("Sin receta: no se corta hasta que Patronaje la capture")).toBeVisible();
		await pantalla.capturar(pagina, "ventas/cajon-mandar");
		const mandado = await avisaLoQueRegresa(pagina, "ventas.mandar_a_produccion", () =>
			cajon.getByRole("button", { name: "Mandar a producción" }).click(),
		);
		expect(mandado).toMatch(new RegExp(`^${nuevo.folio}: 40 piezas a producción: OP-`));
		// Lo listo en aduana se arma en una nota.
		await listoEnAduanaDePrueba(pantalla.servidor, nuevo.pedido_id, prenda.variantes["4"] ?? "", 12);
		await pagina.goto(pagina.url().replace(/cajon=[a-z]+/, "cajon=armar"));
		const armar = pagina.getByRole("dialog");
		await enPantalla(armar.getByText("12 listas en aduana · faltan 40 del pedido")).toBeVisible();
		await pantalla.capturar(pagina, "ventas/cajon-armar-nota");
		const armada = await avisaLoQueRegresa(pagina, "ventas.armar_nota_entrega", () =>
			armar.getByRole("button", { name: /^Crear nota NV-/ }).click(),
		);
		expect(armada).toMatch(/^NV-\d+ lista: 12 piezas por despachar en aduana$/);
		const nota = await idDe("SELECT id FROM notas_entrega WHERE pedido_id = $1", nuevo.pedido_id);
		await pagina.goto(pagina.url().replace(/cajon=[a-z]+&id=[0-9a-f-]+/, `cajon=nota&id=${nota}`));
		await pagina.getByRole("dialog").getByRole("button", { name: "Cancelar nota" }).click();
		await pagina.getByLabel("Motivo").fill("El cliente la pidió después");
		const cancelada = await avisaLoQueRegresa(pagina, "ventas.cancelar_nota_entrega", () =>
			pagina.getByRole("button", { name: "Cancelar nota" }).last().click(),
		);
		expect(cancelada).toMatch(/cancelada: sus piezas regresan a lo listo del pedido/);
		await pagina.close();
	});

	it(
		"Clientes: las fichas con su crédito, el alta de un cliente nuevo, en escritorio y en teléfono",
		espera,
		async () => {
			const { rows } = await pantalla.servidor.base.dueno.query(
				"SELECT count(*)::int AS n FROM clientes WHERE baja_en IS NULL",
			);
			const activos = Number(rows[0]?.n);
			const pagina = await pantalla.abrir("/ventas/clientes", { quien: "ventas" });
			await enPantalla(pagina.getByRole("heading", { name: `${activos} clientes` })).toBeVisible();
			const bajio = pagina.getByRole("article", { name: "Uniformes El Bajío" });
			await enPantalla(bajio.getByText("Sin pedidos nuevos")).toBeVisible();
			await pantalla.capturar(pagina, "ventas/clientes-escritorio");
			await pagina.getByRole("button", { name: "Nuevo cliente" }).click();
			const cajon = pagina.getByRole("dialog");
			await cajon.getByLabel("Nombre").fill("Papelería Escolar Tangancícuaro");
			await cajon.getByLabel("Tipo").selectOption({ label: "Mayorista" });
			await cajon.getByLabel("Municipio").fill("Tangancícuaro");
			await cajon.getByLabel("Dirección de entrega").fill("Calle Morelos 15, Centro");
			await cajon.getByLabel("Teléfono").fill("3555551234");
			await pantalla.capturar(pagina, "ventas/cajon-cliente-nuevo");
			const mensaje = await avisaLoQueRegresa(pagina, "ventas.crear_cliente", () =>
				cajon.getByRole("button", { name: "Dar de alta" }).click(),
			);
			expect(mensaje).toMatch(/^Papelería Escolar Tangancícuaro dado de alta/);
			await enPantalla(pagina.getByRole("heading", { name: `${activos + 1} clientes` })).toBeVisible();
			await pagina.close();
			const telefono = await pantalla.abrir("/ventas/clientes", { quien: "ventas", tamano: "telefono" });
			await enPantalla(telefono.getByRole("article", { name: "Colegio Morelos" })).toBeVisible();
			await pantalla.capturar(telefono, "ventas/clientes-telefono");
			await telefono.close();
			const notas = await pantalla.abrir("/ventas/notas", { quien: "ventas", tamano: "telefono" });
			await enPantalla(notas.getByRole("table", { name: "Notas de entrega" })).toBeVisible();
			await pantalla.capturar(notas, "ventas/notas-telefono");
			await notas.close();
		},
	);

	it("sin Ventas, sus pantallas dicen «No tienes acceso a esta pantalla»", espera, async () => {
		const pagina = await pantalla.abrir("/ventas/notas", { quien: "aduana" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await pagina.close();
	});
});
