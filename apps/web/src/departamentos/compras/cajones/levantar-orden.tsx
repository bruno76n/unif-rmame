/**
 * El cajón Levantar orden (ancho): un bloque por proveedor («{condición} · tarda {n} días», «Se suma al borrador {OC}»
 * si ya tiene uno) con la tabla Material · Cantidad · Precio · Importe · X y su total. Cambiar de proveedor pasa el
 * material a ese bloque con su último precio. «Agregar material» trae los que no están, de lo más urgente a lo menos.
 * «Crear la orden» o «Crear {n} órdenes» llama `compras.levantar_orden` y lleva a Órdenes de compra con «Borradores»
 * abierto.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Levantar orden») y docs/modulos/compras/ordenes-de-compra.md
 * («`compras.levantar_orden`»)
 *
 * «Sube {n} % · antes ${precio}» sale de `cambioDePrecio` y los errores de la cantidad de `errorDeCantidad`, del
 * paquete compartido: la pantalla dice lo mismo que la acción.
 */

import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { plural } from "@uniformame/compartido/calculos/textos";
import { levantarOrdenPropuesta } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { levantarOrden } from "@uniformame/compartido/contratos/compras/ordenes";
import {
	cambioDePrecio,
	cantidadConUnidad,
	errorDeCantidad,
	pesos,
} from "@uniformame/compartido/contratos/compras/textos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { useAccion, useConsulta } from "../../../comun/api.tsx";
import { useCierreDelCajon } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { rutaDePestana } from "../../../comun/pagina-de-departamento.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeCompras } from "../direccion.ts";

/** Lo que regresa la consulta. */
type Propuesta = z.infer<typeof levantarOrdenPropuesta.resultado>;

/** Un renglón capturado. */
interface Renglon {
	material_id: string;
	proveedor_id: string;
	cantidad: string;
	precio: string;
}

/**
 * El último precio de un proveedor con un material, en pesos como se escribe, o vacío si nunca se lo ha surtido.
 * @param propuesta La propuesta.
 * @param materialId El material.
 * @param proveedorId El proveedor.
 */
function ultimoPrecio(propuesta: Propuesta, materialId: string, proveedorId: string): number | undefined {
	return propuesta.materiales
		.find((material) => material.material_id === materialId)
		?.surtidores.find((surtidor) => surtidor.proveedor_id === proveedorId)?.ultimo_precio_centavos;
}

/**
 * Un renglón nuevo con su proveedor habitual y su último precio.
 * @param propuesta La propuesta.
 * @param materialId El material.
 * @param cantidad La cantidad.
 */
function renglonNuevo(propuesta: Propuesta, materialId: string, cantidad: number): Renglon {
	const material = propuesta.materiales.find((uno) => uno.material_id === materialId);
	const proveedor = material?.proveedor_habitual_id ?? "";
	const precio = ultimoPrecio(propuesta, materialId, proveedor);
	return {
		material_id: materialId,
		proveedor_id: proveedor,
		cantidad: String(cantidad),
		precio: precio === undefined ? "" : String(precio / 100),
	};
}

/**
 * Los errores de un renglón: de su cantidad y de su precio.
 * @param propuesta La propuesta.
 * @param renglon El renglón.
 */
function erroresDe(propuesta: Propuesta, renglon: Renglon): { cantidad: string | null; precio: string | null } {
	const material = propuesta.materiales.find((uno) => uno.material_id === renglon.material_id);
	const precio = pesosACentavos(renglon.precio);
	return {
		cantidad: errorDeCantidad(renglon.cantidad, {
			multiplo: material?.multiplo ?? 1,
			maxima: propuesta.cantidad_maxima,
			unidad: material?.unidad ?? "",
		}),
		precio: precio === null || precio <= 0 ? "Escribe el precio." : null,
	};
}

/**
 * El bloque de un proveedor con sus renglones.
 * @param props La propuesta, el proveedor, sus renglones y cómo cambiarlos.
 */
function BloqueDeProveedor({
	propuesta,
	proveedorId,
	renglones,
	alCambiar,
	alQuitar,
}: {
	propuesta: Propuesta;
	proveedorId: string;
	renglones: Renglon[];
	alCambiar: (materialId: string, cambio: Partial<Renglon>) => void;
	alQuitar: (materialId: string) => void;
}) {
	const proveedor = propuesta.proveedores.find((uno) => uno.proveedor_id === proveedorId);
	const importe = (renglon: Renglon) =>
		Number(renglon.cantidad.replaceAll(",", "")) * (pesosACentavos(renglon.precio) ?? 0);
	return (
		<section className="flex flex-col gap-2 rounded-grande border border-linea p-4">
			<header>
				<h3 className="m-0 font-bold text-subtitulo">{proveedor?.nombre ?? "Escoge el proveedor"}</h3>
				{proveedor === undefined ? null : (
					<span className="text-etiqueta text-tinta2">
						{proveedor.condicion} · tarda {plural(proveedor.plazo, "día", "días")}
						{proveedor.borrador === null ? "" : ` · Se suma al borrador ${proveedor.borrador}`}
					</span>
				)}
			</header>
			{renglones.map((renglon) => {
				const material = propuesta.materiales.find((uno) => uno.material_id === renglon.material_id);
				if (material === undefined) return null;
				const errores = erroresDe(propuesta, renglon);
				const precio = pesosACentavos(renglon.precio);
				const cambio =
					precio === null
						? null
						: cambioDePrecio(
								ultimoPrecio(propuesta, material.material_id, proveedorId),
								precio,
								propuesta.umbral_cambio_precio_pct,
							);
				const otros = propuesta.proveedores.filter(
					(uno) => !material.surtidores.some((surtidor) => surtidor.proveedor_id === uno.proveedor_id),
				);
				return (
					<div
						key={renglon.material_id}
						className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-start gap-3 border-linea border-t pt-3 max-telefono:grid-cols-2"
					>
						<div className="flex flex-col gap-1">
							<b className="font-semibold">{material.nombre}</b>
							<span className="text-etiqueta text-tinta2">
								Sugerido {cantidadConUnidad(BigInt(material.sugerido) * 1000n, material.unidad)}
							</span>
							<Selector
								etiqueta="Proveedor"
								value={renglon.proveedor_id}
								onChange={(evento) => {
									const nuevo = evento.target.value;
									const suPrecio = ultimoPrecio(propuesta, material.material_id, nuevo);
									alCambiar(material.material_id, {
										proveedor_id: nuevo,
										precio: suPrecio === undefined ? "" : String(suPrecio / 100),
									});
								}}
								opciones={[
									...material.surtidores.map((surtidor) => ({
										valor: surtidor.proveedor_id,
										texto: `${surtidor.nombre} · ${pesos(surtidor.ultimo_precio_centavos)}`,
									})),
									...otros.map((otro) => ({ valor: otro.proveedor_id, texto: `Otro proveedor: ${otro.nombre}` })),
								]}
							/>
						</div>
						<Campo
							etiqueta={`Cantidad (${material.unidad})`}
							inputMode="numeric"
							value={renglon.cantidad}
							onChange={(evento) => alCambiar(material.material_id, { cantidad: evento.target.value })}
							error={errores.cantidad ?? undefined}
						/>
						<div className="flex flex-col gap-1">
							<Campo
								etiqueta="Precio"
								inputMode="decimal"
								value={renglon.precio}
								onChange={(evento) => alCambiar(material.material_id, { precio: evento.target.value })}
								error={errores.precio ?? undefined}
							/>
							{cambio === null ? null : (
								<span
									className={`text-etiqueta ${cambio.ambar ? "font-semibold text-texto-advertencia" : "text-tinta2"}`}
								>
									{cambio.texto}
								</span>
							)}
						</div>
						<b className="pt-7 text-right tabular-nums">{pesos(importe(renglon))}</b>
						<span className="pt-6">
							<Boton
								variante="fantasma"
								chico
								aria-label={`Quitar ${material.nombre}`}
								icono={X}
								onClick={() => alQuitar(material.material_id)}
							/>
						</span>
					</div>
				);
			})}
			<div className="flex justify-between border-linea border-t pt-3 font-bold">
				<span>Total</span>
				<span className="tabular-nums">{pesos(renglones.reduce((suma, renglon) => suma + importe(renglon), 0))}</span>
			</div>
		</section>
	);
}

/**
 * El cajón Levantar orden.
 * @param props Lo escogido (de la dirección) y cómo cerrar el cajón.
 */
export function CajonLevantarOrden({
	materiales,
	cantidades,
	alCerrar,
}: {
	materiales: string | undefined;
	cantidades: string | undefined;
	alCerrar: () => void;
}) {
	const { ir } = useDireccionDeCompras();
	const conConexion = useConConexion();
	const consulta = useConsulta(levantarOrdenPropuesta, { material_ids: materiales, cantidades });
	const levantar = useAccion(levantarOrden, [
		"compras.ordenes",
		"compras.pendientes",
		"compras.por_pedir",
		"compras.material_por_que",
		"compras.levantar_orden_propuesta",
	]);
	const [renglones, setRenglones] = useState<Renglon[] | null>(null);
	const propuesta = consulta.data;
	// Lo escogido llega una vez, con su proveedor habitual y su último precio.
	useEffect(() => {
		if (propuesta !== undefined && renglones === null) {
			setRenglones(propuesta.escogidos.map((uno) => renglonNuevo(propuesta, uno.material_id, uno.cantidad)));
		}
	}, [propuesta, renglones]);
	const lista = renglones ?? [];
	const conCambios =
		renglones !== null &&
		propuesta !== undefined &&
		JSON.stringify(renglones) !==
			JSON.stringify(propuesta.escogidos.map((uno) => renglonNuevo(propuesta, uno.material_id, uno.cantidad)));
	const { alCerrar: cerrar, pregunta } = useCierreDelCajon(conCambios, alCerrar);
	const proveedores = [...new Set(lista.map((renglon) => renglon.proveedor_id))];
	const conErrores =
		propuesta === undefined ||
		lista.some((renglon) => {
			const errores = erroresDe(propuesta, renglon);
			return errores.cantidad !== null || errores.precio !== null || renglon.proveedor_id === "";
		});
	const cambiar = (materialId: string, cambio: Partial<Renglon>) =>
		setRenglones(lista.map((renglon) => (renglon.material_id === materialId ? { ...renglon, ...cambio } : renglon)));
	const crear = () =>
		levantar.mutate(
			{
				datos: {
					renglones: lista.map((renglon) => ({
						material_id: renglon.material_id,
						proveedor_id: renglon.proveedor_id,
						cantidad: Number(renglon.cantidad.replaceAll(",", "")),
						precio_centavos: pesosACentavos(renglon.precio) ?? 0,
					})),
				},
			},
			{
				onSuccess: ({ ordenes }) => {
					setRenglones(null);
					ir({ abiertos: "borradores", resaltar: ordenes[0]?.orden_id }, rutaDePestana("compras", "ordenes"));
				},
			},
		);
	const disponibles = (propuesta?.materiales ?? []).filter(
		(material) => !lista.some((renglon) => renglon.material_id === material.material_id),
	);
	return (
		<>
			<Cajon
				abierto
				ancho
				alCerrar={cerrar}
				conCambios={conCambios}
				contexto={`Compras · ${plural(lista.length, "material", "materiales")} con ${plural(proveedores.length, "proveedor", "proveedores")}`}
				titulo="Levantar orden"
				accion={
					<Boton
						variante="principal"
						disabled={!conConexion || conErrores || lista.length === 0 || levantar.isPending}
						onClick={crear}
					>
						{proveedores.length <= 1 ? "Crear la orden" : `Crear ${proveedores.length} órdenes`}
					</Boton>
				}
			>
				<SegunConsulta consulta={consulta}>
					{(leida) => (
						<div className="flex flex-col gap-4">
							{lista.length === 0 ? (
								<EstadoDePantalla tipo="vacio" texto="No hay materiales en la orden. Agrega uno de la lista." />
							) : (
								proveedores.map((proveedorId) => (
									<BloqueDeProveedor
										key={proveedorId}
										propuesta={leida}
										proveedorId={proveedorId}
										renglones={lista.filter((renglon) => renglon.proveedor_id === proveedorId)}
										alCambiar={cambiar}
										alQuitar={(materialId) =>
											setRenglones(lista.filter((renglon) => renglon.material_id !== materialId))
										}
									/>
								))
							)}
							<Selector
								etiqueta="Agregar material"
								vacio="Escoge un material"
								value=""
								opciones={disponibles.map((material) => ({
									valor: material.material_id,
									texto: `${material.nombre} · ${material.linea}`,
								}))}
								onChange={(evento) => {
									const material = leida.materiales.find((uno) => uno.material_id === evento.target.value);
									if (material !== undefined) {
										setRenglones([...lista, renglonNuevo(leida, material.material_id, material.sugerido)]);
									}
								}}
							/>
						</div>
					)}
				</SegunConsulta>
			</Cajon>
			{pregunta}
		</>
	);
}
