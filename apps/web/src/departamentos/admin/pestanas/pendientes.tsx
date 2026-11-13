/**
 * Pendientes de Administración del sistema: las cuatro cifras (usuarios, dispositivos, bitácora y respaldos) y el
 * panel con las altas por confirmar, los aparatos sin sincronizar, las alertas sin revisar y la prueba de restauración.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Pendientes»)
 *
 * Los renglones llegan armados de `admin.pendientes`: la pantalla solo los pinta y hace lo que dice su botón (abre el
 * cajón Alta de usuario, lleva a Dispositivos con el aparato resaltado, marca revisada la alerta o va a su pestaña).
 */

import { marcarAlertaRevisada } from "@uniformame/compartido/contratos/admin/bitacora";
import { pendientesDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-pendientes";
import { BarraIndicadores, type Cifra } from "@uniformame/interfaz/pagina/barra-indicadores";
import type { ColorDeTipo } from "@uniformame/interfaz/pagina/colores-de-tipo";
import { PanelPendientes, type Pendiente } from "@uniformame/interfaz/tablas/panel-pendientes";
import {
	Archive,
	DatabaseBackup,
	type LucideIcon,
	ShieldAlert,
	ShieldCheck,
	TabletSmartphone,
	UserPlus,
	Users,
} from "lucide-react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { busquedaDeAdmin, type PestanaDeAdmin, useDireccionDeAdmin } from "../direccion.ts";
import { useEnvio } from "../envio.ts";

/** Lo que da la consulta. */
type Pendientes = z.infer<typeof pendientesDeAdmin.resultado>;
/** Un renglón de Pendientes. */
type Renglon = Pendientes["renglones"][number];
/** Una cifra, como la arma la consulta. */
type CifraLeida = Pendientes["cifras"]["usuarios"];

/** El texto, el ícono y el color de cada tipo de pendiente. */
const deTipo: Readonly<Record<Renglon["tipo"], { texto: string; icono: LucideIcon; color: ColorDeTipo }>> = {
	alta_usuario: { texto: "Alta de usuario", icono: UserPlus, color: "azul" },
	dispositivo: { texto: "Dispositivo", icono: TabletSmartphone, color: "pizarra" },
	alerta: { texto: "Alerta de seguridad", icono: ShieldAlert, color: "rojo" },
	respaldo: { texto: "Respaldo", icono: DatabaseBackup, color: "violeta" },
};

/**
 * Una cifra de la barra con lo que armó la consulta.
 * @param clave Su clave.
 * @param nombre Su nombre.
 * @param icono Su ícono.
 * @param color El color de su ícono.
 * @param leida Lo que dio la consulta.
 * @param alTocar A dónde lleva.
 */
function cifraDe(
	clave: string,
	nombre: string,
	icono: LucideIcon,
	color: ColorDeTipo,
	leida: CifraLeida,
	alTocar: () => void,
): Cifra {
	return {
		clave,
		nombre,
		icono,
		color,
		numero: leida.numero ?? "—",
		unidad: leida.unidad,
		...(leida.tono === null ? {} : { tono: leida.tono }),
		contexto: leida.contexto,
		alTocar,
	};
}

/** Pendientes de Administración del sistema. */
export function PestanaPendientes() {
	const { busqueda, navegar, abrirAlta } = useDireccionDeAdmin();
	const consulta = useConsulta(pendientesDeAdmin, {});
	const conConexion = useConConexion();
	const revisar = useEnvio(marcarAlertaRevisada);
	const grupo = busqueda.grupo ?? "todos";
	const ir = (pestana: PestanaDeAdmin) => () => navegar({}, pestana);
	return (
		<SegunConsulta consulta={consulta}>
			{(datos) => {
				/** Lo que hace el botón de cada pendiente. */
				const resolver = (renglon: Renglon) => {
					const { tipo, id } = renglon.accion;
					if (tipo === "revisar" && id !== null) abrirAlta(id);
					else if (tipo === "ver_dispositivo" && id !== null) navegar({ resaltar: id }, "dispositivos");
					else if (tipo === "marcar_revisada" && id !== null) void revisar.enviar({ datos: { bitacora_id: id } });
					else if (tipo === "ver_bitacora") navegar({ alertas: "si" }, "bitacora");
					else if (tipo === "ver_respaldos") navegar({}, "respaldos");
				};
				const pendientes: Pendiente[] = datos.renglones.map((renglon) => ({
					clave: renglon.clave,
					grupo: renglon.grupo,
					tipo: deTipo[renglon.tipo],
					referencia: { titulo: renglon.titulo, detalle: renglon.detalle },
					...(renglon.fecha === null ? {} : { fecha: { texto: renglon.fecha.texto, orden: renglon.fecha.momento } }),
					cifra: renglon.tiempo ?? "—",
					estado: renglon.estado,
					accion: {
						texto: renglon.accion.texto,
						deshabilitada: !conConexion || (renglon.accion.tipo === "marcar_revisada" && revisar.enviando),
						alTocar: () => resolver(renglon),
					},
				}));
				const { usuarios, dispositivos, bitacora, respaldos } = datos.cifras;
				return (
					<>
						<BarraIndicadores
							cifras={[
								cifraDe("usuarios", "Usuarios y accesos", Users, "azul", usuarios, ir("usuarios-y-accesos")),
								cifraDe("dispositivos", "Dispositivos", TabletSmartphone, "pizarra", dispositivos, ir("dispositivos")),
								cifraDe("bitacora", "Bitácora", Archive, "verde-azulado", bitacora, ir("bitacora")),
								cifraDe("respaldos", "Respaldos", ShieldCheck, "violeta", respaldos, ir("respaldos")),
							]}
						/>
						<PanelPendientes
							pendientes={pendientes}
							filtros={[
								{ clave: "todos", texto: "Todos", conteo: datos.conteos.todos },
								{ clave: "usuarios", texto: "Usuarios", conteo: datos.conteos.usuarios, punto: "bg-azul" },
								{
									clave: "dispositivos",
									texto: "Dispositivos",
									conteo: datos.conteos.dispositivos,
									punto: "bg-pizarra",
								},
								{ clave: "seguridad", texto: "Seguridad", conteo: datos.conteos.seguridad, punto: "bg-rojo" },
							]}
							filtro={grupo}
							alEscogerFiltro={(clave) =>
								navegar({ grupo: clave === "todos" ? undefined : busquedaDeAdmin.shape.grupo.parse(clave) })
							}
							columnaCifra="Tiempo"
						/>
					</>
				);
			}}
		</SegunConsulta>
	);
}
