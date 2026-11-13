/**
 * `inventario.reabasto`: la pestaña Reabasto de Bodega. Por ubicación con mínimo y variante bajo su mínimo, lo que
 * viene en camino, cuánto mover de Bodega, cuánto fabricar y lo ya pedido a Producción, en cuatro grupos: Traspaso,
 * Traspaso y fabricación, Fabricación y Sugerido a producción. Solo salen los grupos con renglones.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Reabasto») y docs/modulos/inventario/minimos-y-reabasto.md («La cuenta
 * del reabasto»)
 *
 * La cuenta es `cuentaDelReabasto`; aquí solo se agrupan sus renglones. Traspaso y Traspaso y fabricación van por
 * ubicación (Bodega, Tienda 1, Tienda 2) y por nombre; Fabricación y Sugerido, por nombre.
 */

import { type gruposDeReabasto, reabastoDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { de, leerReabasto } from "./bodega-comun.ts";

/** Un grupo de Reabasto. */
type GrupoDeReabasto = (typeof gruposDeReabasto)[number];

/** El orden de los grupos. */
const ordenDeGrupos: readonly GrupoDeReabasto[] = ["traspaso", "traspaso_y_fabricacion", "fabricacion", "sugerido"];

export const consultaReabasto = implementarConsulta(reabastoDeBodega, async (contexto) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const leido = await leerReabasto(accion);
		const ordenDeUbicacion = new Map(leido.ubicaciones.map((ubicacion) => [ubicacion.id, ubicacion.orden]));
		const renglones = leido.cuenta.flatMap((renglon) => {
			const variante = leido.variantes.get(renglon.varianteId);
			const ubicacion = leido.ubicaciones.find((suya) => suya.id === renglon.ubicacionId);
			const pedidas = de(leido.yaSugerido, renglon.ubicacionId, renglon.varianteId);
			const bajo = renglon.enCero || renglon.bajoMinimo;
			if (variante === undefined || ubicacion === undefined || !bajo) return [];
			// Qué grupo: se mueve todo, se mueve y se fabrica, solo se fabrica, o ya se pidió todo.
			const grupo: GrupoDeReabasto | null =
				renglon.mover > 0
					? renglon.fabricar > 0
						? "traspaso_y_fabricacion"
						: "traspaso"
					: renglon.fabricar > 0
						? "fabricacion"
						: pedidas > 0
							? "sugerido"
							: null;
			if (grupo === null) return [];
			return [
				{
					grupo,
					orden: variante.orden,
					renglon: {
						variante_id: variante.variante_id,
						prenda: variante.prenda,
						talla: variante.talla,
						escuela: variante.escuela,
						codigo: variante.codigo,
						ubicacion_id: ubicacion.id,
						ubicacion: ubicacion.nombre,
						libres: renglon.libres,
						minimo: renglon.minimo,
						en_cero: renglon.enCero,
						en_camino: de(leido.enCamino, renglon.ubicacionId, renglon.varianteId),
						mover: renglon.mover,
						fabricar: renglon.fabricar,
						pedidas,
					},
				},
			];
		});
		return {
			grupos: ordenDeGrupos.flatMap((clave) => {
				const suyos = renglones.filter((renglon) => renglon.grupo === clave);
				const porUbicacion = clave === "traspaso" || clave === "traspaso_y_fabricacion";
				suyos.sort(
					(uno, otro) =>
						(porUbicacion
							? (ordenDeUbicacion.get(uno.renglon.ubicacion_id) ?? 0) -
								(ordenDeUbicacion.get(otro.renglon.ubicacion_id) ?? 0)
							: 0) || uno.orden - otro.orden,
				);
				return suyos.length === 0 ? [] : [{ clave, renglones: suyos.map((suyo) => suyo.renglon) }];
			}),
		};
	}),
}));
