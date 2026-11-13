/**
 * `ventas.clientes` y `ventas.cliente`: la pestaña Clientes y el cajón del cliente nuevo o de sus datos.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Clientes», «Cliente nuevo y Datos del cliente»)
 *
 * Una ficha por cliente activo, con su crédito como lo ve Ventas (el semáforo de Contaduría, sin montos), sus pedidos
 * abiertos, lo que falta entregarle, su próxima entrega, sus modelos y su lista; y los dados de baja con su motivo. El
 * cajón da los datos de un cliente para editarlos, o las escuelas que todavía no son cliente para el alta.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { tiposDeCliente as tipos } from "@uniformame/compartido/contratos/ventas/clientes";
import { clientesVentas, clienteVentas } from "@uniformame/compartido/contratos/ventas/consultas-clientes";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Base } from "../../../nucleo/base/conexion.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	creditoDe,
	creditosDe,
	leerClientes,
	leerNotasDePedidos,
	leerPedidos,
	leerRenglones,
	tiposDeCliente,
} from "./comun.ts";

/**
 * Un teléfono de 10 dígitos como se lee: «356 555 1204».
 * @param telefono Sus 10 dígitos.
 */
export function textoDeTelefono(telefono: string): string {
	return telefono.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");
}

/** Lo de cada cliente en el catálogo: sus modelos, su lista y cuántos productos tienen precio en ella. */
const catalogoDelCliente = z.array(
	z.object({
		cliente_id: z.uuid(),
		modelos: z.coerce.number(),
		lista: z.string().nullable(),
		en_lista: z.coerce.number(),
	}),
);

/**
 * Lo de cada cliente en el catálogo: los modelos de su escuela, su lista y cuántos productos tienen precio en ella.
 * @param base La base.
 */
async function catalogoDeClientes(base: Base) {
	const { rows } = await base.execute(sql`SELECT c.id AS cliente_id,
			(SELECT count(*) FROM productos p WHERE c.escuela_id IS NOT NULL AND p.escuela_id = c.escuela_id
				AND p.baja_en IS NULL) AS modelos,
			l.nombre AS lista,
			(SELECT count(DISTINCT pr.producto_id) FROM precios pr WHERE pr.lista_id = l.id AND pr.vigente_hasta IS NULL)
				AS en_lista
		FROM clientes c LEFT JOIN listas_precios l ON l.cliente_id = c.id`);
	return catalogoDelCliente.parse(rows);
}

export const consultaClientesVentas = implementarConsulta(clientesVentas, async (contexto) => {
	const { base } = contexto;
	const clientes = await leerClientes(base);
	const activos = clientes.filter((cliente) => cliente.baja_en === null);
	const creditos = await creditosDe(
		contexto,
		activos.map((cliente) => cliente.id),
	);
	const pedidos = await leerPedidos(base);
	const renglones = await leerRenglones(
		base,
		pedidos.map((pedido) => pedido.id),
	);
	const notas = await leerNotasDePedidos(
		base,
		pedidos.map((pedido) => pedido.id),
	);
	const catalogo = await catalogoDeClientes(base);
	return {
		resultado: {
			fichas: activos.map((cliente) => {
				const credito = creditos.get(cliente.id);
				const suyos = pedidos.filter((pedido) => pedido.cliente_id === cliente.id);
				const confirmados = suyos.filter((pedido) => pedido.estado === "confirmado");
				const ids = confirmados.map((pedido) => pedido.id);
				// Lo pedido menos lo entregado de sus pedidos confirmados.
				const pedidas = renglones
					.filter((renglon) => ids.includes(renglon.pedido_id))
					.reduce((total, renglon) => total + renglon.cantidad, 0);
				const entregadas = notas
					.filter((nota) => ids.includes(nota.pedido_id) && nota.estado === "entregada")
					.reduce((total, nota) => total + nota.piezas, 0);
				const proxima = confirmados.map((pedido) => pedido.fecha_entrega).sort()[0];
				const suCatalogo = catalogo.find((suyo) => suyo.cliente_id === cliente.id);
				return {
					cliente_id: cliente.id,
					nombre: cliente.nombre,
					color: cliente.color,
					version: cliente.version,
					descripcion: `${tiposDeCliente[cliente.tipo] ?? cliente.tipo} en ${cliente.municipio}, cliente desde ${cliente.desde}`,
					contacto: [cliente.contacto, textoDeTelefono(cliente.telefono)].filter((parte) => parte !== null).join(" · "),
					credito: { texto: credito?.texto ?? "Sin crédito", color: credito?.color ?? "gris" },
					detenido: credito?.detenido ?? false,
					pedidos_abiertos: confirmados.length,
					borradores: suyos.length - confirmados.length,
					piezas_por_entregar: pedidas - entregadas,
					proxima_entrega: proxima === undefined ? "Ninguna" : textoDeDiaCorto(proxima),
					modelos_propios: suCatalogo?.modelos ?? 0,
					productos_lista: suCatalogo?.en_lista ?? 0,
					lista:
						(suCatalogo?.en_lista ?? 0) === 0
							? "Precios de mayoreo"
							: `Precios de la lista ${suCatalogo?.lista ?? cliente.nombre}`,
				};
			}),
			de_baja: clientes
				.filter((cliente) => cliente.baja_en !== null)
				.map((cliente) => ({
					cliente_id: cliente.id,
					nombre: cliente.nombre,
					version: cliente.version,
					desde: cliente.desde,
					motivo: cliente.motivo_baja ?? "",
				})),
		},
	};
});

/** Los datos de un cliente para editarlos. */
const datosLeidos = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	nombre: z.string(),
	tipo: z.enum(tipos),
	escuela: z.string().nullable(),
	municipio: z.string(),
	direccion_entrega: z.string(),
	contacto: z.string().nullable(),
	telefono: z.string(),
	correo: z.string().nullable(),
	rfc: z.string().nullable(),
	lista: z.string().nullable(),
	baja_en: z.string().nullable(),
});

export const consultaClienteVentas = implementarConsulta(clienteVentas, async (contexto, parametros) => {
	const { base } = contexto;
	const { rows: escuelas } = await base.execute(sql`SELECT e.id AS escuela_id, e.nombre FROM escuelas e
		WHERE e.baja_en IS NULL AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.escuela_id = e.id) ORDER BY e.nombre`);
	const libres = z.array(z.object({ escuela_id: z.uuid(), nombre: z.string() })).parse(escuelas);
	if (parametros.cliente_id === undefined) return { resultado: { escuelas: libres, cliente: null } };
	const { rows } = await base.execute(sql`SELECT c.id, c.version, t.nombre, c.tipo, e.nombre AS escuela, c.municipio,
			c.direccion_entrega, c.contacto, c.telefono, c.correo, t.rfc, l.nombre AS lista, c.baja_en::text AS baja_en
		FROM clientes c JOIN terceros t ON t.id = c.tercero_id LEFT JOIN escuelas e ON e.id = c.escuela_id
		LEFT JOIN listas_precios l ON l.cliente_id = c.id WHERE c.id = ${parametros.cliente_id}`);
	const leido = datosLeidos.optional().parse(rows[0]);
	if (leido === undefined) throw noExiste();
	const credito = await creditoDe(contexto, leido.id);
	return {
		resultado: {
			escuelas: libres,
			cliente: {
				cliente_id: leido.id,
				version: leido.version,
				nombre: leido.nombre,
				tipo: leido.tipo,
				escuela: leido.escuela,
				municipio: leido.municipio,
				direccion_entrega: leido.direccion_entrega,
				contacto: leido.contacto,
				telefono: leido.telefono,
				correo: leido.correo,
				rfc: leido.rfc,
				lista: leido.lista ?? leido.nombre,
				credito: { texto: credito.texto, color: credito.color },
				de_baja: leido.baja_en !== null,
			},
		},
	};
});
