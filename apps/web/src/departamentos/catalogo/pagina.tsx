/**
 * La página de Catálogo: el título y sus seis pestañas (Pendientes con su conteo, roja si hay un modelo sin precio), la
 * acción principal «Nuevo producto» y los dos cajones, que se abren desde la dirección en cualquier pestaña.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Quién entra», «Cajones»)
 */

import { pendientesDeCatalogo } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { useConsulta } from "../../comun/api.tsx";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonFichaDeProducto } from "./cajones/ficha-producto.tsx";
import { CajonNuevoProducto } from "./cajones/nuevo-producto.tsx";
import { conAlta, pestanasDeCatalogo, useBusqueda, useIr, usePestana } from "./direccion.ts";

/**
 * La página de Catálogo con la pestaña de la ruta.
 * @param props La pestaña que se ve.
 */
export function PaginaDeCatalogo({ children }: { children: ReactNode }) {
	const activa = usePestana();
	const busqueda = useBusqueda();
	const ir = useIr();
	const pendientes = useConsulta(pendientesDeCatalogo, {});
	const datos = pendientes.data;
	const pestanas = pestanasDeCatalogo.map((pestana) =>
		pestana.clave === "pendientes" && datos !== undefined
			? { ...pestana, conteo: datos.conteos.todos, rojo: datos.cifras.modelos_sin_precio > 0 }
			: pestana,
	);
	return (
		<>
			<PaginaDeDepartamento departamento="catalogo" pestanas={pestanas} activa={activa}>
				{children}
			</PaginaDeDepartamento>
			<AccionPrincipal>
				<Boton variante="principal" icono={Plus} onClick={() => ir(conAlta())}>
					Nuevo producto
				</Boton>
			</AccionPrincipal>
			{busqueda.cajon === "producto" && busqueda.id !== undefined ? (
				<CajonFichaDeProducto key={busqueda.id} productoId={busqueda.id} />
			) : null}
			{busqueda.cajon === "nuevo_producto" ? <CajonNuevoProducto origen={busqueda.origen ?? "catalogo"} /> : null}
		</>
	);
}
