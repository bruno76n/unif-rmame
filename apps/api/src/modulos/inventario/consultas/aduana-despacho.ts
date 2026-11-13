/**
 * `inventario.aduana_despacho`: Despacho de Aduana. Un grupo por destino, en este orden: las tiendas, «Clientes
 * externos» y «Bodega»; solo los que tienen algo, con «{n} por despachar · {m} piezas» (el material no suma piezas: un
 * grupo con solo material dice «{n} por despachar»).
 * No salen los pedidos en línea, lo que espera a Calidad ni lo que regresa a un proveedor.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Despacho»)
 */

import { despachoDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { partidasEnAduana, piezasEscritas } from "./aduana-comun.ts";

export const consultaDespachoDeAduana = implementarConsulta(despachoDeAduana, async (contexto) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const partidas = await partidasEnAduana(accion);
		const { rows } = await accion.transaccion.execute(
			sql`SELECT codigo, nombre FROM ubicaciones WHERE tipo = 'tienda' ORDER BY orden`,
		);
		const tiendas = z.array(z.object({ codigo: z.string(), nombre: z.string() })).parse(rows);
		const destinos = [
			...tiendas.map((tienda) => ({ carril: tienda.codigo, nombre: tienda.nombre })),
			{ carril: "externos", nombre: "Clientes externos" },
			{ carril: "BOD", nombre: "Bodega" },
		];
		return {
			grupos: destinos.flatMap((destino) => {
				const suyas = partidas.filter((partida) => partida.carril === destino.carril);
				if (suyas.length === 0) return [];
				const piezas = suyas.reduce((suma, partida) => suma + partida.piezas, 0);
				return [
					{
						...destino,
						// Solo material: no dice «0 piezas».
						resumen:
							piezas === 0
								? `${suyas.length} por despachar`
								: `${suyas.length} por despachar · ${piezasEscritas(piezas)}`,
						renglones: suyas,
					},
				];
			}),
		};
	}),
}));
