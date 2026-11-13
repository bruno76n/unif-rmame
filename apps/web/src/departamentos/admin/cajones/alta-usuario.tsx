/**
 * El cajón Alta de usuario: lo que pidió la oficina, a qué persona se liga y con qué correo entra; «Rechazar» con su
 * motivo y «Dar de alta», que deciden la autorización AU- desde Administración (`direccion.decidir_autorizacion`, con
 * «Confirmar con Google»). Al dar de alta abre Usuarios y accesos con la cuenta resaltada. Solo la dueña.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Alta de usuario» y «Ventanas»: «Rechazar alta»)
 */

import { altaUsuarioDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-usuarios";
import { decidirAutorizacion } from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { Check } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useDireccionDeAdmin } from "../direccion.ts";
import { useEnvio } from "../envio.ts";

/** La cuenta que regresa el efecto del alta, para resaltarla. */
const cuentaDelAlta = z.object({ usuario_id: z.uuid() });

/**
 * El cajón Alta de usuario de una autorización.
 * @param props La autorización AU- y qué hacer al cerrar.
 */
export function CajonAltaUsuario({ autorizacionId, alCerrar }: { autorizacionId: string; alCerrar: () => void }) {
	const consulta = useConsulta(altaUsuarioDeAdmin, { autorizacion_id: autorizacionId });
	const decidir = useEnvio(decidirAutorizacion);
	const conConexion = useConConexion();
	const { navegar } = useDireccionDeAdmin();
	const [rechazando, setRechazando] = useState(false);
	const alta = consulta.data;
	const sePuede = conConexion && alta?.por_autorizar === true && !decidir.enviando;
	/** Da de alta: decide la AU- y abre Usuarios y accesos con la cuenta nueva resaltada. */
	const darDeAlta = async () => {
		if (alta === undefined) return;
		const salio = await decidir.enviar({
			datos: { autorizacion_id: alta.autorizacion_id, decision: "autorizar", desde: "admin" },
			version: alta.version,
		});
		if (salio === undefined) return;
		const cuenta = cuentaDelAlta.safeParse(salio.datos);
		navegar(
			{ cajon: undefined, id: undefined, ...(cuenta.success ? { resaltar: cuenta.data.usuario_id } : {}) },
			"usuarios-y-accesos",
		);
	};
	/** Rechaza con el motivo; si la regla lo detiene, regresa su mensaje para el campo. */
	const rechazar = async (motivo: string) => {
		if (alta === undefined) return undefined;
		let error: string | undefined;
		const salio = await decidir.enviar(
			{
				datos: { autorizacion_id: alta.autorizacion_id, decision: "rechazar", motivo, desde: "admin" },
				version: alta.version,
			},
			(campos) => {
				error = campos.motivo;
			},
		);
		if (salio !== undefined) {
			setRechazando(false);
			alCerrar();
		}
		return error;
	};
	return (
		<Cajon
			abierto
			alCerrar={alCerrar}
			contexto={alta === undefined ? "" : `${alta.folio} · Pidió ${alta.pidio}`}
			titulo="Alta de usuario"
			pieIzquierda={
				<div className="flex gap-2">
					<Boton variante="fantasma" onClick={alCerrar}>
						Cerrar
					</Boton>
					<Boton variante="peligro" disabled={!sePuede} onClick={() => setRechazando(true)}>
						Rechazar
					</Boton>
				</div>
			}
			accion={
				<Boton variante="principal" icono={Check} disabled={!sePuede} onClick={() => void darDeAlta()}>
					Dar de alta
				</Boton>
			}
		>
			<SegunConsulta consulta={consulta} renglones={4}>
				{(datos) => (
					<div className="flex flex-col gap-4">
						{decidir.choco ? <EstadoDePantalla tipo="choque" documento={datos.folio} /> : null}
						<div className="grid grid-cols-2 gap-4 rounded-mediano bg-suave p-4 max-telefono:grid-cols-1">
							<Dato etiqueta="Persona">{datos.persona}</Dato>
							<Dato etiqueta="Correo">{datos.correo}</Dato>
							<Dato etiqueta="Departamentos">{datos.departamentos}</Dato>
							<Dato etiqueta="Ubicación">{datos.ubicacion}</Dato>
							<Dato etiqueta="Para qué">{datos.para_que}</Dato>
						</div>
						<Recuadro color="azul">{datos.liga}</Recuadro>
						<Recuadro color="azul">
							{`Entra con su cuenta de Google ${datos.correo}. Ninguna otra cuenta puede entrar en su lugar.`}
						</Recuadro>
					</div>
				)}
			</SegunConsulta>
			<VentanaConMotivo
				abierta={rechazando}
				alCerrar={() => setRechazando(false)}
				titulo="Rechazar alta"
				subtitulo={alta === undefined ? undefined : `${alta.folio} · ${alta.persona}`}
				textoAccion="Rechazar"
				ejemplo="Por ejemplo: no necesita entrar al sistema"
				enviando={decidir.enviando}
				alConfirmar={rechazar}
			/>
		</Cajon>
	);
}
