/**
 * La página de Mantenimiento que comparten sus cinco pestañas: el título con las pestañas (Pendientes con sus fallas
 * abiertas, roja si alguna detuvo su máquina), «Reportar falla» y la acción principal «Registrar servicio» en la barra,
 * y el cajón que diga la dirección.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Quién entra») y docs/interfaz/comunes.md («La página de un
 * departamento»)
 */

import { pendientesDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Plus, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { useConsulta } from "../../comun/api.tsx";
import { useConConexion } from "../../comun/estado-de-la-app.ts";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonesDeMantenimiento } from "./cajones/cajones.tsx";
import type { PestanaDeMantenimiento } from "./direccion.ts";
import { VentanaReportarFalla } from "./ventanas/reportar-falla.tsx";
import { VentanaServicio } from "./ventanas/servicio.tsx";

/** Las pestañas de Mantenimiento; su clave es su ruta. */
export const pestanasDeMantenimiento = [
	{ clave: "pendientes", texto: "Pendientes" },
	{ clave: "maquinas", texto: "Máquinas" },
	{ clave: "fallas", texto: "Fallas" },
	{ clave: "servicios", texto: "Servicios" },
	{ clave: "costo", texto: "Costo por máquina" },
] as const satisfies readonly { clave: PestanaDeMantenimiento; texto: string }[];

/**
 * La página de Mantenimiento con una pestaña activa.
 * @param props La pestaña activa y su contenido.
 */
export function PaginaDeMantenimiento({ activa, children }: { activa: PestanaDeMantenimiento; children: ReactNode }) {
	const conConexion = useConConexion();
	const [ventana, setVentana] = useState<"reportar" | "servicio" | null>(null);
	const pendientes = useConsulta(pendientesDeMantenimiento, {}).data;
	const pestanas = pestanasDeMantenimiento.map((pestana) =>
		pestana.clave === "pendientes" && pendientes !== undefined
			? {
					...pestana,
					conteo: pendientes.renglones.length,
					rojo: pendientes.renglones.some((renglon) => renglon.parada),
				}
			: pestana,
	);
	return (
		<PaginaDeDepartamento departamento="mantenimiento" pestanas={pestanas} activa={activa}>
			<AccionPrincipal>
				<span className="flex items-center gap-2">
					<Boton icono={TriangleAlert} disabled={!conConexion} onClick={() => setVentana("reportar")}>
						Reportar falla
					</Boton>
					<Boton variante="principal" icono={Plus} disabled={!conConexion} onClick={() => setVentana("servicio")}>
						Registrar servicio
					</Boton>
				</span>
			</AccionPrincipal>
			{children}
			<CajonesDeMantenimiento />
			{ventana === "reportar" ? <VentanaReportarFalla alCerrar={() => setVentana(null)} /> : null}
			{ventana === "servicio" ? <VentanaServicio alCerrar={() => setVentana(null)} /> : null}
		</PaginaDeDepartamento>
	);
}
