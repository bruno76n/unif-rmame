/**
 * La cuenta, abajo del menú: su avatar con iniciales, su nombre y su puesto. Al tocarla, «Mis sesiones» (las sesiones
 * abiertas, con «Cerrar» en una o «Cerrar las demás») y «Salir».
 * Fase 19 · docs/interfaz/comunes.md («El menú lateral», regla 5, y «Mis sesiones»)
 */

import { misSesiones } from "@uniformame/compartido/contratos/admin/armazon";
import { cerrarMiSesion, salir } from "@uniformame/compartido/contratos/admin/cuentas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { MenuDeOpciones } from "@uniformame/interfaz/contenedores/menu-de-opciones";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import { useAccion, useConsulta } from "./api.tsx";

/** La cuenta como la da `admin.armazon`. */
interface CuentaDelArmazon {
	nombre: string;
	iniciales: string;
	puesto: string;
}

/**
 * La ventana «Mis sesiones».
 * @param props Si está abierta y qué hacer al cerrarla.
 */
function MisSesiones({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
	const sesiones = useConsulta(misSesiones, {}, abierta);
	const cerrar = useAccion(cerrarMiSesion, ["admin.mis_sesiones"]);
	const otras = (sesiones.data?.sesiones ?? []).filter((sesion) => !sesion.es_esta);
	return (
		<Ventana
			abierta={abierta}
			alCerrar={alCerrar}
			titulo="Mis sesiones"
			ancha
			accion={
				otras.length === 0 ? undefined : (
					<Boton variante="peligro" onClick={() => cerrar.mutate({ datos: { todas_las_demas: true } })}>
						Cerrar las demás
					</Boton>
				)
			}
		>
			<ul className="m-0 flex list-none flex-col gap-2 p-0">
				{(sesiones.data?.sesiones ?? []).map((sesion) => (
					<li key={sesion.id} className="flex items-center gap-3 rounded-mediano border border-linea px-3 py-2.5">
						<MonitorSmartphone aria-hidden="true" size={18} className="flex-none text-tinta3" />
						<span className="flex min-w-0 flex-1 flex-col">
							<b className="font-semibold">
								{sesion.aparato ?? "Aparato sin nombre"}
								{sesion.es_esta ? " · esta" : ""}
							</b>
							<span className="text-etiqueta text-tinta2">
								{[sesion.ciudad, sesion.ip].filter((parte) => parte !== null).join(" · ")} · entró el{" "}
								{new Date(sesion.entro_en).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} ·
								última actividad {new Date(sesion.ultima_actividad_en).toLocaleString("es-MX", { timeStyle: "short" })}
							</span>
						</span>
						{sesion.es_esta ? null : (
							<Boton chico variante="peligro" onClick={() => cerrar.mutate({ datos: { sesion_id: sesion.id } })}>
								Cerrar
							</Boton>
						)}
					</li>
				))}
			</ul>
		</Ventana>
	);
}

/**
 * La cuenta con su menú.
 * @param props La cuenta.
 */
export function Cuenta({ cuenta }: { cuenta: CuentaDelArmazon }) {
	const [sesiones, setSesiones] = useState(false);
	const salirDelSistema = useAccion(salir);
	return (
		<>
			<MenuDeOpciones
				boton={
					<>
						<span className="grid size-8 flex-none place-items-center rounded-full bg-tinta font-bold text-white text-xs">
							{cuenta.iniciales}
						</span>
						<span className="flex min-w-0 flex-1 flex-col leading-tight">
							<b className="truncate font-bold">{cuenta.nombre}</b>
							<span className="truncate text-etiqueta text-tinta3">{cuenta.puesto}</span>
						</span>
					</>
				}
				opciones={[
					{ texto: "Mis sesiones", icono: MonitorSmartphone, alTocar: () => setSesiones(true) },
					{
						texto: "Salir",
						icono: LogOut,
						peligro: true,
						alTocar: () =>
							salirDelSistema.mutate({ datos: {} }, { onSuccess: () => window.location.assign("/acceso") }),
					},
				]}
			/>
			<MisSesiones abierta={sesiones} alCerrar={() => setSesiones(false)} />
		</>
	);
}
