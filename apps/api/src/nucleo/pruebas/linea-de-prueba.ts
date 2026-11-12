/**
 * Las ayudas de las pruebas de la tienda en línea: un W- directo en la base (para las pruebas de Inventario que solo
 * necesitan su llave), una prenda que se vende en línea, el pedido como lo manda el sitio, llamar como el sitio y cómo
 * quedó un W-.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md («Cómo se construye»: las pruebas llaman como lo
 * hará el sitio, con su credencial)
 */

import { v7 as uuidv7 } from "uuid";
import { versionDeTraspaso } from "./aduana-de-prueba.ts";
import { nuevoProducto, siembraDelCatalogo } from "./catalogo-de-prueba.ts";
import { quienesDePrueba } from "./cuentas-de-prueba.ts";
import { meterPiezas, ubicacionesPorCodigo } from "./inventario-de-prueba.ts";
import { mandarAccion, nuevaClave } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** La credencial de uniformame.mx de prueba. */
function credencialDePrueba(): string {
	const sitio = quienesDePrueba.sitio;
	if (sitio?.tipo !== "aparato") throw new Error("no hay credencial de prueba");
	return sitio.dispositivoId;
}

/**
 * Un W- directo en la base, sin renglones: para las pruebas que solo necesitan su llave.
 * @param servidor El servidor de prueba.
 * @param estado Su estado; por omisión, esperando el pago.
 * @returns Su id.
 */
export async function pedidoLineaDePrueba(
	servidor: ServidorDePrueba,
	estado: "esperando_pago" | "por_surtir" = "esperando_pago",
): Promise<string> {
	const id = uuidv7();
	const pagado = estado === "por_surtir";
	await servidor.base.dueno.query(
		`INSERT INTO pedidos_linea (id, folio, cliente_nombre, cliente_correo, envio_destinatario, envio_calle,
			envio_numero_exterior, envio_colonia, envio_municipio, envio_entidad_federativa, envio_codigo_postal,
			envio_metodo, envio_paqueteria, envio_costo_centavos, subtotal_centavos, descuento_centavos,
			descuento_envio_centavos, total_centavos, estado, estado_en, pago_estado, pago_pasarela, pago_referencia,
			pago_metodo, pago_monto_centavos, pagado_en, pago_vence_en, dispositivo_id)
		 VALUES ($1::uuid, $2, 'Cliente de prueba', 'cliente@prueba.invalid', 'Cliente de prueba', 'Calle', '1', 'Centro',
			'Zamora', 'Michoacán', '59600', 'estandar', 'Estafeta', 0, 0, 0, 0, 0, $3, now(), $4, 'prueba', $1::text,
			'tarjeta', 0, $5, $6, $7)`,
		[
			id,
			`W-P${id.slice(-6)}`,
			estado,
			pagado ? "pagado" : "pendiente",
			pagado ? new Date().toISOString() : null,
			pagado ? null : new Date(Date.now() + 86_400_000).toISOString(),
			credencialDePrueba(),
		],
	);
	return id;
}

/**
 * Las tallas 4, 6 y 8 de una playera nueva que se vende en línea (y en mostrador).
 * @param servidor El servidor de prueba.
 * @param enLinea Si se vende en línea; sin él, solo en mostrador.
 * @returns Sus variantes.
 */
export async function prendaEnLinea(servidor: ServidorDePrueba, enLinea = true): Promise<string[]> {
	const nueva = await nuevoProducto(servidor, await siembraDelCatalogo(servidor), {
		canales: enLinea ? ["mostrador", "en_linea"] : ["mostrador"],
	});
	return nueva.variantes.map((variante) => variante.variante_id);
}

/** Un renglón del pedido de prueba. */
export interface RenglonDePrueba {
	variante_id: string;
	cantidad: number;
	precio_unitario_centavos?: number;
	descuento_centavos?: number;
}

/**
 * Un pedido como lo manda el sitio, con sus totales bien hechos: $250 por prenda, envío de $99 y pagado con tarjeta.
 * @param renglones Sus prendas.
 * @param cambios Lo que se quiere distinto (el pago, los totales…).
 */
export function pedidoDelSitio(
	renglones: readonly RenglonDePrueba[],
	cambios: { pago?: Record<string, unknown>; [campo: string]: unknown } = {},
): Record<string, unknown> & { id: string } {
	const conPrecio = renglones.map((renglon, i) => ({
		renglon: i + 1,
		variante_id: renglon.variante_id,
		cantidad: renglon.cantidad,
		precio_unitario_centavos: renglon.precio_unitario_centavos ?? 25_000,
		...(renglon.descuento_centavos === undefined ? {} : { descuento_centavos: renglon.descuento_centavos }),
	}));
	const subtotal = conPrecio.reduce((suma, renglon) => suma + renglon.cantidad * renglon.precio_unitario_centavos, 0);
	const descuento = renglones.reduce((suma, renglon) => suma + (renglon.descuento_centavos ?? 0), 0);
	const total = subtotal - descuento + 9_900;
	const id = uuidv7();
	const { pago, ...otros } = cambios;
	return {
		id,
		cliente: { nombre: "Laura Méndez", correo: "laura@correo.invalid", telefono: "3511234567" },
		envio: {
			destinatario: "Laura Méndez",
			calle: "Hidalgo",
			numero_exterior: "120",
			colonia: "Centro",
			municipio: "Zamora",
			entidad_federativa: "Michoacán",
			codigo_postal: "59600",
			metodo: "estandar",
			paqueteria: "Estafeta",
			costo_centavos: 9_900,
		},
		renglones: conPrecio,
		subtotal_centavos: subtotal,
		descuento_centavos: descuento,
		descuento_envio_centavos: 0,
		total_centavos: total,
		pago: {
			estado: "pagado",
			pasarela: "mercado_pago",
			referencia: `MP-${id.slice(-12)}`,
			metodo: "tarjeta",
			monto_centavos: total,
			comision_centavos: 1_500,
			pagado_en: new Date().toISOString(),
			respuesta: { id: `MP-${id.slice(-12)}`, status: "approved" },
			...pago,
		},
		...otros,
	};
}

/**
 * Llama una acción como el sitio: con su credencial, sin `Origin` ni `X-App-Version`.
 * @param servidor El servidor de prueba.
 * @param nombre La acción.
 * @param datos Lo que manda.
 * @param clave La clave de idempotencia; por omisión, una nueva.
 */
export async function comoElSitio(servidor: ServidorDePrueba, nombre: string, datos: unknown, clave = nuevaClave()) {
	const respuesta = await servidor.app.inject({
		method: "POST",
		url: `/v1/acciones/${nombre}`,
		headers: { "x-prueba-quien": "sitio" },
		payload: { clave_idempotencia: clave, datos },
	});
	return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
}

/**
 * Cómo quedó un W-: su estado, su promesa, su pago y sus reservas activas por ubicación.
 * @param servidor El servidor de prueba.
 * @param id El W-.
 */
export async function pedidoLineaComoQuedo(servidor: ServidorDePrueba, id: string) {
	const { rows } = await servidor.base.dueno.query(
		`SELECT p.folio, p.estado, p.promesa, p.pago_estado,
			(SELECT coalesce(json_agg(json_build_object('ubicacion', u.codigo, 'piezas', r.piezas, 'vence', r.vence_en IS NOT NULL)
				ORDER BY u.codigo, r.piezas), '[]') FROM reservas r JOIN ubicaciones u ON u.id = r.ubicacion_id
			 WHERE r.pedido_linea_id = p.id AND r.estado = 'activa') AS reservas
		 FROM pedidos_linea p WHERE p.id = $1`,
		[id],
	);
	return rows[0];
}

/**
 * Un W- pagado de una prenda con sus piezas en Bodega, ya apartadas.
 * @param servidor El servidor de prueba.
 * @param piezas Cuántas.
 * @returns El W-, su folio y su variante.
 */
export async function pedidoLineaEnBodega(servidor: ServidorDePrueba, piezas = 1) {
	const [variante = ""] = await prendaEnLinea(servidor);
	const { BOD = "" } = await ubicacionesPorCodigo(servidor);
	await meterPiezas(servidor, BOD, variante, piezas);
	const pedido = pedidoDelSitio([{ variante_id: variante, cantidad: piezas }]);
	const respuesta = await comoElSitio(servidor, "linea.recibir_pedido", pedido);
	if (respuesta.estado !== 200) throw new Error(`no entró el W-: ${JSON.stringify(respuesta.cuerpo)}`);
	return { id: pedido.id, folio: String((respuesta.cuerpo.resultado as { folio: string }).folio), variante };
}

/**
 * Bodega surte un W- a aduana.
 * @param servidor El servidor de prueba.
 * @param pedidoLineaId El W-.
 * @returns La respuesta y el traspaso que nació.
 */
export async function surtirPedidoLinea(servidor: ServidorDePrueba, pedidoLineaId: string) {
	const respuesta = await mandarAccion(
		servidor,
		"inventario.surtir_a_aduana",
		{ datos: { documento_tipo: "pedido_linea", documento_id: pedidoLineaId } },
		"bodega",
	);
	const traspasoId = (respuesta.cuerpo.resultado as { traspaso_id?: string } | undefined)?.traspaso_id;
	return { respuesta, traspasoId };
}

/**
 * Aduana recibe completo un traspaso.
 * @param servidor El servidor de prueba.
 * @param traspasoId El traspaso.
 */
export async function recibirCompletoEnAduana(servidor: ServidorDePrueba, traspasoId: string) {
	return mandarAccion(
		servidor,
		"inventario.recibir_en_aduana",
		{ datos: { traspaso_id: traspasoId, modo: "completo" }, version: await versionDeTraspaso(servidor, traspasoId) },
		"aduana",
	);
}
