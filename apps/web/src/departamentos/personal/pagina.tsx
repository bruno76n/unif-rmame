/**
 * La página de Personal que comparten sus pestañas: el título con las pestañas (Asistencia con los días sin capturar,
 * Personas, PIN del taller con los que faltan y, con «ven sueldos y tarifas», Tarifas con las que faltan), la acción
 * principal «Nueva persona», que abre el cajón del alta, y el cajón que diga la dirección.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Quién entra») y docs/interfaz/comunes.md («La página de un
 * departamento»)
 *
 * Los conteos de las pestañas salen de `personal.asistencia`, que es la que sabe qué falta.
 */

import { asistenciaDePersonal } from "@uniformame/compartido/contratos/personal/asistencia";
import { Boton } from "@uniformame/interfaz/botones/boton";
import type { Pestana } from "@uniformame/interfaz/pagina/pagina-departamento";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { useConsulta } from "../../comun/api.tsx";
import { useConConexion } from "../../comun/estado-de-la-app.ts";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonesDePersonal } from "./cajones/cajones.tsx";
import { type PestanaDePersonal, useDireccionDePersonal } from "./direccion.ts";

/**
 * Las pestañas de Personal con su conteo; Tarifas solo si la cuenta ve tarifas.
 * @param pestanas Los conteos de `personal.asistencia`, si ya llegaron.
 */
function pestanasDePersonal(pestanas: { asistencia: number; tablet: number; tarifas: number | null } | undefined) {
	const lista: (Pestana & { clave: PestanaDePersonal })[] = [
		{ clave: "pendientes", texto: "Asistencia", ...(pestanas === undefined ? {} : { conteo: pestanas.asistencia }) },
		{ clave: "personas", texto: "Personas" },
		{ clave: "pin", texto: "PIN del taller", ...(pestanas === undefined ? {} : { conteo: pestanas.tablet }) },
	];
	if (pestanas?.tarifas != null) lista.push({ clave: "tarifas", texto: "Tarifas", conteo: pestanas.tarifas });
	return lista;
}

/**
 * La página de Personal con una pestaña activa.
 * @param props La pestaña activa y su contenido.
 */
export function PaginaDePersonal({ activa, children }: { activa: PestanaDePersonal; children: ReactNode }) {
	const conConexion = useConConexion();
	const { abrir } = useDireccionDePersonal();
	const asistencia = useConsulta(asistenciaDePersonal, {}).data;
	return (
		<PaginaDeDepartamento departamento="personal" pestanas={pestanasDePersonal(asistencia?.pestanas)} activa={activa}>
			<AccionPrincipal>
				<Boton variante="principal" icono={Plus} disabled={!conConexion} onClick={() => abrir("nueva")}>
					Nueva persona
				</Boton>
			</AccionPrincipal>
			{children}
			<CajonesDePersonal />
		</PaginaDeDepartamento>
	);
}
