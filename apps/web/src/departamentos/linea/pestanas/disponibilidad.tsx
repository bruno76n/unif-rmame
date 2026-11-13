/**
 * Disponibilidad de Tienda en línea: la leyenda y una ficha por producto que se vende en línea, con un cuadro por
 * talla: verde si sale hoy, ámbar si sale mañana, gris y tachado si está agotada. Sin botones.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Disponibilidad»)
 *
 * La promesa de cada talla llega de `inventario.disponibilidad_linea`, con la cuenta del orden de surtido: la pantalla
 * solo la pinta.
 */

import {
	disponibilidadLinea,
	type promesasDeDisponibilidad,
} from "@uniformame/compartido/contratos/inventario/disponibilidad-linea";
import { unirClases } from "@uniformame/interfaz/clases";
import { Tarjeta } from "@uniformame/interfaz/contenedores/tarjeta";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";

/** El cuadro de cada promesa, con los colores de estado del sistema de diseño. */
const cuadroDe: Readonly<Record<(typeof promesasDeDisponibilidad)[number], string>> = {
	sale_hoy: "border-estado-verde bg-estado-verde text-white",
	sale_manana: "border-estado-ambar bg-estado-ambar text-white",
	agotado: "border-linea2 border-dashed bg-suave text-tinta3 line-through",
};

/** La leyenda, en el orden de la muestra. */
const leyenda = [
	{ promesa: "sale_hoy", texto: "Sale hoy · hay en bodega" },
	{ promesa: "sale_manana", texto: "Sale mañana · está en una tienda" },
	{ promesa: "agotado", texto: "Agotado" },
] as const;

/**
 * El cuadro de una talla.
 * @param props La talla, su promesa y su texto al pasar el puntero; `chico`, el de la leyenda.
 */
function Cuadro({
	talla,
	promesa,
	texto,
	chico = false,
}: {
	talla: string;
	promesa: (typeof promesasDeDisponibilidad)[number];
	texto?: string;
	chico?: boolean;
}) {
	return (
		<span
			title={texto}
			className={unirClases(
				"inline-grid place-items-center rounded-chico border font-bold tabular-nums",
				chico ? "h-3 w-5" : "h-8 min-w-10 px-2 text-etiqueta",
				cuadroDe[promesa],
			)}
		>
			{talla}
			{texto === undefined ? null : <span className="sr-only">: {texto}</span>}
		</span>
	);
}

/** Disponibilidad. */
export function PestanaDisponibilidad() {
	const consulta = useConsulta(disponibilidadLinea, {});
	return (
		<div className="flex flex-col gap-5">
			<ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-etiqueta text-tinta2">
				{leyenda.map((uno) => (
					<li key={uno.promesa} className="inline-flex items-center gap-2">
						<Cuadro talla="" promesa={uno.promesa} chico />
						<span>{uno.texto}</span>
					</li>
				))}
			</ul>
			<SegunConsulta consulta={consulta}>
				{(datos) =>
					datos.productos.length === 0 ? (
						<EstadoDePantalla
							tipo="vacio"
							texto="Ningún producto se vende en línea. Catálogo lo prende en la ficha del producto."
						/>
					) : (
						<div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
							{datos.productos.map((producto) => (
								<Tarjeta key={producto.producto_id} nombre={producto.nombre}>
									<b className="font-bold">{producto.nombre}</b>
									<span className="flex flex-wrap gap-1.5 pt-1">
										{producto.tallas.length === 0 ? (
											<span className="text-etiqueta text-tinta3">Sin existencia</span>
										) : (
											producto.tallas.map((talla) => (
												<Cuadro
													key={talla.variante_id}
													talla={talla.talla}
													promesa={talla.promesa}
													texto={talla.texto}
												/>
											))
										)}
									</span>
								</Tarjeta>
							))}
						</div>
					)
				}
			</SegunConsulta>
		</div>
	);
}
