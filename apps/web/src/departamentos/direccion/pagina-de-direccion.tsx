/**
 * La página de Dirección: su título, sus cuatro pestañas con su conteo y su acción principal «Autorizar», que sale
 * solo si hay alguna por autorizar. La usa la ruta de cada pestaña.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Quién entra»: acción principal y pestañas)
 *
 * Pendientes cuenta las autorizaciones y las alertas y va en rojo si hay alguna; Alertas cruzadas lleva su número. Los
 * conteos salen de `direccion.pendientes`, la misma consulta de la primera pestaña.
 */

import { useNavigate } from "@tanstack/react-router";
import { pendientes } from "@uniformame/compartido/contratos/direccion/pendientes";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { useConsulta } from "../../comun/api.tsx";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";

/** Las pestañas de Dirección: su clave es su ruta. */
type PestanaDeDireccion = "pendientes" | "autorizaciones" | "indicadores" | "alertas";

/**
 * La página de Dirección con la pestaña activa.
 * @param props La pestaña activa y su contenido.
 */
export function PaginaDeDireccion({ activa, children }: { activa: PestanaDeDireccion; children: ReactNode }) {
	const navegar = useNavigate();
	const conteos = useConsulta(pendientes, {}).data?.conteos;
	const enPendientes = conteos === undefined ? 0 : conteos.autorizaciones + conteos.alertas;
	return (
		<PaginaDeDepartamento
			departamento="direccion"
			activa={activa}
			pestanas={[
				{ clave: "pendientes", texto: "Pendientes", conteo: enPendientes, rojo: enPendientes > 0 },
				{ clave: "autorizaciones", texto: "Autorizaciones" },
				{ clave: "indicadores", texto: "Indicadores" },
				{ clave: "alertas", texto: "Alertas cruzadas", conteo: conteos?.alertas ?? 0 },
			]}
		>
			{conteos !== undefined && conteos.autorizaciones > 0 ? (
				<AccionPrincipal>
					<Boton variante="principal" icono={Check} onClick={() => navegar({ to: "/direccion/autorizaciones" })}>
						Autorizar
					</Boton>
				</AccionPrincipal>
			) : null}
			{children}
		</PaginaDeDepartamento>
	);
}
