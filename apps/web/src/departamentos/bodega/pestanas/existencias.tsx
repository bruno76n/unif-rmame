/**
 * Existencias de Bodega: el buscador «Prenda y talla, o código», la sección, la escuela, «Copiar para Excel», los
 * filtros y, por producto (que se pliega, con la suma de cada columna), cada variante con sus piezas en Aduana, Bodega,
 * Tienda 1, Tienda 2 y el Taller (su color contra el mínimo y lo que tiene en diferencia), Tránsito, En camino a
 * aduana, el total, lo comprometido y lo libre. Cada variante abre su cajón. Se piden por páginas de productos.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Existencias»)
 *
 * Las cuentas y los colores llegan de `inventario.existencias`; la pantalla solo suma las columnas del producto.
 */

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
import { GrupoPlegable } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { type ColumnaDeTabla, Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Copy } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
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

/**
 * Una celda de ubicación: el número en su color, «Mínimo {n}» al pasar el puntero y lo que tiene en diferencia.
 * @param props La celda.
 */
function Celda({ celda }: { celda: Variante["celdas"][number] }) {
	const numero = String(celda.piezas);
	return (
		<span
			title={celda.minimo === null ? undefined : `Mínimo ${celda.minimo}`}
			className="inline-flex flex-col items-end"
		>
			{celda.tono === "rojo" || celda.tono === "ambar" ? (
				<TextoConTono tono={celda.tono}>{numero}</TextoConTono>
			) : celda.tono === "gris" ? (
				<TextoConTono tono="normal">{numero}</TextoConTono>
			) : (
				<span className="tabular-nums">{numero}</span>
			)}
			{celda.en_diferencia > 0 ? (
				<TextoConTono tono="ambar">{`${celda.en_diferencia} en diferencia`}</TextoConTono>
			) : null}
		</span>
	);
}

/**
 * Las columnas de la tabla de un producto, con la suma del producto abajo.
 * @param variantes Las variantes del producto.
 */
function columnas(variantes: readonly Variante[]): ColumnaDeTabla<Variante>[] {
	const suma = (valor: (variante: Variante) => number) =>
		variantes.reduce((total, variante) => total + valor(variante), 0);
	const numero = (
		clave: string,
		encabezado: string,
		valor: (variante: Variante) => number,
	): ColumnaDeTabla<Variante> => ({
		clave,
		encabezado,
		alinear: "derecha",
		celda: (variante) => valor(variante),
		suma: suma(valor),
	});
	return [
		{
			clave: "variante",
			encabezado: "Prenda y talla",
			celda: (variante) => <DosRenglones arriba={`Talla ${variante.talla}`} abajo={variante.codigo ?? ""} />,
			suma: "Suma",
		},
		...columnasDeExistencias.map(
			(codigo): ColumnaDeTabla<Variante> => ({
				clave: codigo,
				encabezado: nombresDeColumnas[codigo],
				alinear: "derecha",
				celda: (variante) => {
					const celda = variante.celdas.find((suya) => suya.codigo === codigo);
					return celda === undefined ? null : <Celda celda={celda} />;
				},
				suma: suma((variante) => variante.celdas.find((suya) => suya.codigo === codigo)?.piezas ?? 0),
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
 * Un producto: su grupo plegable con la tabla de sus variantes.
 * @param props El producto y qué hacer al tocar una variante.
 */
function GrupoDelProducto({ producto, alTocar }: { producto: Producto; alTocar: (varianteId: string) => void }) {
	const [abierto, setAbierto] = useState(true);
	const cuantas = producto.variantes.length;
	return (
		<GrupoPlegable
			titulo={`${producto.prenda} · ${producto.escuela}`}
			color="pizarra"
			cuantos={`${cuantas} ${cuantas === 1 ? "variante" : "variantes"}`}
			abierto={abierto}
			alCambiar={setAbierto}
		>
			<Tabla
				nombre={producto.prenda}
				filas={producto.variantes}
				claveDeFila={(variante) => variante.variante_id}
				alTocarFila={(variante) => alTocar(variante.variante_id)}
				columnas={columnas(producto.variantes)}
			/>
		</GrupoPlegable>
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
						{`${primera.resumen.variantes} variantes · ${primera.resumen.piezas} piezas`}
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
							{productos.map((producto) => (
								<GrupoDelProducto
									key={producto.producto_id}
									producto={producto}
									alTocar={(varianteId) => abrir("variante", varianteId)}
								/>
							))}
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
