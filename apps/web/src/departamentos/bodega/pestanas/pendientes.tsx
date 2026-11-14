/**
 * Pendientes de Bodega: la barra de indicadores (Existencia total, Por surtir, Variantes en cero, Diferencias abiertas
 * y Ajustes por autorizar; cada cifra lleva a su pestaña), el panel con lo que toca hacer y sus filtros por grupo, y el
 * panel «Variantes en cero». Cada botón llama a su acción o abre su cajón o su ventana por la dirección.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Pendientes»)
 *
 * El orden, los estados y lo que hace cada botón llegan de `inventario.bodega_pendientes`: la pantalla solo los pinta.
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import {
	gruposDePendientesDeBodega,
	pendientesDeBodega,
	type tiposDePendienteDeBodega,
} from "@uniformame/compartido/contratos/inventario/bodega";
import { recibirDelCorte } from "@uniformame/compartido/contratos/inventario/corte";
import { surtirAAduana } from "@uniformame/compartido/contratos/inventario/despachos";
import { moverATienda } from "@uniformame/compartido/contratos/inventario/reabasto";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { BarraIndicadores } from "@uniformame/interfaz/pagina/barra-indicadores";
import type { ColorDeTipo } from "@uniformame/interfaz/pagina/colores-de-tipo";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { PanelPendientes, type Pendiente as PendienteDelPanel } from "@uniformame/interfaz/tablas/panel-pendientes";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import {
	Boxes,
	ClipboardCheck,
	Globe,
	Layers,
	type LucideIcon,
	PackageX,
	Scale,
	Scissors,
	ShoppingBag,
	TriangleAlert,
	Truck,
	Undo2,
} from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { enteros, VarianteEnDosRenglones } from "../comun.tsx";
import { type PestanaDeBodega, useDireccionDeBodega } from "../direccion.ts";
import { useEnvio } from "../envio.ts";
import { VentanaNoLaEncuentro } from "../ventanas/no-la-encuentro.tsx";
import { VentanaRegresaAProveedor } from "../ventanas/regresa-a-proveedor.tsx";

/** Lo que regresa la consulta. */
type Pendientes = z.infer<typeof pendientesDeBodega.resultado>;

/** Un renglón de la consulta. */
type Renglon = Pendientes["renglones"][number];

/** Un filtro de Pendientes. */
type GrupoDePendientes = "todos" | (typeof gruposDePendientesDeBodega)[number];

/**
 * El filtro de Pendientes que dice la dirección, o «Todos».
 * @param texto Lo que trae la dirección.
 */
function grupoDePendientes(texto: string): GrupoDePendientes {
	return gruposDePendientesDeBodega.find((grupo) => grupo === texto) ?? "todos";
}

/** El texto, el ícono y el color de cada tipo de renglón. */
const tipos: Readonly<
	Record<(typeof tiposDePendienteDeBodega)[number], { texto: string; icono: LucideIcon; color: ColorDeTipo }>
> = {
	excepcion: { texto: "Excepción", icono: TriangleAlert, color: "rojo" },
	pedido_externo: { texto: "Pedido externo", icono: ShoppingBag, color: "azul" },
	pedido_linea: { texto: "Pedido en línea", icono: Globe, color: "rosa" },
	devolucion_proveedor: { texto: "Devolución a proveedor", icono: Undo2, color: "pizarra" },
	recepcion: { texto: "Recepción", icono: Truck, color: "violeta" },
	entrega_corte: { texto: "Entrega a corte", icono: Scissors, color: "ambar" },
	retazo: { texto: "Retazo", icono: Layers, color: "verde-azulado" },
	rollo_corte: { texto: "Rollo del corte", icono: Layers, color: "verde-azulado" },
	diferencia: { texto: "Diferencia", icono: Scale, color: "ambar" },
	diferencia_recepcion: { texto: "Diferencia de recepción", icono: Scale, color: "ambar" },
	diferencia_material: { texto: "Diferencia de material", icono: Scale, color: "ambar" },
};

/** El texto de cada botón. */
const textosDeBoton: Readonly<Record<NonNullable<Renglon["boton"]>, string>> = {
	resolver: "Resolver",
	surtir: "Surtir a aduana",
	surtir_rollos: "Surtir a aduana",
	confirmar_llegada: "Confirmar llegada",
	entregar_tela: "Entregar tela",
	recibir_corte: "Recibir",
	contar: "Contar",
	aclarar: "Aclarar",
};

/** Los nombres de los filtros. */
const nombresDeGrupos: Readonly<Record<GrupoDePendientes, string>> = {
	todos: "Todos",
	surtido: "Surtido",
	recepciones: "Recepciones",
	materiales: "Materiales",
	diferencias: "Diferencias",
	excepciones: "Excepciones",
};

/**
 * La barra de indicadores de Bodega.
 * @param props Los indicadores y a dónde lleva cada cifra.
 */
function Indicadores({
	indicadores,
	alTocar,
}: {
	indicadores: Pendientes["indicadores"];
	alTocar: (pestana: PestanaDeBodega, grupo?: string) => void;
}) {
	const { existencia, por_surtir, en_cero, diferencias, ajustes } = indicadores;
	return (
		<BarraIndicadores
			cifras={[
				{
					clave: "existencia",
					nombre: "Existencia total",
					icono: Boxes,
					color: "azul",
					numero: enteros.format(existencia.total),
					unidad: "pz",
					contexto: [
						{ texto: `Bodega ${enteros.format(existencia.bodega)} · tiendas ${enteros.format(existencia.tiendas)}` },
					],
					reparto: [
						{ color: "azul", valor: existencia.bodega, etiqueta: "Bodega" },
						{ color: "verde", valor: existencia.tiendas, etiqueta: "Tiendas" },
						{ color: "gris", valor: existencia.demas, etiqueta: "Aduana, taller y en camino" },
					],
					alTocar: () => alTocar("existencias"),
				},
				{
					clave: "por_surtir",
					nombre: "Por surtir",
					icono: ShoppingBag,
					color: "ambar",
					numero: enteros.format(por_surtir.total),
					...(por_surtir.en_linea > 0 ? { tono: "rojo" as const } : {}),
					contexto:
						por_surtir.en_linea > 0
							? [{ texto: plural(por_surtir.en_linea, "pedido en línea", "pedidos en línea"), tono: "rojo" }]
							: [{ texto: "Ninguno en línea" }],
					alTocar: () => alTocar("pendientes", "surtido"),
				},
				{
					clave: "en_cero",
					nombre: "Variantes en cero",
					icono: PackageX,
					color: "rojo",
					numero: enteros.format(en_cero),
					...(en_cero > 0 ? { tono: "rojo" as const } : {}),
					contexto: [{ texto: "En alguna ubicación" }],
					alTocar: () => alTocar("reabasto"),
				},
				{
					clave: "diferencias",
					nombre: "Diferencias abiertas",
					icono: Scale,
					color: "violeta",
					numero: enteros.format(diferencias.piezas),
					unidad: "pz",
					contexto: [{ texto: plural(diferencias.registros, "registro", "registros") }],
					alTocar: () => alTocar("diferencias"),
				},
				{
					clave: "ajustes",
					nombre: "Ajustes por autorizar",
					icono: ClipboardCheck,
					color: "pizarra",
					numero: enteros.format(ajustes),
					contexto: ajustes > 0 ? [{ texto: "En Dirección", tono: "ambar" }] : [{ texto: "Ninguno" }],
					alTocar: () => alTocar("conteos"),
				},
			]}
		/>
	);
}

/**
 * El panel «Variantes en cero»: hasta 8, con «Mover {n}» o «Ver reabasto».
 * @param props Lo que trae la consulta.
 */
function VariantesEnCero({ en_cero }: { en_cero: Pendientes["en_cero"] }) {
	const { abrir, navegar } = useDireccionDeBodega();
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(moverATienda);
	type Renglon = (typeof en_cero.renglones)[number];
	return (
		<Panel
			titulo={`Variantes en cero · ${en_cero.total}`}
			derecha={
				en_cero.total > 8 ? (
					<Boton chico variante="fantasma" onClick={() => navegar({}, "reabasto")}>
						{`Ver las ${en_cero.total} en reabasto`}
					</Boton>
				) : null
			}
		>
			{en_cero.total === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Ninguna ubicación en cero" bien />
			) : (
				<Tabla
					nombre="Variantes en cero"
					filas={en_cero.renglones}
					claveDeFila={(renglon: Renglon) => `${renglon.variante_id}:${renglon.ubicacion_id}`}
					alTocarFila={(renglon: Renglon) => abrir("variante", renglon.variante_id)}
					columnas={[
						{
							clave: "variante",
							encabezado: "Variante",
							celda: (renglon) => <VarianteEnDosRenglones variante={renglon} />,
						},
						{ clave: "ubicacion", encabezado: "Ubicación", celda: (renglon) => renglon.ubicacion },
						{
							clave: "disponible",
							encabezado: "Disponible en",
							celda: (renglon) =>
								renglon.disponible === "en_camino" ? (
									<TextoConTono tono="normal">{`${renglon.piezas} en camino`}</TextoConTono>
								) : renglon.disponible === "bodega" ? (
									`Bodega · ${renglon.piezas} libres`
								) : (
									<TextoConTono tono="rojo">Sin existencia</TextoConTono>
								),
						},
						{
							clave: "boton",
							encabezado: "",
							alinear: "derecha",
							celda: (renglon) =>
								renglon.disponible === "bodega" ? (
									<Boton
										chico
										disabled={!conConexion || enviando}
										onClick={() =>
											void enviar({
												datos: {
													renglones: [
														{
															variante_id: renglon.variante_id,
															ubicacion_destino_id: renglon.ubicacion_id,
															piezas: renglon.mover,
														},
													],
												},
											})
										}
									>
										{`Mover ${renglon.mover}`}
									</Boton>
								) : renglon.disponible === "sin_existencia" ? (
									<Boton chico onClick={() => navegar({}, "reabasto")}>
										Ver reabasto
									</Boton>
								) : null,
						},
					]}
				/>
			)}
		</Panel>
	);
}

/** La ventana abierta desde Pendientes. */
type VentanaDePendientes = { tipo: "no_la_encuentro" | "regresa"; renglon: Renglon } | null;

/** La pestaña Pendientes: lee `inventario.bodega_pendientes` con el filtro de la dirección y pinta sus estados. */
export function PendientesDeBodega() {
	const { busqueda } = useDireccionDeBodega();
	const consulta = useConsulta(
		pendientesDeBodega,
		busqueda.grupo === undefined ? {} : { grupo: grupoDePendientes(busqueda.grupo) },
	);
	return <SegunConsulta consulta={consulta}>{(datos) => <Contenido datos={datos} />}</SegunConsulta>;
}

/**
 * Lo que pinta la pestaña con los datos.
 * @param props Lo que regresa `inventario.bodega_pendientes`.
 */
function Contenido({ datos }: { datos: Pendientes }) {
	const { busqueda, navegar, abrir } = useDireccionDeBodega();
	const conConexion = useConConexion();
	const surtir = useEnvio(surtirAAduana);
	const recibir = useEnvio(recibirDelCorte);
	const [ventana, setVentana] = useState<VentanaDePendientes>(null);
	const filtro = grupoDePendientes(busqueda.grupo ?? "todos");

	/** Lo que hace el botón de un renglón: llama a su acción o abre su cajón o su ventana. */
	const alTocar = (renglon: Renglon) => {
		switch (renglon.boton) {
			case "surtir":
				return void surtir.enviar({
					datos: {
						documento_tipo:
							renglon.tipo === "pedido_linea"
								? "pedido_linea"
								: renglon.tipo === "devolucion_proveedor"
									? "devolucion_proveedor"
									: "pedido_externo",
						documento_id: renglon.documento_id,
					},
				});
			case "surtir_rollos":
				return setVentana({ tipo: "regresa", renglon });
			case "recibir_corte":
				return void recibir.enviar({
					datos: { rollo_id: renglon.documento_id },
					...(renglon.version === null ? {} : { version: renglon.version }),
				});
			case "confirmar_llegada":
				return abrir("llegada", renglon.documento_id);
			case "entregar_tela":
				return abrir("entrega", renglon.documento_id);
			case "contar":
				return abrir("conteo", renglon.documento_id);
			case "aclarar":
				return navegar({ aclarar: renglon.documento_id }, "diferencias");
			case "resolver":
				return navegar({ resolver: renglon.documento_id }, "excepciones");
			default:
				return undefined;
		}
	};

	const pendientes: PendienteDelPanel[] = datos.renglones.map((renglon) => ({
		clave: renglon.clave,
		grupo: renglon.grupo,
		tipo: tipos[renglon.tipo],
		referencia: { titulo: renglon.titulo, detalle: renglon.detalle },
		...(renglon.fecha === null ? {} : { fecha: { texto: renglon.fecha, orden: renglon.orden } }),
		cifra: renglon.cantidad,
		estado: { texto: renglon.estado.texto, color: renglon.estado.color },
		...(renglon.boton === null
			? {}
			: {
					accion: {
						texto: textosDeBoton[renglon.boton],
						principal: renglon.tipo === "pedido_linea",
						deshabilitada: !conConexion || surtir.enviando || recibir.enviando,
						alTocar: () => alTocar(renglon),
					},
				}),
	}));
	const conApartadas = datos.renglones.filter((renglon) => renglon.apartadas.length > 0);
	const grupos: GrupoDePendientes[] = ["todos", ...gruposDePendientesDeBodega];
	return (
		<div className="flex flex-col gap-5">
			<Indicadores
				indicadores={datos.indicadores}
				alTocar={(pestana, grupo) => navegar(grupo === undefined ? {} : { grupo }, pestana)}
			/>
			{datos.conteos.todos === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Sin pendientes" bien />
			) : (
				<PanelPendientes
					columnaCifra="Cantidad"
					filtro={filtro}
					alEscogerFiltro={(grupo) => navegar({ grupo: grupo === "todos" ? undefined : grupo })}
					filtros={grupos
						.filter((grupo) => (datos.conteos[grupo] ?? 0) > 0)
						.map((grupo) => ({ clave: grupo, texto: nombresDeGrupos[grupo], conteo: datos.conteos[grupo] ?? 0 }))}
					pendientes={pendientes}
				/>
			)}
			{conApartadas.length === 0 ? null : (
				<Panel titulo="No la encuentro">
					<ul className="m-0 flex list-none flex-col divide-y divide-linea p-0">
						{conApartadas.map((renglon) => (
							<li key={renglon.clave} className="flex items-center justify-between gap-4 py-2">
								<span>{renglon.titulo}</span>
								<Boton chico disabled={!conConexion} onClick={() => setVentana({ tipo: "no_la_encuentro", renglon })}>
									No la encuentro
								</Boton>
							</li>
						))}
					</ul>
				</Panel>
			)}
			<VariantesEnCero en_cero={datos.en_cero} />
			{ventana?.tipo === "no_la_encuentro" ? (
				<VentanaNoLaEncuentro renglon={ventana.renglon} alCerrar={() => setVentana(null)} />
			) : null}
			{ventana?.tipo === "regresa" ? (
				<VentanaRegresaAProveedor renglon={ventana.renglon} alCerrar={() => setVentana(null)} />
			) : null}
		</div>
	);
}
