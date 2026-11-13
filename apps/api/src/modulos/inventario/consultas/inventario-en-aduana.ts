/**
 * `inventario.inventario_en_aduana`: Inventario en aduana. El cuadre de las piezas de prenda por ubicación (Aduana,
 * Bodega, las tiendas, Taller, Tránsito y En camino a aduana, con Aduana resaltada) y lo que está aquí, de lo más
 * viejo a lo más nuevo, por páginas. El material en metros no cuenta en el cuadre, ni lo que ya está con un cliente.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Inventario en aduana») y docs/modulos/inventario/existencias-y-cuadre.md
 */

import { inventarioEnAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { paginarLista } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { leerEnAduana, partidaDe } from "./aduana-comun.ts";

/** Cuántos renglones por página, si no se pide otro número. */
const limitePorOmision = 50;

export const consultaInventarioEnAduana = implementarConsulta(inventarioEnAduana, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const { rows } = await accion.transaccion.execute(sql`
			SELECT u.nombre, u.tipo, coalesce(sum(e.piezas), 0) AS piezas FROM ubicaciones u
			LEFT JOIN existencias e ON e.ubicacion_id = u.id GROUP BY u.id, u.nombre, u.tipo, u.orden ORDER BY u.orden`);
		const cuadre = z
			.array(z.object({ nombre: z.string(), tipo: z.string(), piezas: z.coerce.number() }))
			.parse(rows)
			.map((ubicacion) => ({
				nombre: ubicacion.nombre,
				piezas: ubicacion.piezas,
				resaltada: ubicacion.tipo === "aduana",
			}));
		const pagina = paginarLista(await leerEnAduana(accion), parametros.cursor, parametros.limite ?? limitePorOmision);
		const renglones = [];
		for (const fila of pagina.renglones) renglones.push(await partidaDe(accion, fila));
		return {
			cuadre,
			total: cuadre.reduce((suma, ubicacion) => suma + ubicacion.piezas, 0),
			renglones,
			cursor: pagina.cursor,
			hay_mas: pagina.hay_mas,
		};
	}),
}));
