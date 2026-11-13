/**
 * Inventario en aduana: el cuadre arriba («Aduana + Bodega + Tienda 1 + Tienda 2 + Taller + Tránsito + En camino a
 * aduana = Total», en piezas de prenda, con Aduana resaltada) y lo que está aquí, de lo más viejo a lo más nuevo, por
 * páginas: Lleva aquí (su antigüedad en su cuadro de color) · Qué es · Cuánto · Va a · el botón.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Inventario en aduana»)
 */

import { inventarioEnAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Fragment, useState } from "react";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { DestinoConPunto, type PartidaEnAduana } from "../comun.tsx";
import { VentanaDevolverAProveedor } from "../ventanas/devolver-a-proveedor.tsx";
import { BotonDePartida, QueEs } from "./partidas.tsx";

/** El cuadre. */
type Cuadre = z.infer<typeof inventarioEnAduana.resultado>["cuadre"];

/** Las cifras de enteros, con su separador de miles. */
const enteros = new Intl.NumberFormat("es-MX");

/**
 * Una cifra del cuadre: su nombre chico y su número grande; Aduana con su orilla y el total en negro, como en la muestra.
 * @param props Su nombre, sus piezas y cómo se resalta.
 */
function CifraDelCuadre({
	nombre,
	piezas,
	forma,
}: {
	nombre: string;
	piezas: number;
	forma: "normal" | "resaltada" | "total";
}) {
	const clases = {
		normal: "border-linea bg-panel text-tinta",
		resaltada: "border-tinta bg-panel text-tinta",
		total: "border-tinta bg-tinta text-panel",
	};
	return (
		<span
			className={`flex min-w-28 flex-1 flex-col gap-0.5 rounded-grande border-[1.5px] px-3.5 py-2.5 shadow-panel ${clases[forma]}`}
		>
			<span className="truncate text-etiqueta opacity-80">{nombre}</span>
			<b className="font-bold text-titulo-seccion tabular-nums">{enteros.format(piezas)}</b>
		</span>
	);
}

/**
 * El cuadre de las piezas de prenda: una cifra por ubicación, sumadas, con Aduana resaltada, y el total.
 * @param props Las ubicaciones y el total.
 */
function CuadreDeAduana({ cuadre, total }: { cuadre: Cuadre; total: number }) {
	return (
		<section aria-label="Cuadre de piezas" className="flex flex-wrap items-center gap-2 text-tinta3">
			{cuadre.map((ubicacion, i) => (
				<Fragment key={ubicacion.nombre}>
					{i === 0 ? null : <span aria-hidden>+</span>}
					<CifraDelCuadre
						nombre={ubicacion.nombre}
						piezas={ubicacion.piezas}
						forma={ubicacion.resaltada ? "resaltada" : "normal"}
					/>
				</Fragment>
			))}
			<span aria-hidden>=</span>
			<CifraDelCuadre nombre="Total" piezas={total} forma="total" />
		</section>
	);
}

/** Inventario en aduana. */
export function InventarioDeAduana() {
	const paginas = usePaginas(inventarioEnAduana, {});
	const [devolviendo, setDevolviendo] = useState<PartidaEnAduana | null>(null);
	return (
		<SegunConsulta consulta={paginas}>
			{({ pages }) => {
				const [primera] = pages;
				const renglones = pages.flatMap((pagina) => pagina.renglones);
				return (
					<div className="flex flex-col gap-5">
						{primera === undefined ? null : <CuadreDeAduana cuadre={primera.cuadre} total={primera.total} />}
						{renglones.length === 0 ? (
							<EstadoDePantalla tipo="vacio" texto="Nada en aduana" />
						) : (
							<Panel>
								<Tabla
									nombre="Inventario en aduana"
									filas={renglones}
									claveDeFila={(partida: PartidaEnAduana) => partida.traspaso_id}
									columnas={[
										{
											clave: "lleva",
											encabezado: "Lleva aquí",
											celda: (partida) => <Estado texto={partida.antiguedad.texto} color={partida.antiguedad.color} />,
										},
										{ clave: "que", encabezado: "Qué es", celda: (partida) => <QueEs partida={partida} /> },
										{
											clave: "cuanto",
											encabezado: "Cuánto",
											alinear: "derecha",
											celda: (partida) => partida.cantidad,
										},
										{
											clave: "va_a",
											encabezado: "Va a",
											celda: (partida) => <DestinoConPunto carril={partida.carril} nombre={partida.destino} />,
										},
										{
											clave: "boton",
											encabezado: "",
											alinear: "derecha",
											celda: (partida) => <BotonDePartida partida={partida} alDevolver={setDevolviendo} />,
										},
									]}
								/>
							</Panel>
						)}
						{paginas.hasNextPage ? (
							<Boton chico disabled={paginas.isFetchingNextPage} onClick={() => void paginas.fetchNextPage()}>
								Ver más
							</Boton>
						) : null}
						{devolviendo === null ? null : (
							<VentanaDevolverAProveedor
								key={devolviendo.traspaso_id}
								partida={devolviendo}
								alCerrar={() => setDevolviendo(null)}
							/>
						)}
					</div>
				);
			}}
		</SegunConsulta>
	);
}
