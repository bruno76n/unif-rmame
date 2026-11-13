/**
 * El cajón «por qué» de un material (ancho): su estado, el resumen, «La cuenta», la existencia libre día por día,
 * cuánto se gasta por día según el mes y de dónde sale, y el pedido sugerido con «Cantidad por pedir». Mientras se
 * escribe la cantidad, «Con {cantidad} alcanza hasta…» y la gráfica salen de `proyectarMaterial` del paquete
 * compartido, con los insumos que da la consulta: la misma cuenta del servidor.
 * Fase 19 · docs/interfaz/fabrica/compras.md («"Por qué" de un material») y
 * docs/modulos/compras/proyeccion-de-material.md («La proyección en el paquete compartido»)
 */

import { textoDeDia, textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { type InsumosDeProyeccion, proyectarMaterial } from "@uniformame/compartido/calculos/proyeccion-material";
import { materialPorQue } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { cantidadConUnidad, errorDeCantidad } from "@uniformame/compartido/contratos/compras/textos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { Grafica } from "@uniformame/interfaz/graficas/grafica";
import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { sumarDias, TituloDeSeccion } from "../comun.tsx";
import { useDireccionDeCompras } from "../direccion.ts";

/** Lo que regresa la consulta. */
type PorQue = z.infer<typeof materialPorQue.resultado>;

/** Cómo se dice el tipo de material en el encabezado. */
const nombreDelTipo = { tela: "Tela", avio: "Avío", consumible: "Consumible" } as const;

/** El borde del resumen, en el color del estado. */
const bordeDelEstado = {
	sin_tiempo_de_entrega: "border-estado-rojo",
	pedir_esta_semana: "border-estado-ambar",
	alcanza: "border-estado-verde",
} as const;

/** Cada cuántos días va un punto de la gráfica, y cuántos días muestra. */
const pasoDeLaGrafica = 7;
const diasDeLaGrafica = 126;

/**
 * Los insumos de la consulta como los pide `proyectarMaterial`, con otra cantidad si se escribió.
 * @param insumos Los de la consulta, en milésimos como texto.
 * @param otra Otra cantidad en milésimos.
 */
function insumosDe(insumos: PorQue["insumos"], otra?: bigint): InsumosDeProyeccion {
	return {
		hoy: insumos.hoy,
		libre: BigInt(insumos.libre),
		llegadas: insumos.llegadas.map((llegada) => ({ dia: llegada.dia, cantidad: BigInt(llegada.cantidad) })),
		consumoNormal: insumos.consumo_normal === null ? null : BigInt(insumos.consumo_normal),
		factores: insumos.factores.map(BigInt),
		plazo: insumos.plazo,
		minimo: BigInt(insumos.minimo),
		multiplo: BigInt(insumos.multiplo),
		diasCubre: insumos.dias_cubre,
		limites: {
			diasMaximos: insumos.limites.dias_maximos,
			diasPedirEstaSemana: insumos.limites.dias_pedir_esta_semana,
			diasMasDeSeisMeses: insumos.limites.dias_mas_de_seis_meses,
		},
		...(otra === undefined ? {} : { otraCantidad: otra }),
	};
}

/**
 * Un renglón de «La cuenta».
 * @param props Qué es, cuánto y si va en grande.
 */
function RenglonDeLaCuenta({ texto, cantidad, fuerte = false }: { texto: string; cantidad: string; fuerte?: boolean }) {
	return (
		<div
			className={`flex justify-between gap-4 border-linea border-b py-2.5 last:border-b-0 ${fuerte ? "text-subtitulo" : ""}`}
		>
			<span className="font-semibold">{texto}</span>
			<b className="font-bold tabular-nums">{cantidad}</b>
		</div>
	);
}

/**
 * El contenido del cajón, con sus datos.
 * @param props Lo de `compras.material_por_que` y cómo se escribe la cantidad.
 */
function ContenidoPorQue({
	datos,
	texto,
	alEscribir,
}: {
	datos: PorQue;
	texto: string;
	alEscribir: (texto: string) => void;
}) {
	const { material, cuenta, consumo, insumos, sugerido } = datos;
	const { ir } = useDireccionDeCompras();
	const unidad = material.unidad;
	const error = errorDeCantidad(texto, {
		multiplo: Number(BigInt(insumos.multiplo) / 1000n),
		maxima: datos.cantidad_maxima,
		unidad,
	});
	const cantidad = error === null ? Number(texto.replaceAll(",", "")) : null;
	const conOtra = cantidad === null ? null : proyectarMaterial(insumosDe(insumos, BigInt(cantidad) * 1000n));
	const sinPedir = proyectarMaterial(insumosDe(insumos));
	// La gráfica: lo libre cada semana con lo que viene, y con la cantidad llegando el día «para cuándo».
	const dias = Array.from({ length: diasDeLaGrafica / pasoDeLaGrafica + 1 }, (_, numero) => numero * pasoDeLaGrafica);
	const conPedido =
		cantidad === null
			? null
			: proyectarMaterial({
					...insumosDe(insumos),
					llegadas: [...insumosDe(insumos).llegadas, { dia: sinPedir.paraCuando, cantidad: BigInt(cantidad) * 1000n }],
				});
	const enUnidades = (serie: readonly bigint[]) => dias.map((dia) => Number(serie[dia] ?? 0n) / 1000);
	return (
		<div className="flex flex-col gap-1">
			<div>
				<Estado {...material.estado_armado} abajo={material.linea} />
			</div>
			<p
				className={`mt-3 mb-0 rounded-mediano border-l-4 bg-suave px-4 py-3 font-semibold ${bordeDelEstado[material.estado]}`}
			>
				{datos.resumen}
			</p>
			<TituloDeSeccion titulo="La cuenta" />
			<div className="rounded-mediano bg-suave px-4">
				<RenglonDeLaCuenta texto="Hay en bodega" cantidad={cantidadConUnidad(cuenta.hay_bodega, unidad)} />
				{Number(cuenta.hay_aduana) === 0 ? null : (
					<RenglonDeLaCuenta texto="Hay en aduana" cantidad={cantidadConUnidad(cuenta.hay_aduana, unidad)} />
				)}
				<RenglonDeLaCuenta texto="En camino" cantidad={`+${cantidadConUnidad(cuenta.en_camino_total, unidad)}`} />
				{cuenta.en_camino.map((viene) => (
					<button
						key={viene.orden_compra_id}
						type="button"
						onClick={() => ir({ cajon: "orden", id: viene.orden_compra_id })}
						className="flex w-full justify-between gap-4 py-1.5 pl-4 text-left text-etiqueta text-tinta2 hover:text-marca"
					>
						<span>
							<b className="font-bold tabular-nums">{viene.folio}</b> · llega el {textoDeDiaCorto(viene.dia)}
							{viene.atrasada ? " · atrasada" : ""}
						</span>
						<span className="tabular-nums">{cantidadConUnidad(viene.cantidad, unidad)}</span>
					</button>
				))}
				<RenglonDeLaCuenta
					texto="Comprometido con lotes"
					cantidad={`−${cantidadConUnidad(cuenta.comprometido_total, unidad)}`}
				/>
				{cuenta.comprometido.map((lote) => (
					<div key={lote.lote_id} className="flex justify-between gap-4 py-1.5 pl-4 text-etiqueta text-tinta2">
						<span>
							<b className="font-bold tabular-nums">{lote.folio}</b> {lote.detalle}
						</span>
						<span className="tabular-nums">{cantidadConUnidad(lote.cantidad, unidad)}</span>
					</div>
				))}
				<RenglonDeLaCuenta texto="Libre" cantidad={cantidadConUnidad(cuenta.libre, unidad)} fuerte />
			</div>
			<TituloDeSeccion titulo="Existencia libre día por día" derecha={<span className="text-tinta3">{unidad}</span>} />
			<Grafica
				tipo="lineas"
				periodos={dias.map((dia) => (dia === 0 ? "Hoy" : textoDeDiaCorto(sumarDias(insumos.hoy, dia))))}
				series={[
					{
						clave: "con_lo_que_viene",
						nombre: "Con lo que hay y lo que viene",
						color: "azul",
						valores: enUnidades(sinPedir.serie),
					},
					...(conPedido === null || cantidad === null
						? []
						: [
								{
									clave: "con_pedido",
									nombre: `Con ${cantidadConUnidad(BigInt(cantidad) * 1000n, unidad)} llegando el ${textoDeDiaCorto(sinPedir.paraCuando)}`,
									color: "verde" as const,
									valores: enUnidades(conPedido.serie),
								},
							]),
				]}
			/>
			<span className="text-etiqueta text-tinta2">
				Mínimo {cantidadConUnidad(BigInt(insumos.minimo), unidad)}
				{sinPedir.seAcaba === null ? "" : ` · Se acaba · ${textoDeDiaCorto(sinPedir.seAcaba)}`}
				{` · Llega el pedido · ${textoDeDiaCorto(sinPedir.paraCuando)}`}
			</span>
			<TituloDeSeccion titulo="Cuánto se gasta · Por día, según el mes" />
			<div className="grid grid-cols-4 gap-2 max-telefono:grid-cols-2">
				{consumo.meses.map((mes) => (
					<div key={mes.nombre} className="rounded-mediano bg-suave px-3 py-2">
						<span className="block text-etiqueta text-tinta3">{mes.nombre}</span>
						<b className="font-bold tabular-nums">{cantidadConUnidad(mes.por_dia, unidad)}</b>
						<span className="block text-etiqueta text-tinta2">× {mes.factor}</span>
					</div>
				))}
			</div>
			<dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-etiqueta">
				<dt className="font-semibold text-tinta3">Receta</dt>
				<dd className="m-0">
					{consumo.normal === null
						? "Sin consumo todavía"
						: `${cantidadConUnidad(consumo.normal, unidad)} por día en un mes normal, ${consumo.medido ? "medido con sus salidas" : "el inicial de Compras"}`}
				</dd>
				<dt className="font-semibold text-tinta3">Ventas</dt>
				<dd className="m-0 text-tinta3">Vacío hasta importar el historial</dd>
				<dt className="font-semibold text-tinta3">Temporada</dt>
				<dd className="m-0">{consumo.temporada ?? "—"}</dd>
				<dt className="font-semibold text-tinta3">Se usa en</dt>
				<dd className="m-0">{consumo.se_usa_en.length === 0 ? "—" : consumo.se_usa_en.join(", ")}</dd>
			</dl>
			<TituloDeSeccion titulo={`Pedido sugerido · ${material.proveedor} · ${material.condicion}`} />
			<Campo
				etiqueta={`Cantidad por pedir (${unidad})`}
				inputMode="numeric"
				value={texto}
				onChange={(evento) => alEscribir(evento.target.value)}
				error={error ?? undefined}
			/>
			{error !== null || conOtra === null ? null : (
				<span className="text-etiqueta text-tinta2">
					{cantidad === sugerido.cantidad
						? sugerido.texto
						: conOtra.alcanzaHasta === null || conOtra.alcanzaHasta === undefined
							? `Con ${cantidadConUnidad(BigInt(cantidad ?? 0) * 1000n, unidad)} alcanza más de un año.`
							: `Con ${cantidadConUnidad(BigInt(cantidad ?? 0) * 1000n, unidad)} alcanza hasta el ${textoDeDia(conOtra.alcanzaHasta)}.`}
				</span>
			)}
		</div>
	);
}

/**
 * El cajón «por qué».
 * @param props El material y cómo cerrar el cajón.
 */
export function CajonPorQue({ materialId, alCerrar }: { materialId: string; alCerrar: () => void }) {
	const { ir } = useDireccionDeCompras();
	const consulta = useConsulta(materialPorQue, { material_id: materialId });
	const [escrito, setEscrito] = useState<string | null>(null);
	const datos = consulta.data;
	const texto = escrito ?? String(datos?.sugerido.cantidad ?? "");
	const valida =
		datos !== undefined &&
		errorDeCantidad(texto, {
			multiplo: Number(BigInt(datos.insumos.multiplo) / 1000n),
			maxima: datos.cantidad_maxima,
			unidad: datos.material.unidad,
		}) === null;
	const borrador = datos?.material.en_borrador ?? null;
	return (
		<Cajon
			abierto
			ancho
			alCerrar={alCerrar}
			{...(datos === undefined
				? {}
				: { contexto: `${nombreDelTipo[datos.material.tipo]} · ${datos.material.proveedor}` })}
			titulo={datos?.material.nombre ?? ""}
			accion={
				datos === undefined ? undefined : borrador === null ? (
					<Boton
						variante="principal"
						icono={ShoppingCart}
						disabled={!valida}
						onClick={() =>
							ir({ cajon: "levantar", id: undefined, materiales: materialId, cantidades: texto.replaceAll(",", "") })
						}
					>
						Levantar orden de{" "}
						{valida ? cantidadConUnidad(BigInt(Number(texto.replaceAll(",", ""))) * 1000n, datos.material.unidad) : "…"}
					</Boton>
				) : (
					<Boton variante="principal" onClick={() => ir({ cajon: "orden", id: borrador.orden_compra_id })}>
						Abrir {borrador.folio}, ya en borrador
					</Boton>
				)
			}
		>
			<SegunConsulta consulta={consulta}>
				{(leidos) => <ContenidoPorQue datos={leidos} texto={texto} alEscribir={setEscrito} />}
			</SegunConsulta>
		</Cajon>
	);
}
