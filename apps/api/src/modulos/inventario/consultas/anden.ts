/**
 * `inventario.anden`: el andén de Aduana, su primera pestaña. Las cuatro cifras (lo que espera entrar, las salidas de
 * hoy o mañana, lo parado y lo que no confirma su destino), el conteo de cada pestaña y los carriles: «Entra» con lo
 * que espera entrar, y uno por destino con lo que está en aduana, por fecha de salida.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Andén»)
 */

import { andenDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	leerPorRecibir,
	type PartidaEnAduana,
	type PorRecibir,
	parametrosDeAduana,
	partidasEnAduana,
	piezasEscritas,
} from "./aduana-comun.ts";

/** Una tarjeta de un carril. */
type Tarjeta = z.infer<typeof andenDeAduana.resultado>["carriles"][number]["tarjetas"][number];

/** Un carril. */
type Carril = z.infer<typeof andenDeAduana.resultado>["carriles"][number];

/**
 * La tarjeta de lo que espera entrar.
 * @param entrada Lo que espera entrar.
 */
function tarjetaDeEntrada(entrada: PorRecibir): Tarjeta {
	const { clave, titulo, detalle, cantidad, etiqueta, marca, abre } = entrada;
	return { clave, titulo, detalle, cantidad, etiqueta, marca, abre };
}

/**
 * La tarjeta de lo que está en aduana: su antigüedad abajo y «Sale hoy» o «Sale mañana» junto al título.
 * @param partida Lo que está en aduana.
 */
function tarjetaDePartida(partida: PartidaEnAduana): Tarjeta {
	return {
		clave: partida.traspaso_id,
		titulo: partida.titulo,
		detalle: partida.detalle,
		cantidad: partida.cantidad,
		etiqueta: partida.sale === null ? null : { texto: partida.sale, color: "rojo" },
		marca: partida.antiguedad,
		abre: { a: "despachar", id: partida.traspaso_id },
	};
}

/** Un pedido en línea con lo que ya llegó a aduana. */
const pedidoEnLinea = z.object({ folio: z.string(), estado: z.string(), piezas: z.coerce.number() });

export const consultaAnden = implementarConsulta(andenDeAduana, async (contexto) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const { entradas } = await leerPorRecibir(accion);
		const partidas = await partidasEnAduana(accion);
		const { horasParado } = await parametrosDeAduana(accion);
		const { rows } = await accion.transaccion.execute(sql`SELECT
			(SELECT count(*) FROM despachos WHERE estado = 'en_transito') AS en_transito,
			(SELECT count(*) FROM traspasos WHERE estado = 'en_camino_aduana') AS en_camino,
			(SELECT count(*) FROM pedidos_linea WHERE estado = 'listo_para_empacar') AS empaque`);
		const cuentas = z
			.object({ en_transito: z.coerce.number(), en_camino: z.coerce.number(), empaque: z.coerce.number() })
			.parse(rows[0]);
		const { rows: filasDeTiendas } = await accion.transaccion.execute(
			sql`SELECT codigo, nombre FROM ubicaciones WHERE tipo = 'tienda' ORDER BY orden`,
		);
		const tiendas = z.array(z.object({ codigo: z.string(), nombre: z.string() })).parse(filasDeTiendas);
		// Los pedidos en línea van uno por tarjeta: lo que ya llegó de cada W- contra lo que lleva.
		const { rows: filasDeW } = await accion.transaccion.execute(sql`
			SELECT w.folio, w.estado, sum(r.cantidad) AS piezas FROM pedidos_linea w
			JOIN pedido_linea_renglones r ON r.pedido_linea_id = w.id
			WHERE w.estado IN ('esperando_prendas', 'listo_para_empacar') GROUP BY w.id, w.folio, w.estado`);
		const deW = new Map(
			z
				.array(pedidoEnLinea)
				.parse(filasDeW)
				.map((pedido) => [pedido.folio, pedido]),
		);
		const parados = partidas.filter((partida) => partida.antiguedad.color === "rojo" && partida.carril !== "proveedor");
		// Por fecha de salida; las que no tienen fecha, al final.
		const porSalida = [...partidas].sort((una, otra) =>
			(una.fecha_salida ?? "9999").localeCompare(otra.fecha_salida ?? "9999"),
		);
		const deCarril = (carril: string) => porSalida.filter((partida) => partida.carril === carril);
		const enLinea = new Map<string, PartidaEnAduana[]>();
		for (const partida of deCarril("linea")) {
			const folio = partida.titulo.replace("Pedido en línea ", "");
			enLinea.set(folio, [...(enLinea.get(folio) ?? []), partida]);
		}
		const tarjetasEnLinea = [...enLinea.entries()].map(([folio, suyas]): Tarjeta => {
			const llegaron = suyas.reduce((suma, partida) => suma + partida.piezas, 0);
			const pedido = deW.get(folio);
			const [primera] = suyas;
			return {
				clave: folio,
				titulo: `Pedido en línea ${folio}`,
				detalle:
					pedido?.estado === "listo_para_empacar"
						? "Completo: listo para empacar"
						: `Llegó ${llegaron} de ${pedido?.piezas ?? llegaron}`,
				cantidad: piezasEscritas(llegaron),
				etiqueta: null,
				marca: primera?.antiguedad ?? { texto: "", color: null },
				abre: { a: "empaque", id: primera?.traspaso_id ?? "" },
			};
		});
		const carriles: Carril[] = [
			{ clave: "entra", nombre: "Entra", tipo: "entra", tarjetas: entradas.map(tarjetaDeEntrada) },
			...tiendas.map(
				(tienda): Carril => ({
					clave: tienda.codigo,
					nombre: tienda.nombre,
					tipo: "tienda",
					tarjetas: deCarril(tienda.codigo).map(tarjetaDePartida),
				}),
			),
			{ clave: "linea", nombre: "En línea", tipo: "linea", tarjetas: tarjetasEnLinea },
			{
				clave: "externos",
				nombre: "Clientes externos",
				tipo: "externos",
				tarjetas: deCarril("externos").map(tarjetaDePartida),
			},
			{ clave: "BOD", nombre: "Bodega", tipo: "bodega", tarjetas: deCarril("BOD").map(tarjetaDePartida) },
			{ clave: "calidad", nombre: "Calidad", tipo: "calidad", tarjetas: deCarril("calidad").map(tarjetaDePartida) },
		];
		return {
			cifras: {
				por_recibir: entradas.length,
				atrasadas: entradas.filter((entrada) => entrada.atrasada).length,
				salidas: partidas.filter((partida) => partida.sale !== null).length,
				parados: parados.length,
				dias_parado: Math.floor(horasParado / 24),
				sin_confirmar: cuentas.en_transito,
			},
			pestanas: {
				recepcion: entradas.length,
				en_camino: cuentas.en_camino,
				parados: parados.length,
				en_transito: cuentas.en_transito,
				empaque: cuentas.empaque,
			},
			carriles,
		};
	}),
}));
