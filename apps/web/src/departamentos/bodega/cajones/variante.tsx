/**
 * El cajón Variante: «{código} · {escuela o Básico}» y «{prenda} · talla {t}»; los botones con cifra («{n} en reabasto»
 * y «{n} por aclarar»); las cifras (en total, comprometidas, libres); la tabla de ubicaciones con su mínimo y su
 * etiqueta; «Apartadas» y «Moviéndose» si hay; y el pie: «Ver en reabasto» si alguna ubicación está bajo su mínimo y
 * «Mandar a {tienda}» por cada tienda sin caja, con libres en Bodega.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»: Variante)
 */

import { detalleDeVariante } from "@uniformame/compartido/contratos/inventario/bodega-cajones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { BotonConCifra } from "@uniformame/interfaz/botones/boton-con-cifra";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { CifraDeCajon } from "@uniformame/interfaz/pagina/cifra-de-cajon";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeBodega } from "../direccion.ts";
import { VentanaMandarATienda } from "../ventanas/mandar-a-tienda.tsx";

/** Lo que regresa la consulta. */
type Detalle = z.infer<typeof detalleDeVariante.resultado>;

/**
 * El cuerpo del cajón.
 * @param props El detalle.
 */
function CuerpoDeVariante({ detalle }: { detalle: Detalle }) {
	type Ubicacion = Detalle["ubicaciones"][number];
	return (
		<div className="flex flex-col gap-5">
			<div className="grid grid-cols-3 gap-3">
				<CifraDeCajon numero={String(detalle.total)} nombre="en total" />
				<CifraDeCajon numero={String(detalle.comprometidas)} nombre="comprometidas" />
				<CifraDeCajon numero={String(detalle.libres)} nombre="libres" />
			</div>
			<Tabla
				nombre="Ubicaciones"
				filas={detalle.ubicaciones}
				claveDeFila={(ubicacion: Ubicacion) => ubicacion.codigo}
				columnas={[
					{ clave: "ubicacion", encabezado: "Ubicación", celda: (ubicacion) => ubicacion.nombre },
					{ clave: "hay", encabezado: "Hay", alinear: "derecha", celda: (ubicacion) => ubicacion.piezas },
					{
						clave: "minimo",
						encabezado: "Mínimo",
						alinear: "derecha",
						celda: (ubicacion) => (ubicacion.minimo === null ? "—" : ubicacion.minimo),
					},
					{
						clave: "etiqueta",
						encabezado: "",
						celda: (ubicacion) =>
							ubicacion.etiqueta === null ? null : (
								<TextoConTono tono={ubicacion.etiqueta.tono}>{ubicacion.etiqueta.texto}</TextoConTono>
							),
					},
				]}
			/>
			{detalle.apartadas.length === 0 ? null : (
				<section className="flex flex-col gap-2">
					<TituloDeBloque titulo="Apartadas" />
					<ul className="m-0 flex list-none flex-col divide-y divide-linea p-0">
						{detalle.apartadas.map((apartada) => (
							<li key={`${apartada.documento}:${apartada.ubicacion}`} className="flex justify-between gap-4 py-2">
								<span>{`Apartada para ${apartada.documento} · ${apartada.ubicacion}`}</span>
								<b className="font-bold tabular-nums">{apartada.piezas}</b>
							</li>
						))}
					</ul>
				</section>
			)}
			{detalle.moviendose.length === 0 ? null : (
				<section className="flex flex-col gap-2">
					<TituloDeBloque titulo="Moviéndose" />
					<ul className="m-0 flex list-none flex-col divide-y divide-linea p-0">
						{detalle.moviendose.map((traspaso) => (
							<li key={traspaso.folio} className="flex justify-between gap-4 py-2">
								<span>
									<b className="font-bold">{traspaso.folio}</b> · {traspaso.texto}
								</span>
								<b className="font-bold tabular-nums">{traspaso.piezas}</b>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}

/**
 * El cajón Variante.
 * @param props La variante y cómo cerrar el cajón.
 */
export function CajonVariante({ varianteId, alCerrar }: { varianteId: string; alCerrar: () => void }) {
	const consulta = useConsulta(detalleDeVariante, { variante_id: varianteId });
	const { navegar } = useDireccionDeBodega();
	const conConexion = useConConexion();
	const [tienda, setTienda] = useState<{ ubicacion_id: string; nombre: string } | null>(null);
	const detalle = consulta.data;
	return (
		<Cajon
			abierto
			alCerrar={alCerrar}
			{...(detalle === undefined
				? {}
				: { contexto: detalle.codigo === null ? detalle.escuela : `${detalle.codigo} · ${detalle.escuela}` })}
			titulo={detalle === undefined ? "" : `${detalle.prenda} · talla ${detalle.talla}`}
			relacionados={
				detalle === undefined ? undefined : (
					<span className="flex flex-wrap gap-2">
						<BotonConCifra
							cifra={detalle.en_reabasto}
							texto="en reabasto"
							alTocar={() => navegar({ cajon: undefined, id: undefined }, "reabasto")}
						/>
						<BotonConCifra
							cifra={detalle.por_aclarar}
							texto="por aclarar"
							alTocar={() => navegar({ cajon: undefined, id: undefined }, "diferencias")}
						/>
					</span>
				)
			}
			accion={
				detalle === undefined ? undefined : (
					<span className="flex flex-wrap gap-2">
						{detalle.bajo_minimo ? <Boton onClick={() => navegar({}, "reabasto")}>Ver en reabasto</Boton> : null}
						{detalle.libres_en_bodega > 0
							? detalle.tiendas_sin_caja.map((suya) => (
									<Boton
										key={suya.ubicacion_id}
										variante={detalle.tiendas_sin_caja.length === 1 ? "principal" : "secundario"}
										disabled={!conConexion}
										onClick={() => setTienda(suya)}
									>
										{`Mandar a ${suya.nombre}`}
									</Boton>
								))
							: null}
					</span>
				)
			}
		>
			<SegunConsulta consulta={consulta}>{(datos) => <CuerpoDeVariante detalle={datos} />}</SegunConsulta>
			{detalle !== undefined && tienda !== null ? (
				<VentanaMandarATienda detalle={detalle} tienda={tienda} alCerrar={() => setTienda(null)} />
			) : null}
		</Cajon>
	);
}
