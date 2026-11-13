/**
 * La página de Contaduría: su título, sus siete pestañas como rutas, la acción principal «Registrar pago» (abre el
 * cajón con el primer cliente que tiene algo por pagar) y los cajones y la ventana que abre la dirección.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Quién entra») y docs/interfaz/comunes.md («La página de un
 * departamento»)
 *
 * Pendientes cuenta todos sus renglones (`conTodoLoPendiente`); la pastilla del menú, solo lo de ya.
 */

import { pendientesDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-pendientes";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { useConsulta } from "../../comun/api.tsx";
import { useConConexion } from "../../comun/estado-de-la-app.ts";
import { conTodoLoPendiente, PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonesDeContaduria } from "./cajones/cajones.tsx";
import { type PestanaDeContaduria, pestanasDeContaduria, useDireccionDeContaduria } from "./direccion.ts";
import { VentanaCapturarFactura } from "./ventanas/capturar-factura.tsx";

/**
 * La página de Contaduría con una pestaña activa.
 * @param props La pestaña activa y su contenido.
 */
export function PaginaDeContaduria({ activa, children }: { activa: PestanaDeContaduria; children: ReactNode }) {
	const { busqueda, abrir, navegar } = useDireccionDeContaduria();
	const conConexion = useConConexion();
	const pendientes = useConsulta(pendientesDeContaduria, {}).data;
	return (
		<PaginaDeDepartamento
			departamento="contaduria"
			pestanas={conTodoLoPendiente(pestanasDeContaduria, pendientes?.renglones)}
			activa={activa}
		>
			<AccionPrincipal>
				<Boton variante="principal" icono={Plus} disabled={!conConexion} onClick={() => abrir("registrar_pago")}>
					Registrar pago
				</Boton>
			</AccionPrincipal>
			<div className="flex flex-col gap-6">{children}</div>
			<CajonesDeContaduria />
			{busqueda.ventana === "capturar_factura" ? (
				<VentanaCapturarFactura
					ordenCompraId={busqueda.orden_compra_id}
					alCerrar={() => navegar({ ventana: undefined, orden_compra_id: undefined })}
				/>
			) : null}
		</PaginaDeDepartamento>
	);
}
