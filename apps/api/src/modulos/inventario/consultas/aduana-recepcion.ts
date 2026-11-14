/**
 * `inventario.aduana_recepcion`: Recepción de Aduana. Los cuatro grupos de lo que espera entrar (del taller, de
 * bodega, de proveedores y de las tiendas y los clientes), siempre, con «{n} por recibir · {descripción}» o «Nada por
 * recibir»; las órdenes de compra de la ventana de días o, con `todas_las_ordenes`, todas.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Recepción») y docs/modulos/inventario/recepciones-en-aduana.md (regla 10)
 */

import { recepcionDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { colorDelDestino, leerPorRecibir, type PorRecibir } from "./aduana-comun.ts";

/** Los grupos de Recepción, en su orden, con su descripción. */
const grupos = [
	{ clave: "taller", titulo: "Del taller", descripcion: "lotes y reprocesos revisados por calidad · conteo ciego" },
	{ clave: "bodega", titulo: "De bodega", descripcion: "lo que surtió bodega" },
	{ clave: "proveedores", titulo: "De proveedores", descripcion: "rollo por rollo, con metros y partida" },
	{
		clave: "clientes",
		titulo: "De las tiendas y de clientes",
		descripcion: "devoluciones de los clientes con su nota de crédito",
	},
] as const;

export const consultaRecepcionDeAduana = implementarConsulta(recepcionDeAduana, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const { entradas, ordenesFuera } = await leerPorRecibir(accion, parametros.todas_las_ordenes === true);
		return {
			grupos: grupos.map((grupo) => {
				const suyas = entradas.filter((entrada) => entrada.grupo === grupo.clave);
				return {
					clave: grupo.clave,
					titulo: grupo.titulo,
					resumen: suyas.length === 0 ? "Nada por recibir" : `${suyas.length} por recibir · ${grupo.descripcion}`,
					renglones: suyas.map(({ clave, titulo, detalle, cantidad, carril, destino, abre }: PorRecibir) => ({
						clave,
						titulo,
						detalle,
						cantidad,
						carril,
						destino,
						color_destino: colorDelDestino(carril),
						abre,
					})),
				};
			}),
			ordenes_fuera: ordenesFuera,
		};
	}),
}));
