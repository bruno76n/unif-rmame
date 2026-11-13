/**
 * La pestaña Gastos: el mes (se puede cambiar) y «Registrar gasto»; «Gasto por categoría», con el mes contra el
 * anterior completo; y el registro de gastos con «Cancelar gasto» (el de un servicio se corrige desde Mantenimiento).
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Gastos»)
 *
 * El mes va en la dirección.
 */

import { gastosDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-gastos-contador";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Grafica } from "@uniformame/interfaz/graficas/grafica";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useState } from "react";
import { usePaginas } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { useDireccionDeContaduria } from "../direccion.ts";
import { type ACancelar, VentanaCancelar } from "../ventanas/cancelar.tsx";
import { VentanaRegistrarGasto } from "../ventanas/registrar-gasto.tsx";

/** La pestaña Gastos. */
export function PestanaGastos() {
	const { busqueda, navegar } = useDireccionDeContaduria();
	const conConexion = useConConexion();
	const [registrar, setRegistrar] = useState(false);
	const [cancelar, setCancelar] = useState<ACancelar | undefined>(undefined);
	const parametros = busqueda.mes === undefined ? {} : { mes: busqueda.mes };
	const paginas = usePaginas(gastosDeContaduria, parametros);
	const [datos] = paginas.data?.pages ?? [];
	const gastos = paginas.data?.pages.flatMap((pagina) => pagina.renglones) ?? [];
	if (paginas.isPending) return <EstadoDePantalla tipo="cargando" renglones={8} />;
	if (paginas.isError || datos === undefined) {
		return <EstadoDePantalla tipo="error" alReintentar={() => void paginas.refetch()} />;
	}
	const esteMes = datos.al_dia === null ? datos.mes_texto : `${datos.mes_texto}, al día ${datos.al_dia}`;
	return (
		<>
			<div className="flex flex-wrap items-end gap-3">
				<Campo
					etiqueta="Mes"
					type="month"
					value={datos.mes.slice(0, 7)}
					onChange={(evento) => navegar({ mes: evento.target.value === "" ? undefined : `${evento.target.value}-01` })}
				/>
				<span className="ml-auto">
					<Boton variante="principal" icono={Plus} disabled={!conConexion} onClick={() => setRegistrar(true)}>
						Registrar gasto
					</Boton>
				</span>
			</div>
			<Panel titulo="Gasto por categoría">
				{datos.por_categoria.length === 0 ? (
					<EstadoDePantalla tipo="vacio" texto="Sin gastos" />
				) : (
					<Grafica
						tipo="barras"
						periodos={datos.por_categoria.map((categoria) => categoria.categoria)}
						series={[
							{
								clave: "este",
								nombre: esteMes,
								color: "pizarra",
								valores: datos.por_categoria.map((categoria) => categoria.este_mes_centavos ?? 0),
							},
							{
								clave: "anterior",
								nombre: `${datos.mes_anterior_texto} completo`,
								color: "azul",
								valores: datos.por_categoria.map((categoria) => categoria.mes_anterior_centavos ?? 0),
							},
						]}
						formato={(valor) => montoEnPantalla(valor)}
					/>
				)}
			</Panel>
			<Panel titulo={`Registro de gastos · ${datos.mes_texto}`}>
				{gastos.length === 0 ? (
					<EstadoDePantalla tipo="vacio" texto="Sin gastos registrados" />
				) : (
					<div className="flex flex-col gap-3">
						<Tabla
							nombre={`Registro de gastos · ${datos.mes_texto}`}
							filas={gastos}
							claveDeFila={(gasto) => gasto.gasto_id}
							columnas={[
								{
									clave: "gasto",
									encabezado: "Gasto",
									celda: (gasto) => <b className={gasto.cancelado ? "line-through" : ""}>{gasto.folio}</b>,
								},
								{ clave: "fecha", encabezado: "Fecha", celda: (gasto) => gasto.fecha },
								{ clave: "categoria", encabezado: "Categoría", celda: (gasto) => gasto.categoria },
								{ clave: "donde", encabezado: "Dónde", celda: (gasto) => gasto.donde },
								{ clave: "salio", encabezado: "Salió de", celda: (gasto) => gasto.salio_de },
								{
									clave: "monto",
									encabezado: "Monto",
									alinear: "derecha",
									celda: (gasto) => (
										<b className={gasto.cancelado ? "line-through" : ""}>{montoEnPantalla(gasto.monto_centavos)}</b>
									),
								},
								{
									clave: "comprobante",
									encabezado: "Comprobante",
									celda: (gasto) =>
										gasto.comprobante_archivo_id === null ? (
											<TextoConTono tono="ambar">Sin comprobante</TextoConTono>
										) : (
											<a href={`/v1/archivos/${gasto.comprobante_archivo_id}`} target="_blank" rel="noreferrer">
												Adjunto
											</a>
										),
								},
								{
									clave: "cancelar",
									encabezado: "",
									celda: (gasto) =>
										gasto.cancelado ? null : gasto.de_mantenimiento ? (
											<span className="text-etiqueta text-tinta3">Se corrige desde Mantenimiento</span>
										) : (
											<Boton
												chico
												variante="peligro"
												disabled={!conConexion}
												onClick={() =>
													setCancelar({ tipo: "gasto", id: gasto.gasto_id, version: gasto.version, folio: gasto.folio })
												}
											>
												Cancelar gasto
											</Boton>
										),
								},
							]}
						/>
						{paginas.hasNextPage ? (
							<Boton chico variante="secundario" onClick={() => void paginas.fetchNextPage()}>
								Ver más
							</Boton>
						) : null}
					</div>
				)}
			</Panel>
			{registrar ? <VentanaRegistrarGasto opciones={datos} alCerrar={() => setRegistrar(false)} /> : null}
			{cancelar === undefined ? null : <VentanaCancelar cancelar={cancelar} alCerrar={() => setCancelar(undefined)} />}
		</>
	);
}
