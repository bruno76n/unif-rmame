/**
 * La página de Administración del sistema: su título, sus siete pestañas como rutas, la acción principal «Usuarios»
 * (abre Usuarios y accesos) y el cajón Alta de usuario que abre la dirección.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Quién entra») y docs/interfaz/comunes.md («La página de un
 * departamento»)
 *
 * Pendientes cuenta todos sus renglones (`conTodoLoPendiente`); la pastilla del menú, solo lo de ya.
 */

import { pendientesDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-pendientes";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Users } from "lucide-react";
import type { ReactNode } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { useConsulta } from "../../comun/api.tsx";
import { conTodoLoPendiente, PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonAltaUsuario } from "./cajones/alta-usuario.tsx";
import { type PestanaDeAdmin, pestanasDeAdmin, useDireccionDeAdmin } from "./direccion.ts";

/**
 * La página de Administración del sistema con una pestaña activa.
 * @param props La pestaña activa y su contenido.
 */
export function PaginaDeAdmin({ activa, children }: { activa: PestanaDeAdmin; children: ReactNode }) {
	const { busqueda, navegar, cerrar } = useDireccionDeAdmin();
	const pendientes = useConsulta(pendientesDeAdmin, {}).data;
	return (
		<PaginaDeDepartamento
			departamento="admin"
			pestanas={conTodoLoPendiente(pestanasDeAdmin, pendientes?.renglones)}
			activa={activa}
		>
			<AccionPrincipal>
				<Boton variante="principal" icono={Users} onClick={() => navegar({}, "usuarios-y-accesos")}>
					Usuarios
				</Boton>
			</AccionPrincipal>
			<div className="flex flex-col gap-6">{children}</div>
			{busqueda.cajon === "alta_usuario" && busqueda.id !== undefined ? (
				<CajonAltaUsuario key={busqueda.id} autorizacionId={busqueda.id} alCerrar={cerrar} />
			) : null}
		</PaginaDeDepartamento>
	);
}
