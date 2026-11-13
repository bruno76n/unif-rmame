/**
 * El cajón «Ficha de producto» (ancho): los canales, la categoría para mayoreo y el flujo; la matriz «Tallas, códigos y
 * precios» con el precio base y el de cada talla por lista; «Agregar talla»; el precio para otra lista de cliente; la
 * receta y las medidas (de Patronaje, solo lectura); los cambios recientes; descontinuar o reactivar. Los canales, la
 * categoría, el flujo y los precios no se guardan al escribir: se juntan en «{n} cambios por aplicar» y van en un solo
 * «Aplicar cambios». Con cambios sin aplicar, cerrar, ir a Etiquetas, crear otro o abrir la receta no sale.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Ficha de producto») y docs/modulos/catalogo/productos.md
 */

import { useRouter } from "@tanstack/react-router";
import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { avisosDeLaFicha } from "@uniformame/compartido/calculos/precios";
import { fichaDeProducto } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { aplicarCambiosProducto } from "@uniformame/compartido/contratos/catalogo/precios";
import {
	agregarTalla,
	darBajaTalla,
	descontinuarTalla,
	reactivarProducto,
	reactivarTalla,
	subirFotoProducto,
} from "@uniformame/compartido/contratos/catalogo/productos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { BotonDeArchivo } from "@uniformame/interfaz/botones/boton-de-archivo";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Interruptor } from "@uniformame/interfaz/captura/interruptor";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Shirt } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { z } from "zod";
import { leerFalla, subirArchivo, useConsulta } from "../../../comun/api.tsx";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { usePreguntarAntesDeSalir } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { errorDeCampo, esperar, type Salida, useAccionDeCatalogo } from "../acciones.ts";
import { conAlta, sinCajon, useIr } from "../direccion.ts";
import { cuantos, diaCorto, diaYHora, escuelaOBasico, pesos, textoDeLoQueDetiene } from "../textos.ts";
import { VentanaDescontinuar } from "../ventanas/descontinuar.tsx";

/** Lo que regresa la ficha. */
type Ficha = z.infer<typeof fichaDeProducto.resultado>;

/** Los canales de un producto. */
type Canal = "mostrador" | "en_linea" | "externos";

/** Cómo se dice un canal en los cambios por aplicar, como la bitácora. */
const canalEnCambio: Readonly<Record<Canal, string>> = {
	mostrador: "en mostrador",
	en_linea: "en línea",
	externos: "a externos",
};

/** Lo que se ha cambiado en la ficha y falta aplicar. */
interface Pendientes {
	canales: Partial<Record<Canal, boolean>>;
	categoria?: string | undefined;
	flujo?: string | undefined;
	/** Por `lista:variante` (o `lista:base`), lo que se escribió. */
	precios: Record<string, string>;
}

/** La llave de una cajita de precio. */
const llaveDePrecio = (listaId: string, varianteId: string | null) => `${listaId}:${varianteId ?? "base"}`;

/** Lo que dice el texto del mensaje de choque. */
const aplicarSinCambios: Pendientes = { canales: {}, precios: {} };

/**
 * El cajón de la ficha de un producto.
 * @param props El producto.
 */
export function CajonFichaDeProducto({ productoId }: { productoId: string }) {
	const ir = useIr();
	const consulta = useConsulta(fichaDeProducto, { producto_id: productoId });
	const [pendientes, setPendientes] = useState<Pendientes>(aplicarSinCambios);
	const [choque, setChoque] = useState(false);
	const avisar = useAvisar();
	const hayCambios =
		Object.keys(pendientes.canales).length > 0 ||
		pendientes.categoria !== undefined ||
		pendientes.flujo !== undefined ||
		Object.keys(pendientes.precios).length > 0;
	const pregunta = usePreguntarAntesDeSalir(hayCambios);
	/** Sale del cajón (o va a otro lado) solo sin cambios por aplicar. */
	const salir = (hacer: () => void) => () => {
		if (hayCambios) avisar("Tienes cambios sin aplicar. Aplícalos o descártalos antes de cerrar", "no_se_pudo");
		else hacer();
	};
	const ficha = consulta.data;
	const titulo = ficha?.producto.nombre ?? "";
	return (
		<>
			<Cajon
				abierto
				ancho
				alCerrar={salir(() => ir(sinCajon))}
				{...(ficha === undefined ? {} : { contexto: contextoDe(ficha) })}
				titulo={titulo}
				pieIzquierda={
					hayCambios ? (
						<Boton variante="fantasma" onClick={() => setPendientes(aplicarSinCambios)}>
							Descartar cambios
						</Boton>
					) : (
						// Sin cambios, «Listo» cierra a la derecha: no hace falta otro «Cerrar».
						<span />
					)
				}
				accion={
					ficha === undefined ? null : hayCambios ? (
						<AplicarCambios
							ficha={ficha}
							pendientes={pendientes}
							alAplicar={() => {
								setPendientes(aplicarSinCambios);
								setChoque(false);
							}}
							alChocar={() => {
								setChoque(true);
								void consulta.refetch();
							}}
						/>
					) : (
						<span className="flex flex-wrap justify-end gap-2">
							<Boton onClick={salir(() => ir({ ...sinCajon, etiquetas_de: productoId }, "etiquetas"))}>Etiquetas</Boton>
							<Boton onClick={salir(() => ir(conAlta({ base: productoId })))}>Crear otro a partir de este</Boton>
							<Boton variante="principal" onClick={() => ir(sinCajon)}>
								Listo
							</Boton>
						</span>
					)
				}
			>
				<SegunConsulta consulta={consulta}>
					{(datos) => (
						<CuerpoDeLaFicha
							ficha={datos}
							pendientes={pendientes}
							alCambiar={setPendientes}
							choque={choque}
							salir={salir}
						/>
					)}
				</SegunConsulta>
			</Cajon>
			{pregunta}
		</>
	);
}

/**
 * El encabezado chico: «{sección} · {escuela o Básico}», «Descontinuado» y lo que lo detiene.
 * @param ficha La ficha.
 */
function contextoDe(ficha: Ficha): string {
	const partes = [ficha.producto.seccion.nombre, escuelaOBasico(ficha.producto.escuela?.nombre)];
	for (const detiene of ficha.detiene) partes.push(textoDeLoQueDetiene(detiene));
	return partes.join(" · ");
}

/**
 * El precio que se escribió en una cajita, en centavos: vacío es `null`; algo que no es pesos enteros, `undefined`.
 * @param texto Lo que se escribió.
 */
function leerPrecio(texto: string): number | null | undefined {
	if (texto.trim() === "") return null;
	const centavos = pesosACentavos(texto);
	return centavos === null || centavos <= 0 || centavos % 100 !== 0 ? undefined : centavos;
}

/** Un cambio por aplicar, con su texto y lo que manda a la acción. */
interface CambioPorAplicar {
	texto: string;
	error?: string;
}

/**
 * Los cambios por aplicar, con su texto como la bitácora y los errores que bloquean.
 * @param ficha La ficha.
 * @param pendientes Lo que se cambió.
 */
function cambiosPorAplicar(ficha: Ficha, pendientes: Pendientes): CambioPorAplicar[] {
	const cambios: CambioPorAplicar[] = [];
	for (const [canal, prendido] of Object.entries(pendientes.canales) as [Canal, boolean][]) {
		cambios.push({ texto: `${prendido ? "Empieza a" : "Deja de"} venderse ${canalEnCambio[canal]}` });
	}
	const nombreDeCategoria = (id: string) => ficha.categorias.find((categoria) => categoria.id === id)?.nombre ?? "";
	if (pendientes.categoria !== undefined) {
		cambios.push({
			texto: `Categoría de mayoreo: ${nombreDeCategoria(ficha.producto.categoria_mayoreo_id)} a ${nombreDeCategoria(pendientes.categoria)}`,
		});
	}
	if (pendientes.flujo !== undefined) {
		const nombreDeFlujo = (id: string | null) => ficha.flujos.find((flujo) => flujo.id === id)?.nombre ?? "sin flujo";
		cambios.push({ texto: `Flujo: ${nombreDeFlujo(ficha.producto.flujo_id)} a ${nombreDeFlujo(pendientes.flujo)}` });
	}
	for (const [llave, texto] of Object.entries(pendientes.precios)) {
		const [listaId = "", varianteId = "base"] = llave.split(":");
		const lista = ficha.listas.find((una) => una.id === listaId)?.nombre ?? "";
		const talla = ficha.variantes.find((variante) => variante.id === varianteId)?.talla;
		const donde = talla === undefined ? `Precio de ${lista}` : `Precio de ${lista}, talla ${talla}`;
		const antes = ficha.precios.find(
			(precio) => precio.lista_id === listaId && (precio.variante_id ?? "base") === varianteId,
		)?.precio_centavos;
		const despues = leerPrecio(texto);
		if (despues === undefined) {
			cambios.push({ texto: donde, error: `El precio de ${lista} debe ser un número entero.` });
		} else if (despues === null) {
			cambios.push({ texto: antes === undefined ? donde : `${donde}: se quita (era ${pesos(antes)})` });
		} else {
			cambios.push({
				texto:
					antes === undefined ? `${donde}: ${pesos(despues)} (nuevo)` : `${donde}: ${pesos(antes)} a ${pesos(despues)}`,
			});
		}
	}
	return cambios;
}

/**
 * Los «Ojo» que no bloquean, con la cuenta del paquete compartido: Mayoreo arriba de Mostrador en una talla y un precio
 * que cambia más de `catalogo.aviso_cambio_precio_pct`.
 * @param ficha La ficha.
 * @param pendientes Lo que se cambió.
 */
function ojosDe(ficha: Ficha, pendientes: Pendientes): string[] {
	const vigente = (listaId: string, varianteId: string | null) =>
		ficha.precios.find((precio) => precio.lista_id === listaId && precio.variante_id === varianteId)?.precio_centavos ??
		null;
	const despues = (listaId: string, varianteId: string | null) => {
		const escrito = pendientes.precios[llaveDePrecio(listaId, varianteId)];
		const leido = escrito === undefined ? vigente(listaId, varianteId) : leerPrecio(escrito);
		return leido ?? null;
	};
	const cambios = Object.entries(pendientes.precios).map(([llave, texto]) => {
		const [listaId = "", varianteId = "base"] = llave.split(":");
		return {
			lista: ficha.listas.find((lista) => lista.id === listaId)?.nombre ?? "",
			antes: vigente(listaId, varianteId === "base" ? null : varianteId),
			despues: leerPrecio(texto) ?? null,
		};
	});
	const mostrador = ficha.listas.find((lista) => lista.tipo === "mostrador")?.id;
	const mayoreo = ficha.listas.find((lista) => lista.tipo === "mayoreo")?.id;
	const porTalla =
		mostrador === undefined || mayoreo === undefined
			? []
			: ficha.variantes
					.filter((variante) => !variante.es_pedido_especial && variante.estado !== "baja")
					.map((variante) => ({
						mayoreo: despues(mayoreo, variante.id) ?? despues(mayoreo, null),
						mostrador: despues(mostrador, variante.id) ?? despues(mostrador, null),
					}));
	return avisosDeLaFicha(cambios, porTalla, ficha.aviso_cambio_precio_pct);
}

/**
 * «Aplicar cambios» → `catalogo.aplicar_cambios_producto`, con la versión de la ficha.
 * @param props La ficha, lo que se cambió y qué hacer al aplicar o al chocar con otro cambio.
 */
function AplicarCambios({
	ficha,
	pendientes,
	alAplicar,
	alChocar,
}: {
	ficha: Ficha;
	pendientes: Pendientes;
	alAplicar: () => void;
	alChocar: () => void;
}) {
	const accion = useAccionDeCatalogo(aplicarCambiosProducto);
	const conConexion = useConConexion();
	const conErrores = cambiosPorAplicar(ficha, pendientes).some((cambio) => cambio.error !== undefined);
	const aplicar = async () => {
		const precios = Object.entries(pendientes.precios).map(([llave, texto]) => {
			const [listaId = "", varianteId = "base"] = llave.split(":");
			return {
				lista_id: listaId,
				variante_id: varianteId === "base" ? null : varianteId,
				precio_centavos: leerPrecio(texto) ?? null,
			};
		});
		const salida = await esperar(
			accion.mutateAsync({
				datos: {
					producto_id: ficha.producto.id,
					...(Object.keys(pendientes.canales).length === 0 ? {} : { canales: pendientes.canales }),
					...(pendientes.categoria === undefined ? {} : { categoria_mayoreo_id: pendientes.categoria }),
					...(pendientes.flujo === undefined ? {} : { flujo_id: pendientes.flujo }),
					...(precios.length === 0 ? {} : { precios }),
				},
				version: ficha.producto.version,
			}),
		);
		if (salida.bien) alAplicar();
		else if (salida.falla.tipo === "choque") alChocar();
	};
	return (
		<Boton
			variante="principal"
			disabled={conErrores || accion.isPending || !conConexion}
			onClick={() => void aplicar()}
		>
			Aplicar cambios
		</Boton>
	);
}

/**
 * Un bloque de la ficha con su título.
 * @param props Su título, lo de la derecha y su contenido.
 */
function Bloque({ titulo, derecha, children }: { titulo: string; derecha?: ReactNode; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-3 border-linea border-t pt-4">
			<header className="flex flex-wrap items-baseline gap-3">
				<h3 className="m-0 font-bold text-subtitulo">{titulo}</h3>
				{derecha === undefined ? null : <span className="text-etiqueta text-tinta2">{derecha}</span>}
			</header>
			{children}
		</section>
	);
}

/**
 * El cuerpo de la ficha.
 * @param props La ficha, lo que se cambió, cómo cambiarlo, si chocó con otro cambio y cómo salir.
 */
function CuerpoDeLaFicha({
	ficha,
	pendientes,
	alCambiar,
	choque,
	salir,
}: {
	ficha: Ficha;
	pendientes: Pendientes;
	alCambiar: (cambiar: (antes: Pendientes) => Pendientes) => void;
	choque: boolean;
	salir: (hacer: () => void) => () => void;
}) {
	const router = useRouter();
	const { producto } = ficha;
	const canal = (cual: Canal) => pendientes.canales[cual] ?? producto.canales[cual];
	const cambiarCanal = (cual: Canal, prendido: boolean) =>
		alCambiar((antes) => {
			const canales = { ...antes.canales };
			if (prendido === producto.canales[cual]) delete canales[cual];
			else canales[cual] = prendido;
			return { ...antes, canales };
		});
	const categoria = pendientes.categoria ?? producto.categoria_mayoreo_id;
	const descripcionDeCategoria = ficha.categorias.find((una) => una.id === categoria)?.descripcion ?? "";
	const conReceta = ficha.receta !== null;
	const cambios = cambiosPorAplicar(ficha, pendientes);
	const ojos = ojosDe(ficha, pendientes);
	return (
		<div className="flex flex-col gap-5">
			{choque ? <EstadoDePantalla tipo="choque" documento={producto.nombre} /> : null}
			<div className="grid grid-cols-[180px_1fr] gap-5 max-telefono:grid-cols-1">
				<FotoDelProducto producto={producto} />
				<div className="flex flex-col gap-3">
					<Interruptor
						etiqueta="Mostrador · Tienda 1 y Tienda 2"
						prendido={canal("mostrador")}
						deshabilitado={producto.descontinuado}
						alCambiar={(prendido) => cambiarCanal("mostrador", prendido)}
					/>
					<Interruptor
						etiqueta={
							producto.escuela === null && !producto.es_servicio
								? "En línea · Se puede vender en uniformame.mx. Publicarlo lo decide su panel"
								: "En línea · Solo productos de «Ninguna escuela»"
						}
						prendido={canal("en_linea")}
						deshabilitado={producto.descontinuado || producto.escuela !== null || producto.es_servicio}
						alCambiar={(prendido) => cambiarCanal("en_linea", prendido)}
					/>
					<Interruptor
						etiqueta={
							!canal("externos")
								? "Ventas a externos · No se cotiza a clientes"
								: producto.escuela === null
									? "Ventas a externos · Mayoristas, con su lista"
									: `Ventas a externos · Con la lista de ${producto.escuela.nombre}`
						}
						prendido={canal("externos")}
						deshabilitado={producto.descontinuado}
						alCambiar={(prendido) => cambiarCanal("externos", prendido)}
					/>
					<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
						<div>
							<Selector
								etiqueta="Categoría para mayoreo"
								opciones={ficha.categorias.map((una) => ({ valor: una.id, texto: una.nombre }))}
								value={categoria}
								disabled={producto.descontinuado}
								onChange={(evento) => {
									const elegida = evento.target.value;
									alCambiar((antes) => ({
										...antes,
										...(elegida === producto.categoria_mayoreo_id ? { categoria: undefined } : { categoria: elegida }),
									}));
								}}
							/>
							<p className="m-0 mt-1 text-etiqueta text-tinta2">{descripcionDeCategoria}</p>
						</div>
						{conReceta ? (
							<Selector
								etiqueta="Flujo de Producción"
								vacio="Sin flujo"
								opciones={ficha.flujos.map((uno) => ({ valor: uno.id, texto: uno.nombre }))}
								value={pendientes.flujo ?? producto.flujo_id ?? ""}
								disabled={producto.descontinuado}
								onChange={(evento) => {
									const elegido = evento.target.value;
									alCambiar((antes) => ({
										...antes,
										...(elegido === "" || elegido === producto.flujo_id ? { flujo: undefined } : { flujo: elegido }),
									}));
								}}
							/>
						) : null}
					</div>
				</div>
			</div>
			<MatrizDeTallas ficha={ficha} pendientes={pendientes} alCambiar={alCambiar} />
			{conReceta && ficha.receta !== null ? (
				<Bloque titulo="Receta">
					<p className="m-0 font-semibold">
						{ficha.receta.estado === "verificada"
							? "Receta verificada contra corte"
							: ficha.receta.estado === "sin_verificar"
								? "Receta capturada, sin verificar"
								: "Sin receta"}
					</p>
					{ficha.receta.version === null ? null : (
						<p className="m-0 text-tinta2">
							{[
								ficha.receta.tela === null
									? null
									: `${ficha.receta.tela}: ${ficha.receta.metros ?? "—"} m por prenda en talla ${ficha.receta.talla ?? "—"}`,
								cuantos(ficha.receta.avios, "avío", "avíos"),
								`versión ${ficha.receta.version}`,
							]
								.filter((parte) => parte !== null)
								.join(" · ")}
						</p>
					)}
					{ficha.puede_patronaje ? (
						<div>
							<Boton
								variante="secundario"
								onClick={salir(() => router.history.push(`/patronaje/recetas?cajon=receta&id=${producto.id}`))}
							>
								{ficha.receta.estado === "sin_receta" ? "Capturar receta" : "Abrir receta"}
							</Boton>
						</div>
					) : null}
				</Bloque>
			) : null}
			{conReceta && ficha.medidas.length > 0 ? (
				<Bloque titulo="Medidas de la prenda" derecha="En centímetros">
					<div className="overflow-x-auto">
						<table className="w-full border-collapse text-etiqueta">
							<thead>
								<tr className="bg-suave">
									<th className="px-2 py-1.5 text-left font-semibold">Medida</th>
									{(ficha.medidas[0]?.valores ?? []).map((valor) => (
										<th key={valor.talla} className="px-2 py-1.5 text-right font-semibold">
											{valor.talla}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{ficha.medidas.map((medida) => (
									<tr key={medida.medida} className="border-linea border-b">
										<td className="px-2 py-1.5">{medida.medida}</td>
										{medida.valores.map((valor) => (
											<td key={valor.talla} className="px-2 py-1.5 text-right tabular-nums">
												{valor.valor_cm}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Bloque>
			) : null}
			<Bloque titulo="Cambios recientes">
				{ficha.cambios.length === 0 ? (
					<p className="m-0 text-tinta2">Todavía no hay cambios registrados.</p>
				) : (
					<ul className="m-0 flex list-none flex-col gap-2 p-0">
						{ficha.cambios.map((cambio) => (
							<li key={`${cambio.ocurrido_en}-${cambio.descripcion}`} className="flex flex-col">
								<span>{cambio.descripcion}</span>
								<span className="text-etiqueta text-tinta2">{`${diaYHora(cambio.ocurrido_en)} · ${cambio.quien}`}</span>
							</li>
						))}
					</ul>
				)}
			</Bloque>
			<DescontinuarOReactivar ficha={ficha} />
			{cambios.length === 0 ? null : (
				<div className="sticky bottom-0 flex flex-col gap-1.5 rounded-grande bg-tinta px-4 py-3 text-white">
					<b>{cuantos(cambios.length, "cambio por aplicar", "cambios por aplicar")}</b>
					<ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-etiqueta">
						{cambios.map((cambio) => (
							<li
								key={cambio.texto}
								className={cambio.error === undefined ? undefined : "font-semibold text-estado-rojo"}
							>
								{cambio.error ?? cambio.texto}
							</li>
						))}
						{ojos.map((ojo) => (
							<li key={ojo} className="font-semibold text-estado-ambar">
								{ojo}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

/**
 * La foto de referencia del producto, con «Subir foto» o «Cambiar foto»: sube el archivo y lo guarda en el momento con
 * `catalogo.subir_foto_producto`; el aviso dice lo que regresa.
 * @param props El producto de la ficha.
 */
function FotoDelProducto({ producto }: { producto: Ficha["producto"] }) {
	const avisar = useAvisar();
	const conConexion = useConConexion();
	const guardar = useAccionDeCatalogo(subirFotoProducto);
	const [subiendo, setSubiendo] = useState(false);
	/** Sube la foto escogida y la guarda; si no se puede, el aviso dice por qué. */
	const subir = async (archivo: File) => {
		setSubiendo(true);
		try {
			const archivoId = await subirArchivo("foto", "catalogo", archivo);
			await esperar(
				guardar.mutateAsync({
					datos: { producto_id: producto.id, archivo_id: archivoId },
					version: producto.version,
				}),
			);
		} catch (error) {
			const falla = leerFalla(error);
			avisar(falla.tipo === "regla" ? falla.mensaje : "La foto no se subió. Intenta otra vez.", "no_se_pudo");
		} finally {
			setSubiendo(false);
		}
	};
	return (
		<div className="flex flex-col gap-2">
			<div className="grid h-44 place-items-center rounded-grande bg-suave text-tinta3">
				{producto.foto_archivo_id === null ? (
					<span className="flex flex-col items-center gap-2 text-etiqueta">
						<Shirt aria-hidden="true" size={32} />
						Sin foto
					</span>
				) : (
					<img
						src={`/v1/archivos/${producto.foto_archivo_id}`}
						alt={`Foto de ${producto.nombre}`}
						className="size-full rounded-grande object-cover"
					/>
				)}
			</div>
			<BotonDeArchivo
				variante="secundario"
				chico
				acepta="image/jpeg,image/png,image/webp"
				disabled={!conConexion || subiendo}
				alEscoger={(archivo) => void subir(archivo)}
			>
				{producto.foto_archivo_id === null ? "Subir foto" : "Cambiar foto"}
			</BotonDeArchivo>
		</div>
	);
}

/**
 * La matriz «Tallas, códigos y precios»: el precio base y cada talla por lista, sus acciones, «Agregar talla» y «Precio
 * para otra lista de cliente».
 * @param props La ficha, lo que se cambió y cómo cambiarlo.
 */
function MatrizDeTallas({
	ficha,
	pendientes,
	alCambiar,
}: {
	ficha: Ficha;
	pendientes: Pendientes;
	alCambiar: (cambiar: (antes: Pendientes) => Pendientes) => void;
}) {
	const { producto } = ficha;
	const [otras, setOtras] = useState<string[]>([]);
	const [ventana, setVentana] = useState<
		{ cual: "descontinuar" | "baja"; variante: Ficha["variantes"][number] } | undefined
	>(undefined);
	const reactivar = useAccionDeCatalogo(reactivarTalla);
	const descontinuar = useAccionDeCatalogo(descontinuarTalla);
	const darBaja = useAccionDeCatalogo(darBajaTalla);
	const conConexion = useConConexion();
	const columnas = [
		...ficha.listas,
		...ficha.otras_listas
			.filter((lista) => otras.includes(lista.id))
			.map((lista) => ({ ...lista, tipo: "cliente" as const })),
	];
	const precioDe = (listaId: string, varianteId: string | null) =>
		ficha.precios.find((precio) => precio.lista_id === listaId && precio.variante_id === varianteId)?.precio_centavos;
	const escribir = (listaId: string, varianteId: string | null, texto: string) =>
		alCambiar((antes) => {
			const precios = { ...antes.precios };
			const llave = llaveDePrecio(listaId, varianteId);
			const vigente = precioDe(listaId, varianteId);
			if ((vigente === undefined && texto.trim() === "") || leerPrecio(texto) === vigente) delete precios[llave];
			else precios[llave] = texto;
			return { ...antes, precios };
		});
	const cajita = (listaId: string, varianteId: string | null, etiqueta: string, base?: number) => {
		const vigente = precioDe(listaId, varianteId);
		return (
			<Campo
				etiqueta={etiqueta}
				inputMode="numeric"
				placeholder={base === undefined ? "" : pesos(base)}
				disabled={producto.descontinuado}
				value={
					pendientes.precios[llaveDePrecio(listaId, varianteId)] ?? (vigente === undefined ? "" : String(vigente / 100))
				}
				onChange={(evento) => escribir(listaId, varianteId, evento.target.value)}
			/>
		);
	};
	const vivas = ficha.variantes.filter((variante) => variante.estado !== "baja");
	const porPedido = vivas.filter((variante) => variante.es_pedido_especial).length;
	return (
		<Bloque
			titulo="Tallas, códigos y precios"
			derecha={`${cuantos(vivas.length, "variante", "variantes")}, ${porPedido} por pedido`}
		>
			<div className="overflow-x-auto">
				<table aria-label="Tallas, códigos y precios" className="w-full border-collapse">
					<thead>
						<tr className="h-encabezado-tabla bg-suave text-etiqueta text-tinta3">
							<th className="px-2 text-left font-semibold">Talla</th>
							<th className="px-2 text-left font-semibold">Código</th>
							<th className="px-2 text-right font-semibold">En toda la fábrica</th>
							{columnas.map((lista) => (
								<th key={lista.id} className="min-w-28 px-2 text-left font-semibold">
									{lista.nombre}
								</th>
							))}
							<th className="px-2" aria-label="Acciones" />
						</tr>
					</thead>
					<tbody>
						<tr className="border-linea border-b">
							<td className="px-2 py-2" colSpan={3}>
								<b>Precio base</b>
								<p className="m-0 text-etiqueta text-tinta2">
									{`Lo toma cada talla que no tenga el suyo. Las de pedido especial suman ${pesos(producto.recargo_centavos)}.`}
								</p>
							</td>
							{columnas.map((lista) => (
								<td key={lista.id} className="px-2 py-2">
									{cajita(lista.id, null, `Precio base · ${lista.nombre}`)}
								</td>
							))}
							<td />
						</tr>
						{ficha.variantes.map((variante) => (
							<tr key={variante.id} className="border-linea border-b">
								<td className="px-2 py-2">
									<b>{variante.talla}</b>
									{variante.es_pedido_especial ? (
										<span className="block text-etiqueta text-tinta2">Pedido especial</span>
									) : null}
									{variante.estado === "descontinuada" ? (
										<span className="block text-etiqueta text-texto-advertencia">Descontinuada</span>
									) : null}
								</td>
								<td className="px-2 py-2 font-mono">
									{variante.codigo}
									{variante.estado === "baja" ? (
										<span className="block text-etiqueta text-tinta3">retirado</span>
									) : null}
								</td>
								<td className="px-2 py-2 text-right tabular-nums">
									<Existencia variante={variante} pocas={ficha.pocas_piezas} />
								</td>
								{variante.estado === "baja" ? (
									<td colSpan={columnas.length + 1} className="px-2 py-2 text-etiqueta text-tinta2">
										<b className="mr-2 text-tinta">Baja</b>
										{variante.baja === null
											? null
											: `Dada de baja el ${diaCorto(variante.baja.en)} por ${variante.baja.por}. ${variante.baja.motivo}. El código no se vuelve a usar.`}
									</td>
								) : (
									<>
										{columnas.map((lista) => (
											<td key={lista.id} className="px-2 py-2">
												{variante.es_pedido_especial && lista.tipo === "en_linea" ? (
													<span className="text-etiqueta text-tinta2">No se publica</span>
												) : variante.es_pedido_especial && lista.tipo === "mayoreo" ? (
													<span className="text-etiqueta text-tinta2">No aplica</span>
												) : variante.es_pedido_especial ? (
													<span className="text-etiqueta text-tinta2">{`Base + ${pesos(producto.recargo_centavos)}`}</span>
												) : (
													cajita(
														lista.id,
														variante.id,
														`Talla ${variante.talla} · ${lista.nombre}`,
														precioDe(lista.id, null),
													)
												)}
											</td>
										))}
										<td className="px-2 py-2">
											<span className="flex flex-col items-end gap-1">
												{variante.estado === "descontinuada" ? (
													<Boton
														chico
														variante="fantasma"
														disabled={reactivar.isPending || !conConexion}
														onClick={() =>
															void esperar(
																reactivar.mutateAsync({
																	datos: { variante_id: variante.id },
																	version: producto.version,
																}),
															)
														}
													>
														Reactivar talla
													</Boton>
												) : (
													<Boton
														chico
														variante="fantasma"
														onClick={() => setVentana({ cual: "descontinuar", variante })}
													>
														Descontinuar talla
													</Boton>
												)}
												<Boton chico variante="peligro" onClick={() => setVentana({ cual: "baja", variante })}>
													Dar de baja esta talla
												</Boton>
											</span>
										</td>
									</>
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<AgregarTalla ficha={ficha} />
			{producto.canales.externos && ficha.otras_listas.length > 0 ? (
				<div className="max-w-sm">
					<Selector
						etiqueta="Precio para otra lista de cliente"
						vacio="Escoge la lista"
						opciones={ficha.otras_listas
							.filter((lista) => !otras.includes(lista.id))
							.map((lista) => ({ valor: lista.id, texto: lista.nombre }))}
						value=""
						onChange={(evento) => {
							const elegida = evento.target.value;
							if (elegida !== "") setOtras((antes) => [...antes, elegida]);
						}}
					/>
				</div>
			) : null}
			{ventana === undefined ? null : (
				<VentanaConMotivo
					abierta
					alCerrar={() => setVentana(undefined)}
					titulo={
						ventana.cual === "baja"
							? `Dar de baja la talla ${ventana.variante.talla}`
							: `Descontinuar la talla ${ventana.variante.talla}`
					}
					textoAccion={ventana.cual === "baja" ? "Dar de baja" : "Descontinuar"}
					peligro={ventana.cual === "baja"}
					alConfirmar={async (motivo) => {
						const contrato = ventana.cual === "baja" ? darBaja : descontinuar;
						const salida = await esperar(
							contrato.mutateAsync({ datos: { variante_id: ventana.variante.id, motivo }, version: producto.version }),
						);
						if (salida.bien) {
							setVentana(undefined);
							return undefined;
						}
						return errorDeCampo(salida, "motivo") ?? (salida.falla.tipo === "regla" ? salida.falla.mensaje : undefined);
					}}
				>
					{ventana.cual === "baja" ? (
						<p className="m-0 text-tinta2">
							{`${producto.nombre}, ${escuelaOBasico(producto.escuela?.nombre)}. Código ${ventana.variante.codigo}.`}
						</p>
					) : (
						<p className="m-0 text-tinta2">Se vende hasta acabarla.</p>
					)}
				</VentanaConMotivo>
			)}
		</Bloque>
	);
}

/**
 * La existencia de una talla en toda la fábrica: verde, ámbar con pocas piezas, «Sin recibir» o «Pedido especial».
 * @param props La talla y `catalogo.pocas_piezas`.
 */
function Existencia({ variante, pocas }: { variante: Ficha["variantes"][number]; pocas: number }) {
	if (variante.existencia === null) {
		return <span className="text-tinta3">{variante.es_pedido_especial ? "Pedido especial" : "Sin recibir"}</span>;
	}
	return (
		<b className={variante.existencia <= pocas ? "text-texto-advertencia" : "text-texto-bien"}>{variante.existencia}</b>
	);
}

/**
 * «Agregar talla»: las tallas de sus grupos que no tiene, «Normal» o «Pedido especial» y «Agregar» →
 * `catalogo.agregar_talla`, con el código que le toca.
 * @param props La ficha.
 */
function AgregarTalla({ ficha }: { ficha: Ficha }) {
	const [talla, setTalla] = useState("");
	const [especial, setEspecial] = useState(false);
	const [salida, setSalida] = useState<Salida<unknown>>();
	const accion = useAccionDeCatalogo(agregarTalla);
	const conConexion = useConConexion();
	if (ficha.agregar.tallas.length === 0) {
		return <p className="m-0 text-tinta2">Ya tiene todas las tallas de su grupo.</p>;
	}
	const agregar = async () => {
		const resultado = await esperar(
			accion.mutateAsync({
				datos: { producto_id: ficha.producto.id, talla_id: talla, es_pedido_especial: especial },
				version: ficha.producto.version,
			}),
		);
		setSalida(resultado);
		if (resultado.bien) setTalla("");
	};
	return (
		<div className="flex flex-wrap items-end gap-3 rounded-mediano bg-suave p-3">
			<div className="min-w-56">
				<Selector
					etiqueta="Agregar talla"
					vacio="Escoge la talla"
					opciones={ficha.agregar.tallas.map((una) => ({
						valor: una.talla_id,
						texto: una.tuvo_baja ? `${una.talla}, tuvo baja, lleva código nuevo` : `${una.talla} (${una.grupo})`,
					}))}
					value={talla}
					error={errorDeCampo(salida, "talla_id")}
					onChange={(evento) => setTalla(evento.target.value)}
				/>
			</div>
			<Filtros
				nombre="Normal o pedido especial"
				filtros={[
					{ clave: "normal", texto: "Normal" },
					{ clave: "especial", texto: "Pedido especial" },
				]}
				activo={especial ? "especial" : "normal"}
				alEscoger={(clave) => setEspecial(clave === "especial")}
			/>
			<Boton
				variante="secundario"
				disabled={talla === "" || ficha.producto.descontinuado || accion.isPending || !conConexion}
				onClick={() => void agregar()}
			>
				Agregar
			</Boton>
			<span className="pb-3 text-etiqueta text-tinta2">{`Código ${ficha.agregar.siguiente_codigo ?? "—"}`}</span>
		</div>
	);
}

/**
 * «Descontinuar con motivo» o, si lo está, «Reactivar producto» → `catalogo.reactivar_producto`.
 * @param props La ficha.
 */
function DescontinuarOReactivar({ ficha }: { ficha: Ficha }) {
	const [abierta, setAbierta] = useState(false);
	const reactivar = useAccionDeCatalogo(reactivarProducto);
	const conConexion = useConConexion();
	const { producto } = ficha;
	return (
		<div className="flex justify-start">
			{producto.descontinuado ? (
				<Boton
					variante="secundario"
					disabled={reactivar.isPending || !conConexion}
					onClick={() =>
						void esperar(reactivar.mutateAsync({ datos: { producto_id: producto.id }, version: producto.version }))
					}
				>
					Reactivar producto
				</Boton>
			) : (
				<Boton variante="peligro" onClick={() => setAbierta(true)}>
					Descontinuar con motivo
				</Boton>
			)}
			<VentanaDescontinuar
				productos={[{ id: producto.id, version: producto.version, nombre: producto.nombre }]}
				abierta={abierta}
				alCerrar={() => setAbierta(false)}
				alTerminar={() => setAbierta(false)}
			/>
		</div>
	);
}
