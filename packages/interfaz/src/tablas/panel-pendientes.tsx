/**
 * El panel «Pendientes» de la primera pestaña de cada departamento: su conteo, sus filtros por grupo y la tabla Tipo ·
 * Referencia · Fecha · Importe o Cantidad · Estado · el botón que resuelve el pendiente. Primero lo rojo, luego lo
 * ámbar, luego lo sin color y al final lo verde; dentro de cada color, por fecha. Sin pendientes: «Sin pendientes», en
 * verde.
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», reglas 3 y 4)
 *
 * Uso: `<PanelPendientes pendientes={…} filtros={…} filtro={…} alEscogerFiltro={…} columnaCifra="Cantidad" />`. Cada
 * pendiente llega armado: la pantalla no calcula estados, solo los muestra.
 */

import type { LucideIcon } from "lucide-react";
import { Boton } from "../botones/boton.tsx";
import { type Filtro, Filtros } from "../captura/filtros.tsx";
import { unirClases } from "../clases.ts";
import type { ColorDeEstado } from "../estados/colores.ts";
import { colorDelEstado } from "../estados/colores.ts";
import { Estado } from "../estados/estado.tsx";
import { EstadoDePantalla } from "../estados/estado-de-pantalla.tsx";
import { type ColorDeTipo, iconoDeTipo } from "../pagina/colores-de-tipo.ts";
import { Tabla } from "./tabla.tsx";

/** Un pendiente, ya armado por su consulta. */
export interface Pendiente {
	clave: string;
	/** El filtro al que pertenece. */
	grupo: string;
	tipo: { texto: string; icono: LucideIcon; color: ColorDeTipo };
	referencia: { titulo: string; detalle?: string };
	/** La fecha que importa, ya escrita, y la que ordena (ISO). */
	fecha?: { texto: string; orden: string };
	/** El importe o la cantidad, ya escritos. */
	cifra?: string;
	estado: { texto: string; color?: ColorDeEstado; abajo?: string };
	accion?: { texto: string; alTocar: () => void };
}

/** El lugar de cada color en el orden de Pendientes. */
const ordenDeColor: Readonly<Record<string, number>> = { rojo: 0, ambar: 1, verde: 3 };

/**
 * Ordena los pendientes: rojo, ámbar, sin color y verde; dentro de cada color, por fecha.
 * @param pendientes Los pendientes.
 */
export function ordenarPendientes(pendientes: readonly Pendiente[]): Pendiente[] {
	const lugar = (pendiente: Pendiente) =>
		ordenDeColor[pendiente.estado.color ?? colorDelEstado(pendiente.estado.texto)] ?? 2;
	return [...pendientes].sort(
		(uno, otro) => lugar(uno) - lugar(otro) || (uno.fecha?.orden ?? "9999").localeCompare(otro.fecha?.orden ?? "9999"),
	);
}

/** Lo que recibe el panel. */
export interface PropsDePanelPendientes {
	pendientes: readonly Pendiente[];
	filtros: readonly Filtro[];
	filtro: string;
	alEscogerFiltro: (clave: string) => void;
	/** El nombre de la columna de la cifra: «Importe» o «Cantidad». */
	columnaCifra: string;
}

/**
 * El panel de Pendientes.
 * @param props Los pendientes, los filtros, el activo, qué hacer al escoger y el nombre de la columna de la cifra.
 */
export function PanelPendientes({
	pendientes,
	filtros,
	filtro,
	alEscogerFiltro,
	columnaCifra,
}: PropsDePanelPendientes) {
	const visibles = ordenarPendientes(
		filtro === "todos" ? pendientes : pendientes.filter((uno) => uno.grupo === filtro),
	);
	return (
		<section aria-labelledby="titulo-pendientes" className="rounded-grande bg-panel shadow-panel">
			<header className="flex items-center gap-3 border-linea border-b px-5 py-4">
				<h2 id="titulo-pendientes" className="m-0 font-bold text-subtitulo">
					Pendientes
				</h2>
				<span className="rounded-full bg-riel px-2.5 font-bold text-sm tabular-nums">{pendientes.length}</span>
			</header>
			<div className="px-5 pt-4">
				<Filtros nombre="Filtrar pendientes" filtros={filtros} activo={filtro} alEscoger={alEscogerFiltro} />
			</div>
			<div className="px-5 pt-2 pb-4">
				{visibles.length === 0 ? (
					<EstadoDePantalla tipo="vacio" texto="Sin pendientes" bien />
				) : (
					<Tabla
						nombre="Pendientes"
						filas={visibles}
						claveDeFila={(pendiente) => pendiente.clave}
						columnas={[
							{
								clave: "tipo",
								encabezado: "Tipo",
								celda: ({ tipo: { texto, icono: Icono, color } }) => (
									<span className="inline-flex items-center gap-2.5">
										<span className={unirClases("grid size-8 place-items-center rounded-mediano", iconoDeTipo[color])}>
											<Icono aria-hidden="true" size={18} strokeWidth={1.9} />
										</span>
										{texto}
									</span>
								),
							},
							{
								clave: "referencia",
								encabezado: "Referencia",
								celda: ({ referencia }) => (
									<span className="flex flex-col">
										<b className="font-bold">{referencia.titulo}</b>
										{referencia.detalle === undefined ? null : (
											<span className="text-etiqueta text-tinta2">{referencia.detalle}</span>
										)}
									</span>
								),
							},
							{ clave: "fecha", encabezado: "Fecha", celda: ({ fecha }) => fecha?.texto ?? "—" },
							{ clave: "cifra", encabezado: columnaCifra, alinear: "derecha", celda: ({ cifra }) => cifra ?? "—" },
							{ clave: "estado", encabezado: "Estado", celda: ({ estado }) => <Estado {...estado} /> },
							{
								clave: "accion",
								encabezado: "",
								alinear: "derecha",
								celda: ({ accion }) =>
									accion === undefined ? null : (
										<Boton chico onClick={accion.alTocar}>
											{accion.texto}
										</Boton>
									),
							},
						]}
					/>
				)}
			</div>
		</section>
	);
}
