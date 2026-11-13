/**
 * `ventas.buscar_prendas`: el buscador de prendas del pedido.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pedido nuevo y Modificar pedido», «El buscador»)
 *
 * Las prendas que se venden a clientes externos, en cuatro grupos: los modelos de la escuela del cliente, las que
 * tienen precio en su lista, los básicos y generales de la fábrica y los modelos de otras escuelas. Cada una con su
 * escuela, su rango de tallas y su precio sugerido para el cliente con su origen. El buscador pide todas sus palabras
 * en la prenda, la escuela o la sección.
 */

import { buscarPrendas } from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { ordenDeTallas } from "../../catalogo/dominio/tallas.ts";
import { leerClientes, llevaTodas, paraBuscar, rangoDeTallas } from "./comun.ts";
import { sugeridoDe } from "./prendas.ts";

/** Una prenda que se vende a externos, con sus tallas vigentes. */
const prendaLeida = z.object({
	id: z.uuid(),
	nombre: z.string(),
	escuela_id: z.uuid().nullable(),
	escuela: z.string().nullable(),
	seccion: z.string(),
	tallas: z.array(z.string()),
	primera: z.uuid(),
	en_lista: z.boolean(),
});

export const consultaBuscarPrendas = implementarConsulta(buscarPrendas, async (contexto, parametros) => {
	const { base } = contexto;
	const cliente = (await leerClientes(base)).find((suyo) => suyo.id === parametros.cliente_id);
	if (cliente === undefined) throw noExiste();
	const { rows: deEscuela } = await base.execute(sql`SELECT escuela_id FROM clientes WHERE id = ${cliente.id}`);
	const escuelaDelCliente = z.object({ escuela_id: z.uuid().nullable() }).parse(deEscuela[0]).escuela_id;
	const { rows: deLista } = await base.execute(
		sql`SELECT id, nombre FROM listas_precios WHERE cliente_id = ${cliente.id} LIMIT 1`,
	);
	const lista = z.object({ id: z.uuid(), nombre: z.string() }).optional().parse(deLista[0]);
	const { rows } = await base.execute(sql`SELECT p.id, p.nombre, p.escuela_id, e.nombre AS escuela, s.nombre AS seccion,
			array_agg(t.nombre ORDER BY ${ordenDeTallas("t")}) AS tallas,
			(array_agg(v.id ORDER BY v.es_pedido_especial, ${ordenDeTallas("t")}))[1] AS primera,
			EXISTS (SELECT 1 FROM precios pr WHERE pr.producto_id = p.id AND pr.vigente_hasta IS NULL
				AND pr.lista_id = ${lista?.id ?? null}) AS en_lista
		FROM productos p JOIN secciones s ON s.id = p.seccion_id LEFT JOIN escuelas e ON e.id = p.escuela_id
		JOIN variantes v ON v.producto_id = p.id AND v.baja_en IS NULL JOIN tallas t ON t.id = v.talla_id
		WHERE p.canal_externos AND p.baja_en IS NULL AND NOT p.es_servicio
		GROUP BY p.id, e.nombre, s.nombre ORDER BY p.nombre`);
	const prendas = z
		.array(prendaLeida)
		.parse(rows)
		.filter((prenda) =>
			llevaTodas(paraBuscar([prenda.nombre, prenda.escuela ?? "", prenda.seccion].join(" ")), parametros.buscar),
		);
	const grupoDe = (prenda: z.infer<typeof prendaLeida>) =>
		escuelaDelCliente !== null && prenda.escuela_id === escuelaDelCliente
			? "cliente"
			: prenda.en_lista
				? "lista"
				: prenda.escuela_id === null
					? "basicos"
					: "otras";
	const conPrecio = await Promise.all(
		prendas.map(async (prenda) => {
			const sugerido = await sugeridoDe(contexto, cliente.id, prenda.primera);
			return {
				grupo: grupoDe(prenda),
				producto_id: prenda.id,
				nombre: prenda.nombre,
				detalle: `${prenda.escuela ?? "Básico"} · tallas ${rangoDeTallas(prenda.tallas)}`,
				precio_centavos: sugerido.precio,
				origen: sugerido.origen,
			};
		}),
	);
	const titulos = {
		cliente: `Modelos de ${cliente.nombre}`,
		lista: `En la lista de ${lista?.nombre ?? cliente.nombre}`,
		basicos: "Básicos y generales de la fábrica",
		otras: "Modelos de otras escuelas",
	} as const;
	return {
		resultado: {
			cliente: cliente.nombre,
			grupos: (["cliente", "lista", "basicos", "otras"] as const)
				.map((clave) => ({
					clave,
					titulo: titulos[clave],
					productos: conPrecio.filter((prenda) => prenda.grupo === clave).map(({ grupo: _grupo, ...prenda }) => prenda),
				}))
				.filter((grupo) => grupo.productos.length > 0),
		},
	};
});
