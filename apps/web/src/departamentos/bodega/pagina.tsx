/**
 * La página de Bodega que comparten sus siete pestañas: el título con las pestañas (Pendientes con su conteo, roja si
 * algo va en rojo), la acción principal «Surtir» en la barra (abre Pendientes con «Surtido») y el cajón que diga la
 * dirección.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Quién entra») y docs/interfaz/comunes.md («La página de un departamento»)
 */

import { pendientesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Store } from "lucide-react";
import type { ReactNode } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { useConsulta } from "../../comun/api.tsx";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonesDeBodega } from "./cajones/cajones.tsx";
import { type PestanaDeBodega, useDireccionDeBodega } from "./direccion.ts";

/** Las pestañas de Bodega; su clave es su ruta. */
export const pestanasDeBodega = [
	{ clave: "pendientes", texto: "Pendientes" },
	{ clave: "existencias", texto: "Existencias" },
	{ clave: "materiales", texto: "Materiales" },
	{ clave: "reabasto", texto: "Reabasto" },
	{ clave: "diferencias", texto: "Diferencias" },
	{ clave: "conteos", texto: "Conteos y ajustes" },
	{ clave: "excepciones", texto: "Excepciones" },
] as const satisfies readonly { clave: PestanaDeBodega; texto: string }[];

/**
 * La página de Bodega con una pestaña activa.
 * @param props La pestaña activa y su contenido.
 */
export function PaginaDeBodega({ activa, children }: { activa: PestanaDeBodega; children: ReactNode }) {
	const { navegar } = useDireccionDeBodega();
	const pastilla = useConsulta(pendientesDeBodega, {}).data?.pastilla;
	const pestanas = pestanasDeBodega.map((pestana) =>
		pestana.clave === "pendientes" && pastilla !== undefined
			? { ...pestana, conteo: pastilla.conteo, rojo: pastilla.rojo }
			: pestana,
	);
	return (
		<PaginaDeDepartamento departamento="bodega" pestanas={pestanas} activa={activa}>
			<AccionPrincipal>
				<Boton variante="principal" icono={Store} onClick={() => navegar({ grupo: "surtido" }, "pendientes")}>
					Surtir
				</Boton>
			</AccionPrincipal>
			{children}
			<CajonesDeBodega />
		</PaginaDeDepartamento>
	);
}
