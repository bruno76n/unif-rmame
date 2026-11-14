/**
 * La barra de selección de Productos y de Listas de precios: «{n} productos seleccionados», «Imprimir etiquetas»,
 * «Cambiar precios» y, en Productos, «Descontinuar con motivo», más quitar la selección. Si ninguno tiene precio o
 * todos están descontinuados, lo dice en el aviso de abajo en vez de abrir la ventana.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Productos», «Listas de precios»)
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { X } from "lucide-react";
import { useState } from "react";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { VentanaCambiarPrecios } from "../ventanas/cambiar-precios.tsx";
import { VentanaDescontinuar } from "../ventanas/descontinuar.tsx";
import { VentanaEtiquetasDeProductos } from "../ventanas/etiquetas-de-productos.tsx";

/** Un producto escogido. */
interface ProductoEscogido {
	id: string;
	version: number;
	nombre: string;
	etiquetables: number;
	/** Si tiene precio en alguna lista (o en la lista que se ve). */
	tiene_precio: boolean;
	descontinuado: boolean;
}

/**
 * La barra de selección.
 * @param props Los productos escogidos, la lista que se ve (en Listas de precios), si se puede descontinuar y qué hacer
 * al quitar la selección.
 */
export function BarraDeSeleccion({
	productos,
	lista,
	conDescontinuar = true,
	alQuitar,
}: {
	productos: readonly ProductoEscogido[];
	lista?: string | undefined;
	conDescontinuar?: boolean;
	alQuitar: () => void;
}) {
	const avisar = useAvisar();
	const [abierta, setAbierta] = useState<"etiquetas" | "precios" | "descontinuar" | undefined>(undefined);
	const cerrar = () => setAbierta(undefined);
	const terminar = () => {
		setAbierta(undefined);
		alQuitar();
	};
	return (
		<div
			role="toolbar"
			aria-label="Selección"
			className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-grande bg-tinta px-4 py-2.5 text-white shadow-flotante"
		>
			<b className="mr-auto">{plural(productos.length, "producto seleccionado", "productos seleccionados")}</b>
			<Boton chico variante="secundario" onClick={() => setAbierta("etiquetas")}>
				Imprimir etiquetas
			</Boton>
			<Boton
				chico
				variante="secundario"
				onClick={() =>
					productos.some((producto) => producto.tiene_precio)
						? setAbierta("precios")
						: avisar("Los productos que escogiste no tienen precio en ninguna lista", "no_se_pudo")
				}
			>
				Cambiar precios
			</Boton>
			{conDescontinuar ? (
				<Boton
					chico
					variante="secundario"
					onClick={() =>
						productos.every((producto) => producto.descontinuado)
							? avisar("Esos productos ya están descontinuados", "no_se_pudo")
							: setAbierta("descontinuar")
					}
				>
					Descontinuar con motivo
				</Boton>
			) : null}
			<button
				type="button"
				aria-label="Quitar selección"
				onClick={alQuitar}
				className="grid size-8 place-items-center rounded-mediano hover:bg-tinta2"
			>
				<X aria-hidden="true" size={17} />
			</button>
			<VentanaEtiquetasDeProductos
				productos={productos}
				abierta={abierta === "etiquetas"}
				alCerrar={cerrar}
				alTerminar={terminar}
			/>
			<VentanaCambiarPrecios
				productos={productos}
				listaInicial={lista}
				abierta={abierta === "precios"}
				alCerrar={cerrar}
				alTerminar={terminar}
			/>
			<VentanaDescontinuar
				productos={productos.filter((producto) => !producto.descontinuado)}
				abierta={abierta === "descontinuar"}
				alCerrar={cerrar}
				alTerminar={terminar}
			/>
		</div>
	);
}
