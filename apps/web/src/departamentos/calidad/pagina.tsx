/**
 * La página de Calidad: su título con sus cuatro pestañas, la acción principal «Revisar lote» (solo si hay lotes por
 * revisar: abre la revisión del primero de Por revisar) y la ventana «Revisar devolución», que se abre en cualquier
 * pestaña con `?cajon=devolucion&id={traspaso}`. Cada ruta de Calidad pone su pestaña adentro.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Quién entra»: la acción principal y las pestañas)
 *
 * Uso, en la ruta de cada pestaña: `<PaginaDeCalidad activa="defectos"><PestanaDefectos /></PaginaDeCalidad>`.
 */

import { porRevisarDeCalidad } from "@uniformame/compartido/contratos/calidad/por-revisar";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { useConsulta } from "../../comun/api.tsx";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { rutasDeCalidad, useDireccion } from "./direccion.ts";
import { VentanaRevisarDevolucion } from "./ventanas/revisar-devolucion.tsx";

/** Las pestañas de Calidad, en su orden; su clave es su ruta. */
const pestanasDeCalidad = [
	{ clave: "pendientes", texto: "Pendientes" },
	{ clave: "por-revisar", texto: "Por revisar" },
	{ clave: "defectos", texto: "Defectos" },
	{ clave: "reclamos", texto: "Reclamos" },
] as const;

/** La clave de una pestaña de Calidad. */
type PestanaDeCalidad = (typeof pestanasDeCalidad)[number]["clave"];

/**
 * La página de Calidad con una pestaña.
 * @param props La pestaña activa, el conteo de Pendientes si su pantalla lo da, y su contenido.
 */
export function PaginaDeCalidad({
	activa,
	pendientes,
	children,
}: {
	activa: PestanaDeCalidad;
	pendientes?: { conteo: number; rojo: boolean };
	children: ReactNode;
}) {
	const { leer, ir } = useDireccion();
	const porRevisar = useConsulta(porRevisarDeCalidad, {});
	const primero = porRevisar.data?.lotes[0];
	const pestanas = pestanasDeCalidad.map((pestana) =>
		pestana.clave === "pendientes" && pendientes !== undefined ? { ...pestana, ...pendientes } : pestana,
	);
	const devolucion = leer("cajon") === "devolucion" ? (leer("id") ?? null) : null;
	return (
		<PaginaDeDepartamento departamento="calidad" pestanas={pestanas} activa={activa}>
			{primero === undefined ? null : (
				<AccionPrincipal>
					<Boton
						variante="principal"
						icono={Check}
						onClick={() => ir({ lote: primero.lote_id }, rutasDeCalidad.porRevisar)}
					>
						Revisar lote
					</Boton>
				</AccionPrincipal>
			)}
			<div className="flex flex-col gap-5">{children}</div>
			<VentanaRevisarDevolucion traspasoId={devolucion} alCerrar={() => ir({ cajon: undefined, id: undefined })} />
		</PaginaDeDepartamento>
	);
}
