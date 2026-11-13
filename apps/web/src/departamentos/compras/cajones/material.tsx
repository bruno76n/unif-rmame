/**
 * El cajón de un material: su estado, sus cifras (libres, comprometidos, mínimo y lo que hay), lo comprometido con lotes
 * y lo que viene, sus proveedores («Hacer habitual», «Ya no lo surte» y «Agregar proveedor»), sus últimos precios y
 * «Cómo se pide», que se guarda con «Guardar cambios». «Ver por qué se pide» abre su «por qué»; «Dar de baja» pide el
 * motivo.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Material») y docs/modulos/compras/materiales.md y
 * proveedores-y-precios.md («Acciones»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { materialDeCompras } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import {
	darBajaMaterial,
	guardarMaterial,
	hacerHabitual,
	quitarProveedorMaterial,
} from "@uniformame/compartido/contratos/compras/materiales";
import { cantidadConUnidad, pesos, plural } from "@uniformame/compartido/contratos/compras/textos";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { leerFalla, useAccion, useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import {
	erroresDeLaAccion,
	numeroEscrito,
	TituloDeSeccion,
	useCierreDelCajon,
	validadorDelContrato,
} from "../comun.tsx";
import { useDireccionDeCompras } from "../direccion.ts";
import { VentanaOtroProveedor } from "../ventanas/otro-proveedor.tsx";

/** Lo que regresa la consulta. */
type Material = z.infer<typeof materialDeCompras.resultado>;

/** Las consultas que cambian con el material. */
const cambianConElMaterial = [
	"compras.material",
	"compras.materiales",
	"compras.material_por_que",
	"compras.por_pedir",
	"compras.pendientes",
	"compras.levantar_orden_propuesta",
];

/** Cómo se dice el tipo de material. */
const nombreDelTipo = { tela: "Tela", avio: "Avío", consumible: "Consumible" } as const;

/** «Cómo se pide», como texto. */
interface ComoSePide {
	minimo: string;
	multiplo_compra: string;
	dias_cubre: string;
	consumo_diario_inicial: string;
	unidad_tablet: string;
	factor_tablet: string;
}

/**
 * Un número guardado («150.000») como se escribe en un campo («150»).
 * @param texto El decimal guardado.
 */
function comoSeEscribe(texto: string | null): string {
	return texto === null ? "" : String(Number(texto));
}

/**
 * «Cómo se pide» del material, como se ve en los campos.
 * @param material El material.
 */
function comoEsta(material: Material["material"]): ComoSePide {
	return {
		minimo: comoSeEscribe(material.minimo),
		multiplo_compra: comoSeEscribe(material.multiplo_compra),
		dias_cubre: String(material.dias_cubre),
		consumo_diario_inicial: comoSeEscribe(material.consumo_diario_inicial),
		unidad_tablet: material.unidad_tablet ?? "",
		factor_tablet: comoSeEscribe(material.factor_tablet),
	};
}

/**
 * Los datos de `compras.guardar_material`: solo lo que cambió.
 * @param material El material.
 * @param valores Lo capturado.
 */
function soloLoQueCambio(material: Material["material"], valores: ComoSePide) {
	const antes = comoEsta(material);
	const cambio = (campo: keyof ComoSePide) => valores[campo].trim() !== antes[campo];
	const textoONulo = (campo: keyof ComoSePide) => (valores[campo].trim() === "" ? null : valores[campo].trim());
	return {
		material_id: material.material_id,
		...(cambio("minimo") ? { minimo: numeroEscrito(valores.minimo) } : {}),
		...(cambio("multiplo_compra") ? { multiplo_compra: numeroEscrito(valores.multiplo_compra) } : {}),
		...(cambio("dias_cubre") ? { dias_cubre: numeroEscrito(valores.dias_cubre) } : {}),
		...(cambio("consumo_diario_inicial") ? { consumo_diario_inicial: textoONulo("consumo_diario_inicial") } : {}),
		...(cambio("unidad_tablet") ? { unidad_tablet: textoONulo("unidad_tablet") } : {}),
		...(cambio("factor_tablet") ? { factor_tablet: textoONulo("factor_tablet") } : {}),
	};
}

/**
 * El cajón de un material.
 * @param props El material y cómo cerrar el cajón.
 */
export function CajonMaterial({ materialId, alCerrar }: { materialId: string; alCerrar: () => void }) {
	const { ir } = useDireccionDeCompras();
	const conConexion = useConConexion();
	const consulta = useConsulta(materialDeCompras, { material_id: materialId });
	const [ventana, setVentana] = useState<"otro" | "baja" | { quitar: string; nombre: string } | null>(null);
	const [choque, setChoque] = useState(false);
	const guardar = useAccion(guardarMaterial, cambianConElMaterial);
	const habitual = useAccion(hacerHabitual, cambianConElMaterial);
	const quitar = useAccion(quitarProveedorMaterial, cambianConElMaterial);
	const baja = useAccion(darBajaMaterial, cambianConElMaterial);
	const datos = consulta.data;
	const formulario = useForm<ComoSePide>({
		resolver: validadorDelContrato(guardarMaterial.entrada, (valores: ComoSePide) =>
			datos === undefined ? {} : soloLoQueCambio(datos.material, valores),
		),
	});
	const { register, handleSubmit, reset, setError, formState, watch } = formulario;
	// Lo guardado con que se compara lo capturado: lo que llegó de la consulta, o lo que se acaba de guardar.
	const [guardado, setGuardado] = useState<ComoSePide | null>(null);
	const capturado = watch();
	const conCambios = guardado !== null && JSON.stringify(capturado) !== JSON.stringify(guardado);
	// Lo que llega de la consulta es lo que se ve; con cambios (un choque), lo capturado se queda.
	useEffect(() => {
		if (datos === undefined || conCambios) return;
		const leido = comoEsta(datos.material);
		// Se le da una copia: lo guardado no cambia con lo que se escribe.
		reset({ ...leido });
		setGuardado(leido);
	}, [datos, reset, conCambios]);
	const { alCerrar: cerrar, pregunta } = useCierreDelCajon(conCambios, alCerrar);
	const material = datos?.material;
	const version = material?.version ?? 0;
	const guardarCambios = handleSubmit((valores) => {
		if (datos === undefined) return;
		guardar.mutate(
			{ datos: guardarMaterial.entrada.parse(soloLoQueCambio(datos.material, valores)), version },
			{
				onSuccess: () => {
					setChoque(false);
					reset({ ...valores });
					setGuardado({ ...valores });
				},
				onError: (falla) => {
					// Con choque, se carga lo nuevo y lo capturado se queda.
					const conChoque = leerFalla(falla).tipo === "choque";
					setChoque(conChoque);
					if (conChoque) consulta.refetch();
					erroresDeLaAccion(falla, valores, setError, {
						falta_conversion: "factor_tablet",
						solo_consumible_en_tablet: "unidad_tablet",
					});
				},
			},
		);
	});
	return (
		<>
			<Cajon
				abierto
				alCerrar={cerrar}
				conCambios={conCambios}
				{...(material === undefined
					? {}
					: { contexto: `${nombreDelTipo[material.tipo]} · ${material.presentacion ?? material.unidad}` })}
				titulo={material?.nombre ?? ""}
				accion={
					<span className="flex flex-wrap justify-end gap-2">
						<Boton onClick={() => ir({ cajon: "por_que", id: materialId })}>Ver por qué se pide</Boton>
						{material?.dado_de_baja === false ? (
							<Boton variante="peligro" disabled={!conConexion} onClick={() => setVentana("baja")}>
								Dar de baja
							</Boton>
						) : null}
						<Boton
							variante="principal"
							disabled={!conConexion || !conCambios || guardar.isPending}
							onClick={guardarCambios}
						>
							Guardar cambios
						</Boton>
					</span>
				}
			>
				<SegunConsulta consulta={consulta}>
					{(leidos) => {
						const { material: suyo } = leidos;
						const unidad = suyo.unidad;
						return (
							<div className="flex flex-col gap-2">
								{choque ? <EstadoDePantalla tipo="choque" documento={suyo.nombre} /> : null}
								<div>
									<Estado {...suyo.estado_armado} abajo={suyo.linea} />
								</div>
								<div className="mt-2 grid grid-cols-3 gap-2">
									<Dato etiqueta="libres">{cantidadConUnidad(suyo.libre, unidad)}</Dato>
									<Dato etiqueta="comprometidos">{cantidadConUnidad(suyo.comprometido, unidad)}</Dato>
									<Dato etiqueta="de mínimo">{cantidadConUnidad(suyo.minimo, unidad)}</Dato>
								</div>
								<BarraAvance
									segmentos={[
										{ etiqueta: "Libre", valor: Math.max(0, Number(suyo.libre)), color: suyo.tono_existencia },
										{ etiqueta: "Comprometido", valor: Number(suyo.comprometido), color: "gris" },
									]}
								/>
								<span className="text-etiqueta text-tinta2">{cantidadConUnidad(suyo.hay, unidad)} en bodega</span>
								<TituloDeSeccion titulo="Comprometido con lotes" />
								{leidos.comprometido.length === 0 ? (
									<span className="text-tinta3">Nada comprometido</span>
								) : (
									leidos.comprometido.map((lote) => (
										<div key={lote.lote_id} className="flex justify-between gap-3 text-etiqueta">
											<span>
												<b className="font-mono">{lote.folio}</b> {lote.detalle}
											</span>
											<span className="tabular-nums">{cantidadConUnidad(lote.cantidad, unidad)}</span>
										</div>
									))
								)}
								<TituloDeSeccion titulo="En camino" />
								{leidos.en_camino.length === 0 ? (
									<span className="text-tinta3">Nada en camino</span>
								) : (
									leidos.en_camino.map((viene) => (
										<button
											key={viene.orden_compra_id}
											type="button"
											onClick={() => ir({ cajon: "orden", id: viene.orden_compra_id })}
											className="flex justify-between gap-3 text-left text-etiqueta hover:text-marca"
										>
											<span>
												<b className="font-mono">{viene.folio}</b> · llega el {textoDeDiaCorto(viene.dia)}
											</span>
											<span className="tabular-nums">+{cantidadConUnidad(viene.cantidad, unidad)}</span>
										</button>
									))
								)}
								<TituloDeSeccion
									titulo="Proveedores"
									derecha={
										<Boton chico icono={Plus} disabled={!conConexion} onClick={() => setVentana("otro")}>
											Agregar proveedor
										</Boton>
									}
								/>
								<Tabla
									nombre="Proveedores del material"
									filas={leidos.proveedores}
									claveDeFila={(proveedor) => proveedor.proveedor_id}
									columnas={[
										{
											clave: "proveedor",
											encabezado: "Proveedor",
											celda: (proveedor) => (
												<span className="flex flex-col">
													<b className="font-semibold">{proveedor.nombre}</b>
													<span className="text-etiqueta text-tinta2">
														Tarda {plural(proveedor.plazo, "día", "días")} ·{" "}
														{proveedor.ultima_compra === null
															? "sin compras registradas"
															: `última compra ${textoDeDiaCorto(proveedor.ultima_compra)}`}
													</span>
												</span>
											),
										},
										{
											clave: "precio",
											encabezado: "Último precio",
											alinear: "derecha",
											celda: (proveedor) => pesos(proveedor.ultimo_precio_centavos),
										},
										{
											clave: "habitual",
											encabezado: "",
											alinear: "derecha",
											celda: (proveedor) =>
												proveedor.habitual ? (
													<span className="font-semibold text-tinta2">Habitual</span>
												) : (
													<span className="flex justify-end gap-2">
														<Boton
															chico
															disabled={!conConexion || habitual.isPending}
															onClick={() =>
																habitual.mutate({
																	datos: { material_id: materialId, proveedor_id: proveedor.proveedor_id },
																	version,
																})
															}
														>
															Hacer habitual
														</Boton>
														<Boton
															chico
															variante="peligro"
															disabled={!conConexion}
															onClick={() => setVentana({ quitar: proveedor.proveedor_id, nombre: proveedor.nombre })}
														>
															Ya no lo surte
														</Boton>
													</span>
												),
										},
									]}
								/>
								<TituloDeSeccion titulo={`Precios · Los últimos ${leidos.precios.length}`} />
								{leidos.precios.map((precio) => (
									<div
										key={`${precio.fecha}-${precio.proveedor}-${precio.precio_centavos}-${precio.origen}`}
										className="flex justify-between gap-3 text-etiqueta"
									>
										<span>
											<b className="font-bold">{pesos(precio.precio_centavos)}</b> · {precio.proveedor}
											{precio.folio === null ? "" : ` · ${precio.folio}`} · {precio.origen}
											{precio.cambio === null ? null : (
												<span className={precio.cambio.ambar ? "font-semibold text-texto-advertencia" : "text-tinta2"}>
													{" "}
													· {precio.cambio.texto}
												</span>
											)}
										</span>
										<span className="text-tinta3">{textoDeDiaCorto(precio.fecha)}</span>
									</div>
								))}
								<TituloDeSeccion titulo="Cómo se pide" />
								<form className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1" onSubmit={guardarCambios}>
									<Campo
										etiqueta={`Mínimo que debe quedar (${unidad})`}
										inputMode="numeric"
										error={formState.errors.minimo?.message}
										{...register("minimo")}
									/>
									<Campo
										etiqueta={`Se compra de … en … (${unidad})`}
										inputMode="numeric"
										error={formState.errors.multiplo_compra?.message}
										{...register("multiplo_compra")}
									/>
									<Campo
										etiqueta="Cada pedido cubre (días)"
										inputMode="numeric"
										error={formState.errors.dias_cubre?.message}
										{...register("dias_cubre")}
									/>
									<Campo
										etiqueta="Consumo por día mientras no se mide"
										inputMode="decimal"
										error={formState.errors.consumo_diario_inicial?.message}
										{...register("consumo_diario_inicial")}
									/>
									{suyo.tipo === "consumible" ? (
										<>
											<Campo
												etiqueta="La tablet lo toma en"
												error={formState.errors.unidad_tablet?.message}
												{...register("unidad_tablet")}
											/>
											<Campo
												etiqueta={`Cuántas hacen un ${unidad}`}
												inputMode="decimal"
												error={formState.errors.factor_tablet?.message}
												{...register("factor_tablet")}
											/>
										</>
									) : null}
								</form>
							</div>
						);
					}}
				</SegunConsulta>
			</Cajon>
			{pregunta}
			{datos === undefined || material === undefined ? null : (
				<>
					<VentanaOtroProveedor
						abierta={ventana === "otro"}
						alCerrar={() => setVentana(null)}
						material={{ material_id: materialId, nombre: material.nombre, unidad: material.unidad, version }}
						otros={datos.otros_proveedores}
						ultimoPrecio={datos.ultimo_precio_centavos ?? null}
					/>
					<VentanaConMotivo
						abierta={ventana === "baja"}
						alCerrar={() => setVentana(null)}
						titulo={`Dar de baja ${material.nombre}`}
						textoAccion="Dar de baja"
						enviando={baja.isPending}
						alConfirmar={(motivo) =>
							baja.mutate(
								{ datos: { material_id: materialId, motivo }, version },
								{
									onSuccess: () => {
										setVentana(null);
										cerrar();
									},
								},
							)
						}
					/>
					<VentanaConMotivo
						abierta={typeof ventana === "object" && ventana !== null}
						alCerrar={() => setVentana(null)}
						titulo={
							typeof ventana === "object" && ventana !== null ? `${ventana.nombre} ya no surte ${material.nombre}` : ""
						}
						textoAccion="Ya no lo surte"
						enviando={quitar.isPending}
						alConfirmar={(motivo) =>
							typeof ventana === "object" && ventana !== null
								? quitar.mutate(
										{ datos: { material_id: materialId, proveedor_id: ventana.quitar, motivo }, version },
										{ onSuccess: () => setVentana(null) },
									)
								: undefined
						}
					/>
				</>
			)}
		</>
	);
}
