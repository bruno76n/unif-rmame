/**
 * El cajón «Nuevo producto» (ancho): desde cero o a partir de otro producto, desde Catálogo, desde un pedido de Ventas a
 * externos o desde un desarrollo de Patronaje. Nombre, sección y tipo de prenda, para quién (la categoría se propone
 * sola mientras no se cambie a mano), las tallas por grupo, la receta, dónde se vende y los precios que pide cada canal.
 * Todos los botones llaman a `catalogo.crear_producto`; los errores marcan su campo y el aviso ámbar dice el primero.
 * Con datos escritos, salir pregunta antes.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Nuevo producto») y docs/modulos/catalogo/productos.md
 */

import { useRouter } from "@tanstack/react-router";
import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { altaDeProducto } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { crearProducto } from "@uniformame/compartido/contratos/catalogo/productos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Interruptor } from "@uniformame/interfaz/captura/interruptor";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { usePreguntarAntesDeSalir } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { esperar, useAccionDeCatalogo } from "../acciones.ts";
import { conFicha, sinCajon, useBusqueda, useIr } from "../direccion.ts";
import { cuantos } from "../textos.ts";

/** Lo que regresa la consulta del alta. */
type Alta = z.infer<typeof altaDeProducto.resultado>;

/** Los canales de un producto. */
type Canal = "mostrador" | "en_linea" | "externos";

/** Lo que se captura en el alta. */
interface Captura {
	modo: "desde_cero" | "a_partir_de";
	nombre: string;
	seccion: string;
	tipo: string;
	escuela: string;
	categoria: string;
	/** Si la categoría se cambió a mano: entonces «Para quién» ya no la cambia. */
	categoriaAMano: boolean;
	/** Por grupo marcado, la primera y la última talla (desde cero). */
	grupos: Record<string, { desde: string; hasta: string }>;
	canales: Record<Canal, boolean>;
	/** Por lista, el precio escrito. */
	precios: Record<string, string>;
}

/** Qué canal pide el precio de cada tipo de lista. */
const canalDeLista: Readonly<Record<string, Canal>> = {
	mostrador: "mostrador",
	mayoreo: "mostrador",
	en_linea: "en_linea",
	cliente: "externos",
};

/**
 * La categoría que el alta propone para «Para quién».
 * @param alta Lo que dio la consulta.
 * @param escuela La escuela escogida, o vacío.
 */
function categoriaPropuesta(alta: Alta, escuela: string): string {
	const para = escuela === "" ? "sin_escuela" : "con_escuela";
	return alta.categorias.find((categoria) => categoria.defecto_para === para)?.id ?? alta.categorias[0]?.id ?? "";
}

/**
 * Lo que se captura al abrir: vacío, o lo del producto base, o lo del desarrollo.
 * @param alta Lo que dio la consulta.
 * @param origen De dónde viene.
 * @param seccion La sección con que se abrió, si la hay.
 */
function capturaInicial(alta: Alta, origen: string, seccion: string | undefined): Captura {
	const base = alta.base;
	const escuela = base?.escuela_id ?? alta.desarrollo?.escuela_id ?? "";
	return {
		modo: base === null ? "desde_cero" : "a_partir_de",
		nombre: base?.nombre ?? alta.desarrollo?.prenda ?? "",
		seccion: base?.seccion_id ?? seccion ?? "",
		tipo: "",
		escuela,
		categoria: base?.categoria_mayoreo_id ?? categoriaPropuesta(alta, escuela),
		categoriaAMano: base !== null,
		grupos: {},
		canales:
			origen === "pedido"
				? { mostrador: false, en_linea: false, externos: true }
				: (base?.canales ?? { mostrador: true, en_linea: false, externos: false }),
		precios: Object.fromEntries(
			(base?.precios ?? []).map((precio) => [precio.lista_id, String(precio.precio_centavos / 100)]),
		),
	};
}

/**
 * El cajón del alta de un producto.
 * @param props De dónde viene.
 */
export function CajonNuevoProducto({ origen }: { origen: "catalogo" | "pedido" | "desarrollo" }) {
	const busqueda = useBusqueda();
	const ir = useIr();
	const router = useRouter();
	const consulta = useConsulta(altaDeProducto, {
		origen,
		...(busqueda.base === undefined ? {} : { producto_base_id: busqueda.base }),
		...(busqueda.seccion_alta === undefined ? {} : { seccion_id: busqueda.seccion_alta }),
		...(busqueda.cliente === undefined ? {} : { cliente_id: busqueda.cliente }),
		...(busqueda.desarrollo === undefined ? {} : { desarrollo_id: busqueda.desarrollo }),
	});
	const [captura, setCaptura] = useState<Captura | undefined>(undefined);
	const alta = consulta.data;
	// Al llegar el alta (o un producto base nuevo), lo capturado empieza con lo que propone.
	useEffect(() => {
		if (alta !== undefined) setCaptura(capturaInicial(alta, origen, busqueda.seccion_alta));
	}, [alta, origen, busqueda.seccion_alta]);
	const conDatos =
		captura !== undefined && (captura.nombre.trim() !== "" || Object.values(captura.precios).some(Boolean));
	const pregunta = usePreguntarAntesDeSalir(conDatos);
	const alPedido = busqueda.pedido === undefined ? undefined : `/ventas/pedidos?cajon=pedido&id=${busqueda.pedido}`;
	const cerrar = () => (alPedido === undefined ? ir(sinCajon) : router.history.push(alPedido));
	const contexto =
		alta === undefined
			? undefined
			: `Nuevo producto ${alta.siguiente_codigo ?? ""}${alta.cliente === null ? "" : ` · Regresa al pedido de ${alta.cliente.nombre}`}`;
	return (
		<>
			<Cajon
				abierto
				ancho
				alCerrar={cerrar}
				{...(contexto === undefined ? {} : { contexto })}
				titulo={captura?.nombre.trim() || "¿Qué prenda es?"}
				pieIzquierda={
					<Boton variante="fantasma" onClick={cerrar}>
						{alPedido === undefined ? "Descartar" : "Volver al pedido"}
					</Boton>
				}
				accion={
					alta === undefined || captura === undefined ? null : (
						<BotonesDelAlta
							alta={alta}
							captura={captura}
							origen={origen}
							alPedido={alPedido}
							alCrear={() => setCaptura(undefined)}
						/>
					)
				}
			>
				<SegunConsulta consulta={consulta}>
					{(datos) =>
						captura === undefined ? null : (
							<FormularioDelAlta
								alta={datos}
								captura={captura}
								alCambiar={(cambio) => setCaptura((antes) => (antes === undefined ? antes : { ...antes, ...cambio }))}
								alEscogerBase={(base) => ir({ base })}
							/>
						)
					}
				</SegunConsulta>
			</Cajon>
			{pregunta}
		</>
	);
}

/**
 * Las tallas que lleva el alta: desde cero, las de cada grupo marcado entre «desde» y «a»; a partir de otro, las del
 * base en los grupos marcados (las resuelve la acción con lo que llega).
 * @param alta Lo que dio la consulta.
 * @param captura Lo capturado.
 */
function tallasDelAlta(alta: Alta, captura: Captura) {
	if (captura.modo === "a_partir_de" && alta.base !== null) {
		return alta.base.tallas
			.filter((talla) => captura.grupos[talla.grupo_id] !== undefined)
			.map(({ talla_id, es_pedido_especial }) => ({ talla_id, es_pedido_especial }));
	}
	return alta.grupos.flatMap((grupo) => {
		const marcado = captura.grupos[grupo.id];
		if (marcado === undefined) return [];
		const desde = grupo.tallas.findIndex((talla) => talla.id === marcado.desde);
		const hasta = grupo.tallas.findIndex((talla) => talla.id === marcado.hasta);
		return grupo.tallas
			.slice(Math.max(0, desde), hasta < 0 ? grupo.tallas.length : hasta + 1)
			.map((talla) => ({ talla_id: talla.id, es_pedido_especial: false }));
	});
}

/**
 * Los datos de `catalogo.crear_producto` con lo capturado.
 * @param alta Lo que dio la consulta.
 * @param captura Lo capturado.
 * @param origen De dónde viene.
 */
function datosDelAlta(alta: Alta, captura: Captura, origen: "catalogo" | "pedido" | "desarrollo") {
	const canales = (Object.keys(captura.canales) as Canal[]).filter((canal) => captura.canales[canal]);
	const precios = alta.listas
		.filter((lista) => canales.includes(canalDeLista[lista.tipo] ?? "mostrador"))
		.flatMap((lista) => {
			const centavos = pesosACentavos(captura.precios[lista.id] ?? "");
			return centavos === null ? [] : [{ lista_id: lista.id, precio_centavos: centavos }];
		});
	return {
		modo: captura.modo,
		origen,
		...(captura.modo === "a_partir_de" && alta.base !== null ? { producto_base_id: alta.base.id } : {}),
		...(alta.cliente === null ? {} : { cliente_id: alta.cliente.id }),
		...(alta.desarrollo === null ? {} : { desarrollo_id: alta.desarrollo.id }),
		nombre: captura.nombre,
		seccion_id: captura.seccion,
		escuela_id: captura.escuela === "" ? null : captura.escuela,
		...(captura.tipo === "" ? {} : { tipo_prenda_id: captura.tipo }),
		categoria_mayoreo_id: captura.categoria,
		tallas: tallasDelAlta(alta, captura),
		canales,
		precios,
		...(captura.modo === "a_partir_de" && alta.base !== null && alta.base.medidas.length > 0
			? { medidas: alta.base.medidas }
			: {}),
	};
}

/**
 * Los botones del pie: «Crear y seguir con la receta» y «Crear producto» desde Catálogo, o «Crear y agregar al pedido».
 * Valida con el esquema del contrato antes de mandar: con errores no crea y el aviso ámbar dice el primero.
 * @param props El alta, lo capturado, de dónde viene, el pedido al que regresa y qué hacer al crear.
 */
function BotonesDelAlta({
	alta,
	captura,
	origen,
	alPedido,
	alCrear,
}: {
	alta: Alta;
	captura: Captura;
	origen: "catalogo" | "pedido" | "desarrollo";
	alPedido: string | undefined;
	alCrear: () => void;
}) {
	const accion = useAccionDeCatalogo(crearProducto);
	const avisar = useAvisar();
	const ir = useIr();
	const router = useRouter();
	const conConexion = useConConexion();
	const seccion = alta.secciones.find((una) => una.id === captura.seccion);
	const crear = async (despues: "ficha" | "receta" | "pedido") => {
		const datos = datosDelAlta(alta, captura, origen);
		const revisado = crearProducto.entrada.safeParse(datos);
		if (!revisado.success) {
			avisar(revisado.error.issues[0]?.message ?? "Revisa los campos.", "no_se_pudo");
			return;
		}
		const salida = await esperar(accion.mutateAsync({ datos: revisado.data }));
		if (!salida.bien) {
			if (salida.falla.tipo === "regla") {
				const [primero] = Object.values(salida.falla.campos);
				if (primero !== undefined) avisar(primero, "no_se_pudo");
			}
			return;
		}
		// Lo capturado se suelta antes de salir, para que salir no pregunte.
		flushSync(alCrear);
		const id = salida.resultado.producto_id;
		if (despues === "receta") router.history.push(`/patronaje/recetas?cajon=receta&id=${id}`);
		else if (despues === "pedido" && alPedido !== undefined) router.history.push(alPedido);
		else ir(conFicha(id), "productos");
	};
	const ocupado = accion.isPending || !conConexion;
	if (origen === "pedido") {
		return (
			<Boton disabled={ocupado} onClick={() => void crear("pedido")}>
				Crear y agregar al pedido
			</Boton>
		);
	}
	return (
		<span className="flex flex-wrap gap-2">
			{alta.puede_patronaje && seccion?.lleva_receta === true ? (
				<Boton variante="secundario" disabled={ocupado} onClick={() => void crear("receta")}>
					Crear y seguir con la receta
				</Boton>
			) : null}
			<Boton disabled={ocupado} onClick={() => void crear("ficha")}>
				Crear producto
			</Boton>
		</span>
	);
}

/**
 * Los campos del alta.
 * @param props El alta, lo capturado, cómo cambiarlo y cómo escoger el producto base.
 */
function FormularioDelAlta({
	alta,
	captura,
	alCambiar,
	alEscogerBase,
}: {
	alta: Alta;
	captura: Captura;
	alCambiar: (cambio: Partial<Captura>) => void;
	alEscogerBase: (base: string | undefined) => void;
}) {
	const seccion = alta.secciones.find((una) => una.id === captura.seccion);
	const tipos = alta.tipos.filter((tipo) => tipo.seccion_id === captura.seccion);
	const tipo = alta.tipos.find((uno) => uno.id === (captura.tipo || seccion?.tipo_prenda_defecto_id));
	const categoria = alta.categorias.find((una) => una.id === captura.categoria);
	const tallas = tallasDelAlta(alta, captura);
	const primero = Number(alta.siguiente_codigo ?? "0");
	const conEscuela = captura.escuela !== "";
	const baseNombre = alta.productos_base.find((producto) => producto.id === alta.base?.id)?.nombre ?? "";
	const gruposDelBase = new Set((alta.base?.tallas ?? []).map((talla) => talla.grupo_id));
	return (
		<div className="flex flex-col gap-4">
			<Filtros
				nombre="Empezar"
				filtros={[
					{ clave: "a_partir_de", texto: "A partir de un producto existente" },
					{ clave: "desde_cero", texto: "Desde cero" },
				]}
				activo={captura.modo}
				alEscoger={(clave) => {
					alCambiar({ modo: clave === "a_partir_de" ? "a_partir_de" : "desde_cero" });
					if (clave === "desde_cero") alEscogerBase(undefined);
				}}
			/>
			{captura.modo === "a_partir_de" ? (
				<div>
					<Selector
						etiqueta="Producto base"
						vacio="Escoge el producto base"
						opciones={alta.productos_base.map((producto) => ({
							valor: producto.id,
							texto: `${producto.nombre} · ${producto.escuela ?? "Básico"}`,
						}))}
						value={alta.base?.id ?? ""}
						onChange={(evento) => alEscogerBase(evento.target.value || undefined)}
					/>
					{alta.base === null ? null : (
						<p className="m-0 mt-1 text-etiqueta text-tinta2">
							{"Se copian tallas, canales, precios, medidas y receta · "}
							{alta.base.receta === null
								? "El producto base no tiene receta"
								: `Receta versión ${alta.base.receta.version} de ${baseNombre}: queda sin verificar en Patronaje`}
						</p>
					)}
				</div>
			) : null}
			<Campo
				etiqueta="Nombre de la prenda"
				value={captura.nombre}
				onChange={(evento) => alCambiar({ nombre: evento.target.value })}
			/>
			<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
				<Selector
					etiqueta="Sección"
					vacio="Escoge la sección"
					opciones={alta.secciones.map((una) => ({ valor: una.id, texto: una.nombre }))}
					value={captura.seccion}
					onChange={(evento) => alCambiar({ seccion: evento.target.value, tipo: "" })}
				/>
				{seccion?.lleva_receta === true && captura.modo === "desde_cero" ? (
					<div>
						<Selector
							etiqueta="Tipo de prenda"
							vacio="Escoge el tipo de prenda"
							opciones={tipos.map((uno) => ({ valor: uno.id, texto: uno.nombre }))}
							value={captura.tipo || (seccion.tipo_prenda_defecto_id ?? "")}
							onChange={(evento) => alCambiar({ tipo: evento.target.value })}
						/>
						{tipo === undefined ? null : (
							<p className="m-0 mt-1 text-etiqueta text-tinta2">{`Como ${tipo.nombre.toLocaleLowerCase("es-MX")}${tipo.flujo === null ? "" : ` · ${tipo.flujo}`}`}</p>
						)}
					</div>
				) : null}
			</div>
			<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
				<Selector
					etiqueta="Para quién"
					opciones={[
						{ valor: "", texto: "Ninguna escuela: básico o general" },
						...alta.escuelas.map((escuela) => ({ valor: escuela.id, texto: escuela.nombre })),
					]}
					value={captura.escuela}
					onChange={(evento) => {
						const escuela = evento.target.value;
						alCambiar({
							escuela,
							...(captura.categoriaAMano ? {} : { categoria: categoriaPropuesta(alta, escuela) }),
							...(escuela === "" ? {} : { canales: { ...captura.canales, en_linea: false } }),
						});
					}}
				/>
				<div>
					<Selector
						etiqueta="Categoría para mayoreo"
						opciones={alta.categorias.map((una) => ({ valor: una.id, texto: una.nombre }))}
						value={captura.categoria}
						onChange={(evento) => alCambiar({ categoria: evento.target.value, categoriaAMano: true })}
					/>
					<p className="m-0 mt-1 text-etiqueta text-tinta2">{categoria?.descripcion ?? ""}</p>
				</div>
			</div>
			<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
				<legend className="mb-1 font-semibold">Tallas</legend>
				{alta.grupos
					.filter((grupo) => captura.modo === "desde_cero" || gruposDelBase.has(grupo.id))
					.map((grupo) => {
						const marcado = captura.grupos[grupo.id];
						return (
							<div key={grupo.id} className="flex flex-wrap items-end gap-3">
								<div className="w-48 pb-3">
									<Casilla
										etiqueta={grupo.nombre}
										marcada={marcado !== undefined}
										alCambiar={(marcada) => {
											const grupos = { ...captura.grupos };
											if (marcada) {
												grupos[grupo.id] = { desde: grupo.tallas[0]?.id ?? "", hasta: grupo.tallas.at(-1)?.id ?? "" };
											} else delete grupos[grupo.id];
											alCambiar({ grupos });
										}}
									/>
								</div>
								{marcado === undefined || captura.modo === "a_partir_de" ? null : (
									<>
										<div className="w-32">
											<Selector
												etiqueta="desde"
												opciones={grupo.tallas.map((talla) => ({ valor: talla.id, texto: talla.nombre }))}
												value={marcado.desde}
												onChange={(evento) =>
													alCambiar({
														grupos: { ...captura.grupos, [grupo.id]: { ...marcado, desde: evento.target.value } },
													})
												}
											/>
										</div>
										<div className="w-32">
											<Selector
												etiqueta="a"
												opciones={grupo.tallas.map((talla) => ({ valor: talla.id, texto: talla.nombre }))}
												value={marcado.hasta}
												onChange={(evento) =>
													alCambiar({
														grupos: { ...captura.grupos, [grupo.id]: { ...marcado, hasta: evento.target.value } },
													})
												}
											/>
										</div>
									</>
								)}
							</div>
						);
					})}
				{tallas.length === 0 ? null : (
					<p className="m-0 text-etiqueta text-tinta2">
						{`Se crean ${cuantos(tallas.length, "variante", "variantes")}, una por talla, con los códigos ${alta.siguiente_codigo ?? ""} a ${String(primero + tallas.length - 1).padStart(6, "0")}.`}
					</p>
				)}
			</fieldset>
			<div>
				<b>Receta</b>
				<p
					className={
						seccion?.lleva_receta !== true || (captura.modo === "a_partir_de" && alta.base?.receta === null)
							? "m-0 font-semibold text-texto-advertencia"
							: "m-0 text-tinta2"
					}
				>
					{seccion?.lleva_receta !== true
						? "Queda sin receta"
						: captura.modo === "a_partir_de" && alta.base !== null
							? alta.base.receta === null
								? "Queda sin receta"
								: `Se copia la versión ${alta.base.receta.version} de ${baseNombre}`
							: "Se captura al crear el producto"}
				</p>
			</div>
			<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
				<legend className="mb-1 font-semibold">Dónde se vende</legend>
				<Interruptor
					etiqueta="Mostrador"
					prendido={captura.canales.mostrador}
					alCambiar={(prendido) => alCambiar({ canales: { ...captura.canales, mostrador: prendido } })}
				/>
				<Interruptor
					etiqueta="En línea"
					prendido={captura.canales.en_linea}
					deshabilitado={conEscuela}
					alCambiar={(prendido) => alCambiar({ canales: { ...captura.canales, en_linea: prendido } })}
				/>
				<Interruptor
					etiqueta="Ventas a externos"
					prendido={captura.canales.externos}
					alCambiar={(prendido) => alCambiar({ canales: { ...captura.canales, externos: prendido } })}
				/>
			</fieldset>
			<div className="grid grid-cols-3 gap-3 max-menu:grid-cols-2 max-telefono:grid-cols-1">
				{alta.listas
					.filter((lista) => captura.canales[canalDeLista[lista.tipo] ?? "mostrador"])
					.map((lista) => (
						<Campo
							key={lista.id}
							etiqueta={`Precio para ${lista.nombre_corto ?? lista.nombre}`}
							inputMode="numeric"
							value={captura.precios[lista.id] ?? ""}
							onChange={(evento) => alCambiar({ precios: { ...captura.precios, [lista.id]: evento.target.value } })}
						/>
					))}
			</div>
		</div>
	);
}
