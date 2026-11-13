/**
 * El cajón «Mandar a producción» (ancho): la revisión antes de fabricar. Lo que se va, el hilo del envío, los avisos
 * que no detienen nada y, por prenda, lo libre en bodega con «Surtir de bodega · {n}», el lote y el material.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Mandar a producción (ancho)») y docs/modulos/ventas/mandar-a-produccion.md
 *
 * Si no queda nada por mandar no se abre: «Todo el pedido ya está en producción».
 */

import { ErrorDeLaApi } from "@uniformame/compartido/cliente/cliente";
import { revisionMandar } from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import { mandarAProduccion, surtirDeBodega } from "@uniformame/compartido/contratos/ventas/mandar";
import { Hilo } from "@uniformame/interfaz/avance/hilo";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { Factory, Warehouse } from "lucide-react";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeVentas } from "../direccion.ts";
import { useEnvio } from "../envio.ts";

/** El color del texto de cada línea del material. */
const textoDeColor: Readonly<Record<"verde" | "ambar" | "rojo", string>> = {
	verde: "text-texto-bien",
	ambar: "font-semibold text-texto-advertencia",
	rojo: "font-semibold text-texto-error",
};

/**
 * El cajón de la revisión.
 * @param props El pedido y qué hacer al cerrar.
 */
export function CajonMandar({ pedidoId, alCerrar }: { pedidoId: string; alCerrar: () => void }) {
	const consulta = useConsulta(revisionMandar, { pedido_id: pedidoId });
	const { abrir } = useDireccionDeVentas();
	const conConexion = useConConexion();
	const mandar = useEnvio(mandarAProduccion);
	const surtir = useEnvio(surtirDeBodega);
	const revision = consulta.data;
	const nadaPorMandar = consulta.error instanceof ErrorDeLaApi && consulta.error.respuesta.codigo === "nada_por_mandar";
	const regresar = () => abrir("pedido", pedidoId);
	return (
		<Cajon
			abierto
			ancho
			alCerrar={alCerrar}
			contexto={revision === undefined ? "Mandar a producción" : `${revision.folio} · Mandar a producción`}
			titulo={revision?.cliente.nombre ?? ""}
			pieIzquierda={
				<Boton variante="fantasma" onClick={regresar}>
					Regresar al pedido
				</Boton>
			}
			accion={
				<Boton
					variante="principal"
					icono={Factory}
					disabled={!conConexion || revision === undefined || mandar.enviando}
					onClick={async () => {
						if (revision === undefined) return;
						const hecho = await mandar.enviar({ datos: { pedido_id: pedidoId }, version: revision.version });
						if (hecho !== undefined) regresar();
					}}
				>
					Mandar a producción
				</Boton>
			}
		>
			{nadaPorMandar ? (
				<EstadoDePantalla tipo="vacio" texto="Todo el pedido ya está en producción" bien />
			) : (
				<SegunConsulta consulta={consulta}>
					{(datos) => (
						<div className="flex flex-col gap-5">
							{mandar.choco || surtir.choco ? <EstadoDePantalla tipo="choque" documento={datos.folio} /> : null}
							<section className="flex items-start justify-between gap-3 rounded-grande bg-suave p-4">
								<Dato etiqueta="Se va a producción">
									{datos.piezas.toLocaleString("es-MX")} piezas de {datos.prendas_cuantas}{" "}
									{datos.prendas_cuantas === 1 ? "prenda" : "prendas"}
								</Dato>
								<Dato etiqueta="Entrega">
									{datos.entrega.texto} <TextoConTono tono={datos.entrega.tono}>{datos.entrega.cuando}</TextoConTono>
								</Dato>
							</section>
							<Hilo paradas={datos.hilo} />
							{datos.avisos.map((aviso) => (
								<Recuadro key={aviso.texto} color={aviso.color}>
									{aviso.texto}
								</Recuadro>
							))}
							{datos.prendas.map((prenda) => (
								<article
									key={prenda.producto_id}
									aria-label={prenda.nombre}
									className="flex flex-col gap-2 rounded-grande border border-linea p-4"
								>
									<header className="flex items-start justify-between gap-3">
										<div>
											<b className="font-bold">{prenda.nombre}</b>
											<p className="m-0 text-etiqueta text-tinta2">{prenda.tallas}</p>
										</div>
										<Dato etiqueta="piezas">{prenda.piezas.toLocaleString("es-MX")}</Dato>
									</header>
									{prenda.bodega === null ? null : (
										<div className="flex flex-wrap items-center gap-3">
											<span>{prenda.bodega.texto}</span>
											<Boton
												chico
												icono={Warehouse}
												disabled={!conConexion || surtir.enviando}
												onClick={async () => {
													const hecho = await surtir.enviar({
														datos: { pedido_id: pedidoId, producto_id: prenda.producto_id },
														version: datos.version,
													});
													if (hecho !== undefined && hecho.por_mandar === 0) regresar();
												}}
											>
												Surtir de bodega · {prenda.bodega.piezas}
											</Boton>
										</div>
									)}
									<span>{prenda.lote}</span>
									<ul className="m-0 flex list-none flex-col gap-1 p-0">
										{prenda.material.map((linea) => (
											<li key={linea.texto} className={textoDeColor[linea.color]}>
												{linea.texto}
											</li>
										))}
									</ul>
								</article>
							))}
						</div>
					)}
				</SegunConsulta>
			)}
		</Cajon>
	);
}
