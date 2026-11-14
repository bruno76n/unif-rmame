/**
 * `compras.proveedores`: los proveedores con lo que surten, lo que dicen que tardan contra lo que tardan de verdad,
 * cuántas entregas llegaron a tiempo, su condición de pago y su teléfono; con «Dados de baja», los dados de baja.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Proveedores») y docs/modulos/compras/proveedores-y-precios.md
 * (reglas 3 a 6)
 *
 * El plazo real y las entregas a tiempo salen de `plazosReales`, la misma regla de Por pedir.
 */

import { condicionDePago, telefonoEnTexto } from "@uniformame/compartido/calculos/compras";
import { proveedoresDeCompras } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { asc, eq, isNotNull, isNull } from "drizzle-orm";
import { type ContextoDeAccion, implementarConsulta } from "../../../nucleo/modulos.ts";
import { terceros } from "../../contaduria/tablas.ts";
import { plazosReales } from "../dominio/ordenes.ts";
import { proveedores } from "../tablas.ts";
import { cumpleBusqueda } from "./comun.ts";

/** Un tono de la pantalla de Proveedores. */
type Tono = "verde" | "ambar" | "rojo" | "gris";

/**
 * El tono del plazo: verde si no se pasa de lo que dice, ámbar si se pasa 1 día, rojo si más; gris sin entregas.
 * @param dice Lo que dice que tarda.
 * @param tarda Lo que tarda en realidad; nulo sin entregas.
 */
export function tonoDelPlazo(dice: number, tarda: number | null): Tono {
	if (tarda === null) return "gris";
	if (tarda <= dice) return "verde";
	return tarda - dice === 1 ? "ambar" : "rojo";
}

/**
 * El tono de las entregas a tiempo: rojo bajo la mitad, ámbar bajo el 80 %, verde; gris sin entregas.
 * @param aTiempo Las que llegaron a tiempo.
 * @param total Todas.
 */
export function tonoDeEntregas(aTiempo: number, total: number): Tono {
	if (total === 0) return "gris";
	if (aTiempo * 2 < total) return "rojo";
	return aTiempo * 5 < total * 4 ? "ambar" : "verde";
}

/**
 * Los proveedores con su nombre, activos o dados de baja.
 * @param accion El contexto de la lectura.
 * @param dadosDeBaja Si se quieren los dados de baja.
 */
export async function proveedoresConNombre(accion: ContextoDeAccion, dadosDeBaja: boolean) {
	return accion.transaccion
		.select({ proveedor: proveedores, nombre: terceros.nombre, rfc: terceros.rfc })
		.from(proveedores)
		.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
		.where(dadosDeBaja ? isNotNull(proveedores.bajaEn) : isNull(proveedores.bajaEn))
		.orderBy(asc(terceros.nombre));
}

export const consultaProveedores = implementarConsulta(proveedoresDeCompras, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const filas = (await proveedoresConNombre(accion, parametros.incluir_bajas === "si")).filter((fila) =>
			cumpleBusqueda(parametros.buscar, [fila.nombre, fila.proveedor.ciudad, fila.proveedor.surte]),
		);
		const plazos = await plazosReales(
			accion,
			filas.map((fila) => ({ id: fila.proveedor.id, diasDiceTardar: fila.proveedor.diasDiceTardar })),
		);
		return {
			proveedores: filas.map(({ proveedor, nombre }) => {
				const plazo = plazos.get(proveedor.id);
				const entregas = plazo?.entregas ?? [];
				const tarda = entregas.length === 0 ? null : (plazo?.plazo ?? null);
				const aTiempo = entregas.filter((entrega) => entrega.aTiempo).length;
				return {
					proveedor_id: proveedor.id,
					version: proveedor.version,
					nombre,
					ciudad: proveedor.ciudad,
					surte: proveedor.surte,
					dice: proveedor.diasDiceTardar,
					tarda,
					tono_plazo: tonoDelPlazo(proveedor.diasDiceTardar, tarda),
					a_tiempo: aTiempo,
					entregas: entregas.length,
					tono_entregas: tonoDeEntregas(aTiempo, entregas.length),
					condicion: condicionDePago(proveedor.diasCredito),
					telefono: telefonoEnTexto(proveedor.telefono),
					dado_de_baja: proveedor.bajaEn !== null,
				};
			}),
		};
	}),
}));
