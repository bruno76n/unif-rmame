/**
 * Prueba del alcance de la credencial de uniformame.mx: solo alcanza sus dos acciones; no sincroniza; una cuenta de la
 * web no las llama; y Aduana y Bodega nunca reciben precios ni datos del pago de un W-.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «La credencial de uniformame.mx solo
 * alcanza sus dos acciones; Aduana y Bodega nunca reciben precios ni datos del pago»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { revisionDePermisos } from "../../nucleo/acceso/permisos.ts";
import { crearBase } from "../../nucleo/base/conexion.ts";
import { llaveDePrueba, quienesDePrueba } from "../../nucleo/pruebas/cuentas-de-prueba.ts";
import {
	pedidoDelSitio,
	pedidoLineaEnBodega,
	prendaEnLinea,
	recibirCompletoEnAduana,
	surtirPedidoLinea,
} from "../../nucleo/pruebas/linea-de-prueba.ts";
import { mandarAccion } from "../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";
import linea from "./index.ts";

/** Sus dos acciones. */
const suyas = ["linea.recibir_pedido", "linea.confirmar_pago"];

describe("La credencial de uniformame.mx solo alcanza sus dos acciones; Aduana y Bodega nunca ven precios ni el pago", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la revisión de permisos deja a la credencial solo sus dos acciones: ninguna otra acción ni consulta", async () => {
		const sitio = quienesDePrueba.sitio;
		if (sitio === undefined) throw new Error("no hay credencial de prueba");
		const revisar = revisionDePermisos(crearBase(servidor.base.app));
		const ahora = Temporal.Now.instant();
		const contratos = [...servidor.modulos.acciones.values(), ...servidor.modulos.consultas.values()].map(
			(una) => una.contrato,
		);
		expect(contratos.length).toBeGreaterThan(100);
		for (const contrato of contratos) {
			const resultado = await revisar(sitio, contrato.permiso, ahora).then(
				() => "entra",
				(error: { codigo?: string }) => error.codigo,
			);
			expect([contrato.nombre, resultado]).toEqual([
				contrato.nombre,
				suyas.includes(contrato.nombre) ? "entra" : "fuera_de_alcance",
			]);
		}
	});

	it("con datos bien formados: la credencial no cancela un W- y una cuenta de la web no manda ni paga uno", async () => {
		const [variante = ""] = await prendaEnLinea(servidor);
		const pedido = pedidoDelSitio([{ variante_id: variante, cantidad: 1 }]);
		const cancelar = await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/linea.cancelar_pedido",
			headers: { "x-prueba-quien": "sitio" },
			payload: {
				clave_idempotencia: "01936f2e-0000-7000-8000-00000000c0dd",
				datos: { pedido_linea_id: pedido.id, motivo: "Lo canceló el sitio" },
				version: 1,
			},
		});
		expect(cancelar.json()).toMatchObject({ codigo: "fuera_de_alcance" });
		expect((await mandarAccion(servidor, "linea.recibir_pedido", { datos: pedido }, "duena")).cuerpo).toMatchObject({
			codigo: "fuera_de_alcance",
		});
		const pago = {
			pedido_linea_id: pedido.id,
			pasarela: "mercado_pago",
			referencia: "MP-1",
			monto_centavos: 100,
			pagado_en: new Date().toISOString(),
		};
		expect((await mandarAccion(servidor, "linea.confirmar_pago", { datos: pago }, "linea")).cuerpo).toMatchObject({
			codigo: "fuera_de_alcance",
		});
	});

	it("con su llave de verdad entra sin versión de app, y no sincroniza", async () => {
		const conLlave = await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/linea.confirmar_pago",
			headers: { authorization: llaveDePrueba("sitio") },
			payload: {
				clave_idempotencia: "01936f2e-0000-7000-8000-00000000c0de",
				datos: {
					pedido_linea_id: "01936f2e-0000-7000-8000-00000000c0df",
					pasarela: "mercado_pago",
					referencia: "MP-2",
					monto_centavos: 100,
					pagado_en: new Date().toISOString(),
				},
			},
		});
		// Entró: el W- no existe, pero ni la llave ni la versión la detuvieron.
		expect(conLlave.statusCode).toBe(404);
		const bajar = await servidor.app.inject({
			method: "GET",
			url: "/v1/sync/bajar",
			headers: { authorization: llaveDePrueba("sitio"), "x-app-version": "1.0.0" },
		});
		expect(bajar.json()).toMatchObject({ codigo: "fuera_de_alcance" });
		// Tampoco sube comandos ni archivos.
		const conSuLlave = { authorization: llaveDePrueba("sitio") };
		const subir = await servidor.app.inject({
			method: "POST",
			url: "/v1/sync/subir",
			headers: { ...conSuLlave, "x-app-version": "1.0.0" },
			payload: {
				enviado_en: new Date().toISOString(),
				pendientes_por_subir: 1,
				comandos: [
					{
						clave_idempotencia: "01936f2e-0000-7000-8000-00000000c0e0",
						accion: "linea.confirmar_pago",
						datos: {},
						ocurrido_en: new Date().toISOString(),
					},
				],
			},
		});
		expect(subir.json(), subir.body).toMatchObject({ codigo: "fuera_de_alcance" });
		const subida = await servidor.app.inject({
			method: "POST",
			url: "/v1/archivos/subida",
			headers: conSuLlave,
			payload: {
				proposito: "comprobante",
				modulo: "contaduria",
				nombre_original: "recibo.pdf",
				tipo_mime: "application/pdf",
				tamano_bytes: 10,
				sha256: "0".repeat(64),
			},
		});
		expect(subida.json()).toMatchObject({ codigo: "fuera_de_alcance" });
		// Un archivo que subió Contaduría, sin documento, no existe para él: nunca recibe una dirección firmada.
		const contaduria = quienesDePrueba.contaduria;
		const { rows } = await servidor.base.dueno.query(
			`INSERT INTO archivos (id, proposito, modulo, nombre_original, tipo_mime, tamano_bytes, sha256, almacen_clave, creado_por)
			 VALUES (gen_random_uuid(), 'comprobante', 'contaduria', 'recibo.pdf', 'application/pdf', 10, $1, 'prueba/recibo.pdf', $2)
			 RETURNING id`,
			["0".repeat(64), contaduria?.tipo === "cuenta" ? contaduria.usuarioId : null],
		);
		const ajeno = await servidor.app.inject({ method: "GET", url: `/v1/archivos/${rows[0]?.id}`, headers: conSuLlave });
		expect(ajeno.statusCode, ajeno.body).toBe(404);
	});

	it("lo que Bodega y Aduana reciben al surtir y recibir un W- no trae precios ni datos del pago", async () => {
		const pedido = await pedidoLineaEnBodega(servidor);
		const { respuesta, traspasoId } = await surtirPedidoLinea(servidor, pedido.id);
		const recibido = await recibirCompletoEnAduana(servidor, traspasoId ?? "");
		for (const cuerpo of [respuesta.cuerpo, recibido.cuerpo]) {
			expect(JSON.stringify(cuerpo)).not.toMatch(/centavos|precio|pago|pasarela|mercado/);
		}
		// Los avisos en vivo solo llevan la tabla y el id; sus lectores son Tienda en línea, Aduana y Bodega.
		expect(linea.lectores).toEqual({
			pedidos_linea: ["linea", "aduana", "bodega"],
			pedido_linea_renglones: ["linea", "aduana", "bodega"],
		});
	});
});
