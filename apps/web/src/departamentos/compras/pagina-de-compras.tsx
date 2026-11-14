/**
 * La página de Compras que comparten sus seis pestañas: el título con las pestañas (Pendientes con el conteo de todo
 * lo pendiente, roja si algo urge), la acción principal «Levantar orden» en la barra y el cajón que diga la dirección.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Quién entra») y docs/interfaz/comunes.md («La página de un departamento»)
 */

import { pendientesDeCompras } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import type { Pestana } from "@uniformame/interfaz/pagina/pagina-departamento";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { useConsulta } from "../../comun/api.tsx";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonesDeCompras } from "./cajones/cajones.tsx";
import { useDireccionDeCompras } from "./direccion.ts";

/** Las pestañas de Compras; su clave es su ruta. */
const pestanasDeCompras = [
	{ clave: "pendientes", texto: "Pendientes" },
	{ clave: "por-pedir", texto: "Por pedir" },
	{ clave: "ordenes", texto: "Órdenes de compra" },
	{ clave: "materiales", texto: "Materiales" },
	{ clave: "proveedores", texto: "Proveedores" },
	{ clave: "conciliacion", texto: "Conciliación de facturas" },
] as const satisfies readonly Pestana[];

/** La clave de una pestaña de Compras. */
type PestanaDeCompras = (typeof pestanasDeCompras)[number]["clave"];

/** Lo que recibe la página. */
interface PropsDePaginaDeCompras {
	activa: PestanaDeCompras;
	/** Lo marcado en Por pedir: «Levantar orden» lo lleva; sin nada, el cajón propone lo urgente. */
	escogidos?: readonly string[];
	children: ReactNode;
}

/**
 * La página de Compras con su pestaña activa.
 * @param props La pestaña activa, lo escogido en Por pedir y su contenido.
 */
export function PaginaDeCompras({ activa, escogidos = [], children }: PropsDePaginaDeCompras) {
	const { ir } = useDireccionDeCompras();
	const pendientes = useConsulta(pendientesDeCompras, {});
	const datos = pendientes.data;
	const pestanas = pestanasDeCompras.map((pestana) =>
		pestana.clave === "pendientes" && datos !== undefined
			? {
					...pestana,
					conteo: datos.conteos.todos,
					rojo: datos.renglones.some((renglon) => renglon.estado.color === "rojo"),
				}
			: pestana,
	);
	return (
		<PaginaDeDepartamento departamento="compras" pestanas={pestanas} activa={activa}>
			<AccionPrincipal>
				<Boton
					variante="principal"
					icono={Plus}
					onClick={() =>
						ir({ cajon: "levantar", id: undefined, materiales: escogidos.length > 0 ? escogidos.join(",") : undefined })
					}
				>
					Levantar orden
				</Boton>
			</AccionPrincipal>
			{children}
			<CajonesDeCompras />
		</PaginaDeDepartamento>
	);
}
