/**
 * Asistencia, la primera pestaña de Personal: la barra de indicadores (Asistencia de la semana, Personas y PIN del
 * taller, cada cifra lleva a su pestaña), el panel de Pendientes con sus filtros (Todos, Asistencia, PIN y, con el
 * permiso, Tarifas; solo los que tienen renglones), la cuadrícula «Asistencia del {semana}» con su selector si hay dos
 * semanas abiertas, y «Semanas cerradas», con «Reabrir semana» para la dueña. Lee `personal.asistencia` con la semana
 * de la dirección; mientras llega otra semana, sigue mostrando la anterior: el selector no pierde su valor.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Asistencia») y docs/interfaz/comunes.md («La página de un
 * departamento»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import {
	asistenciaDePersonal,
	cerrarSemanaAsistencia,
	gruposDePendientesDePersonal,
	reabrirSemanaAsistencia,
} from "@uniformame/compartido/contratos/personal/asistencia";
import { desbloquearPin } from "@uniformame/compartido/contratos/personal/pines";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import type { Cifra, Contexto } from "@uniformame/interfaz/pagina/barra-indicadores";
import { BarraIndicadores } from "@uniformame/interfaz/pagina/barra-indicadores";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { PanelPendientes, type Pendiente } from "@uniformame/interfaz/tablas/panel-pendientes";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Clock, Tablet, Users, Wallet } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { type PestanaDePersonal, useDireccionDePersonal } from "../direccion.ts";
import { useEnvio } from "../envio.ts";
import { useDarPin } from "../ventanas/pin.tsx";
import { Cuadricula, useCerrarSemana } from "./cuadricula.tsx";

/** Lo que regresa la consulta. */
type Asistencia = z.infer<typeof asistenciaDePersonal.resultado>;

/** Un renglón de Pendientes, como lo regresa la consulta. */
type RenglonDePendientes = Asistencia["pendientes"][number];

/** Una semana cerrada. */
type SemanaCerrada = Asistencia["semanas_cerradas"][number];

/** El ícono y el color de cada tipo de pendiente. */
const tipos = {
	Asistencia: { icono: Clock, color: "verde-azulado" },
	PIN: { icono: Tablet, color: "pizarra" },
	Tarifa: { icono: Wallet, color: "ambar" },
} as const;

/** El texto del botón de cada pendiente. */
const textoDelBoton = {
	cerrar_semana: "Cerrar asistencia",
	asignar_pin: "Asignar PIN",
	desbloquear_pin: "Desbloquear",
	poner_tarifa: "Poner tarifa",
} as const;

/**
 * La barra de indicadores de Personal.
 * @param props Los indicadores y a dónde lleva cada cifra.
 */
function Indicadores({
	indicadores,
	alTocar,
}: {
	indicadores: Asistencia["indicadores"];
	alTocar: (pestana: PestanaDePersonal) => void;
}) {
	const { asistencia, personas, tablet } = indicadores;
	const semana: Pick<Cifra, "numero" | "unidad" | "tono"> = asistencia.cerrada
		? { numero: "Cerrada" }
		: asistencia.sin_capturar > 0
			? { numero: asistencia.sin_capturar, unidad: "días sin capturar", tono: "ambar" }
			: { numero: "Lista para cerrar" };
	const lineaDelPin: Contexto[] = [{ texto: plural(tablet.activos, "PIN activo", "PIN activos") }];
	if (tablet.bloqueados > 0)
		lineaDelPin.unshift({ texto: plural(tablet.bloqueados, "bloqueado", "bloqueados"), tono: "rojo" });
	return (
		<BarraIndicadores
			cifras={[
				{
					clave: "asistencia",
					nombre: "Asistencia de la semana",
					icono: Clock,
					color: "verde-azulado",
					...semana,
					contexto: [
						asistencia.cerrada
							? { texto: "Cerrada y enviada a Contaduría" }
							: { texto: "Por cerrar para nómina", tono: "ambar" },
						{ texto: `${asistencia.personas} cobran por tiempo` },
					],
					reparto: [
						{ color: "verde", valor: asistencia.completos, etiqueta: "Completos" },
						{ color: "ambar", valor: asistencia.medios, etiqueta: "Medios" },
						{ color: "rojo", valor: asistencia.faltas, etiqueta: "Faltas" },
						{ color: "gris", valor: asistencia.sin_capturar, etiqueta: "Sin capturar" },
					],
					alTocar: () => alTocar("pendientes"),
				},
				{
					clave: "personas",
					nombre: "Personas",
					icono: Users,
					color: "azul",
					numero: personas.activas,
					unidad: "activas",
					contexto: [{ texto: `${personas.sin_cuenta} sin cuenta de Google` }],
					alTocar: () => alTocar("personas"),
				},
				{
					clave: "pin",
					nombre: "PIN del taller",
					icono: Tablet,
					color: "pizarra",
					numero: tablet.sin_acceso,
					unidad: "sin PIN",
					...(tablet.sin_acceso > 0 ? { tono: "ambar" as const } : {}),
					contexto: lineaDelPin,
					alTocar: () => alTocar("pin"),
				},
			]}
		/>
	);
}

/**
 * Lo que hace el botón de cada pendiente: cerrar la semana, dar o desbloquear un PIN, o ir a la tarifa.
 * @param semanaActual La semana de la cuadrícula (su cierre pone el foco en sus días).
 * @returns `alTocar(renglon)`, la ventana del PIN y si algo va en camino.
 */
function useBotonesDePendientes(semanaActual: Asistencia["semana"]) {
	const { navegar } = useDireccionDePersonal();
	const cierreDeLaCuadricula = useCerrarSemana();
	const cierre = useEnvio(cerrarSemanaAsistencia);
	const desbloqueo = useEnvio(desbloquearPin);
	const pin = useDarPin();
	const alTocar = (renglon: RenglonDePendientes) => {
		const { boton } = renglon;
		if (boton === null) return;
		if (boton.tipo === "cerrar_semana") {
			// La semana que todavía no se abre es la de la cuadrícula: su cierre pone el foco en lo que falta.
			if (boton.asistencia_semana_id === null || boton.version === null) {
				void cierreDeLaCuadricula.cerrar(semanaActual);
				return;
			}
			void cierre.enviar({ datos: { asistencia_semana_id: boton.asistencia_semana_id }, version: boton.version });
		}
		if (boton.tipo === "asignar_pin") void pin.asignar({ persona_id: boton.persona_id, nombre: renglon.referencia });
		if (boton.tipo === "desbloquear_pin") {
			void desbloqueo.enviar({ datos: { persona_id: boton.persona_id }, version: boton.version });
		}
		if (boton.tipo === "poner_tarifa")
			navegar({ flujo: boton.flujo_id, operacion: boton.flujo_operacion_id }, "tarifas");
	};
	return {
		alTocar,
		ventana: pin.ventana,
		enviando: cierre.enviando || desbloqueo.enviando || pin.enviando || cierreDeLaCuadricula.enviando,
	};
}

/**
 * El panel de Pendientes de Personal.
 * @param props Lo que regresó la consulta.
 */
function Pendientes({ datos }: { datos: Asistencia }) {
	const { busqueda, navegar } = useDireccionDePersonal();
	const conConexion = useConConexion();
	const botones = useBotonesDePendientes(datos.semana);
	const cuantos = (grupo: string) => datos.pendientes.filter((renglon) => renglon.grupo === grupo).length;
	const pendientes: Pendiente[] = datos.pendientes.map((renglon) => ({
		clave: renglon.clave,
		grupo: renglon.grupo,
		tipo: { texto: renglon.tipo, ...tipos[renglon.tipo] },
		referencia: { titulo: renglon.referencia, detalle: renglon.detalle },
		...(renglon.fecha === null || renglon.fecha_texto === null
			? {}
			: { fecha: { texto: renglon.fecha_texto, orden: renglon.fecha } }),
		estado: renglon.estado,
		...(renglon.boton === null
			? {}
			: {
					accion: {
						texto: textoDelBoton[renglon.boton.tipo],
						principal: renglon.boton.tipo === "cerrar_semana" && renglon.boton.principal,
						deshabilitada: !conConexion || botones.enviando,
						alTocar: () => botones.alTocar(renglon),
					},
				}),
	}));
	return (
		<>
			<PanelPendientes
				columnaCifra="Cantidad"
				filtro={busqueda.grupo ?? "todos"}
				alEscogerFiltro={(clave) => {
					const grupo = z.enum(gruposDePendientesDePersonal).safeParse(clave);
					navegar({ grupo: grupo.success ? grupo.data : undefined });
				}}
				filtros={[
					{ clave: "todos", texto: "Todos", conteo: datos.pendientes.length },
					...[
						{ clave: "asistencia", texto: "Asistencia", conteo: cuantos("asistencia") },
						{ clave: "pin", texto: "PIN", conteo: cuantos("pin") },
						...(datos.ve_tarifas ? [{ clave: "tarifas", texto: "Tarifas", conteo: cuantos("tarifas") }] : []),
						// Solo salen los grupos con renglones, y el que está escogido aunque se haya vaciado.
					].filter((filtro) => filtro.conteo > 0 || filtro.clave === busqueda.grupo),
				]}
				pendientes={pendientes}
			/>
			{botones.ventana}
		</>
	);
}

/**
 * «Semanas cerradas»: las últimas cuatro, con «Reabrir semana» en las que la dueña puede reabrir.
 * @param props Las semanas cerradas.
 */
function SemanasCerradas({ semanas }: { semanas: readonly SemanaCerrada[] }) {
	const conConexion = useConConexion();
	const [reabrir, setReabrir] = useState<SemanaCerrada | null>(null);
	const reapertura = useEnvio(reabrirSemanaAsistencia);
	const conReabrir = semanas.some((semana) => semana.reabrible);
	return (
		<Seccion titulo="Semanas cerradas">
			{semanas.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Sin semanas cerradas" />
			) : (
				<Tabla
					nombre="Semanas cerradas"
					filas={semanas}
					claveDeFila={(semana) => semana.asistencia_semana_id}
					columnas={[
						{ clave: "semana", encabezado: "Semana", celda: (semana) => semana.texto },
						{ clave: "la_cerro", encabezado: "La cerró", celda: (semana) => semana.la_cerro ?? "—" },
						{
							clave: "cuando",
							encabezado: "Cuándo",
							celda: (semana) => (semana.cuando === null ? "—" : textoDeDiaCorto(semana.cuando)),
						},
						{ clave: "faltas", encabezado: "Faltas", alinear: "derecha", celda: (semana) => semana.faltas },
						...(conReabrir
							? [
									{
										clave: "reabrir",
										encabezado: "",
										alinear: "derecha" as const,
										celda: (semana: SemanaCerrada) =>
											semana.reabrible ? (
												<Boton chico disabled={!conConexion} onClick={() => setReabrir(semana)}>
													Reabrir semana
												</Boton>
											) : null,
									},
								]
							: []),
					]}
				/>
			)}
			{reabrir === null ? null : (
				<VentanaConMotivo
					titulo={`Reabrir la semana del ${reabrir.texto}`}
					textoAccion="Reabrir semana"
					peligro={false}
					enviando={reapertura.enviando}
					alCerrar={() => setReabrir(null)}
					alConfirmar={async (motivo) => {
						let error: string | undefined;
						const salio = await reapertura.enviar(
							{ datos: { asistencia_semana_id: reabrir.asistencia_semana_id, motivo }, version: reabrir.version },
							(falla) => {
								error = falla.campos.motivo ?? falla.mensaje;
							},
						);
						if (salio !== undefined) setReabrir(null);
						return error;
					}}
				>
					{reapertura.choco ? <EstadoDePantalla tipo="choque" documento={`La semana del ${reabrir.texto}`} /> : null}
					<LineaDeAviso tono="advertencia">Contaduría no la puede pagar mientras esté abierta.</LineaDeAviso>
				</VentanaConMotivo>
			)}
		</Seccion>
	);
}

/** La pestaña Asistencia: lee `personal.asistencia` con la semana de la dirección y pinta sus estados. */
export function AsistenciaDePersonal() {
	const { busqueda } = useDireccionDePersonal();
	const consulta = useConsulta(
		asistenciaDePersonal,
		busqueda.semana === undefined ? {} : { asistencia_semana_id: busqueda.semana },
		true,
		true,
	);
	return (
		<SegunConsulta consulta={consulta} renglones={8}>
			{(datos) => <Contenido datos={datos} />}
		</SegunConsulta>
	);
}

/**
 * Lo que pinta Asistencia con los datos.
 * @param props Lo que regresa `personal.asistencia`.
 */
function Contenido({ datos }: { datos: Asistencia }) {
	const { navegar } = useDireccionDePersonal();
	const { semana, semanas_abiertas: abiertas } = datos;
	return (
		<div className="flex flex-col gap-5">
			<Indicadores indicadores={datos.indicadores} alTocar={(pestana) => navegar({}, pestana)} />
			<Pendientes datos={datos} />
			<Seccion
				titulo={`Asistencia del ${semana.texto}`}
				derecha={
					abiertas.length > 1 ? (
						<Selector
							etiqueta="Semana"
							value={semana.asistencia_semana_id ?? ""}
							opciones={abiertas.map((abierta) => ({
								valor: abierta.asistencia_semana_id ?? "",
								texto: `Semana del ${abierta.texto}`,
							}))}
							onChange={(evento) => navegar({ semana: evento.target.value || undefined })}
						/>
					) : null
				}
			>
				<Cuadricula semana={semana} />
			</Seccion>
			<SemanasCerradas semanas={datos.semanas_cerradas} />
		</div>
	);
}
