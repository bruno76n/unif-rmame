/**
 * La página de Patronaje: su título con sus cuatro pestañas, la acción principal «Capturar receta» (la ventana para
 * escoger la prenda) y los cajones Rendimiento y del desarrollo, que se abren en cualquier pestaña con
 * `?cajon=rendimiento&id={producto}` o `?cajon=desarrollo&id={desarrollo}`. Cada ruta pone su pestaña adentro.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Quién entra»: la acción principal y las pestañas)
 *
 * Uso, en la ruta de cada pestaña: `<PaginaDePatronaje activa="rendimiento"><PestanaRendimiento /></PaginaDePatronaje>`.
 */

import { Boton } from "@uniformame/interfaz/botones/boton";
import { Ruler } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonDesarrollo } from "./cajones/desarrollo.tsx";
import { CajonRendimiento } from "./cajones/rendimiento.tsx";
import { VentanaCapturarReceta } from "./ventanas/capturar-receta.tsx";

/** Las pestañas de Patronaje, en su orden; su clave es su ruta. */
export const pestanasDePatronaje = [
	{ clave: "pendientes", texto: "Pendientes" },
	{ clave: "recetas", texto: "Recetas" },
	{ clave: "rendimiento", texto: "Rendimiento" },
	{ clave: "desarrollo", texto: "Desarrollo de producto" },
] as const;

/** La clave de una pestaña de Patronaje. */
export type PestanaDePatronaje = (typeof pestanasDePatronaje)[number]["clave"];

/**
 * La página de Patronaje con una pestaña.
 * @param props La pestaña activa, el conteo de Pendientes si su pantalla lo da, y su contenido.
 */
export function PaginaDePatronaje({
	activa,
	pendientes,
	children,
}: {
	activa: PestanaDePatronaje;
	pendientes?: { conteo: number; rojo: boolean };
	children: ReactNode;
}) {
	const [escogiendo, setEscogiendo] = useState(false);
	const pestanas = pestanasDePatronaje.map((pestana) =>
		pestana.clave === "pendientes" && pendientes !== undefined ? { ...pestana, ...pendientes } : pestana,
	);
	return (
		<PaginaDeDepartamento departamento="patronaje" pestanas={pestanas} activa={activa}>
			<AccionPrincipal>
				<Boton variante="principal" icono={Ruler} onClick={() => setEscogiendo(true)}>
					Capturar receta
				</Boton>
			</AccionPrincipal>
			<div className="flex flex-col gap-5">{children}</div>
			<VentanaCapturarReceta abierta={escogiendo} alCerrar={() => setEscogiendo(false)} />
			<CajonRendimiento />
			<CajonDesarrollo />
		</PaginaDeDepartamento>
	);
}
