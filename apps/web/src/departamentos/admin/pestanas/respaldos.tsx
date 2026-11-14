/**
 * Respaldos: la recuperación a un punto en el tiempo, el último respaldo semanal fuera del proveedor, la última
 * restauración probada con cuándo toca la siguiente y «Registrar restauración probada» (la dueña), y las pruebas con su
 * evidencia.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Respaldos»)
 *
 * Todo llega armado de `admin.respaldos`: la pantalla solo lo pinta.
 */

import { respaldosDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-respaldos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Tarjeta } from "@uniformame/interfaz/contenedores/tarjeta";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Check, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaRegistrarRestauracion } from "../ventanas/registrar-restauracion.tsx";

/** La pestaña Respaldos. */
export function PestanaRespaldos() {
	const consulta = useConsulta(respaldosDeAdmin, {});
	const conConexion = useConConexion();
	const [registrar, setRegistrar] = useState(false);
	return (
		<SegunConsulta consulta={consulta} renglones={4}>
			{(datos) => (
				<>
					<div className="grid grid-cols-3 gap-4 max-menu:grid-cols-1">
						<Tarjeta nombre="Recuperación a un punto en el tiempo">
							<b>Recuperación a un punto en el tiempo</b>
							{datos.recuperacion_dias === null ? (
								<TextoConTono tono="normal">Sin dato del proveedor</TextoConTono>
							) : (
								<>
									<TextoConTono tono="normal">Activa</TextoConTono>
									<span className="text-etiqueta text-tinta3">
										{`Cualquier minuto de los últimos ${datos.recuperacion_dias} días, en la base del proveedor`}
									</span>
								</>
							)}
						</Tarjeta>
						<Tarjeta
							nombre="Respaldo semanal fuera del proveedor"
							orilla={datos.semanal?.correcto === false ? "rojo" : undefined}
						>
							<b>Respaldo semanal fuera del proveedor</b>
							{datos.semanal === null ? (
								<TextoConTono tono="normal">Sin respaldo semanal</TextoConTono>
							) : (
								<>
									<TextoConTono tono={datos.semanal.correcto ? "normal" : "rojo"}>{datos.semanal.texto}</TextoConTono>
									<span className="text-etiqueta text-tinta3">
										{`Cifrado · ${datos.semanal.tamano ?? "—"} · si el proveedor desaparece, el negocio no`}
									</span>
								</>
							)}
						</Tarjeta>
						<Tarjeta
							nombre="Última restauración probada"
							orilla={datos.ultima_prueba?.tono === "ambar" ? "ambar" : undefined}
						>
							<b>Última restauración probada</b>
							{datos.ultima_prueba === null ? (
								<TextoConTono tono="ambar">Por probar</TextoConTono>
							) : (
								<>
									<TextoConTono tono={datos.ultima_prueba.tono}>{datos.ultima_prueba.texto}</TextoConTono>
									<span className="text-etiqueta text-tinta3">{datos.ultima_prueba.siguiente}</span>
								</>
							)}
							{datos.puede_registrar_restauracion ? (
								<Boton chico icono={Check} disabled={!conConexion} onClick={() => setRegistrar(true)}>
									Registrar restauración probada
								</Boton>
							) : null}
						</Tarjeta>
					</div>
					<Seccion titulo="Pruebas">
						<Tabla
							nombre="Pruebas"
							filas={datos.pruebas}
							claveDeFila={(prueba) => prueba.restauracion_id}
							columnas={[
								{ clave: "fecha", encabezado: "Fecha", celda: (prueba) => prueba.fecha },
								{ clave: "que", encabezado: "Qué se restauró", celda: (prueba) => prueba.que },
								{
									clave: "cuadro",
									encabezado: "Conteos",
									celda: (prueba) => (
										<TextoConTono tono={prueba.cuadro ? "normal" : "rojo"}>
											{prueba.cuadro ? "Cuadraron" : "No cuadraron"}
										</TextoConTono>
									),
								},
								{
									clave: "evidencia",
									encabezado: "Evidencia",
									celda: (prueba) => (
										<a href={`/v1/archivos/${prueba.evidencia_archivo_id}`} target="_blank" rel="noreferrer">
											{prueba.evidencia}
										</a>
									),
								},
							]}
						/>
					</Seccion>
					<span className="inline-flex items-center gap-2 text-etiqueta text-tinta3">
						<ShieldCheck aria-hidden="true" size={13} />
						Un respaldo que nunca se restauró no es un respaldo
					</span>
					{registrar ? (
						<VentanaRegistrarRestauracion respaldos={datos.respaldos_correctos} alCerrar={() => setRegistrar(false)} />
					) : null}
				</>
			)}
		</SegunConsulta>
	);
}
