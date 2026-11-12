/**
 * Las ayudas de las pruebas de Ventas: un cliente dado de alta con `ventas.crear_cliente`, o solo su renglón (con su
 * tercero) para las pruebas que crean su lista o su crédito con las internas; un pedido escrito directo, una prenda
 * que se vende a externos y guardar o confirmar un pedido con las acciones.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Cómo se construye»)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { siembraDelCatalogo } from "./catalogo-de-prueba.ts";
import { llamarInterna } from "./inventario-de-prueba.ts";
import { mandarAccion } from "./llamadas.ts";
import { prendaDelTaller } from "./produccion-de-prueba.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Los tipos de cliente. */
type TipoDeCliente = "escuela" | "mayorista" | "empresa_otro";

/** Un cliente dado de alta en la prueba. */
export interface ClienteDeVentas {
	clienteId: string;
	terceroId: string;
	nombre: string;
}

/** Un nombre que ningún otro cliente de la prueba tiene. */
export function nombreDeClienteNuevo(prefijo = "Cliente de prueba"): string {
	return `${prefijo} ${uuidv7().slice(-12)}`;
}

/**
 * Da de alta un cliente con `ventas.crear_cliente`: su tercero, su crédito, su lista y, si es escuela, su escuela.
 * @param servidor El servidor de prueba.
 * @param datos Lo que cambia de la ficha de ejemplo (un mayorista de León).
 * @returns El cliente, su lista y su escuela.
 */
export async function darDeAltaClienteDePrueba(servidor: ServidorDePrueba, datos: Record<string, unknown> = {}) {
	const respuesta = await mandarAccion(
		servidor,
		"ventas.crear_cliente",
		{
			datos: {
				nombre: nombreDeClienteNuevo(),
				tipo: "mayorista",
				municipio: "León",
				direccion_entrega: "Blvd. López Mateos 1200, León",
				telefono: "4771234567",
				...datos,
			},
		},
		"ventas",
	);
	return z
		.object({ cliente_id: z.uuid(), lista_id: z.uuid(), escuela_id: z.uuid().nullable() })
		.parse(respuesta.cuerpo.resultado);
}

/**
 * Solo el renglón de un cliente, con su tercero (y su escuela, si es escuela): sin crédito ni lista, para las pruebas
 * que los crean con las internas de Contaduría y de Catálogo.
 * @param servidor El servidor de prueba.
 * @param tipo Su tipo.
 * @param nombre Su nombre; uno nuevo si no se dice.
 */
export async function renglonDeClienteDePrueba(
	servidor: ServidorDePrueba,
	tipo: TipoDeCliente = "mayorista",
	nombre = nombreDeClienteNuevo(),
): Promise<ClienteDeVentas> {
	const { tercero_id: terceroId } = z
		.object({ tercero_id: z.uuid() })
		.parse(await llamarInterna(servidor, "contaduria.crear_tercero", { nombre, rol: "cliente" }));
	const escuelaId =
		tipo === "escuela"
			? z
					.object({ escuela_id: z.uuid() })
					.parse(await llamarInterna(servidor, "catalogo.crear_escuela_para_cliente", { nombre, municipio: "León" }))
					.escuela_id
			: null;
	const clienteId = uuidv7();
	await servidor.base.dueno.query(
		`INSERT INTO clientes (id, tercero_id, tipo, escuela_id, municipio, direccion_entrega, telefono)
		 VALUES ($1, $2, $3, $4, 'León', 'Blvd. López Mateos 1200, León', '4771234567')`,
		[clienteId, terceroId, tipo, escuelaId],
	);
	return { clienteId, terceroId, nombre };
}

/** El cliente de los pedidos de prueba de cada servidor, para no dar de alta uno por pedido. */
const clientesDePedidos = new WeakMap<ServidorDePrueba, Promise<string>>();

/**
 * Escribe directo un pedido confirmado, sin renglones y con su versión 1, para las pruebas que solo necesitan un pedido
 * de verdad al que apunten sus reservas, sus lotes o sus anticipos.
 * @param servidor El servidor de prueba.
 * @param clienteId Su cliente; uno de prueba si no se dice.
 * @returns El id del pedido.
 */
export async function pedidoDePrueba(servidor: ServidorDePrueba, clienteId?: string): Promise<string> {
	let cliente = clienteId;
	if (cliente === undefined) {
		const yaHay =
			clientesDePedidos.get(servidor) ?? renglonDeClienteDePrueba(servidor).then((nuevo) => nuevo.clienteId);
		clientesDePedidos.set(servidor, yaHay);
		cliente = await yaHay;
	}
	const id = uuidv7();
	await servidor.base.dueno.query(
		`INSERT INTO pedidos (id, folio, cliente_id, estado, fecha_entrega, forma_pago, dias_credito, confirmado_en)
		 VALUES ($1, $2, $3, 'confirmado', (now() AT TIME ZONE 'America/Mexico_City')::date + 30, 'contado', 0, now())`,
		[id, `PE-P${id.slice(-8)}`, cliente],
	);
	await servidor.base.dueno.query(
		`INSERT INTO pedido_versiones (id, pedido_id, numero, origen, fecha_entrega, forma_pago, dias_credito)
		 SELECT $1, id, 1, 'confirmacion', fecha_entrega, forma_pago, dias_credito FROM pedidos WHERE id = $2`,
		[uuidv7(), id],
	);
	return id;
}

/**
 * La versión vigente de un pedido, para lo que se manda a producción con ella.
 * @param servidor El servidor de prueba.
 * @param pedidoId El pedido.
 */
export async function versionVigenteDePrueba(servidor: ServidorDePrueba, pedidoId: string): Promise<string> {
	const { rows } = await servidor.base.dueno.query(
		`SELECT v.id FROM pedido_versiones v JOIN pedidos p ON p.id = v.pedido_id AND v.numero = p.version_vigente
		 WHERE p.id = $1`,
		[pedidoId],
	);
	return z.uuid().parse(rows[0]?.id);
}

/**
 * Una playera infantil del taller (tallas 4, 6 y 8, $250 en Mostrador) que se vende a clientes externos.
 * @param servidor El servidor de prueba.
 * @param cambios Lo que cambia del alta.
 */
export async function prendaParaVender(servidor: ServidorDePrueba, cambios: Record<string, unknown> = {}) {
	return prendaDelTaller(servidor, await siembraDelCatalogo(servidor), {
		canales: ["mostrador", "externos"],
		...cambios,
	});
}

/** Lo que regresan guardar y confirmar un pedido. */
const pedidoGuardado = z.object({ pedido_id: z.uuid(), folio: z.string() }).passthrough();

/**
 * Ventas guarda o confirma un pedido de un cliente: 30 días a la entrega, de contado, y los renglones que se digan.
 * @param servidor El servidor de prueba.
 * @param accion `guardar_borrador_pedido` o `confirmar_pedido`.
 * @param datos El cliente, los renglones y lo demás que cambie.
 * @param version La versión, si edita un borrador que ya existe.
 */
export async function pedidoDeVentas(
	servidor: ServidorDePrueba,
	accion: "guardar_borrador_pedido" | "confirmar_pedido",
	datos: Record<string, unknown>,
	version?: number,
) {
	return mandarAccion(
		servidor,
		`ventas.${accion}`,
		{
			datos: {
				fecha_entrega: Temporal.Now.plainDateISO("America/Mexico_City").add({ days: 30 }).toString(),
				forma_pago: "contado",
				...datos,
			},
			...(version === undefined ? {} : { version }),
		},
		"ventas",
	);
}

/**
 * Confirma un pedido nuevo y regresa su id y su folio.
 * @param servidor El servidor de prueba.
 * @param datos El cliente, los renglones y lo demás que cambie.
 * @throws Error si no se confirmó.
 */
export async function pedidoConfirmadoDePrueba(servidor: ServidorDePrueba, datos: Record<string, unknown>) {
	const respuesta = await pedidoDeVentas(servidor, "confirmar_pedido", datos);
	if (respuesta.estado !== 200) throw new Error(`no se confirmó: ${JSON.stringify(respuesta.cuerpo)}`);
	return pedidoGuardado.parse(respuesta.cuerpo.resultado);
}

/**
 * La versión de un pedido.
 * @param servidor El servidor de prueba.
 * @param pedidoId El pedido.
 */
export async function versionDelPedido(servidor: ServidorDePrueba, pedidoId: string): Promise<number> {
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM pedidos WHERE id = $1", [pedidoId]);
	return z.number().parse(rows[0]?.v);
}
