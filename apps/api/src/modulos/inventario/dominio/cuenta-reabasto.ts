/**
 * La cuenta del reabasto: por ubicación con mínimo y variante, el mínimo, la meta, si está en cero o bajo mínimo,
 * cuánto mover de Bodega y cuánto mandar a fabricar.
 * Fase 14 · docs/modulos/inventario/minimos-y-reabasto.md (reglas 1 a 8 y 12, «La cuenta del reabasto»)
 *
 * Es una función pura: quien la llama lee los mínimos, los libres, lo que viene en camino y lo ya sugerido, y deja
 * fuera lo que no aplica (en Bodega, las prendas activas; en una tienda, las de mostrador). La usan las consultas de
 * Reabasto y de Pendientes de Bodega (fase 19). No va al paquete compartido: ninguna pantalla la calcula al escribir.
 */

/** Los dos mínimos de una ubicación. */
export interface MinimosDeUbicacion {
	mayorVenta: number;
	demas: number;
}

/** Una ubicación con mínimo: Bodega o una tienda. Una tienda sin caja no entra a la cuenta (regla 12). */
export interface UbicacionDeReabasto {
	id: string;
	tipo: "bodega" | "tienda";
	/** Si es una tienda sin caja: Unifórmame no lleva su existencia. */
	sinCaja: boolean;
	minimos: MinimosDeUbicacion;
}

/** Una variante: su id y el nombre de su talla. */
export interface VarianteDeReabasto {
	id: string;
	talla: string;
}

/** Lo que recibe la cuenta. */
export interface DatosDelReabasto {
	ubicaciones: readonly UbicacionDeReabasto[];
	variantes: readonly VarianteDeReabasto[];
	/** Los nombres de las tallas de mayor venta (`inventario.tallas_mayor_venta`). */
	tallasMayorVenta: ReadonlySet<string>;
	/** `inventario.factor_meta_reabasto`. */
	factorMeta: number;
	/** Los libres (existencia − reservado) de cada ubicación y variante: `libres[ubicacion][variante]`. */
	libres: Readonly<Record<string, Readonly<Record<string, number>>>>;
	/** Lo que viene en camino hacia cada ubicación (regla 4). */
	enCamino: Readonly<Record<string, Readonly<Record<string, number>>>>;
	/** Lo ya sugerido para cada ubicación (regla 7). */
	yaSugerido: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** Lo que sale de la cuenta, por ubicación y variante. */
export interface RenglonDeReabasto {
	ubicacionId: string;
	varianteId: string;
	minimo: number;
	meta: number;
	libres: number;
	enCero: boolean;
	bajoMinimo: boolean;
	/** De Bodega a esta tienda (siempre 0 en Bodega). */
	mover: number;
	fabricar: number;
}

/** Un valor de un mapa de mapas, o 0. */
function de(mapa: Readonly<Record<string, Readonly<Record<string, number>>>>, ubicacion: string, variante: string) {
	return mapa[ubicacion]?.[variante] ?? 0;
}

/**
 * Hace la cuenta del reabasto.
 * @param datos Los mínimos, las tallas de mayor venta, el factor de la meta, los libres, lo que viene en camino y lo
 * ya sugerido.
 * @returns Un renglón por ubicación con mínimo (sin las tiendas sin caja) y variante. Lo que se mueve de Bodega se
 * reparte entre las tiendas en el orden en que vienen, sin pasar nunca de los libres de Bodega.
 */
export function cuentaDelReabasto(datos: DatosDelReabasto): RenglonDeReabasto[] {
	const bodega = datos.ubicaciones.find((ubicacion) => ubicacion.tipo === "bodega");
	const disponible = new Map(
		datos.variantes.map((variante) => [
			variante.id,
			bodega === undefined ? 0 : Math.max(0, de(datos.libres, bodega.id, variante.id)),
		]),
	);
	const renglones: RenglonDeReabasto[] = [];
	for (const ubicacion of datos.ubicaciones) {
		if (ubicacion.sinCaja) continue;
		for (const variante of datos.variantes) {
			const minimo = datos.tallasMayorVenta.has(variante.talla)
				? ubicacion.minimos.mayorVenta
				: ubicacion.minimos.demas;
			const meta = minimo * datos.factorMeta;
			const libres = de(datos.libres, ubicacion.id, variante.id);
			const sugerido = de(datos.yaSugerido, ubicacion.id, variante.id);
			let mover = 0;
			let fabricar = 0;
			if (ubicacion.tipo === "bodega") {
				// Bodega bajo su mínimo solo se fabrica (regla 6).
				if (libres < minimo) fabricar = Math.max(0, meta - libres - sugerido);
			} else {
				// Una tienda: bajo su mínimo y sin llegar a la meta con lo que viene en camino (regla 5).
				const enCamino = de(datos.enCamino, ubicacion.id, variante.id);
				const falta = meta - libres - enCamino;
				if (libres < minimo && falta > 0) {
					mover = Math.min(falta, disponible.get(variante.id) ?? 0);
					disponible.set(variante.id, (disponible.get(variante.id) ?? 0) - mover);
					fabricar = Math.max(0, falta - mover - sugerido);
				}
			}
			renglones.push({
				ubicacionId: ubicacion.id,
				varianteId: variante.id,
				minimo,
				meta,
				libres,
				enCero: libres <= 0,
				bajoMinimo: libres > 0 && libres < minimo,
				mover,
				fabricar,
			});
		}
	}
	return renglones;
}
