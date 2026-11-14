/**
 * El cajón de un proveedor: lo que dice que tarda, lo que tarda en realidad y cuántas entregas llegaron a tiempo; sus
 * últimas entregas con los días de cada una; su ficha para editar («Guardar»); los materiales que surte (el nombre abre
 * su «por qué») y sus últimas órdenes. «Dar de baja» pide el motivo.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Proveedor») y docs/modulos/compras/proveedores-y-precios.md
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { proveedorDeCompras } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { darBajaProveedor, guardarProveedor } from "@uniformame/compartido/contratos/compras/proveedores";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAccion, useConsulta } from "../../../comun/api.tsx";
import { useCierreDelCajon } from "../../../comun/cambios-sin-guardar.tsx";
import { erroresEnSusCampos, useEnvioConCampos } from "../../../comun/envio.ts";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { numeroEscrito } from "../comun.tsx";
import { useDireccionDeCompras } from "../direccion.ts";
import { textoDelTono } from "../pestanas/proveedores.tsx";

/** Lo que regresa la consulta. */
type Proveedor = z.infer<typeof proveedorDeCompras.resultado>;

/** Las consultas que cambian con el proveedor. */
const cambianConElProveedor = [
	"compras.proveedor",
	"compras.proveedores",
	"compras.pendientes",
	"compras.materiales",
	"compras.levantar_orden_propuesta",
];

/** La ficha, como texto. */
interface Ficha {
	nombre: string;
	rfc: string;
	telefono: string;
	ciudad: string;
	dias_credito: string;
	dias_dice_tardar: string;
	surte: string;
}

/**
 * La ficha del proveedor como se ve en los campos.
 * @param proveedor El proveedor.
 */
function fichaDe(proveedor: Proveedor["proveedor"]): Ficha {
	return {
		nombre: proveedor.nombre,
		rfc: proveedor.rfc ?? "",
		telefono: proveedor.telefono,
		ciudad: proveedor.ciudad,
		dias_credito: String(proveedor.dias_credito),
		dias_dice_tardar: String(proveedor.dias_dice_tardar),
		surte: proveedor.surte ?? "",
	};
}

/**
 * Los datos de `compras.guardar_proveedor`: solo lo que cambió.
 * @param proveedor El proveedor.
 * @param valores Lo capturado.
 */
function soloLoQueCambio(proveedor: Proveedor["proveedor"], valores: Ficha) {
	const antes = fichaDe(proveedor);
	const cambio = (campo: keyof Ficha) => valores[campo].trim() !== antes[campo];
	return {
		proveedor_id: proveedor.proveedor_id,
		...(cambio("nombre") ? { nombre: valores.nombre } : {}),
		...(cambio("rfc") ? { rfc: valores.rfc.trim() === "" ? null : valores.rfc } : {}),
		...(cambio("telefono") ? { telefono: valores.telefono } : {}),
		...(cambio("ciudad") ? { ciudad: valores.ciudad } : {}),
		...(cambio("dias_credito") ? { dias_credito: numeroEscrito(valores.dias_credito) } : {}),
		...(cambio("dias_dice_tardar") ? { dias_dice_tardar: numeroEscrito(valores.dias_dice_tardar) } : {}),
		...(cambio("surte") ? { surte: valores.surte.trim() === "" ? null : valores.surte } : {}),
	};
}

/**
 * El cajón de un proveedor.
 * @param props El proveedor y cómo cerrar el cajón.
 */
export function CajonProveedor({ proveedorId, alCerrar }: { proveedorId: string; alCerrar: () => void }) {
	const { ir } = useDireccionDeCompras();
	const conConexion = useConConexion();
	const consulta = useConsulta(proveedorDeCompras, { proveedor_id: proveedorId });
	const [baja, setBaja] = useState(false);
	const guardar = useEnvioConCampos(guardarProveedor, cambianConElProveedor);
	const darDeBaja = useAccion(darBajaProveedor, cambianConElProveedor);
	const datos = consulta.data;
	// La ficha se revisa con la entrada de `compras.guardar_proveedor`: lo capturado se vuelve sus datos.
	const formulario = useForm<Ficha, unknown, z.output<typeof guardarProveedor.entrada>>({
		resolver: zodResolver(
			z
				.custom<Ficha>()
				.transform((valores) => (datos === undefined ? {} : soloLoQueCambio(datos.proveedor, valores)))
				.pipe(guardarProveedor.entrada),
		),
	});
	const { register, handleSubmit, reset, formState, watch, getValues, setError } = formulario;
	// Lo guardado con que se compara lo capturado: lo que llegó de la consulta, o lo que se acaba de guardar.
	const [guardado, setGuardado] = useState<Ficha | null>(null);
	const capturado = watch();
	const conCambios = guardado !== null && JSON.stringify(capturado) !== JSON.stringify(guardado);
	// Lo que llega de la consulta es lo que se ve; con cambios (un choque), lo capturado se queda.
	useEffect(() => {
		if (datos === undefined || conCambios) return;
		const leido = fichaDe(datos.proveedor);
		// Se le da una copia: lo guardado no cambia con lo que se escribe.
		reset({ ...leido });
		setGuardado(leido);
	}, [datos, reset, conCambios]);
	const { alCerrar: cerrar, pregunta } = useCierreDelCajon(conCambios, alCerrar);
	const proveedor = datos?.proveedor;
	const version = proveedor?.version ?? 0;
	// Con choque, `useEnvioConCampos` vuelve a leer el proveedor y lo capturado se queda.
	const guardarFicha = handleSubmit(async (datosDeLaAccion) => {
		const valores = getValues();
		const salio = await guardar.enviar(
			{ datos: datosDeLaAccion, version },
			(campos) => erroresEnSusCampos(campos, formulario),
			(falla) => {
				if (falla.codigo === "proveedor_repetido") setError("nombre", { message: falla.mensaje });
			},
		);
		if (salio === undefined) return;
		reset({ ...valores });
		setGuardado({ ...valores });
	});
	return (
		<>
			<Cajon
				abierto
				alCerrar={cerrar}
				conCambios={conCambios}
				{...(proveedor === undefined ? {} : { contexto: `Proveedor · ${proveedor.ciudad}` })}
				titulo={proveedor?.nombre ?? ""}
				accion={
					<span className="flex flex-wrap justify-end gap-2">
						{proveedor?.dado_de_baja === false ? (
							<Boton variante="peligro" disabled={!conConexion} onClick={() => setBaja(true)}>
								Dar de baja
							</Boton>
						) : null}
						<Boton
							variante="principal"
							disabled={!conConexion || !conCambios || guardar.enviando}
							onClick={guardarFicha}
						>
							Guardar
						</Boton>
					</span>
				}
			>
				<SegunConsulta consulta={consulta}>
					{(leidos) => (
						<div className="flex flex-col gap-2">
							{guardar.choco ? <EstadoDePantalla tipo="choque" documento={leidos.proveedor.nombre} /> : null}
							<div className="grid grid-cols-3 gap-2">
								<Dato etiqueta="dice que tarda">{plural(leidos.proveedor.dias_dice_tardar, "día", "días")}</Dato>
								<Dato etiqueta="tarda en realidad">
									<span className={textoDelTono[leidos.plazo.tono]}>
										{leidos.plazo.tarda === null ? "—" : plural(leidos.plazo.tarda, "día", "días")}
									</span>
								</Dato>
								<Dato etiqueta="llegaron a tiempo">
									{leidos.plazo.a_tiempo} de {leidos.plazo.entregas}
								</Dato>
							</div>
							<TituloDeBloque titulo="Últimas entregas · Días que tardó cada una" />
							{leidos.entregas.length === 0 ? (
								<span className="text-tinta3">Sin entregas todavía</span>
							) : (
								<div className="flex items-end gap-2">
									{leidos.entregas.map((entrega) => (
										<span
											key={entrega.recepcion_id}
											title={`${entrega.folio}: ${plural(entrega.dias, "día", "días")}`}
											className="flex flex-col items-center gap-1 text-etiqueta"
										>
											<b className={entrega.a_tiempo ? "text-texto-bien" : "text-texto-error"}>{entrega.dias}</b>
											<span
												className={`w-5 rounded-chico ${entrega.a_tiempo ? "bg-estado-verde" : "bg-estado-rojo"}`}
												style={{ height: `${Math.max(4, entrega.dias * 3)}px` }}
											/>
										</span>
									))}
									<span className="ml-2 text-etiqueta text-tinta2">Dice {leidos.proveedor.dias_dice_tardar}</span>
								</div>
							)}
							<TituloDeBloque titulo="Ficha" />
							<form className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1" onSubmit={guardarFicha}>
								<Campo etiqueta="Nombre" error={formState.errors.nombre?.message} {...register("nombre")} />
								<Campo etiqueta="RFC" error={formState.errors.rfc?.message} {...register("rfc")} />
								<Campo
									etiqueta="Teléfono"
									inputMode="tel"
									error={formState.errors.telefono?.message}
									{...register("telefono")}
								/>
								<Campo etiqueta="Ciudad" error={formState.errors.ciudad?.message} {...register("ciudad")} />
								<Campo
									etiqueta="Condición de pago (días de crédito; 0 es contado)"
									inputMode="numeric"
									error={formState.errors.dias_credito?.message}
									{...register("dias_credito")}
								/>
								<Campo
									etiqueta={`Días que dice tardar (de 1 a ${leidos.dias_dice_tardar_maximo})`}
									inputMode="numeric"
									error={formState.errors.dias_dice_tardar?.message}
									{...register("dias_dice_tardar")}
								/>
								<div className="col-span-2 max-telefono:col-span-1">
									<Campo etiqueta="Qué surte" error={formState.errors.surte?.message} {...register("surte")} />
								</div>
							</form>
							<TituloDeBloque titulo={`Materiales que surte · ${leidos.materiales.length}`} />
							{leidos.materiales.length === 0 ? (
								<span className="text-tinta3">Todavía no surte ningún material.</span>
							) : (
								leidos.materiales.map((material) => (
									<div key={material.material_id} className="flex items-center justify-between gap-3">
										<button
											type="button"
											className="text-left font-semibold hover:text-marca"
											onClick={() => ir({ cajon: "por_que", id: material.material_id })}
										>
											{material.nombre}
											<span className="block font-normal text-etiqueta text-tinta2">
												{montoEnPantalla(material.ultimo_precio_centavos)}
												{material.habitual ? "" : " · no es el habitual"}
											</span>
										</button>
										<Estado texto={material.estado.texto} color={material.estado.color} />
									</div>
								))
							)}
							<TituloDeBloque titulo={`Órdenes · Las últimas ${leidos.ordenes.length}`} />
							{leidos.ordenes.length === 0 ? (
								<span className="text-tinta3">Todavía no hay órdenes con este proveedor.</span>
							) : (
								leidos.ordenes.map((orden) => (
									<button
										key={orden.orden_compra_id}
										type="button"
										onClick={() => ir({ cajon: "orden", id: orden.orden_compra_id })}
										className="flex items-center justify-between gap-3 text-left hover:bg-suave"
									>
										<span>
											<b className="font-bold">{orden.folio}</b>
											<span className="block text-etiqueta text-tinta2">Creada el {textoDeDiaCorto(orden.creada)}</span>
										</span>
										<span className="flex items-center gap-3">
											<b className="tabular-nums">{montoEnPantalla(orden.total_centavos)}</b>
											<Estado
												texto={orden.estado.texto}
												color={orden.estado.color}
												{...(orden.estado.abajo === null ? {} : { abajo: orden.estado.abajo })}
											/>
										</span>
									</button>
								))
							)}
						</div>
					)}
				</SegunConsulta>
			</Cajon>
			{pregunta}
			{datos === undefined || proveedor === undefined ? null : (
				<VentanaConMotivo
					abierta={baja}
					alCerrar={() => setBaja(false)}
					titulo={`Dar de baja ${proveedor.nombre}`}
					textoAccion="Dar de baja"
					enviando={darDeBaja.isPending}
					alConfirmar={(motivo) =>
						darDeBaja.mutate(
							{ datos: { proveedor_id: proveedorId, motivo }, version },
							{
								onSuccess: () => {
									setBaja(false);
									cerrar();
								},
							},
						)
					}
				/>
			)}
		</>
	);
}
