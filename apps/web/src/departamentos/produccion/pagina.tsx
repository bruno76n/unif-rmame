/**
 * La página de Producción: su título con sus seis pestañas, la acción principal «Capturar corte» y el cajón del lote,
 * que se abre en cualquier pestaña con `?cajon=lote&id={id}` en la dirección. Cada ruta de Producción pone su pestaña adentro.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Quién entra»: la acción principal y las pestañas)
 *
 * Uso, en la ruta de cada pestaña: `<PaginaDeProduccion activa="lotes"><PestanaLotes /></PaginaDeProduccion>`.
 */

import { Boton } from "@uniformame/interfaz/botones/boton";
import { Scissors } from "lucide-react";
import type { ReactNode } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonLote } from "./cajones/lote.tsx";
import { rutasDeProduccion, useDireccion } from "./direccion.ts";

/** Las pestañas de Producción, en su orden; su clave es su ruta. */
const pestanasDeProduccion = [
	{ clave: "pendientes", texto: "Pendientes" },
	{ clave: "lotes", texto: "Lotes" },
	{ clave: "ordenes", texto: "Órdenes de producción" },
	{ clave: "corte", texto: "Corte" },
	{ clave: "operaciones", texto: "Operaciones" },
	{ clave: "por-persona", texto: "Producción por persona" },
] as const;

/** La clave de una pestaña de Producción. */
type PestanaDeProduccion = (typeof pestanasDeProduccion)[number]["clave"];

/**
 * La página de Producción con una pestaña.
 * @param props La pestaña activa, el conteo de Pendientes si su pantalla lo da, y su contenido.
 */
export function PaginaDeProduccion({
	activa,
	pendientes,
	children,
}: {
	activa: PestanaDeProduccion;
	pendientes?: { conteo: number; rojo: boolean };
	children: ReactNode;
}) {
	const { ir } = useDireccion();
	const pestanas = pestanasDeProduccion.map((pestana) =>
		pestana.clave === "pendientes" && pendientes !== undefined ? { ...pestana, ...pendientes } : pestana,
	);
	return (
		<PaginaDeDepartamento departamento="produccion" pestanas={pestanas} activa={activa}>
			<AccionPrincipal>
				<Boton variante="principal" icono={Scissors} onClick={() => ir({}, rutasDeProduccion.corte)}>
					Capturar corte
				</Boton>
			</AccionPrincipal>
			<div className="flex flex-col gap-5">{children}</div>
			<CajonLote />
		</PaginaDeDepartamento>
	);
}
