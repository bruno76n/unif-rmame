/**
 * Configuración: las decisiones de operación (con los mínimos de existencia, los permisos finos y el acceso a cada
 * departamento), las ubicaciones, las listas, los parámetros (con los técnicos plegados) y la empresa, con sus
 * impresoras de etiquetas y los siguientes folios.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Configuración»)
 *
 * Todo llega de `admin.configuracion` y los mínimos de `inventario.minimos_vigentes`. Solo la dueña cambia: para las
 * demás cuentas todo sale apagado, con «Solo la dueña puede cambiarlas».
 */

import { configuracionDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-configuracion";
import { minimosVigentes } from "@uniformame/compartido/contratos/inventario/minimos-vigentes";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { GrupoPlegable } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { Tarjeta } from "@uniformame/interfaz/contenedores/tarjeta";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Seccion, TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeAdmin } from "../direccion.ts";
import { VentanaAgregarALista } from "../ventanas/agregar-a-lista.tsx";
import { VentanaEmpresa } from "../ventanas/empresa.tsx";
import { VentanaHistorialParametro } from "../ventanas/historial-parametro.tsx";
import { type ImpresoraParaCambiar, VentanaImpresora } from "../ventanas/impresora.tsx";
import {
	CasillaDeMinimo,
	CasillaDeParametro,
	CasillaDePermisoFino,
	type ParametroParaVer,
} from "./casillas-de-configuracion.tsx";

/** Lo que da la consulta. */
export type Configuracion = z.infer<typeof configuracionDeAdmin.resultado>;
/** Una lista, como su tarjeta. */
export type Lista = Configuracion["listas"][number];

/** Los permisos finos, con su nombre y su explicación. */
const permisosFinos = [
	{
		permiso: "ven_sueldos_y_tarifas",
		nombre: "Ven sueldos y tarifas",
		explicacion: "Nómina, sueldos y tarifas por pieza",
	},
	{ permiso: "imprime_guias", nombre: "Imprimen guías de la paquetería", explicacion: undefined },
] as const;

/** La pestaña Configuración. */
export function PestanaConfiguracion() {
	const consulta = useConsulta(configuracionDeAdmin, {});
	return (
		<SegunConsulta consulta={consulta} renglones={10}>
			{(datos) => <Configuracion datos={datos} />}
		</SegunConsulta>
	);
}

/**
 * Las casillas de una sección de parámetros, en dos columnas.
 * @param props Los parámetros, si la cuenta los puede cambiar y qué hacer al pedir un historial.
 */
function Casillas({
	parametros,
	puedeCambiar,
	alVerHistorial,
}: {
	parametros: readonly ParametroParaVer[];
	puedeCambiar: boolean;
	alVerHistorial: (parametro: ParametroParaVer) => void;
}) {
	return (
		<div className="grid grid-cols-2 gap-x-6 gap-y-5 max-telefono:grid-cols-1">
			{parametros.map((parametro) => (
				<CasillaDeParametro
					key={`${parametro.clave}-${parametro.version}`}
					parametro={parametro}
					puedeCambiar={puedeCambiar}
					alVerHistorial={() => alVerHistorial(parametro)}
				/>
			))}
		</div>
	);
}

/**
 * Configuración con los datos ya leídos.
 * @param props Lo que dio la consulta.
 */
function Configuracion({ datos }: { datos: Configuracion }) {
	const { navegar } = useDireccionDeAdmin();
	const conConexion = useConConexion();
	const minimos = useConsulta(minimosVigentes, {});
	const [historial, setHistorial] = useState<ParametroParaVer | undefined>(undefined);
	const [lista, setLista] = useState<Lista | undefined>(undefined);
	const [empresa, setEmpresa] = useState(false);
	const [impresora, setImpresora] = useState<ImpresoraParaCambiar | undefined>(undefined);
	const [tecnicos, setTecnicos] = useState(false);
	const puede = datos.es_duena;
	const soloLaDuena = puede ? {} : { nota: "Solo la dueña puede cambiarlas" };
	return (
		<>
			<Seccion titulo="Decisiones de operación" enPanel {...soloLaDuena}>
				<SegunConsulta consulta={minimos} renglones={2}>
					{({ ubicaciones }) => (
						<div className="flex flex-col gap-4">
							{ubicaciones.map((ubicacion) => (
								<div key={ubicacion.ubicacion_id} className="flex flex-col gap-2">
									<b>{`Mínimo de existencia en ${ubicacion.ubicacion}`}</b>
									<div className="grid grid-cols-2 gap-4">
										<CasillaDeMinimo
											key={`mayor-${ubicacion.mayor_venta?.version}`}
											ubicacionId={ubicacion.ubicacion_id}
											nivel="mayor_venta"
											vigente={ubicacion.mayor_venta}
											puedeCambiar={puede}
										/>
										<CasillaDeMinimo
											key={`demas-${ubicacion.demas?.version}`}
											ubicacionId={ubicacion.ubicacion_id}
											nivel="demas"
											vigente={ubicacion.demas}
											puedeCambiar={puede}
										/>
									</div>
								</div>
							))}
						</div>
					)}
				</SegunConsulta>
				<Casillas parametros={datos.decisiones} puedeCambiar={puede} alVerHistorial={setHistorial} />
				{permisosFinos.map(({ permiso, nombre, explicacion }) => (
					<div key={permiso} className="flex flex-col gap-2">
						<b>{nombre}</b>
						{explicacion === undefined ? null : <span className="text-etiqueta text-tinta3">{explicacion}</span>}
						<div className="flex flex-wrap gap-x-5 gap-y-2">
							{datos.permisos_finos.map((cuenta) => (
								<CasillaDePermisoFino
									key={`${cuenta.usuario_id}-${cuenta.version}`}
									cuenta={cuenta}
									permiso={permiso}
									tiene={cuenta.permisos.includes(permiso)}
									puedeCambiar={puede}
								/>
							))}
						</div>
					</div>
				))}
				<div className="flex flex-wrap items-center gap-3">
					<b>Acceso a cada departamento</b>
					<Boton chico onClick={() => navegar({}, "usuarios-y-accesos")}>
						Usuarios y accesos
					</Boton>
				</div>
			</Seccion>
			<Seccion titulo="Ubicaciones">
				<Tabla
					nombre="Ubicaciones"
					filas={datos.ubicaciones}
					claveDeFila={(ubicacion) => ubicacion.nombre}
					columnas={[
						{ clave: "ubicacion", encabezado: "Ubicación", celda: (ubicacion) => <b>{ubicacion.nombre}</b> },
						{ clave: "responsable", encabezado: "Responsable", celda: (ubicacion) => ubicacion.responsable },
						{ clave: "que_es", encabezado: "Qué es", celda: (ubicacion) => ubicacion.que_es },
					]}
				/>
				<div className="grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
					<Dato etiqueta="En línea">Es un apartado de bodega, no un lugar: no se suma al total</Dato>
					<Dato etiqueta="Clientes externos">Es una salida: lo entregado deja de ser inventario</Dato>
				</div>
			</Seccion>
			<Seccion titulo="Listas">
				<div className="grid grid-cols-3 gap-4 max-menu:grid-cols-2 max-telefono:grid-cols-1">
					{datos.listas.map((una) => (
						<Tarjeta key={una.clave} nombre={una.nombre}>
							<div className="flex items-baseline justify-between gap-3">
								<b>{una.nombre}</b>
								<span className="text-etiqueta text-tinta3 tabular-nums">{una.valores.length}</span>
							</div>
							<ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
								{una.valores.map((valor) => (
									<li key={valor} className="rounded-full border border-linea2 px-2.5 py-0.5 text-etiqueta">
										{valor}
									</li>
								))}
							</ul>
							{una.puede_agregar ? (
								<Boton chico variante="fantasma" icono={Plus} disabled={!conConexion} onClick={() => setLista(una)}>
									Agregar
								</Boton>
							) : (
								<span className="text-etiqueta text-tinta3">Solo la dueña puede agregar</span>
							)}
						</Tarjeta>
					))}
				</div>
			</Seccion>
			<Seccion titulo="Parámetros" enPanel {...soloLaDuena}>
				<Casillas parametros={datos.parametros} puedeCambiar={puede} alVerHistorial={setHistorial} />
				<GrupoPlegable
					titulo="Técnicos"
					color="pizarra"
					cuantos={`${datos.tecnicos.length} parámetros`}
					abierto={tecnicos}
					alCambiar={setTecnicos}
				>
					<Casillas parametros={datos.tecnicos} puedeCambiar={puede} alVerHistorial={setHistorial} />
				</GrupoPlegable>
			</Seccion>
			<Empresa datos={datos} alEditar={() => setEmpresa(true)} alCambiarImpresora={setImpresora} />
			{historial === undefined ? null : (
				<VentanaHistorialParametro parametro={historial} alCerrar={() => setHistorial(undefined)} />
			)}
			{lista === undefined ? null : (
				<VentanaAgregarALista lista={lista} tiposPrenda={datos.tipos_prenda} alCerrar={() => setLista(undefined)} />
			)}
			{empresa && datos.empresa !== null ? (
				<VentanaEmpresa empresa={datos.empresa} alCerrar={() => setEmpresa(false)} />
			) : null}
			{impresora === undefined ? null : (
				<VentanaImpresora
					impresora={impresora}
					puentes={datos.puentes}
					ubicaciones={datos.ubicaciones_para_escoger}
					alCerrar={() => setImpresora(undefined)}
				/>
			)}
		</>
	);
}

/**
 * «Empresa»: sus datos con «Editar», las impresoras de etiquetas con «Agregar», «Cambiar» y «Dar de baja», y los
 * siguientes folios y código de barras.
 * @param props Los datos, qué hacer al editar y al cambiar una impresora.
 */
function Empresa({
	datos,
	alEditar,
	alCambiarImpresora,
}: {
	datos: Configuracion;
	alEditar: () => void;
	alCambiarImpresora: (impresora: ImpresoraParaCambiar) => void;
}) {
	const conConexion = useConConexion();
	const { empresa, es_duena: esDuena } = datos;
	return (
		<Seccion
			titulo="Empresa"
			derecha={
				esDuena && empresa !== null ? (
					<Boton chico icono={Pencil} disabled={!conConexion} onClick={alEditar}>
						Editar
					</Boton>
				) : undefined
			}
		>
			<Panel>
				<div className="grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
					<Dato etiqueta="Razón social">{empresa?.razon_social ?? "—"}</Dato>
					<Dato etiqueta="Nombre comercial">{empresa?.nombre_comercial ?? "—"}</Dato>
					<Dato etiqueta="RFC">{empresa?.rfc ?? "—"}</Dato>
					<Dato etiqueta="Domicilio">{empresa?.domicilio ?? "—"}</Dato>
					{datos.folios.map((folio) => (
						<Dato key={folio.nombre} etiqueta={folio.nombre}>
							{folio.folio}
						</Dato>
					))}
					<Dato etiqueta="Siguiente código de barras">{datos.codigo_barras}</Dato>
				</div>
			</Panel>
			<TituloDeBloque titulo="Impresoras de etiquetas" />
			<Tabla
				nombre="Impresoras de etiquetas"
				filas={datos.impresoras}
				claveDeFila={(impresora) => impresora.impresora_id}
				columnas={[
					{ clave: "nombre", encabezado: "Impresora", celda: (impresora) => <b>{impresora.nombre}</b> },
					{ clave: "modelo", encabezado: "Modelo", celda: (impresora) => impresora.modelo },
					{ clave: "ubicacion", encabezado: "Ubicación", celda: (impresora) => impresora.ubicacion },
					{ clave: "puente", encabezado: "Programa puente", celda: (impresora) => impresora.puente ?? "—" },
					{
						clave: "conectada",
						encabezado: "Conexión",
						celda: (impresora) => (impresora.conectada ? "Conectada" : "No conectada"),
					},
					{
						clave: "cambiar",
						encabezado: "",
						alinear: "derecha",
						celda: (impresora) =>
							esDuena ? (
								<span className="inline-flex gap-2">
									<Boton
										chico
										disabled={!conConexion}
										onClick={() => alCambiarImpresora({ tipo: "cambiar", impresora })}
									>
										Cambiar
									</Boton>
									<Boton
										chico
										variante="peligro"
										disabled={!conConexion}
										onClick={() => alCambiarImpresora({ tipo: "baja", impresora })}
									>
										Dar de baja
									</Boton>
								</span>
							) : null,
					},
				]}
			/>
			{esDuena ? (
				<Boton chico icono={Plus} disabled={!conConexion} onClick={() => alCambiarImpresora({ tipo: "alta" })}>
					Agregar
				</Boton>
			) : null}
		</Seccion>
	);
}
