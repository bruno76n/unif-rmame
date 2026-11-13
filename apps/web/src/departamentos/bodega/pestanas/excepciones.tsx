/**
 * Excepciones de Bodega: «Por resolver», una tarjeta por excepción, la más vieja arriba (la hora y la fecha, qué pasó,
 * de dónde llegó, su documento y «Resolver», que abre su ventana por la dirección; una de un aparato revocado lleva
 * además «Aplicar el movimiento», solo la dueña, con «Confirmar con Google», y la dueña ve «Lo que llegó»); y
 * «Resueltas» con «Ver más».
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Excepciones»)
 */

import { aplicarComandoRetenido } from "@uniformame/compartido/contratos/admin/dispositivos";
import { type excepcionDeBodega, excepcionesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Tarjeta } from "@uniformame/interfaz/contenedores/tarjeta";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../comun.tsx";
import { useDireccionDeBodega } from "../direccion.ts";
import { VentanaResolverExcepcion } from "../ventanas/resolver-excepcion.tsx";

/** Una excepción. */
type Excepcion = z.infer<typeof excepcionDeBodega>;

/**
 * La tarjeta de una excepción por resolver.
 * @param props La excepción y si la cuenta puede aplicar un movimiento retenido.
 */
function TarjetaDeExcepcion({ excepcion, puedeAplicar }: { excepcion: Excepcion; puedeAplicar: boolean }) {
	const { navegar } = useDireccionDeBodega();
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(aplicarComandoRetenido);
	const { comando_id: comandoId } = excepcion;
	return (
		<Tarjeta nombre={excepcion.descripcion} orilla="rojo">
			<div className="flex items-start justify-between gap-4 max-telefono:flex-col">
				<div className="flex flex-col gap-1">
					<TextoConTono tono="normal">{excepcion.detectada_en}</TextoConTono>
					<b className="font-bold">{excepcion.descripcion}</b>
					{excepcion.de_donde === null ? null : <span className="text-tinta2">{excepcion.de_donde}</span>}
					{excepcion.documento === null ? null : <span className="text-tinta2">{excepcion.documento}</span>}
					{excepcion.lo_que_llego === null ? null : (
						<span className="flex flex-col">
							<TextoConTono tono="normal">Lo que llegó</TextoConTono>
							<code className="break-all font-mono text-etiqueta">{excepcion.lo_que_llego}</code>
						</span>
					)}
				</div>
				<span className="flex flex-wrap gap-2">
					{comandoId !== null && puedeAplicar ? (
						<Boton
							chico
							disabled={!conConexion || enviando}
							onClick={() => void enviar({ datos: { comando_id: comandoId }, version: excepcion.version })}
						>
							Aplicar el movimiento
						</Boton>
					) : null}
					<Boton chico variante="principal" onClick={() => navegar({ resolver: excepcion.excepcion_id })}>
						Resolver
					</Boton>
				</span>
			</div>
		</Tarjeta>
	);
}

/** «Resueltas», por páginas. */
function Resueltas() {
	const paginas = usePaginas(excepcionesDeBodega, { estado: "resuelta" });
	return (
		<SegunConsulta consulta={paginas} renglones={3}>
			{({ pages }) => {
				const resueltas = pages.flatMap((pagina) => pagina.renglones);
				if (resueltas.length === 0) return null;
				return (
					<Seccion titulo="Resueltas">
						<Panel>
							<Tabla
								nombre="Excepciones resueltas"
								filas={resueltas}
								claveDeFila={(excepcion) => excepcion.excepcion_id}
								columnas={[
									{ clave: "que", encabezado: "Qué pasó", celda: (excepcion) => excepcion.descripcion },
									{
										clave: "quien",
										encabezado: "Quién la resolvió",
										celda: (excepcion) => excepcion.resuelta_por ?? "—",
									},
									{ clave: "cuando", encabezado: "Cuándo", celda: (excepcion) => excepcion.resuelta_en ?? "—" },
									{ clave: "hizo", encabezado: "Qué se hizo", celda: (excepcion) => excepcion.resolucion ?? "" },
								]}
							/>
						</Panel>
						{paginas.hasNextPage ? (
							<Boton chico disabled={paginas.isFetchingNextPage} onClick={() => void paginas.fetchNextPage()}>
								Ver más
							</Boton>
						) : null}
					</Seccion>
				);
			}}
		</SegunConsulta>
	);
}

/** Excepciones de Bodega. */
export function ExcepcionesDeBodega() {
	const { busqueda, navegar } = useDireccionDeBodega();
	const porResolver = usePaginas(excepcionesDeBodega, {});
	return (
		<div className="flex flex-col gap-6">
			<SegunConsulta consulta={porResolver} renglones={4}>
				{({ pages }) => {
					const excepciones = pages.flatMap((pagina) => pagina.renglones);
					const puedeAplicar = pages[0]?.puede_aplicar ?? false;
					const abierta = excepciones.find((excepcion) => excepcion.excepcion_id === busqueda.resolver);
					return (
						<Seccion titulo="Por resolver">
							{excepciones.length === 0 ? (
								<EstadoDePantalla tipo="vacio" texto="Sin excepciones por resolver" bien />
							) : (
								excepciones.map((excepcion) => (
									<TarjetaDeExcepcion key={excepcion.excepcion_id} excepcion={excepcion} puedeAplicar={puedeAplicar} />
								))
							)}
							{porResolver.hasNextPage ? (
								<Boton chico disabled={porResolver.isFetchingNextPage} onClick={() => void porResolver.fetchNextPage()}>
									Ver más
								</Boton>
							) : null}
							{abierta === undefined ? null : (
								<VentanaResolverExcepcion excepcion={abierta} alCerrar={() => navegar({ resolver: undefined })} />
							)}
						</Seccion>
					);
				}}
			</SegunConsulta>
			<Resueltas />
		</div>
	);
}
