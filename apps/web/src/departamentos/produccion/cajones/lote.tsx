/**
 * El cajón del lote (ancho): se abre en cualquier pestaña de Producción con `?cajon=lote&id={id}` en la dirección. Su estado y
 * sus avisos, el hilo grande, sus cifras y sus datos, operación por operación, los registros de la tablet (con
 * «Cancelar registro» y «Ver más»), sus bultos con «Imprimir etiquetas de bulto» y su PDF, los rollos usados, el costo
 * del lote (con Compras o Contaduría) y sus botones: «Capturar corte», «Capturar receta», «Hoja del lote» y «Ver
 * receta».
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Cajones · Lote (ancho)»)
 */

import { useRouter } from "@tanstack/react-router";
import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { imprimirEtiquetasBulto } from "@uniformame/compartido/contratos/produccion/corte";
import { hiloPedido } from "@uniformame/compartido/contratos/produccion/hilo";
import { costoDeLote, loteDeProduccion } from "@uniformame/compartido/contratos/produccion/lotes";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { Hilo } from "@uniformame/interfaz/avance/hilo";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { FileDown, Printer, Scissors } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { consultar, leerFalla, useAccion, useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { enOtroDepartamento, useCuenta } from "../cuenta.ts";
import { rutasDeProduccion, useDireccion } from "../direccion.ts";
import { loQueCambiaEnProduccion } from "../invalidar.ts";
import { ParaQuien } from "../piezas.tsx";
import { VentanaCancelarRegistro } from "../ventanas/cancelar-registro.tsx";

/** El lote, como lo regresa `produccion.lote`. */
type Lote = z.infer<typeof loteDeProduccion.resultado>;
/** Un registro de la tablet. */
type Registro = Lote["registros"]["renglones"][number];

/** El cajón del lote, si la dirección lo pide. */
export function CajonLote() {
	const { leer, ir } = useDireccion();
	const loteId = leer("cajon") === "lote" ? leer("id") : undefined;
	const consulta = useConsulta(loteDeProduccion, { lote_id: loteId ?? "" }, loteId !== undefined);
	const lote = consulta.data;
	return (
		<Cajon
			abierto={loteId !== undefined}
			alCerrar={() => ir({ cajon: undefined, id: undefined })}
			ancho
			titulo={lote?.prenda ?? "Lote"}
			{...(lote === undefined
				? {}
				: { contexto: `${lote.folio} · ${lote.orden}`, accion: <BotonesDelLote lote={lote} /> })}
		>
			<SegunConsulta consulta={consulta} renglones={8}>
				{(leido) => <CuerpoDelLote lote={leido} />}
			</SegunConsulta>
		</Cajon>
	);
}

/**
 * Los botones del pie, según el lote.
 * @param props El lote.
 */
function BotonesDelLote({ lote }: { lote: Lote }) {
	const router = useRouter();
	const { ir } = useDireccion();
	const { tiene } = useCuenta();
	if (lote.etapa === "por_cortar") {
		if (lote.con_receta) {
			return (
				<Boton
					variante="principal"
					icono={Scissors}
					onClick={() => ir({ cortar: lote.lote_id, cajon: undefined, id: undefined }, rutasDeProduccion.corte)}
				>
					Capturar corte
				</Boton>
			);
		}
		return tiene("patronaje") ? (
			<Boton variante="principal" onClick={() => router.history.push(enOtroDepartamento.receta(lote.producto_id))}>
				Capturar receta
			</Boton>
		) : null;
	}
	if (lote.etapa === "cancelado") return null;
	return (
		<div className="flex flex-wrap gap-2">
			{tiene("patronaje") ? (
				<Boton onClick={() => router.history.push(enOtroDepartamento.receta(lote.producto_id))}>Ver receta</Boton>
			) : null}
			<Boton
				variante="principal"
				icono={FileDown}
				onClick={() => window.open(`/v1/etiquetas/lote/${lote.lote_id}?formato=pdf`, "_blank")}
			>
				Hoja del lote
			</Boton>
		</div>
	);
}

/**
 * El cuerpo del cajón.
 * @param props El lote.
 */
function CuerpoDelLote({ lote }: { lote: Lote }) {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<Estado
					texto={lote.estado.texto}
					color={lote.estado.color}
					{...(lote.estado.linea === "" ? {} : { abajo: lote.estado.linea })}
				/>
				{lote.avisos.map((aviso) => (
					<LineaDeAviso key={aviso} tono="error">
						{aviso}
					</LineaDeAviso>
				))}
			</div>
			<HiloDelLote lote={lote} />
			<div className="m-0 grid grid-cols-4 gap-4 rounded-mediano bg-suave p-4 max-telefono:grid-cols-2">
				<Dato etiqueta="Planeadas">{lote.cifras.planeadas}</Dato>
				<Dato etiqueta="Cortadas">{lote.cifras.cortadas ?? "—"}</Dato>
				<Dato etiqueta="Listas">{lote.cifras.listas}</Dato>
				<Dato etiqueta="Merma">{lote.cifras.merma ?? "—"}</Dato>
			</div>
			<div className="m-0 grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
				<Dato etiqueta="Para">
					<ParaQuien para={lote.para} />
				</Dato>
				<Dato etiqueta="Entrega">{lote.entrega}</Dato>
				<Dato etiqueta="Corte">{lote.corte}</Dato>
				<Dato etiqueta="Receta">{lote.receta}</Dato>
			</div>
			<OperacionPorOperacion lote={lote} />
			<RegistrosDeLaTablet lote={lote} />
			{lote.bultos.length > 0 ? <BultosDelLote lote={lote} /> : null}
			{lote.rollos === null ? null : <RollosUsados rollos={lote.rollos} />}
			{lote.ver_costo ? <CostoDelLote lote={lote} /> : null}
		</div>
	);
}

/**
 * El hilo grande: el de esa prenda en todo el pedido si es de un pedido; si no, el del lote.
 * @param props El lote.
 */
function HiloDelLote({ lote }: { lote: Lote }) {
	const delPedido = useConsulta(
		hiloPedido,
		{ pedido_id: lote.pedido_id ?? "", producto_id: lote.producto_id },
		lote.pedido_id !== null,
	);
	if (lote.pedido_id === null) return <Hilo paradas={lote.hilo} />;
	const paradas = delPedido.data?.prendas[0]?.paradas;
	return paradas === undefined ? <EstadoDePantalla tipo="cargando" renglones={1} /> : <Hilo paradas={paradas} />;
}

/**
 * «Operación por operación», ya cortado; sin cortar, cuándo se corta.
 * @param props El lote.
 */
function OperacionPorOperacion({ lote }: { lote: Lote }) {
	if (lote.sin_cortar !== null) {
		return (
			<Seccion titulo="Operación por operación">
				<p className="m-0 text-tinta2">{lote.sin_cortar}</p>
			</Seccion>
		);
	}
	return (
		<Seccion titulo="Operación por operación" nota="Ninguna puede reportar más que la anterior">
			<Tabla
				nombre="Operación por operación"
				filas={lote.operaciones}
				claveDeFila={(operacion) => operacion.operacion}
				columnas={[
					{
						clave: "operacion",
						encabezado: "Operación",
						celda: (operacion) => (
							<span className="flex flex-col">
								<b>{operacion.operacion}</b>
								{operacion.linea === "" ? null : (
									<span
										className={
											operacion.marca === "atorado"
												? "text-etiqueta text-texto-error"
												: "text-etiqueta text-texto-advertencia"
										}
									>
										{operacion.linea}
									</span>
								)}
							</span>
						),
					},
					{
						clave: "hechas",
						encabezado: "Hechas",
						alinear: "derecha",
						celda: (operacion) => (
							<span className="flex min-w-24 flex-col items-end gap-1">
								{operacion.hechas}
								<BarraAvance
									segmentos={[
										{ etiqueta: "Hechas", valor: operacion.hechas, color: "azul" },
										{
											etiqueta: "Por hacer",
											valor: Math.max(0, (lote.cifras.cortadas ?? 0) - operacion.hechas),
											color: "gris",
										},
									]}
								/>
							</span>
						),
					},
					{
						clave: "puede",
						encabezado: "Puede reportar hasta",
						alinear: "derecha",
						celda: (operacion) => operacion.puede_hasta,
					},
					{ clave: "merma", encabezado: "Merma", alinear: "derecha", celda: (operacion) => operacion.merma },
					{
						clave: "quien",
						encabezado: "Quién",
						celda: (operacion) =>
							operacion.quien.length === 0
								? "—"
								: operacion.quien.map((una) => `${una.persona} ${una.piezas}`).join(" · "),
					},
				]}
			/>
		</Seccion>
	);
}

/**
 * «Registros de la tablet»: los últimos, con «Ver más», y «Cancelar registro» en los que se pueden cancelar.
 * @param props El lote.
 */
function RegistrosDeLaTablet({ lote }: { lote: Lote }) {
	const [mas, setMas] = useState<{ renglones: Registro[]; cursor: string | null; hay_mas: boolean } | null>(null);
	const [cancelando, setCancelando] = useState<Registro | null>(null);
	const renglones = [...lote.registros.renglones, ...(mas?.renglones ?? [])];
	const hayMas = mas === null ? lote.registros.hay_mas : mas.hay_mas;
	const cursor = mas === null ? lote.registros.cursor : mas.cursor;
	const conTarifa = renglones.some((registro) => registro.tarifa_centavos !== undefined);
	/** Pide la página siguiente y la suma abajo. */
	const verMas = async () => {
		if (cursor === null) return;
		const pagina = await consultar(loteDeProduccion, { lote_id: lote.lote_id, cursor });
		setMas({
			renglones: [...(mas?.renglones ?? []), ...pagina.registros.renglones],
			cursor: pagina.registros.cursor,
			hay_mas: pagina.registros.hay_mas,
		});
	};
	if (renglones.length === 0) return null;
	return (
		<Seccion
			titulo="Registros de la tablet"
			nota={`Los últimos ${renglones.length} de ${lote.registros.total}`}
			derecha={
				hayMas ? (
					<Boton chico onClick={() => void verMas()}>
						Ver más
					</Boton>
				) : undefined
			}
		>
			<Tabla
				nombre="Registros de la tablet"
				filas={renglones}
				claveDeFila={(registro) => registro.registro_id}
				columnas={[
					{ clave: "cuando", encabezado: "Cuándo", celda: (registro) => registro.cuando },
					{ clave: "quien", encabezado: "Quién", celda: (registro) => registro.persona },
					{
						clave: "operacion",
						encabezado: "Operación",
						celda: (registro) => (
							<span className={registro.cancelado ? "flex flex-col line-through" : "flex flex-col"}>
								{registro.del_corte ? "Corte" : registro.operacion}
								{registro.motivo === null ? null : (
									<span className="text-etiqueta text-tinta3 no-underline">{registro.motivo}</span>
								)}
							</span>
						),
					},
					{
						clave: "piezas",
						encabezado: "Piezas",
						alinear: "derecha",
						celda: (registro) => (
							<span className={registro.cancelado ? "line-through" : undefined}>
								{registro.buenas}
								{registro.danadas > 0 ? ` · ${registro.danadas} dañadas` : ""}
							</span>
						),
					},
					...(conTarifa
						? [
								{
									clave: "tarifa",
									encabezado: "Tarifa",
									alinear: "derecha" as const,
									celda: (registro: Registro) =>
										registro.tarifa_centavos == null ? "—" : enPesos(registro.tarifa_centavos),
								},
							]
						: []),
					{
						clave: "accion",
						encabezado: "",
						alinear: "derecha",
						celda: (registro) =>
							registro.cancelable ? (
								<Boton chico variante="peligro" onClick={() => setCancelando(registro)}>
									Cancelar registro
								</Boton>
							) : null,
					},
				]}
			/>
			<VentanaCancelarRegistro
				registro={cancelando}
				folioDelLote={lote.folio}
				alCerrar={() => {
					setCancelando(null);
					setMas(null);
				}}
			/>
		</Seccion>
	);
}

/**
 * «Bultos», con «Imprimir etiquetas de bulto» y su PDF.
 * @param props El lote.
 */
function BultosDelLote({ lote }: { lote: Lote }) {
	const conConexion = useConConexion();
	const imprimir = useAccion(imprimirEtiquetasBulto, loQueCambiaEnProduccion);
	const falla = imprimir.error === null ? null : leerFalla(imprimir.error);
	const ids = lote.bultos.map((bulto) => bulto.bulto_id);
	const pdf = `/v1/etiquetas/bulto/${ids[0] ?? ""}?formato=pdf&ids=${ids.join(",")}`;
	return (
		<Seccion
			titulo="Bultos"
			derecha={
				<>
					<Boton
						chico
						icono={Printer}
						disabled={!conConexion || imprimir.isPending}
						onClick={() => imprimir.mutate({ datos: { lote_id: lote.lote_id } })}
					>
						Imprimir etiquetas de bulto
					</Boton>
					<Boton chico icono={FileDown} onClick={() => window.open(pdf, "_blank")}>
						PDF
					</Boton>
				</>
			}
		>
			{falla?.tipo === "regla" && falla.codigo === "sin_impresora_taller" ? (
				<LineaDeAviso tono="advertencia">{falla.mensaje}</LineaDeAviso>
			) : null}
			<Tabla
				nombre="Bultos"
				filas={lote.bultos}
				claveDeFila={(bulto) => bulto.bulto_id}
				columnas={[
					{ clave: "bulto", encabezado: "Bulto", celda: (bulto) => <b>{bulto.folio}</b> },
					{ clave: "talla", encabezado: "Talla", celda: (bulto) => bulto.talla },
					{ clave: "piezas", encabezado: "Piezas", alinear: "derecha", celda: (bulto) => bulto.piezas },
				]}
			/>
		</Seccion>
	);
}

/**
 * «Rollos usados»: la partida, cada rollo y el rendimiento contra el patrón.
 * @param props Los rollos del lote.
 */
function RollosUsados({ rollos }: { rollos: NonNullable<Lote["rollos"]> }) {
	const conPrecio = rollos.renglones.some((rollo) => rollo.costo_metro_centavos !== undefined);
	type Rollo = (typeof rollos.renglones)[number];
	return (
		<Seccion
			titulo="Rollos usados"
			derecha={<Estado texto={rollos.partidas} color={rollos.mezcladas ? "ambar" : "gris"} />}
		>
			<Tabla
				nombre="Rollos usados"
				filas={rollos.renglones}
				claveDeFila={(rollo) => rollo.rollo}
				columnas={[
					{ clave: "rollo", encabezado: "Rollo", celda: (rollo) => <b>{rollo.rollo}</b> },
					{ clave: "partida", encabezado: "Partida", celda: (rollo) => rollo.partida },
					{ clave: "tela", encabezado: "Tela", celda: (rollo) => rollo.tela },
					{ clave: "metros", encabezado: "Metros", alinear: "derecha", celda: (rollo) => `${rollo.metros} m` },
					...(conPrecio
						? [
								{
									clave: "precio",
									encabezado: "Precio por metro",
									alinear: "derecha" as const,
									celda: (rollo: Rollo) =>
										rollo.costo_metro_centavos === undefined ? "—" : enPesos(rollo.costo_metro_centavos),
								},
							]
						: []),
				]}
			/>
			<div className="m-0 grid grid-cols-3 gap-4">
				<Dato etiqueta="Por pieza">{rollos.por_pieza} m</Dato>
				<Dato etiqueta="Patrón">{rollos.patron} m</Dato>
				<Dato etiqueta="Rendimiento">
					<span className={rollos.rendimiento_rojo ? "text-texto-error" : undefined}>{rollos.rendimiento}</span>
				</Dato>
			</div>
		</Seccion>
	);
}

/**
 * «Costo del lote», con Compras o Contaduría; sin «ven sueldos y tarifas», sin la mano de obra ni el total.
 * @param props El lote.
 */
function CostoDelLote({ lote }: { lote: Lote }) {
	const consulta = useConsulta(costoDeLote, { lote_id: lote.lote_id });
	return (
		<SegunConsulta consulta={consulta} renglones={3}>
			{(costo) => {
				const renglones = [
					{
						concepto: "Tela",
						deDonde: `${costo.tela.metros} m, cada rollo al precio en que se compró`,
						importe: costo.tela.importe_centavos,
					},
					{ concepto: "Avíos", deDonde: "a su última compra", importe: costo.avios.importe_centavos },
					...(costo.mano_de_obra === undefined
						? []
						: [
								{
									concepto: "Mano de obra",
									deDonde: `${costo.mano_de_obra.operaciones} operaciones · ${costo.mano_de_obra.por_pieza_centavos === undefined ? "—" : enPesos(costo.mano_de_obra.por_pieza_centavos)} por pieza${costo.mano_de_obra.estimada ? " · estimada" : ""}`,
									importe: costo.mano_de_obra.importe_centavos,
								},
							]),
				];
				return (
					<Seccion titulo={`Costo del lote · ${costo.cortadas} piezas cortadas`}>
						<Tabla
							nombre="Costo del lote"
							filas={renglones}
							claveDeFila={(renglon) => renglon.concepto}
							columnas={[
								{
									clave: "concepto",
									encabezado: "Concepto",
									celda: (renglon) => <b>{renglon.concepto}</b>,
									...(costo.total_centavos === undefined ? {} : { suma: "Total" }),
								},
								{ clave: "de_donde", encabezado: "De dónde sale", celda: (renglon) => renglon.deDonde },
								{
									clave: "importe",
									encabezado: "Importe",
									alinear: "derecha",
									celda: (renglon) => (renglon.importe === undefined ? "—" : enPesos(renglon.importe)),
									...(costo.total_centavos === undefined ? {} : { suma: enPesos(costo.total_centavos) }),
								},
							]}
						/>
						{costo.costo_por_pieza_centavos === undefined ? null : (
							<p className="m-0 text-right font-semibold">{enPesos(costo.costo_por_pieza_centavos)} por pieza</p>
						)}
					</Seccion>
				);
			}}
		</SegunConsulta>
	);
}
