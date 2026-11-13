/**
 * Pendientes de Contaduría: las cuatro cifras, el panel de pendientes por grupo con el botón que resuelve cada uno y,
 * debajo, el flujo de los próximos días.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Pendientes»)
 *
 * Los renglones llegan armados de `contaduria.pendientes`: la pantalla solo los pinta y abre el cajón, la ventana o la
 * pestaña de cada botón. El grupo escogido va en la dirección. Sin «ven sueldos y tarifas», la nómina sale en «••••».
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import {
	flujoProximosDias,
	pendientesDeContaduria,
} from "@uniformame/compartido/contratos/contaduria/consultas-pendientes";
import { pagarNomina } from "@uniformame/compartido/contratos/contaduria/nomina";
import { pedirPagoLoRecibido } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { Grafica } from "@uniformame/interfaz/graficas/grafica";
import { BarraIndicadores, type Cifra } from "@uniformame/interfaz/pagina/barra-indicadores";
import type { ColorDeTipo } from "@uniformame/interfaz/pagina/colores-de-tipo";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { PanelPendientes, type Pendiente } from "@uniformame/interfaz/tablas/panel-pendientes";
import {
	ArrowDownToLine,
	ArrowLeftRight,
	ArrowUpFromLine,
	Ban,
	FileArchive,
	HandCoins,
	Landmark,
	type LucideIcon,
	PiggyBank,
	TrendingUp,
	TriangleAlert,
	Truck,
	Users,
} from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { busquedaDeContaduria, useDireccionDeContaduria } from "../direccion.ts";
import { useEnvio } from "../envio.ts";
import { VentanaPagar } from "../ventanas/pagar.tsx";
import { VentanaPaqueteMes } from "../ventanas/paquete-mes.tsx";
import { VentanaResolverExcepcion } from "../ventanas/resolver-excepcion.tsx";

/** Lo que da la consulta. */
type Pendientes = z.infer<typeof pendientesDeContaduria.resultado>;
/** Un renglón de Pendientes. */
type Renglon = Pendientes["renglones"][number];

/** El texto, el ícono y el color de cada tipo de pendiente. */
const deTipo: Readonly<Record<Renglon["tipo"], { texto: string; icono: LucideIcon; color: ColorDeTipo }>> = {
	pago_proveedor: { texto: "Pago a proveedor", icono: Truck, color: "violeta" },
	pago_acreedor: { texto: "Pago a acreedor", icono: Landmark, color: "pizarra" },
	pago_detenido: { texto: "Pago detenido", icono: Ban, color: "rojo" },
	deposito_tercero: { texto: "Depósito a tercero", icono: ArrowLeftRight, color: "verde-azulado" },
	cobranza: { texto: "Cobranza", icono: HandCoins, color: "ambar" },
	saldo_favor: { texto: "Saldo a favor", icono: PiggyBank, color: "verde" },
	nomina: { texto: "Nómina", icono: Users, color: "azul" },
	contador_externo: { texto: "Contador externo", icono: FileArchive, color: "rosa" },
	excepcion: { texto: "Excepción", icono: TriangleAlert, color: "rojo" },
};

/**
 * Una cifra con su barra repartida por tramos.
 * @param tramos Los tramos con su monto.
 */
function reparto(tramos: Pendientes["cifras"]["por_cobrar"]["tramos"]) {
	return tramos.map((tramo) => ({ color: tramo.color, valor: tramo.monto_centavos ?? 0, etiqueta: tramo.etiqueta }));
}

/**
 * La línea de lo vencido de una cifra: «{monto} vencido» en rojo, o «Sin saldo vencido».
 * @param vencido Lo vencido.
 */
function lineaDeVencido(vencido: number | undefined) {
	return vencido === undefined || vencido > 0
		? [{ texto: `${montoEnPantalla(vencido)} vencido`, tono: "rojo" as const }]
		: [{ texto: "Sin saldo vencido", tono: "normal" as const }];
}

/**
 * Las cuatro cifras de arriba.
 * @param props Las cifras, la ventana de días y cómo ir a otra pestaña.
 */
function cifrasDe(datos: Pendientes, ir: (pestana: "cuentas-por-cobrar" | "cuentas-por-pagar") => void): Cifra[] {
	const { por_cobrar, por_pagar, flujo, detenidos } = datos.cifras;
	return [
		{
			clave: "por_cobrar",
			nombre: "Saldo por cobrar",
			icono: ArrowDownToLine,
			color: "verde",
			numero: montoEnPantalla(por_cobrar.total_centavos),
			contexto: lineaDeVencido(por_cobrar.vencido_centavos),
			reparto: reparto(por_cobrar.tramos),
			alTocar: () => ir("cuentas-por-cobrar"),
		},
		{
			clave: "por_pagar",
			nombre: "Saldo por pagar",
			icono: ArrowUpFromLine,
			color: "ambar",
			numero: montoEnPantalla(por_pagar.total_centavos),
			contexto: lineaDeVencido(por_pagar.vencido_centavos),
			reparto: reparto(por_pagar.tramos),
			alTocar: () => ir("cuentas-por-pagar"),
		},
		{
			clave: "flujo",
			nombre: `Flujo neto · ${datos.ventana_dias} días`,
			icono: TrendingUp,
			color: flujo.positivo ? "verde" : "rojo",
			numero: montoEnPantalla(flujo.neto_centavos),
			...(flujo.positivo ? {} : { tono: "rojo" as const }),
			contexto: [
				{ texto: `Entra ${montoEnPantalla(flujo.entra_centavos)} · sale ${montoEnPantalla(flujo.sale_centavos)}` },
			],
			alTocar: () => document.getElementById("flujo-proximos-dias")?.scrollIntoView(),
		},
		{
			clave: "detenidos",
			nombre: "Pagos detenidos",
			icono: Ban,
			color: "rojo",
			numero: detenidos.cuantos,
			contexto:
				detenidos.cuantos === 0
					? [{ texto: "Ninguno" }]
					: [{ texto: `${montoEnPantalla(detenidos.monto_centavos)} sin pagar`, tono: "rojo" }],
			reparto: reparto(detenidos.tramos),
			alTocar: () => ir("cuentas-por-pagar"),
		},
	];
}

/**
 * Un monto corto para las barras del flujo: «+$74k», «−$15k».
 * @param valor En centavos.
 */
function montoCorto(valor: number): string {
	const pesos = Math.abs(valor) / 100;
	const texto = pesos >= 1000 ? `$${Math.round(pesos / 1000)}k` : enPesos(Math.abs(valor));
	return valor === 0 ? "$0" : `${valor > 0 ? "+" : "−"}${texto}`;
}

/** El flujo de los próximos días: lo que entra arriba de la línea y lo que sale abajo, por día. */
function FlujoDeLosProximosDias() {
	const consulta = useConsulta(flujoProximosDias, {});
	return (
		<div id="flujo-proximos-dias">
			<Panel titulo={`Flujo de los próximos ${consulta.data?.ventana_dias ?? ""} días`}>
				<SegunConsulta consulta={consulta} renglones={3}>
					{(datos) => (
						<Grafica
							tipo="barras"
							periodos={datos.dias.map((dia) => (dia.hoy ? `Hoy · ${dia.texto}` : dia.texto))}
							series={[
								{
									clave: "entra",
									nombre: "Entra",
									color: "verde",
									valores: datos.dias.map((dia) => dia.entra_centavos ?? 0),
								},
								{
									clave: "sale",
									nombre: "Sale",
									color: "ambar",
									valores: datos.dias.map((dia) => -(dia.sale_centavos ?? 0)),
								},
							]}
							formato={montoCorto}
						/>
					)}
				</SegunConsulta>
			</Panel>
		</div>
	);
}

/** La ventana abierta desde un pendiente. */
type VentanaAbierta =
	| { tipo: "pagar"; renglon: Renglon }
	| { tipo: "paquete"; id: string }
	| { tipo: "excepcion"; renglon: Renglon };

/** Pendientes de Contaduría. */
export function PestanaPendientes() {
	const { busqueda, navegar, abrir } = useDireccionDeContaduria();
	const consulta = useConsulta(pendientesDeContaduria, {});
	const conConexion = useConConexion();
	const pedirLoRecibido = useEnvio(pedirPagoLoRecibido);
	const pagar = useEnvio(pagarNomina);
	const [ventana, setVentana] = useState<VentanaAbierta | undefined>(undefined);
	const grupo = busqueda.grupo ?? "todos";
	return (
		<SegunConsulta consulta={consulta}>
			{(datos) => {
				/** Lo que hace el botón de cada pendiente. */
				const resolver = (renglon: Renglon) => {
					const { tipo, id, version } = renglon.accion;
					if (tipo === "pagar") setVentana({ tipo: "pagar", renglon });
					else if (tipo === "pagar_lo_recibido" && id !== null && version !== null) {
						void pedirLoRecibido.enviar({ datos: { factura_proveedor_id: id }, version });
					} else if (tipo === "revisar") navegar({}, "cuentas-por-pagar");
					else if (tipo === "aplicar") navegar({}, "cuentas-por-cobrar");
					else if (tipo === "ver_cliente" && id !== null) abrir("cliente", id);
					else if (tipo === "ver_nomina") navegar({}, "nomina");
					else if (tipo === "pagar_nomina" && id !== null && version !== null) {
						void pagar.enviar({
							datos: { nomina_id: id, total_visto_centavos: renglon.total_nomina_centavos ?? 0 },
							version,
						});
					} else if (tipo === "preparar_paquete" && id !== null) setVentana({ tipo: "paquete", id });
					else if (tipo === "resolver") setVentana({ tipo: "excepcion", renglon });
				};
				const pendientes: Pendiente[] = datos.renglones.map((renglon) => ({
					clave: renglon.clave,
					grupo: renglon.grupo,
					tipo: deTipo[renglon.tipo],
					referencia: { titulo: renglon.titulo, detalle: renglon.detalle },
					...(renglon.fecha === null
						? {}
						: { fecha: { texto: renglon.fecha.texto, orden: renglon.fecha.fecha, roja: renglon.fecha.roja } }),
					cifra:
						renglon.tipo === "nomina"
							? renglon.total_nomina_centavos === undefined
								? "••••"
								: montoEnPantalla(renglon.total_nomina_centavos)
							: renglon.importe_centavos === undefined
								? "—"
								: montoEnPantalla(renglon.importe_centavos),
					estado: { texto: renglon.estado.texto, color: renglon.estado.color },
					accion: {
						texto: renglon.accion.texto,
						principal: renglon.accion.principal,
						deshabilitada: !conConexion,
						alTocar: () => resolver(renglon),
					},
				}));
				const filtros = [
					{ clave: "todos", texto: "Todos", conteo: datos.conteos.todos },
					{ clave: "pagos", texto: "Pagos", conteo: datos.conteos.pagos, punto: "bg-violeta" as const },
					{ clave: "cobranza", texto: "Cobranza", conteo: datos.conteos.cobranza, punto: "bg-ambar" as const },
					{ clave: "nomina", texto: "Nómina", conteo: datos.conteos.nomina, punto: "bg-azul" as const },
					{
						clave: "contador_externo",
						texto: "Contador externo",
						conteo: datos.conteos.contador_externo,
						punto: "bg-rosa" as const,
					},
					{ clave: "excepciones", texto: "Excepciones", conteo: datos.conteos.excepciones, punto: "bg-rojo" as const },
				].filter((filtro) => filtro.clave === "todos" || filtro.conteo > 0);
				return (
					<>
						<BarraIndicadores cifras={cifrasDe(datos, (pestana) => navegar({}, pestana))} />
						<PanelPendientes
							pendientes={pendientes}
							filtros={filtros}
							filtro={grupo}
							alEscogerFiltro={(clave) =>
								navegar({ grupo: clave === "todos" ? undefined : busquedaDeContaduria.shape.grupo.parse(clave) })
							}
							columnaCifra="Importe"
						/>
						<FlujoDeLosProximosDias />
						{ventana?.tipo === "pagar" && ventana.renglon.accion.id !== null ? (
							<VentanaPagar
								cuenta={{
									id: ventana.renglon.accion.id,
									version: ventana.renglon.accion.version ?? 0,
									beneficiario: ventana.renglon.titulo,
									documento: ventana.renglon.detalle,
									vence: ventana.renglon.fecha?.texto ?? "",
									saldoCentavos: ventana.renglon.importe_centavos,
								}}
								cuentasFabrica={datos.cuentas_fabrica}
								alCerrar={() => setVentana(undefined)}
							/>
						) : null}
						{ventana?.tipo === "paquete" ? (
							<VentanaPaqueteMes paqueteId={ventana.id} alCerrar={() => setVentana(undefined)} />
						) : null}
						{ventana?.tipo === "excepcion" && ventana.renglon.accion.id !== null ? (
							<VentanaResolverExcepcion
								excepcion={{
									id: ventana.renglon.accion.id,
									version: ventana.renglon.accion.version ?? 0,
									que_paso: ventana.renglon.titulo,
									documento: ventana.renglon.detalle,
								}}
								alCerrar={() => setVentana(undefined)}
							/>
						) : null}
					</>
				);
			}}
		</SegunConsulta>
	);
}
