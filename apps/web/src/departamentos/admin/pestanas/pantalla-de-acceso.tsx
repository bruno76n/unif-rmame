/**
 * Pantalla de acceso: la entrada al sistema tal como la ve la gente (la marca, «Entrar con Google» y el taller con su
 * PIN), el saludo al volver de Google de quien la ve (su nombre, su puesto y sus departamentos, del armazón) y, abajo, las
 * cuentas con acceso.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Pantalla de acceso»)
 *
 * No simula la entrada (no se copia de la muestra): «Entrar con Google» va a Google como la entrada de verdad y vuelve
 * a esta pestaña.
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { armazon } from "@uniformame/compartido/contratos/admin/armazon";
import { pantallaAccesoDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-usuarios";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { CircleCheck, TabletSmartphone } from "lucide-react";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";

/** La ida a Google para entrar, que vuelve a esta pestaña. */
const entrarConGoogle = `/v1/acceso/google?${new URLSearchParams({ regresar: "/admin/pantalla-de-acceso" }).toString()}`;

/** La pestaña Pantalla de acceso. */
export function PestanaPantallaDeAcceso() {
	const consulta = useConsulta(pantallaAccesoDeAdmin, {});
	// El saludo es el de quien ve: su nombre, su puesto y sus departamentos, como los da el armazón.
	const cuenta = useConsulta(armazon, {}).data;
	const departamentos = cuenta?.departamentos.length ?? 0;
	return (
		<SegunConsulta consulta={consulta} renglones={4}>
			{(datos) => (
				<>
					<div className="grid grid-cols-2 gap-6 max-menu:grid-cols-1">
						<Panel>
							<div className="flex flex-col items-center gap-5 py-4 text-center">
								<span className="grid size-12 place-items-center rounded-grande bg-marca font-bold text-white">UA</span>
								<div>
									<b className="block font-bold text-titulo-seccion">{datos.marca}</b>
									<span className="text-tinta3">Sistema de fábrica</span>
								</div>
								<Boton variante="principal" onClick={() => window.location.assign(entrarConGoogle)}>
									Entrar con Google
								</Boton>
								<span className="inline-flex items-center gap-2 text-etiqueta text-tinta3">
									<TabletSmartphone aria-hidden="true" size={13} />
									El taller entra con su PIN en la tablet registrada, sin cuenta de Google
								</span>
							</div>
						</Panel>
						<Panel titulo="Al volver de Google">
							<div className="flex flex-col items-center gap-3 py-4 text-center">
								<CircleCheck aria-hidden="true" size={22} className="text-texto-bien" />
								<b className="font-bold text-subtitulo">{`Hola, ${cuenta?.cuenta.nombre.split(/\s+/)[0] ?? ""}`}</b>
								<span className="text-tinta2">
									{`${cuenta?.cuenta.puesto ?? ""} · ${plural(departamentos, "departamento", "departamentos")}. La sesión se cierra sola tras ${datos.inactividad_min} min sin actividad.`}
								</span>
							</div>
						</Panel>
					</div>
					<Panel titulo="Cuentas con acceso">
						<Tabla
							nombre="Cuentas con acceso"
							filas={datos.cuentas}
							claveDeFila={(cuenta) => cuenta.usuario_id}
							columnas={[
								{ clave: "iniciales", encabezado: "", celda: (cuenta) => <b>{cuenta.iniciales}</b> },
								{
									clave: "cuenta",
									encabezado: "Cuenta",
									celda: (cuenta) => <DosRenglones arriba={cuenta.nombre} abajo={cuenta.correo} />,
								},
							]}
						/>
					</Panel>
				</>
			)}
		</SegunConsulta>
	);
}
