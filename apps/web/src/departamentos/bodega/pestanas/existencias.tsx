/**
 * Existencias de Bodega: el buscador «Prenda y talla, o código», la sección, la escuela, «Copiar para Excel», los
 * filtros y una sola matriz: por producto (su renglón se pliega y lleva la suma de cada columna), cada variante con sus
 * piezas en Aduana, Bodega, Tienda 1, Tienda 2 y el Taller (su color contra el mínimo y lo que tiene en diferencia),
 * Tránsito, En camino a aduana, el total, lo comprometido y lo libre. Cada variante abre su cajón. Se piden por páginas
 * de productos.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Existencias»)
 *
 * Las cuentas y los colores llegan de `inventario.existencias`; la pantalla solo suma las columnas del producto.
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import {
	columnasDeExistencias,
	existenciasDeBodega,
	filtrosDeExistencias,
	type varianteDeExistencias,
} from "@uniformame/compartido/contratos/inventario/bodega";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Buscador } from "@uniformame/interfaz/captura/buscador";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { type ColumnaDeTabla, Tabla } from "@uniformame/interfaz/tablas/tabla";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { enteros } from "../comun.tsx";
import { useDireccionDeBodega } from "../direccion.ts";

/** Lo que regresa una página. */
type Existencias = z.infer<typeof existenciasDeBodega.resultado>;

/** Un producto de la tabla. */
type Producto = Existencias["renglones"][number];

/** Una variante de la tabla. */
type Variante = z.infer<typeof varianteDeExistencias>;

/** Cuántos productos pide cada página. */
const porPagina = 40;

/** El nombre de cada columna de ubicación. */
const nombresDeColumnas: Readonly<Record<(typeof columnasDeExistencias)[number], string>> = {
	ADU: "Aduana",
	BOD: "Bodega",
	T1: "Tienda 1",
	T2: "Tienda 2",
	TAL: "Taller",
};

/** El nombre de cada filtro. */
const nombresDeFiltros: Readonly<Record<(typeof filtrosDeExistencias)[number], string>> = {
	todas: "Todas",
	bajo_minimo: "Bajo mínimo",
	en_cero: "En cero",
	con_comprometido: "Con comprometido",
	con_diferencia: "Con diferencia",
};

/** Un renglón de la matriz: el de un producto (que se pliega, con la suma de cada columna) o el de una variante. */
type Renglon =
	| { tipo: "producto"; producto: Producto; abierto: boolean }
	| { tipo: "variante"; producto: Producto; variante: Variante };

/**
 * Una cifra de la matriz con su separador de miles; el cero, en gris en todas las columnas.
 * @param props La cifra y si va en negritas (la suma del producto).
 */
function Cifra({ valor, negritas = false }: { valor: number; negritas?: boolean }) {
	const texto = enteros.format(valor);
	if (valor === 0) return <span className="text-tinta3">{texto}</span>;
	return negritas ? <b>{texto}</b> : <span>{texto}</span>;
}

/** El color del número de una celda de ubicación, contra su mínimo. */
const claseDelTono: Readonly<Record<NonNullable<Variante["celdas"][number]["tono"]>, string>> = {
	rojo: "font-bold text-estado-rojo",
	ambar: "font-bold text-texto-advertencia",
	gris: "text-tinta3",
};

/**
 * Una celda de ubicación: el número en su color, «Mínimo {n}» al pasar el puntero y lo que tiene en diferencia.
 * @param props La celda.
 */
function Celda({ celda }: { celda: Variante["celdas"][number] }) {
	return (
		<span
			title={celda.minimo === null ? undefined : `Mínimo ${celda.minimo}`}
			className="inline-flex flex-col items-end"
		>
			<span className={celda.tono === null ? undefined : claseDelTono[celda.tono]}>{enteros.format(celda.piezas)}</span>
			{celda.en_diferencia > 0 ? (
				<TextoConTono tono="ambar">{`${enteros.format(celda.en_diferencia)} en diferencia`}</TextoConTono>
			) : null}
		</span>
	);
}

/**
 * Lo que tiene una variante en una ubicación.
 * @param variante La variante.
 * @param codigo La ubicación.
 */
function piezasEn(variante: Variante, codigo: (typeof columnasDeExistencias)[number]): number {
	return variante.celdas.find((suya) => suya.codigo === codigo)?.piezas ?? 0;
}

/**
 * La suma de una columna en las variantes de un producto: va en su renglón.
 * @param producto El producto.
 * @param valor Lo de cada variante.
 */
function sumaDe(producto: Producto, valor: (variante: Variante) => number): number {
	return producto.variantes.reduce((total, variante) => total + valor(variante), 0);
}

/**
 * El nombre del producto en su renglón: la flecha que lo pliega, el nombre y su escuela.
 * @param props El producto, si está abierto y qué hacer al plegarlo.
 */
function NombreDelProducto({
	producto,
	abierto,
	alCambiar,
}: {
	producto: Producto;
	abierto: boolean;
	alCambiar: () => void;
}) {
	const Flecha = abierto ? ChevronDown : ChevronRight;
	return (
		<span className="flex items-center gap-2">
			<button
				type="button"
				aria-expanded={abierto}
				aria-label={abierto ? `Plegar ${producto.prenda}` : `Abrir ${producto.prenda}`}
				onClick={(evento) => {
					// El renglón también pliega: el botón no lo repite.
					evento.stopPropagation();
					alCambiar();
				}}
				className="grid size-6 place-items-center rounded-chico text-tinta2 hover:bg-riel"
			>
				<Flecha aria-hidden="true" size={15} strokeWidth={1.9} />
			</button>
			<b>{producto.prenda}</b>
			<span className="text-etiqueta text-tinta3">{producto.escuela}</span>
		</span>
	);
}

/**
 * Las columnas de la matriz: en el renglón del producto, la suma de cada una; en el de la variante, lo suyo.
 * @param alPlegar Pliega o abre un producto.
 */
function columnas(alPlegar: (productoId: string) => void): ColumnaDeTabla<Renglon>[] {
	const numero = (
		clave: string,
		encabezado: string,
		valor: (variante: Variante) => number,
	): ColumnaDeTabla<Renglon> => ({
		clave,
		encabezado,
		alinear: "derecha",
		celda: (renglon) =>
			renglon.tipo === "producto" ? (
				<Cifra valor={sumaDe(renglon.producto, valor)} negritas />
			) : (
				<Cifra valor={valor(renglon.variante)} />
			),
	});
	return [
		{
			clave: "variante",
			encabezado: "Prenda y talla",
			celda: (renglon) =>
				renglon.tipo === "producto" ? (
					<NombreDelProducto
						producto={renglon.producto}
						abierto={renglon.abierto}
						alCambiar={() => alPlegar(renglon.producto.producto_id)}
					/>
				) : (
					<span className="flex items-baseline gap-3 pl-8">
						<b>{`Talla ${renglon.variante.talla}`}</b>
						<span className="text-etiqueta text-tinta3 tabular-nums">{renglon.variante.codigo ?? ""}</span>
					</span>
				),
		},
		...columnasDeExistencias.map(
			(codigo): ColumnaDeTabla<Renglon> => ({
				clave: codigo,
				encabezado: nombresDeColumnas[codigo],
				alinear: "derecha",
				celda: (renglon) => {
					if (renglon.tipo === "producto") {
						return <Cifra valor={sumaDe(renglon.producto, (variante) => piezasEn(variante, codigo))} negritas />;
					}
					const celda = renglon.variante.celdas.find((suya) => suya.codigo === codigo);
					return celda === undefined ? null : <Celda celda={celda} />;
				},
			}),
		),
		numero("transito", "Tránsito", (variante) => variante.transito),
		numero("en_camino", "En camino a aduana", (variante) => variante.en_camino),
		numero("total", "Total", (variante) => variante.total),
		numero("comprometido", "Comprometido", (variante) => variante.comprometido),
		numero("libre", "Libre", (variante) => variante.libre),
	];
}

/**
 * La matriz de existencias: una sola tabla, con el renglón de cada producto (que se pliega y lleva la suma de cada
 * columna) y abajo sus variantes. Tocar el producto lo pliega; tocar una variante abre su cajón.
 * @param props Los productos y qué hacer al tocar una variante.
 */
function MatrizDeExistencias({
	productos,
	alTocar,
}: {
	productos: readonly Producto[];
	alTocar: (varianteId: string) => void;
}) {
	const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set());
	const alPlegar = (productoId: string) =>
		setPlegados((antes) => {
			const despues = new Set(antes);
			if (despues.has(productoId)) despues.delete(productoId);
			else despues.add(productoId);
			return despues;
		});
	const renglones: Renglon[] = productos.flatMap((producto) => {
		const abierto = !plegados.has(producto.producto_id);
		return [
			{ tipo: "producto" as const, producto, abierto },
			...(abierto ? producto.variantes.map((variante) => ({ tipo: "variante" as const, producto, variante })) : []),
		];
	});
	return (
		<Panel>
			<Tabla
				nombre="Existencias"
				filas={renglones}
				claveDeFila={(renglon) =>
					renglon.tipo === "producto" ? `producto:${renglon.producto.producto_id}` : renglon.variante.variante_id
				}
				alTocarFila={(renglon) =>
					renglon.tipo === "producto" ? alPlegar(renglon.producto.producto_id) : alTocar(renglon.variante.variante_id)
				}
				columnas={columnas(alPlegar)}
			/>
		</Panel>
	);
}

/**
 * Lo filtrado, separado por tabuladores, para pegarlo en Excel: Código, Prenda, Escuela, Talla, las cinco ubicaciones,
 * Tránsito, En camino a aduana, Total, Comprometido y Libre.
 * @param productos Todos los productos de lo filtrado.
 */
function paraExcel(productos: readonly Producto[]): { texto: string; filas: number } {
	const encabezado = [
		"Código",
		"Prenda",
		"Escuela",
		"Talla",
		...columnasDeExistencias.map((codigo) => nombresDeColumnas[codigo]),
		"Tránsito",
		"En camino a aduana",
		"Total",
		"Comprometido",
		"Libre",
	];
	const filas = productos.flatMap((producto) =>
		producto.variantes.map((variante) =>
			[
				variante.codigo ?? "",
				variante.prenda,
				variante.escuela,
				variante.talla,
				...columnasDeExistencias.map((codigo) => variante.celdas.find((celda) => celda.codigo === codigo)?.piezas ?? 0),
				variante.transito,
				variante.en_camino,
				variante.total,
				variante.comprometido,
				variante.libre,
			].join("\t"),
		),
	);
	return { texto: [encabezado.join("\t"), ...filas].join("\n"), filas: filas.length };
}

/** Existencias de Bodega. */
export function ExistenciasDeBodega() {
	const { busqueda, navegar, abrir } = useDireccionDeBodega();
	const avisar = useAvisar();
	const filtro = busqueda.filtro ?? "todas";
	const parametros = {
		limite: porPagina,
		filtro,
		...(busqueda.texto === undefined ? {} : { texto: busqueda.texto }),
		...(busqueda.seccion === undefined ? {} : { seccion_id: busqueda.seccion }),
		...(busqueda.escuela === undefined ? {} : { escuela: busqueda.escuela }),
	};
	const paginas = usePaginas(existenciasDeBodega, parametros);
	const primera = paginas.data?.pages[0];
	/** Pide las páginas que falten y copia todo lo filtrado. */
	const copiar = async () => {
		let todas = paginas.data?.pages ?? [];
		while (todas.at(-1)?.hay_mas === true) {
			const siguiente = await paginas.fetchNextPage();
			if (siguiente.isError || siguiente.data === undefined) break;
			todas = siguiente.data.pages;
		}
		const { texto, filas } = paraExcel(todas.flatMap((pagina) => pagina.renglones));
		try {
			await navigator.clipboard.writeText(texto);
			avisar(`${filas} filas copiadas: pégalas en Excel`, "bien");
		} catch {
			avisar("No se pudo copiar desde aquí", "no_se_pudo");
		}
	};
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end gap-3">
				<div className="min-w-64 flex-1">
					<Buscador
						etiqueta="Buscar"
						ayuda="Prenda y talla, o código"
						valor={busqueda.texto ?? ""}
						alBuscar={(texto) => navegar({ texto })}
					/>
				</div>
				<Selector
					etiqueta="Sección"
					opciones={[
						{ valor: "", texto: "Todas las secciones" },
						...(primera?.secciones ?? []).map((seccion) => ({ valor: seccion.id, texto: seccion.nombre })),
					]}
					value={busqueda.seccion ?? ""}
					onChange={(evento) => navegar({ seccion: evento.target.value })}
				/>
				<Selector
					etiqueta="Escuela"
					opciones={[
						{ valor: "", texto: "Toda escuela o modelo" },
						{ valor: "basicos", texto: "Básicos, sin escuela" },
						...(primera?.escuelas ?? []).map((escuela) => ({ valor: escuela.id, texto: escuela.nombre })),
					]}
					value={busqueda.escuela ?? ""}
					onChange={(evento) => navegar({ escuela: evento.target.value })}
				/>
				<Boton icono={Copy} disabled={primera === undefined} onClick={() => void copiar()}>
					Copiar para Excel
				</Boton>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Filtros
					nombre="Filtros de existencias"
					filtros={filtrosDeExistencias.map((clave) => ({ clave, texto: nombresDeFiltros[clave] }))}
					activo={filtro}
					alEscoger={(clave) =>
						navegar({
							filtro: clave === "todas" ? undefined : filtrosDeExistencias.find((suyo) => suyo === clave),
						})
					}
				/>
				{primera === undefined ? null : (
					<span className="text-tinta3 tabular-nums">
						{`${plural(primera.resumen.variantes, "variante", "variantes")} · ${plural(primera.resumen.piezas, "pieza", "piezas")}`}
					</span>
				)}
			</div>
			<SegunConsulta consulta={paginas} renglones={8}>
				{({ pages }) => {
					const productos = pages.flatMap((pagina) => pagina.renglones);
					if (productos.length === 0) {
						return (
							<EstadoDePantalla
								tipo="vacio"
								texto={
									busqueda.texto === undefined
										? "Nada con este filtro"
										: `Nada con «${busqueda.texto}». Prueba con prenda y talla, como «polo 12», o con el código de la etiqueta.`
								}
							/>
						);
					}
					return (
						<div className="flex flex-col gap-3">
							<MatrizDeExistencias productos={productos} alTocar={(varianteId) => abrir("variante", varianteId)} />
							{paginas.hasNextPage ? (
								<Boton chico disabled={paginas.isFetchingNextPage} onClick={() => void paginas.fetchNextPage()}>
									Ver más
								</Boton>
							) : null}
						</div>
					);
				}}
			</SegunConsulta>
		</div>
	);
}
