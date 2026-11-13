/**
 * La pestaña Terceros: el buscador, el filtro por relación y «Registrar deuda»; la tabla de terceros con lo que nos
 * deben, lo que les debemos y su saldo neto; y las compensaciones con su «Cancelar».
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Terceros»)
 *
 * El buscador y el filtro van en la dirección; el renglón abre el cajón del tercero.
 */

import { tercerosDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-terceros";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Buscador } from "@uniformame/interfaz/captura/buscador";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { RenglonDeLista } from "../comun.tsx";
import { busquedaDeContaduria, useDireccionDeContaduria } from "../direccion.ts";
import { type ACancelar, VentanaCancelar } from "../ventanas/cancelar.tsx";
import { VentanaRegistrarDeuda } from "../ventanas/registrar-deuda.tsx";

/** Lo que da la consulta. */
type Terceros = z.infer<typeof tercerosDeContaduria.resultado>;

/**
 * El saldo neto escrito: «A favor {monto}» en verde, «En contra {monto}» en ámbar (los dos en negritas, del mismo
 * tamaño) o «Saldado».
 * @param neto El saldo neto.
 */
export function SaldoNeto({ neto }: { neto: Terceros["renglones"][number]["neto"] }) {
	if (neto.como === "saldado") return <span>Saldado</span>;
	return neto.como === "a_favor" ? (
		<b className="text-texto-bien">A favor {montoEnPantalla(neto.monto_centavos)}</b>
	) : (
		<b className="text-texto-advertencia">En contra {montoEnPantalla(neto.monto_centavos)}</b>
	);
}

/**
 * Las compensaciones, con su «Cancelar»; la cancelada sale tachada.
 * @param props Las compensaciones y qué hacer al cancelar una.
 */
export function Compensaciones({
	compensaciones,
	alCancelar,
}: {
	compensaciones: Terceros["compensaciones"];
	alCancelar: (cancelar: ACancelar) => void;
}) {
	const conConexion = useConConexion();
	return (
		<ul className="m-0 list-none p-0">
			{compensaciones.map((compensacion) => (
				<RenglonDeLista
					key={compensacion.compensacion_id}
					tachado={compensacion.cancelada}
					texto={`${compensacion.tercero}: ${compensacion.descripcion}`}
					detalle={compensacion.fecha}
					monto={compensacion.monto_centavos}
					derecha={
						compensacion.cancelada ? null : (
							<Boton
								chico
								variante="peligro"
								disabled={!conConexion}
								onClick={() =>
									alCancelar({
										tipo: "compensacion",
										id: compensacion.compensacion_id,
										version: compensacion.version,
										tercero: compensacion.tercero,
									})
								}
							>
								Cancelar
							</Boton>
						)
					}
				/>
			))}
		</ul>
	);
}

/** La pestaña Terceros. */
export function PestanaTerceros() {
	const { busqueda, navegar, abrir } = useDireccionDeContaduria();
	const conConexion = useConConexion();
	const [deuda, setDeuda] = useState(false);
	const [cancelar, setCancelar] = useState<ACancelar | undefined>(undefined);
	const parametros = {
		...(busqueda.buscar === undefined ? {} : { buscar: busqueda.buscar }),
		...(busqueda.rol === undefined ? {} : { rol: busqueda.rol }),
	};
	const paginas = usePaginas(tercerosDeContaduria, parametros);
	const [primera] = paginas.data?.pages ?? [];
	const terceros = paginas.data?.pages.flatMap((pagina) => pagina.renglones) ?? [];
	return (
		<>
			<div className="flex flex-wrap items-end gap-3">
				<div className="min-w-0 flex-1 basis-72">
					<Buscador
						etiqueta="Nombre"
						ayuda="Nombre"
						valor={busqueda.buscar ?? ""}
						alBuscar={(texto) => navegar({ buscar: texto === "" ? undefined : texto })}
					/>
				</div>
				<Filtros
					nombre="Filtrar por relación"
					filtros={[
						{ clave: "todos", texto: "Todos" },
						{ clave: "cliente", texto: "Clientes" },
						{ clave: "proveedor", texto: "Proveedores" },
						{ clave: "acreedor", texto: "Acreedores" },
					]}
					activo={busqueda.rol ?? "todos"}
					alEscoger={(clave) =>
						navegar({ rol: clave === "todos" ? undefined : busquedaDeContaduria.shape.rol.parse(clave) })
					}
				/>
				<Boton icono={Plus} disabled={!conConexion || primera === undefined} onClick={() => setDeuda(true)}>
					Registrar deuda
				</Boton>
			</div>
			<Panel>
				{paginas.isPending ? (
					<EstadoDePantalla tipo="cargando" renglones={6} />
				) : paginas.isError ? (
					<EstadoDePantalla tipo="error" alReintentar={() => void paginas.refetch()} />
				) : terceros.length === 0 ? (
					<EstadoDePantalla tipo="vacio" texto="Sin terceros con esos filtros" />
				) : (
					<div className="flex flex-col gap-3">
						<Tabla
							nombre="Terceros"
							filas={terceros}
							claveDeFila={(tercero) => tercero.tercero_id}
							alTocarFila={(tercero) => abrir("tercero", tercero.tercero_id)}
							columnas={[
								{ clave: "tercero", encabezado: "Tercero", celda: (tercero) => <b>{tercero.nombre}</b> },
								{ clave: "relacion", encabezado: "Relación", celda: (tercero) => tercero.relacion.join(" · ") },
								{
									clave: "por_cobrar",
									encabezado: "Por cobrar",
									alinear: "derecha",
									celda: (tercero) =>
										tercero.por_cobrar_centavos === 0 ? "—" : montoEnPantalla(tercero.por_cobrar_centavos),
								},
								{
									clave: "por_pagar",
									encabezado: "Por pagar",
									alinear: "derecha",
									celda: (tercero) =>
										tercero.por_pagar_centavos === 0 ? "—" : montoEnPantalla(tercero.por_pagar_centavos),
								},
								{
									clave: "neto",
									encabezado: "Saldo neto",
									alinear: "derecha",
									celda: (tercero) => <SaldoNeto neto={tercero.neto} />,
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
			{primera === undefined || primera.compensaciones.length === 0 ? null : (
				<Panel titulo="Compensaciones">
					<Compensaciones compensaciones={primera.compensaciones} alCancelar={setCancelar} />
				</Panel>
			)}
			{deuda && primera !== undefined ? (
				<VentanaRegistrarDeuda terceros={primera.para_deuda} alCerrar={() => setDeuda(false)} />
			) : null}
			{cancelar === undefined ? null : <VentanaCancelar cancelar={cancelar} alCerrar={() => setCancelar(undefined)} />}
		</>
	);
}
