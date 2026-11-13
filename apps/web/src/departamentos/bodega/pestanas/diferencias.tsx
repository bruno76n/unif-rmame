/**
 * Diferencias de Bodega: «Por contar» (una tarjeta por diferencia, con «Contar» o «Contada · en autorización»),
 * «Diferencias de recepción» agrupadas por quién recibió, «Material» si hay (las dos con «Aclarar», que abre su ventana
 * por la dirección) y «Diferencias resueltas» con «Ver más».
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Diferencias»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { type diferenciaPorAclarar, diferenciasDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Tarjeta } from "@uniformame/interfaz/contenedores/tarjeta";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Seccion, TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeBodega } from "../direccion.ts";
import { VentanaAclarar } from "../ventanas/aclarar.tsx";

/** Lo que regresa la consulta. */
type Diferencias = z.infer<typeof diferenciasDeBodega.resultado>;

/** Una diferencia por aclarar. */
type PorAclarar = z.infer<typeof diferenciaPorAclarar>;

/**
 * La tabla de unas diferencias por aclarar, con «Aclarar».
 * @param props Las diferencias y su nombre.
 */
function TablaPorAclarar({ diferencias, nombre }: { diferencias: readonly PorAclarar[]; nombre: string }) {
	const { navegar } = useDireccionDeBodega();
	return (
		<Tabla
			nombre={nombre}
			filas={diferencias}
			claveDeFila={(diferencia) => diferencia.diferencia_id}
			columnas={[
				{ clave: "folio", encabezado: "Diferencia", celda: (diferencia) => <b>{diferencia.folio}</b> },
				{ clave: "prenda", encabezado: "Prenda", celda: (diferencia) => diferencia.prenda },
				{ clave: "que", encabezado: "Qué pasó", celda: (diferencia) => diferencia.descripcion },
				{ clave: "cargo", encabezado: "A cargo de", celda: (diferencia) => diferencia.a_cargo },
				{
					clave: "aclarar",
					encabezado: "",
					alinear: "derecha",
					celda: (diferencia) => (
						<Boton chico onClick={() => navegar({ aclarar: diferencia.diferencia_id })}>
							Aclarar
						</Boton>
					),
				},
			]}
		/>
	);
}

/** Las resueltas, por páginas, con «Ver más». */
function Resueltas() {
	const paginas = usePaginas(diferenciasDeBodega, {}, { siguiente: (pagina) => pagina.resueltas.cursor });
	type Resuelta = Diferencias["resueltas"]["renglones"][number];
	return (
		<SegunConsulta consulta={paginas} renglones={3}>
			{({ pages }) => {
				const resueltas = pages.flatMap((pagina) => pagina.resueltas.renglones);
				if (resueltas.length === 0) return null;
				return (
					<Seccion titulo="Diferencias resueltas">
						<Tabla
							nombre="Diferencias resueltas"
							filas={resueltas}
							claveDeFila={(resuelta: Resuelta) => resuelta.diferencia_id}
							columnas={[
								{ clave: "folio", encabezado: "Diferencia", celda: (resuelta) => <b>{resuelta.folio}</b> },
								{ clave: "prenda", encabezado: "Prenda", celda: (resuelta) => resuelta.prenda },
								{ clave: "donde", encabezado: "Dónde", celda: (resuelta) => resuelta.ubicacion },
								{ clave: "como", encabezado: "Cómo se resolvió", celda: (resuelta) => resuelta.como },
							]}
						/>
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

/**
 * Diferencias de Bodega.
 * @param props Lo que regresa `inventario.diferencias`.
 */
export function DiferenciasDeBodega({ datos }: { datos: Diferencias }) {
	const { busqueda, navegar, abrir } = useDireccionDeBodega();
	const recibio = [...new Set(datos.de_recepcion.map((diferencia) => diferencia.recibio))];
	const porAclarar = [...datos.de_recepcion, ...datos.material].find(
		(diferencia) => diferencia.diferencia_id === busqueda.aclarar,
	);
	const vacio = datos.por_contar.length + datos.de_recepcion.length + datos.material.length === 0;
	return (
		<div className="flex flex-col gap-6">
			{vacio ? <EstadoDePantalla tipo="vacio" texto="Sin diferencias abiertas" bien /> : null}
			{datos.por_contar.length === 0 ? null : (
				<Seccion titulo="Por contar">
					<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
						{datos.por_contar.map((diferencia) => (
							<Tarjeta key={diferencia.diferencia_id} nombre={diferencia.folio} orilla="ambar">
								<div className="flex items-start justify-between gap-4">
									<div className="flex flex-col gap-1">
										<b className="font-bold text-subtitulo tabular-nums">{`${diferencia.piezas} piezas`}</b>
										<span>{`${diferencia.prenda} · talla ${diferencia.talla}`}</span>
										<span className="text-tinta2">{diferencia.descripcion}</span>
										<TextoConTono tono="normal">
											{`${diferencia.folio} · ${textoDeDiaCorto(diferencia.fecha)} · ${diferencia.ubicacion}`}
										</TextoConTono>
									</div>
									{diferencia.contada ? (
										<TextoConTono tono="ambar">Contada · en autorización</TextoConTono>
									) : (
										<Boton chico variante="principal" onClick={() => abrir("conteo", diferencia.diferencia_id)}>
											Contar
										</Boton>
									)}
								</div>
							</Tarjeta>
						))}
					</div>
				</Seccion>
			)}
			{datos.de_recepcion.length === 0 ? null : (
				<Seccion titulo="Diferencias de recepción">
					{recibio.map((quien) => (
						<div key={quien} className="flex flex-col gap-2">
							<TituloDeBloque titulo={quien} />
							<TablaPorAclarar
								nombre={quien}
								diferencias={datos.de_recepcion.filter((diferencia) => diferencia.recibio === quien)}
							/>
						</div>
					))}
				</Seccion>
			)}
			{datos.material.length === 0 ? null : (
				<Seccion titulo="Material">
					<TablaPorAclarar nombre="Material" diferencias={datos.material} />
				</Seccion>
			)}
			<Resueltas />
			{porAclarar === undefined ? null : (
				<VentanaAclarar
					diferencia={porAclarar}
					motivos={datos.motivos_ajuste}
					alCerrar={() => navegar({ aclarar: undefined })}
				/>
			)}
		</div>
	);
}
