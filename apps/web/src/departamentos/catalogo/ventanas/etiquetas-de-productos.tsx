/**
 * La ventana «Etiquetas de {n} productos»: una etiqueta por cada talla viva normal de los productos escogidos, sin las de
 * pedido especial. «Generar PDF · {n} etiquetas» → `catalogo.imprimir_etiquetas`; al salir, abre el PDF.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Ventanas») y docs/modulos/catalogo/variantes-codigos-y-etiquetas.md
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { imprimirEtiquetas } from "@uniformame/compartido/contratos/catalogo/etiquetas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { esperar, useAccionDeCatalogo } from "../acciones.ts";

/** Un producto escogido, con cuántas etiquetas lleva. */
interface ProductoConEtiquetas {
	id: string;
	nombre: string;
	etiquetables: number;
}

/**
 * La ventana de etiquetas de varios productos.
 * @param props Los productos, si está abierta y qué hacer al cerrar o al terminar.
 */
export function VentanaEtiquetasDeProductos({
	productos,
	abierta,
	alCerrar,
	alTerminar,
}: {
	productos: readonly ProductoConEtiquetas[];
	abierta: boolean;
	alCerrar: () => void;
	alTerminar: () => void;
}) {
	const accion = useAccionDeCatalogo(imprimirEtiquetas);
	const conConexion = useConConexion();
	const etiquetas = productos.reduce((suma, producto) => suma + producto.etiquetables, 0);
	const generar = async () => {
		const salida = await esperar(
			accion.mutateAsync({ datos: { producto_ids: productos.map((producto) => producto.id) } }),
		);
		if (!salida.bien) return;
		window.open(salida.resultado.url, "_blank", "noopener");
		alTerminar();
	};
	return (
		<Ventana
			abierta={abierta}
			alCerrar={alCerrar}
			titulo={`Etiquetas de ${plural(productos.length, "producto", "productos")}`}
			accion={
				<Boton disabled={etiquetas === 0 || accion.isPending || !conConexion} onClick={() => void generar()}>
					{`Generar PDF · ${plural(etiquetas, "etiqueta", "etiquetas")}`}
				</Boton>
			}
		>
			<ul className="m-0 flex list-none flex-col gap-1 p-0">
				{productos.map((producto) => (
					<li key={producto.id} className="flex justify-between gap-3">
						<span>{producto.nombre}</span>
						<span className="text-tinta2 tabular-nums">{producto.etiquetables}</span>
					</li>
				))}
			</ul>
		</Ventana>
	);
}
