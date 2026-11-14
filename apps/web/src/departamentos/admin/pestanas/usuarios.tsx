/**
 * Usuarios y accesos: las cuentas con su ubicación, su última entrada y sus sesiones (con «Cerrar» y «Quitar
 * acceso»), el renglón fijo de soporte, los avisos de las altas pendientes y «Departamentos de cada quien», con el
 * borrador de casillas que se guarda en su ventana.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Usuarios y accesos»)
 *
 * Todo llega de `admin.usuarios`. El borrador solo dice qué casillas se tocaron; si una cuenta se queda sin
 * departamentos lo dice la acción al guardar. Con el borrador, salir pregunta antes.
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { usuariosDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-usuarios";
import { cerrarSesiones } from "@uniformame/compartido/contratos/admin/cuentas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Seccion, TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Lock, Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { usePreguntarAntesDeSalir } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeAdmin } from "../direccion.ts";
import { useEnvio } from "../envio.ts";
import { type CambioDeDepartamentos, VentanaCambiarDepartamentos } from "../ventanas/cambiar-departamentos.tsx";
import { VentanaCuentaNueva } from "../ventanas/cuenta-nueva.tsx";
import { VentanaQuitarAcceso } from "../ventanas/quitar-acceso.tsx";

/** Lo que da la consulta. */
type Usuarios = z.infer<typeof usuariosDeAdmin.resultado>;
/** Una cuenta. */
type Cuenta = Usuarios["cuentas"][number];
/** Un renglón de la tabla: una cuenta, o el renglón fijo de soporte. */
type Fila = { tipo: "cuenta"; cuenta: Cuenta } | { tipo: "soporte"; soporte: NonNullable<Usuarios["soporte"]> };

/** Los grupos del menú, en su orden, con su nombre; Dirección va sin grupo. */
const gruposDelMenu = [
	{ grupo: null, nombre: "Dirección" },
	{ grupo: "operacion", nombre: "Operación" },
	{ grupo: "taller", nombre: "Taller" },
	{ grupo: "almacen", nombre: "Almacén" },
	{ grupo: "administracion", nombre: "Administración" },
] as const;

/** La pestaña Usuarios y accesos. */
export function PestanaUsuarios() {
	const consulta = useConsulta(usuariosDeAdmin, {});
	return (
		<SegunConsulta consulta={consulta} renglones={8}>
			{(datos) => <UsuariosYAccesos datos={datos} />}
		</SegunConsulta>
	);
}

/**
 * La pantalla con los datos ya leídos.
 * @param props Lo que dio la consulta.
 */
function UsuariosYAccesos({ datos }: { datos: Usuarios }) {
	const { abrirAlta } = useDireccionDeAdmin();
	const conConexion = useConConexion();
	const cerrar = useEnvio(cerrarSesiones);
	const [nueva, setNueva] = useState(false);
	const [quitar, setQuitar] = useState<Cuenta | undefined>(undefined);
	const filas: Fila[] = [
		...datos.cuentas.map((cuenta) => ({ tipo: "cuenta" as const, cuenta })),
		...(datos.soporte === null ? [] : [{ tipo: "soporte" as const, soporte: datos.soporte }]),
	];
	return (
		<>
			<Seccion
				titulo={plural(datos.cuentas.length, "cuenta", "cuentas")}
				derecha={
					<Boton chico icono={Plus} disabled={!conConexion} onClick={() => setNueva(true)}>
						{datos.puede.crear_cuenta ? "Cuenta nueva" : "Pedir cuenta nueva"}
					</Boton>
				}
			>
				{datos.altas_pendientes.map((alta) => (
					<Recuadro
						key={alta.autorizacion_id}
						color="ambar"
						boton={
							datos.puede.revisar_altas ? (
								<Boton chico onClick={() => abrirAlta(alta.autorizacion_id)}>
									Revisar
								</Boton>
							) : undefined
						}
					>
						{alta.texto}
					</Recuadro>
				))}
				<Tabla
					nombre="Usuarios"
					filas={filas}
					claveDeFila={(fila) => (fila.tipo === "cuenta" ? fila.cuenta.usuario_id : "soporte")}
					columnas={[
						{
							clave: "usuario",
							encabezado: "Usuario",
							celda: (fila) =>
								fila.tipo === "cuenta" ? (
									<DosRenglones arriba={<b>{fila.cuenta.nombre}</b>} abajo={fila.cuenta.correo} />
								) : (
									<DosRenglones arriba={<b>{fila.soporte.nombre}</b>} abajo={fila.soporte.correo} />
								),
						},
						{
							clave: "ubicacion",
							encabezado: "Ubicación",
							celda: (fila) => (fila.tipo === "cuenta" ? fila.cuenta.ubicacion : "Sin dinero ni nómina"),
						},
						{ clave: "entra", encabezado: "Entra con", celda: () => "Google" },
						{
							clave: "ultima",
							encabezado: "Última entrada",
							celda: (fila) => (fila.tipo === "cuenta" ? fila.cuenta.ultima_entrada : fila.soporte.ultima_entrada),
						},
						{
							clave: "sesiones",
							encabezado: "Sesiones",
							celda: (fila) =>
								fila.tipo === "soporte" || fila.cuenta.sesiones_abiertas === 0 ? (
									"Ninguna"
								) : (
									<span className="inline-flex items-center gap-2">
										<span className="tabular-nums">{plural(fila.cuenta.sesiones_abiertas, "abierta", "abiertas")}</span>
										{fila.cuenta.puede_cerrar_sesiones ? (
											<Boton
												chico
												variante="fantasma"
												disabled={!conConexion || cerrar.enviando}
												onClick={() => void cerrar.enviar({ datos: { usuario_id: fila.cuenta.usuario_id } })}
											>
												Cerrar
											</Boton>
										) : null}
									</span>
								),
						},
						{
							clave: "accion",
							encabezado: "",
							alinear: "derecha",
							celda: (fila) => {
								if (fila.tipo === "soporte") return "Todo lo que hace queda registrado";
								if (fila.cuenta.es_duena) return "Administradora principal";
								return datos.puede.quitar_acceso ? (
									<Boton chico variante="peligro" disabled={!conConexion} onClick={() => setQuitar(fila.cuenta)}>
										Quitar acceso
									</Boton>
								) : null;
							},
						},
					]}
				/>
			</Seccion>
			<DepartamentosDeCadaQuien datos={datos} />
			{nueva ? <VentanaCuentaNueva alCerrar={() => setNueva(false)} /> : null}
			{quitar === undefined ? null : <VentanaQuitarAcceso cuenta={quitar} alCerrar={() => setQuitar(undefined)} />}
		</>
	);
}

/**
 * «Departamentos de cada quien»: una tabla por grupo del menú, un renglón por departamento y una casilla por cuenta.
 * Tocar casillas arma el borrador; «Guardar cambios» abre su ventana.
 * @param props Lo que dio la consulta.
 */
function DepartamentosDeCadaQuien({ datos }: { datos: Usuarios }) {
	const conConexion = useConConexion();
	// El borrador: por cuenta, los departamentos que tendría.
	const [borrador, setBorrador] = useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
	const [guardando, setGuardando] = useState(false);
	const tiene = (cuenta: Cuenta, clave: string) =>
		(borrador.get(cuenta.usuario_id) ?? new Set(cuenta.departamentos)).has(clave);
	const cambios: CambioDeDepartamentos[] = datos.cuentas.flatMap((cuenta) => {
		const nuevos = borrador.get(cuenta.usuario_id);
		if (nuevos === undefined) return [];
		const recibe = datos.departamentos.filter((d) => nuevos.has(d.clave) && !cuenta.departamentos.includes(d.clave));
		const deja = datos.departamentos.filter((d) => !nuevos.has(d.clave) && cuenta.departamentos.includes(d.clave));
		return recibe.length + deja.length === 0 ? [] : [{ cuenta, recibe, deja }];
	});
	const cuantos = cambios.reduce((suma, cambio) => suma + cambio.recibe.length + cambio.deja.length, 0);
	const pregunta = usePreguntarAntesDeSalir(cuantos > 0);
	/** Prende o apaga una casilla en el borrador. */
	const tocar = (cuenta: Cuenta, clave: string) => {
		const actuales = new Set(borrador.get(cuenta.usuario_id) ?? cuenta.departamentos);
		if (actuales.has(clave)) actuales.delete(clave);
		else actuales.add(clave);
		setBorrador(new Map(borrador).set(cuenta.usuario_id, actuales));
	};
	return (
		<Seccion
			titulo="Departamentos de cada quien"
			{...(datos.puede.cambiar_departamentos ? {} : { nota: "Solo la dueña los cambia" })}
			derecha={
				cuantos === 0 ? undefined : (
					<span className="inline-flex flex-wrap items-center gap-2">
						<TextoConTono tono="ambar">{`${plural(cuantos, "cambio", "cambios")} sin guardar`}</TextoConTono>
						<Boton chico variante="fantasma" onClick={() => setBorrador(new Map())}>
							Descartar
						</Boton>
						<Boton chico variante="principal" icono={Lock} disabled={!conConexion} onClick={() => setGuardando(true)}>
							Guardar cambios
						</Boton>
					</span>
				)
			}
		>
			{gruposDelMenu.map(({ grupo, nombre }) => {
				const delGrupo = datos.departamentos.filter((departamento) => departamento.grupo === grupo);
				return delGrupo.length === 0 ? null : (
					<div key={nombre} className="flex flex-col gap-2">
						<TituloDeBloque titulo={nombre} />
						<Tabla
							nombre={`Departamentos de ${nombre}`}
							filas={delGrupo}
							claveDeFila={(departamento) => departamento.clave}
							columnas={[
								{ clave: "departamento", encabezado: "Departamento", celda: (departamento) => departamento.nombre },
								...datos.cuentas.map((cuenta) => ({
									clave: cuenta.usuario_id,
									encabezado: cuenta.nombre.split(/\s+/)[0] ?? cuenta.nombre,
									celda: (departamento: (typeof delGrupo)[number]) =>
										cuenta.es_duena ? (
											<Casilla
												etiqueta="La dueña tiene todos los departamentos"
												sinTexto
												marcada
												deshabilitada
												alCambiar={() => undefined}
											/>
										) : (
											<Casilla
												etiqueta={`${departamento.nombre} para ${cuenta.nombre}`}
												sinTexto
												marcada={tiene(cuenta, departamento.clave)}
												deshabilitada={!datos.puede.cambiar_departamentos}
												alCambiar={() => tocar(cuenta, departamento.clave)}
											/>
										),
								})),
							]}
						/>
					</div>
				);
			})}
			<span className="inline-flex items-center gap-2 text-etiqueta text-tinta3">
				<Lock aria-hidden="true" size={13} />
				Cada cambio de accesos queda en la bitácora
			</span>
			{guardando ? (
				<VentanaCambiarDepartamentos
					cambios={cambios}
					alCerrar={() => setGuardando(false)}
					alGuardar={() => {
						setGuardando(false);
						setBorrador(new Map());
					}}
				/>
			) : null}
			{pregunta}
		</Seccion>
	);
}
