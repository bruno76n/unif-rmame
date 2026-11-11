/**
 * La regla de los rollos sugeridos: qué rollos libres de Bodega le tocan a cada lote por cortar, tela por tela.
 * Fase 12 · docs/modulos/inventario/entregas-a-corte.md (reglas 1 y 2)
 *
 * Pura: recibe los lotes en orden de corte con lo que pide cada tela y los rollos libres, y regresa los apartados.
 * Para cada tela de cada lote, en orden de fecha de corte: la primera partida (por su folio) que alcanza sola, del
 * rollo más chico al más grande; si ninguna alcanza, las partidas de más metros a menos (cada una, del rollo más
 * chico al más grande) hasta cubrir, o lo que haya. Un rollo apartado ya no está libre para el lote siguiente.
 */

/** Una tela que un lote todavía no recibe, con lo que pide su receta en milésimos de metro. */
export interface TelaPorSugerir {
	materialId: string;
	pide: bigint;
}

/** Un lote por cortar, en el orden en que se reparten los rollos. */
export interface LotePorSugerir {
	loteId: string;
	telas: readonly TelaPorSugerir[];
}

/** Un rollo libre de Bodega: su tela, su partida y lo que tiene. */
export interface RolloLibre {
	rolloId: string;
	materialId: string;
	/** El folio de su partida (sin partida, de la carga inicial, cuenta como una partida más). */
	partida: string;
	milesimos: bigint;
}

/** Un rollo sugerido para un lote. */
export interface Sugerido {
	loteId: string;
	rolloId: string;
}

/** Compara dos enteros grandes para ordenar. */
function comparar(uno: bigint, otro: bigint): number {
	return uno < otro ? -1 : uno > otro ? 1 : 0;
}

/**
 * Escoge los rollos de una tela para lo que pide, de los libres de esa tela.
 * @returns Los rollos escogidos.
 */
function escoger(libres: readonly RolloLibre[], pide: bigint): RolloLibre[] {
	const porPartida = new Map<string, RolloLibre[]>();
	for (const rollo of libres) porPartida.set(rollo.partida, [...(porPartida.get(rollo.partida) ?? []), rollo]);
	const partidas = [...porPartida].map(([partida, suyos]) => ({
		partida,
		rollos: [...suyos].sort(
			(uno, otro) => comparar(uno.milesimos, otro.milesimos) || uno.rolloId.localeCompare(otro.rolloId),
		),
		total: suyos.reduce((suma, rollo) => suma + rollo.milesimos, 0n),
	}));
	const sola = partidas
		.filter((partida) => partida.total >= pide)
		.sort((una, otra) => una.partida.localeCompare(otra.partida))[0];
	const enOrden =
		sola === undefined
			? partidas
					.sort((una, otra) => comparar(otra.total, una.total) || una.partida.localeCompare(otra.partida))
					.flatMap((partida) => partida.rollos)
			: sola.rollos;
	const escogidos: RolloLibre[] = [];
	let cubierto = 0n;
	for (const rollo of enOrden) {
		if (cubierto >= pide) break;
		escogidos.push(rollo);
		cubierto += rollo.milesimos;
	}
	return escogidos;
}

/**
 * Los rollos sugeridos de unos lotes.
 * @param lotes Los lotes por cortar, ya en orden de fecha de corte, con las telas que todavía no reciben.
 * @param libres Los rollos libres de Bodega: disponibles, con metros y sin entregar a otro lote.
 * @returns Los apartados sugeridos; un rollo nunca va a dos lotes.
 */
export function sugerirRollos(lotes: readonly LotePorSugerir[], libres: readonly RolloLibre[]): Sugerido[] {
	const quedan = new Map(libres.map((rollo) => [rollo.rolloId, rollo]));
	const sugeridos: Sugerido[] = [];
	for (const lote of lotes) {
		for (const tela of lote.telas) {
			if (tela.pide <= 0n) continue;
			const deLaTela = [...quedan.values()].filter((rollo) => rollo.materialId === tela.materialId);
			for (const rollo of escoger(deLaTela, tela.pide)) {
				quedan.delete(rollo.rolloId);
				sugeridos.push({ loteId: lote.loteId, rolloId: rollo.rolloId });
			}
		}
	}
	return sugeridos;
}
