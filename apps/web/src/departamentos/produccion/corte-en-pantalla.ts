/**
 * Lo que la captura del corte muestra mientras se escribe, con las cuentas del paquete compartido y los mismos insumos
 * que `produccion.cerrar_corte` repite al cerrar: lo que pide la receta y el piso del patrón (`pideLaReceta`), los
 * rollos automáticos (`rollosAutomaticos`), «La tela alcanza» (`laTelaAlcanza`) y lo que queda según la receta
 * (`usoDeLaTela`), a dónde va lo que quedó (`destinoDeLoQueQuedo`) y el % contra el patrón (`porcentajeSobreElPatron`). Aquí solo se juntan esas cuentas con lo capturado y se escriben sus textos; ninguna cuenta vive aquí.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Corte») y docs/interfaz/TEXTOS.md («El corte»)
 *
 * Los textos son los de la guía: «La tela alcanza · 190 piezas llevan 214 m según la receta · los 3 rollos tienen
 * 277 m», «Se usan 25.5 m · quedan 63 m según la receta», «R-0432 regresa a bodega con 60 m»… Los metros se leen con
 * un decimal a lo más (y los de por pieza con dos, como la receta); la cuenta sigue en milésimos, y lo exacto de cada
 * rollo viaja aparte para comprobar que es lo que guarda la acción.
 */

import {
	type DestinoDeLoQueQuedo,
	destinoDeLoQueQuedo,
	laTelaAlcanza,
	porcentajeSobreElPatron,
	type RolloDelCorte,
	rollosAutomaticos,
	usoDeLaTela,
} from "@uniformame/compartido/calculos/corte";
import {
	aMilesimos,
	cantidadEnTexto,
	type LineaDeLaCuenta,
	pideLaReceta,
} from "@uniformame/compartido/calculos/cuenta-material";
import type { capturaDeCorte } from "@uniformame/compartido/contratos/produccion/captura-corte";
import type { cerrarCorte } from "@uniformame/compartido/contratos/produccion/corte";
import type { z } from "zod";

/** La captura que regresa `produccion.corte`. */
export type CapturaDelCorte = NonNullable<z.infer<typeof capturaDeCorte.resultado>["captura"]>;
/** Una tela de la captura. */
type TelaDeLaCaptura = CapturaDelCorte["telas"][number];

/** Lo que se lleva capturado de una tela. */
export interface TelaCapturada {
	/** Sus rollos, en el orden en que se usan; con los automáticos, los calcula la cuenta. */
	rollos: string[];
	/** Mientras no se cambie, quite ni agregue un rollo, la cuenta los pone. */
	automaticos: boolean;
	/** Lo que se escribió que quedó del último, si fue distinto de lo calculado. */
	quedaron: string | null;
	/** Si lo que quedó, abajo de la frontera, ya no sirve. */
	yaNoSirve: boolean;
}

/** Lo que se lleva capturado. */
export interface CorteCapturado {
	/** Las piezas de cada talla, como se escriben, por variante. */
	piezas: Record<string, string>;
	telas: Record<string, TelaCapturada>;
	cortadorId: string;
}

/** Lo que se muestra de una tela. */
interface TelaEnPantalla {
	tela: TelaDeLaCaptura;
	/** Sus rollos puestos, en orden, con lo que se usa de cada uno. */
	rollos: {
		rolloId: string;
		texto: string;
		/** Lo que se usa del rollo, exacto en metros («32.984»). */
		usados: string;
		/** Lo que queda del último, exacto en metros; nulo en los demás. */
		quedan: string | null;
	}[];
	/** La línea de la tela, con lo que pide la receta exacto en metros («213.484»); vacía con cero piezas. */
	linea: { texto: string; alcanza: boolean; pide: string } | null;
	/** El rollo que conviene agregar si falta tela, y su texto («Agregar R-0432 · 88.5 m»). */
	agregar: { rolloId: string; texto: string } | null;
	/** Lo que quedó del último, calculado, y lo escrito si se cambió. */
	quedo: { folio: string; calculado: string; cambiado: boolean; error: string | null };
	/** Si va «Sirve» · «Ya no sirve»: quedó más de 0 y menos que la frontera. */
	pideSirve: boolean;
	/** Lo que pasa con lo que quedó, al cerrar. */
	destino: string;
	/** «Se mezclan las partidas…», si mezcla. */
	mezcla: string | null;
	/** Los milésimos usados (para las cifras) y el piso del patrón. */
	usados: bigint;
	piso: bigint;
}

/**
 * Las piezas por talla como las cuenta la receta: por talla de catálogo, solo enteros de 0 en adelante.
 * @param captura La captura.
 * @param piezas Lo escrito, por variante.
 */
export function piezasPorTalla(
	captura: CapturaDelCorte,
	piezas: Readonly<Record<string, string>>,
): Record<string, number> {
	return Object.fromEntries(
		captura.tallas.map((talla) => {
			const escrito = Number(piezas[talla.variante_id] ?? "");
			return [talla.talla_id, Number.isInteger(escrito) && escrito > 0 ? escrito : 0];
		}),
	);
}

/**
 * La línea de la cuenta de material de una tela de la captura.
 * @param tela La tela.
 */
function lineaDeLaCuenta(tela: TelaDeLaCaptura): LineaDeLaCuenta {
	return {
		materialId: tela.material_id,
		esTelaPrincipal: tela.papel === "tela_principal",
		cantidad: tela.receta.cantidad,
		porTalla: Object.fromEntries(tela.receta.por_talla.map((talla) => [talla.talla_id, talla.cantidad])),
		recetaPorUnidadInventario: tela.receta.receta_por_unidad_inventario,
		seCuentaEntera: false,
	};
}

/**
 * Lo que pide la receta de cada tela para las piezas escritas, y el piso del patrón: la cuenta del paquete compartido.
 * @param captura La captura.
 * @param piezas Las piezas por talla de catálogo.
 */
export function loQuePideLaReceta(captura: CapturaDelCorte, piezas: Readonly<Record<string, number>>) {
	const lineas = captura.telas.map(lineaDeLaCuenta);
	return { pide: pideLaReceta(lineas, piezas, captura.desperdicio_pct), piso: pideLaReceta(lineas, piezas, "0") };
}

/**
 * Los rollos de una tela como los cuenta la cuenta del corte.
 * @param tela La tela.
 * @param ids Los rollos, en orden.
 */
function rollosDe(tela: TelaDeLaCaptura, ids: readonly string[]): RolloDelCorte[] {
	return ids.flatMap((id) => {
		const rollo = tela.rollos.find((uno) => uno.rollo_id === id);
		return rollo === undefined ? [] : [{ rolloId: id, milesimos: aMilesimos(rollo.metros) }];
	});
}

/**
 * Los rollos puestos de una tela: los automáticos si nadie los cambió, o los que se escogieron.
 * @param tela La tela.
 * @param capturada Lo capturado de ella.
 * @param pide Lo que pide la receta.
 */
export function rollosPuestos(tela: TelaDeLaCaptura, capturada: TelaCapturada, pide: bigint): string[] {
	if (!capturada.automaticos) return capturada.rollos;
	return rollosAutomaticos(
		rollosDe(
			tela,
			tela.rollos.map((rollo) => rollo.rollo_id),
		),
		pide,
	).map((rollo) => rollo.rolloId);
}

/** Los metros como se leen: con un decimal a lo más («213.5»); nadie mide tela al milímetro. */
const formatoDeMetros = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });
/** Los metros por pieza, con dos decimales a lo más («1.06»), como la receta. */
const formatoPorPieza = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
/** Los metros que se ponen en un campo: con un decimal y sin separador de miles, para que se puedan corregir. */
const formatoDeCampo = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1, useGrouping: false });

/**
 * «{n} m»: unos milésimos de metro como se dicen.
 * @param milesimos Los milésimos.
 * @param formato Cómo se escriben: con un decimal o, por pieza, con dos.
 */
function metros(milesimos: bigint, formato = formatoDeMetros): string {
	return `${formato.format(Number(milesimos) / 1000)} m`;
}

/**
 * Todo lo que se muestra de una tela, con lo capturado.
 * @param captura La captura.
 * @param tela La tela.
 * @param capturada Lo capturado de ella.
 * @param cuenta Lo que pide la receta, el piso y cuántas piezas van.
 */
export function telaEnPantalla(
	captura: CapturaDelCorte,
	tela: TelaDeLaCaptura,
	capturada: TelaCapturada,
	cuenta: { pide: bigint; piso: bigint; piezas: number },
): TelaEnPantalla {
	const puestos = rollosPuestos(tela, capturada, cuenta.pide);
	const rollos = rollosDe(tela, puestos);
	const folio = (id: string) => tela.rollos.find((rollo) => rollo.rollo_id === id)?.folio ?? "";
	const ultimo = rollos.at(-1);
	const tienen = rollos.reduce((suma, rollo) => suma + rollo.milesimos, 0n);
	// Lo que quedó: lo calculado según la receta, o lo escrito si es un número válido.
	const calculado = rollos.length === 0 ? null : usoDeLaTela(rollos, cuenta.pide);
	let uso = calculado;
	let error: string | null = null;
	if (capturada.quedaron !== null && ultimo !== undefined) {
		const escrito = /^\d{1,6}(\.\d{1,3})?$/.test(capturada.quedaron.trim()) ? aMilesimos(capturada.quedaron) : null;
		if (escrito === null) error = "Escribe los metros con números, por ejemplo 12.5";
		else if (escrito >= ultimo.milesimos) {
			error = `Del rollo ${folio(ultimo.rolloId)} no pueden quedar más de ${cantidadEnTexto(ultimo.milesimos - 1n)} m`;
		} else uso = usoDeLaTela(rollos, cuenta.pide, escrito);
	}
	const quedan = uso?.quedan ?? 0n;
	const cambiado = capturada.quedaron !== null && error === null;
	const frontera = aMilesimos(captura.frontera);
	const ultimoFolio = ultimo === undefined ? "" : folio(ultimo.rolloId);
	// A dónde va lo que quedó (regla 6 de corte y bultos), como lo dirá la acción.
	const textoDelDestino: Record<DestinoDeLoQueQuedo, string> = {
		ninguno: `El rollo ${ultimoFolio} se usó completo`,
		rollo: `${ultimoFolio} regresa a bodega con ${metros(quedan)}`,
		merma: `${metros(quedan)} se registran como merma de tela`,
		retazo: `Retazo de ${metros(quedan)} a la bodega de tela`,
	};
	const destino = textoDelDestino[destinoDeLoQueQuedo(quedan, frontera, capturada.yaNoSirve)];
	const siguiente = tela.rollos.find((rollo) => !puestos.includes(rollo.rollo_id));
	const alcanza = laTelaAlcanza(rollos, cuenta.pide);
	const llevan = `${cuenta.piezas} piezas llevan ${metros(cuenta.pide)} según la receta`;
	const tienenTexto =
		rollos.length === 1 ? `el rollo tiene ${metros(tienen)}` : `los ${rollos.length} rollos tienen ${metros(tienen)}`;
	const partidas = [
		...new Set(
			puestos.flatMap((id) => {
				const partida = tela.rollos.find((rollo) => rollo.rollo_id === id)?.partida ?? null;
				return partida === null ? [] : [partida];
			}),
		),
	].sort();
	return {
		tela,
		rollos: (uso?.usados ?? []).map((usado, i, todos) => ({
			rolloId: usado.rolloId,
			texto:
				i < todos.length - 1
					? `Completo · ${metros(usado.milesimos)}`
					: `Se usan ${metros(usado.milesimos)} · quedan ${metros(quedan)}${cambiado ? "" : " según la receta"}`,
			usados: cantidadEnTexto(usado.milesimos),
			quedan: i < todos.length - 1 ? null : cantidadEnTexto(quedan),
		})),
		linea:
			cuenta.piezas === 0
				? null
				: alcanza
					? { texto: `La tela alcanza · ${llevan} · ${tienenTexto}`, alcanza: true, pide: cantidadEnTexto(cuenta.pide) }
					: {
							texto: `Faltan ${metros(cuenta.pide - tienen)} de ${tela.nombre} · ${llevan} · ${tienenTexto}${
								siguiente === undefined ? " · no hay más rollos de esta tela en bodega" : ""
							}`,
							alcanza: false,
							pide: cantidadEnTexto(cuenta.pide),
						},
		agregar:
			alcanza || siguiente === undefined
				? null
				: {
						rolloId: siguiente.rollo_id,
						texto: `Agregar ${siguiente.folio} · ${metros(aMilesimos(siguiente.metros))}`,
					},
		quedo: {
			folio: ultimoFolio,
			calculado: formatoDeCampo.format(Number(calculado?.quedan ?? 0n) / 1000),
			cambiado: capturada.quedaron !== null,
			error,
		},
		pideSirve: quedan > 0n && quedan < frontera,
		destino,
		mezcla:
			partidas.length > 1
				? `Se mezclan las partidas ${partidas.slice(0, -1).join(", ")} y ${partidas.at(-1)}: el tono puede variar entre piezas.`
				: null,
		usados: (uso?.usados ?? []).reduce((suma, usado) => suma + usado.milesimos, 0n),
		piso: cuenta.piso,
	};
}

/**
 * Las cifras de la tela principal: piezas, metros usados, por pieza, el patrón por pieza y cuánto se pasa del patrón.
 * Con cero piezas, «—».
 * @param principal Lo que se muestra de la tela principal.
 * @param piezas Las piezas cortadas.
 * @param rojo `produccion.rendimiento_rojo_porcentaje`.
 */
export function cifrasDelCorte(principal: TelaEnPantalla | undefined, piezas: number, rojo: number) {
	if (principal === undefined || piezas === 0) {
		return { piezas: "—", usados: "—", porPieza: "—", patron: "—", contraPatron: "—", rojo: false };
	}
	const cuantas = BigInt(piezas);
	const sobre = Math.round(porcentajeSobreElPatron(principal.usados, principal.piso));
	return {
		piezas: String(piezas),
		usados: metros(principal.usados),
		porPieza: metros(principal.usados / cuantas, formatoPorPieza),
		patron: metros(principal.piso / cuantas, formatoPorPieza),
		contraPatron: `${sobre >= 0 ? "+" : "−"}${Math.abs(sobre)}%`,
		rojo: sobre > rojo,
	};
}

/**
 * Lo que manda «Cerrar corte»: cada tela con sus rollos puestos, lo que quedó solo si se cambió, las piezas de cada
 * talla y quién cortó.
 * @param captura La captura.
 * @param capturado Lo capturado.
 */
export function datosDelCierre(
	captura: CapturaDelCorte,
	capturado: CorteCapturado,
): z.input<typeof cerrarCorte.entrada> {
	const piezas = piezasPorTalla(captura, capturado.piezas);
	const { pide } = loQuePideLaReceta(captura, piezas);
	return {
		lote_id: captura.lote_id,
		receta_version_id: captura.receta_version_id ?? "",
		telas: captura.telas.map((tela) => {
			const capturada = capturado.telas[tela.material_id] ?? tela0;
			return {
				material_id: tela.material_id,
				rollos: rollosPuestos(tela, capturada, pide[tela.material_id] ?? 0n).map((rolloId) => ({ rollo_id: rolloId })),
				...(capturada.quedaron === null ? {} : { metros_quedaron: capturada.quedaron.trim() }),
				...(capturada.yaNoSirve ? { ya_no_sirve: true } : {}),
			};
		}),
		tallas: captura.tallas.map((talla) => ({
			variante_id: talla.variante_id,
			piezas: Number(capturado.piezas[talla.variante_id] ?? ""),
		})),
		corto_persona_id: capturado.cortadorId,
	};
}

/** Una tela recién escogida: los rollos los pone la cuenta. */
export const tela0: TelaCapturada = { rollos: [], automaticos: true, quedaron: null, yaNoSirve: false };

/**
 * Lo capturado al escoger un lote: las piezas planeadas, los rollos automáticos y quien corta de base.
 * @param captura La captura.
 */
export function corteNuevo(captura: CapturaDelCorte): CorteCapturado {
	return {
		piezas: Object.fromEntries(captura.tallas.map((talla) => [talla.variante_id, String(talla.planeadas)])),
		telas: Object.fromEntries(captura.telas.map((tela) => [tela.material_id, tela0])),
		cortadorId: captura.personas[0]?.persona_id ?? "",
	};
}
