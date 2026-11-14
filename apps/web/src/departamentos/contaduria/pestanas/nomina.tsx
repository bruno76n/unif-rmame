/**
 * La pestaña Nómina: la semana con su anterior y su siguiente, cuándo se paga y su total, con «Pagar nómina»; la
 * gráfica de las últimas semanas por tiempo y por pieza; el aviso de la bitácora con las opciones con que se calcula;
 * «Descuento semanal»; y un grupo por área y por tienda con la cuenta de cada persona y cómo se le paga.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Nómina») y docs/modulos/contaduria/nomina.md
 *
 * Sin «ven sueldos y tarifas» (lo dice `ve_sueldos` de `contaduria.pendientes`) la consulta ni se pide: solo el candado
 * y su texto. Lo que se ve es lo que se paga: el total que muestra la pantalla viaja tal cual como
 * `total_visto_centavos`; si la cuenta cambió mientras se veía, la API no paga y la pantalla vuelve a leer lo nuevo.
 */

import { nominaSemana } from "@uniformame/compartido/contratos/contaduria/consultas-nomina";
import { pendientesDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-pendientes";
import { pagarNomina } from "@uniformame/compartido/contratos/contaduria/nomina";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { Grafica } from "@uniformame/interfaz/graficas/grafica";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeContaduria } from "../direccion.ts";
import { useEnvio } from "../envio.ts";
import { VentanaDescuentoSemanal } from "../ventanas/descuento-semanal.tsx";

/** Lo que da la consulta. */
type Nomina = z.infer<typeof nominaSemana.resultado>;
/** El renglón de una persona. */
type Renglon = Nomina["grupos"][number]["renglones"][number];

/** Cómo se le paga a cada persona, mientras la nómina está por pagar. */
type ComoSePaga = Record<string, { medio_pago: "efectivo" | "transferencia"; referencia_pago: string }>;

/**
 * Lo de base de una persona: «{n} días · {monto}», «{n} piezas · {monto}», o los dos unidos con «+».
 * @param renglon El renglón.
 */
function base(renglon: Renglon): string {
	const tiempo = `${renglon.dias.toLocaleString("es-MX")} ${renglon.dias === 1 ? "día" : "días"} · ${montoEnPantalla(renglon.total_tiempo_nomina_centavos)}`;
	const piezas = `${renglon.piezas.toLocaleString("es-MX")} ${renglon.piezas === 1 ? "pieza" : "piezas"} · ${montoEnPantalla(renglon.total_piezas_nomina_centavos)}`;
	if (renglon.forma === "Por tiempo") return tiempo;
	if (renglon.forma === "Por pieza") return piezas;
	return `${tiempo} + ${piezas}`;
}

/**
 * Los avisos de un renglón: lo que no alcanzó y si cobra por tiempo.
 * @param props El renglón.
 */
function AvisosDelRenglon({ renglon }: { renglon: Renglon }) {
	const noAlcanzo = renglon.no_alcanzo_nomina_centavos ?? 0;
	return (
		<>
			{noAlcanzo > 0 ? (
				<LineaDeAviso tono="advertencia">
					No alcanzó {montoEnPantalla(noAlcanzo)}:{" "}
					{renglon.destino_no_alcanzo === "siguiente_semana" ? "pasa a la siguiente semana" : "se perdona"}
				</LineaDeAviso>
			) : null}
			{renglon.cobra_por_tiempo ? (
				<LineaDeAviso tono="info">Cobra por tiempo: sus piezas no se pagan aparte</LineaDeAviso>
			) : null}
		</>
	);
}

/**
 * Cómo se le paga a una persona: «Efectivo» o «Transferencia» y su referencia, opcional.
 * @param props Lo escogido y cómo cambiarlo.
 */
function ComoSeLePaga({
	como,
	alCambiar,
}: {
	como: ComoSePaga[string] | undefined;
	alCambiar: (como: ComoSePaga[string] | undefined) => void;
}) {
	return (
		<span className="flex min-w-48 flex-col gap-1">
			<Selector
				etiqueta="Cómo se le paga"
				vacio="Sin anotar"
				opciones={[
					{ valor: "efectivo", texto: "Efectivo" },
					{ valor: "transferencia", texto: "Transferencia" },
				]}
				value={como?.medio_pago ?? ""}
				onChange={(evento) =>
					alCambiar(
						evento.target.value === "efectivo" || evento.target.value === "transferencia"
							? { medio_pago: evento.target.value, referencia_pago: como?.referencia_pago ?? "" }
							: undefined,
					)
				}
			/>
			{como?.medio_pago === "transferencia" ? (
				<Campo
					etiqueta="Referencia"
					value={como.referencia_pago}
					onChange={(evento) => alCambiar({ ...como, referencia_pago: evento.target.value })}
				/>
			) : null}
		</span>
	);
}

/**
 * La nómina de una semana, ya leída.
 * @param props La nómina y cómo volver a leerla.
 */
function NominaDeLaSemana({ datos, alVolverALeer }: { datos: Nomina; alVolverALeer: () => void }) {
	const { navegar } = useDireccionDeContaduria();
	const conConexion = useConConexion();
	const pagar = useEnvio(pagarNomina);
	const [como, setComo] = useState<ComoSePaga>({});
	const [descuento, setDescuento] = useState(false);
	const { semana, nomina } = datos;
	if (semana === null) return <EstadoDePantalla tipo="vacio" texto="Sin semanas de asistencia" />;
	const porPagar = nomina?.estado === "por_pagar";
	const pagarLaNomina = async () => {
		if (nomina === null) return;
		await pagar.enviar(
			{
				datos: {
					nomina_id: nomina.nomina_id,
					total_visto_centavos: datos.total_nomina_centavos ?? 0,
					renglones: Object.entries(como).map(([persona, suyo]) => ({
						persona_id: persona,
						medio_pago: suyo.medio_pago,
						...(suyo.referencia_pago.trim() === "" ? {} : { referencia_pago: suyo.referencia_pago.trim() }),
					})),
				},
				version: nomina.version,
			},
			undefined,
			// Si la cuenta cambió mientras se veía, no se paga: se vuelve a leer lo nuevo.
			(falla) => {
				if (falla.codigo === "nomina_cambio") alVolverALeer();
			},
		);
	};
	return (
		<>
			<Panel>
				<div className="flex flex-wrap items-end gap-6">
					<Dato etiqueta="Semana">
						<span className="flex items-center gap-2">
							<Boton
								chico
								variante="fantasma"
								icono={ChevronLeft}
								aria-label="Semana anterior"
								disabled={semana.anterior_id === null}
								onClick={() => navegar({ semana: semana.anterior_id ?? undefined })}
							/>
							<b>{semana.texto}</b>
							<Boton
								chico
								variante="fantasma"
								icono={ChevronRight}
								aria-label="Semana siguiente"
								disabled={semana.siguiente_id === null}
								onClick={() => navegar({ semana: semana.siguiente_id ?? undefined })}
							/>
						</span>
					</Dato>
					<Dato etiqueta="Se paga">{nomina?.fecha_pago ?? "—"}</Dato>
					<Dato etiqueta="Total">
						<b>{montoEnPantalla(datos.total_nomina_centavos)}</b>
					</Dato>
					<span className="ml-auto">
						{nomina === null ? (
							<Estado texto="Asistencia sin cerrar" />
						) : nomina.pagada !== null ? (
							<Estado texto={nomina.pagada} color="verde" />
						) : (
							<Boton
								variante="principal"
								disabled={!conConexion || pagar.enviando}
								onClick={() => void pagarLaNomina()}
							>
								Pagar nómina
							</Boton>
						)}
					</span>
				</div>
			</Panel>
			{pagar.choco ? <EstadoDePantalla tipo="choque" documento={`La nómina ${semana.texto}`} /> : null}
			<Panel titulo="Nómina por semana · Por tiempo y por pieza">
				<Grafica
					tipo="barras"
					alto={200}
					periodos={datos.grafica.map((una) => (una.actual ? `${una.semana} (esta)` : una.semana))}
					series={[
						{
							clave: "tiempo",
							nombre: "Por tiempo",
							color: "pizarra",
							valores: datos.grafica.map((una) => una.total_tiempo_nomina_centavos ?? 0),
						},
						{
							clave: "piezas",
							nombre: "Por pieza",
							color: "verde",
							valores: datos.grafica.map((una) => una.total_piezas_nomina_centavos ?? 0),
						},
					]}
					formato={(valor) => montoEnPantalla(valor)}
				/>
			</Panel>
			<Recuadro
				color="azul"
				boton={
					nomina?.estado === "pagada" ? undefined : (
						<Boton chico disabled={!conConexion} onClick={() => setDescuento(true)}>
							Descuento semanal
						</Boton>
					)
				}
			>
				La consulta de la nómina queda registrada en la bitácora
				<span className="block font-normal text-etiqueta">{datos.opciones}</span>
			</Recuadro>
			{datos.grupos.length === 0 ? <EstadoDePantalla tipo="vacio" texto="Sin personas en esta nómina" /> : null}
			{datos.grupos.map((grupo) => (
				<Seccion
					key={grupo.clave}
					enPanel
					titulo={grupo.titulo}
					nota={`${grupo.personas} · ${montoEnPantalla(grupo.total_nomina_centavos)}`}
				>
					<Tabla
						nombre={`Nómina de ${grupo.titulo}`}
						filas={grupo.renglones}
						claveDeFila={(renglon) => renglon.persona_id}
						columnas={[
							{
								clave: "persona",
								encabezado: "Persona",
								celda: (renglon) => (
									<span className="flex flex-col">
										<DosRenglones arriba={<b>{renglon.nombre}</b>} abajo={renglon.puesto} />
										<AvisosDelRenglon renglon={renglon} />
									</span>
								),
							},
							{ clave: "forma", encabezado: "Forma", celda: (renglon) => renglon.forma },
							{ clave: "base", encabezado: "Base", celda: base },
							{
								clave: "correcciones",
								encabezado: "Correcciones",
								alinear: "derecha",
								celda: (renglon) =>
									(renglon.total_correcciones_nomina_centavos ?? 0) === 0
										? "—"
										: `−${montoEnPantalla(Math.abs(renglon.total_correcciones_nomina_centavos ?? 0))}`,
							},
							{
								clave: "descuentos",
								encabezado: "Descuentos",
								celda: (renglon) => (
									<DosRenglones
										arriba={
											(renglon.total_descontado_nomina_centavos ?? 0) === 0
												? "—"
												: `−${montoEnPantalla(renglon.total_descontado_nomina_centavos)}`
										}
										abajo={[
											renglon.descuento_motivo ?? "",
											(renglon.arrastre_nomina_centavos ?? 0) > 0
												? `+${montoEnPantalla(renglon.arrastre_nomina_centavos)} de la semana anterior`
												: "",
										]
											.filter((texto) => texto !== "")
											.join(" · ")}
									/>
								),
							},
							{
								clave: "total",
								encabezado: "Total",
								alinear: "derecha",
								celda: (renglon) => <b>{montoEnPantalla(renglon.total_nomina_centavos)}</b>,
							},
							{
								clave: "como",
								encabezado: "Cómo se le paga",
								celda: (renglon) =>
									porPagar ? (
										<ComoSeLePaga
											como={como[renglon.persona_id]}
											alCambiar={(suyo) =>
												setComo((antes) => {
													const { [renglon.persona_id]: _quitado, ...demas } = antes;
													return suyo === undefined ? demas : { ...demas, [renglon.persona_id]: suyo };
												})
											}
										/>
									) : renglon.medio_pago === null ? (
										"—"
									) : (
										<DosRenglones
											arriba={renglon.medio_pago === "efectivo" ? "Efectivo" : "Transferencia"}
											abajo={renglon.referencia_pago ?? undefined}
										/>
									),
							},
						]}
					/>
				</Seccion>
			))}
			{descuento ? <VentanaDescuentoSemanal personas={datos.personas} alCerrar={() => setDescuento(false)} /> : null}
		</>
	);
}

/** La pestaña Nómina. */
export function PestanaNomina() {
	const { busqueda } = useDireccionDeContaduria();
	// Quién ve sueldos lo dice la API (`ve_sueldos` de los pendientes, la misma consulta que ya pidió la página).
	const pendientes = useConsulta(pendientesDeContaduria, {});
	const veSueldos = pendientes.data?.ve_sueldos === true;
	const consulta = useConsulta(
		nominaSemana,
		busqueda.semana === undefined ? {} : { asistencia_semana_id: busqueda.semana },
		veSueldos,
	);
	return (
		<SegunConsulta consulta={pendientes} renglones={6}>
			{(deLaCuenta) =>
				deLaCuenta.ve_sueldos ? (
					<SegunConsulta consulta={consulta} renglones={8}>
						{(datos) => <NominaDeLaSemana datos={datos} alVolverALeer={() => void consulta.refetch()} />}
					</SegunConsulta>
				) : (
					<Recuadro color="ambar">
						<span className="flex items-center gap-2">
							<Lock aria-hidden="true" size={17} />
							Esta cuenta no tiene acceso a sueldos. Lo decide la dueña en Administración del sistema.
						</span>
					</Recuadro>
				)
			}
		</SegunConsulta>
	);
}
