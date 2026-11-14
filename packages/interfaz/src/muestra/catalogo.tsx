/**
 * El catálogo del sistema de diseño: todos los componentes en todos sus estados, dentro del armazón, con datos de
 * ejemplo. Lo abren su prueba (medidas, colores y capturas) y el revisor de diseño, junto a la muestra.
 * Fase 19 · docs/interfaz/DISENO.md («Los componentes») y docs/fases/19-web-principal.md (criterio de los componentes)
 *
 * Con `?abrir=cajon` o `?abrir=ventana` abre esos contenedores, para capturarlos solos.
 */

import {
	BarChart3,
	Barcode,
	Factory,
	Globe,
	LayoutDashboard,
	Package,
	Plus,
	ShoppingCart,
	Tag,
	Warehouse,
} from "lucide-react";
import { useState } from "react";
import { BarraAvance } from "../avance/barra-avance.tsx";
import { Hilo } from "../avance/hilo.tsx";
import { Pasos } from "../avance/pasos.tsx";
import { Boton } from "../botones/boton.tsx";
import { BotonConCifra } from "../botones/boton-con-cifra.tsx";
import { BotonDeArchivo } from "../botones/boton-de-archivo.tsx";
import { Enlace } from "../botones/enlace.tsx";
import { Campo } from "../captura/campo.tsx";
import { CampoDeArchivo } from "../captura/campo-de-archivo.tsx";
import { Casilla } from "../captura/casilla.tsx";
import { Filtros } from "../captura/filtros.tsx";
import { Interruptor } from "../captura/interruptor.tsx";
import { Selector } from "../captura/selector.tsx";
import { Cajon } from "../contenedores/cajon.tsx";
import { Ventana } from "../contenedores/ventana.tsx";
import { Aviso } from "../estados/aviso.tsx";
import { Estado } from "../estados/estado.tsx";
import { EstadoDePantalla } from "../estados/estado-de-pantalla.tsx";
import { Grafica } from "../graficas/grafica.tsx";
import { Armazon } from "../pagina/armazon.tsx";
import { BarraIndicadores } from "../pagina/barra-indicadores.tsx";
import { PaginaDepartamento } from "../pagina/pagina-departamento.tsx";
import { PanelPendientes, type Pendiente } from "../tablas/panel-pendientes.tsx";
import { Tabla } from "../tablas/tabla.tsx";

/** Un estado de cada color, para ver la paleta completa. */
export const estadosDeMuestra = [
	"Vencido",
	"Por surtir · sale hoy",
	"Por imprimir",
	"En tiempo",
	"Alcanza",
	"Borrador",
	"Listo en aduana",
	"Entrega parcial",
] as const;

/** Los pendientes de ejemplo. */
const pendientes: Pendiente[] = [
	{
		clave: "p1",
		grupo: "productos",
		tipo: { texto: "Modelo sin precio", icono: Tag, color: "rojo" },
		referencia: { titulo: "Bata blanca de laboratorio con escudo", detalle: "Modelo de cliente · Técnica 12" },
		estado: { texto: "Sin precio" },
		accion: { texto: "Abrir ficha", alTocar: () => undefined },
	},
	{
		clave: "p2",
		grupo: "etiquetas",
		tipo: { texto: "Etiquetas", icono: Barcode, color: "azul" },
		referencia: { titulo: "Playera polo blanca con escudo", detalle: "Tallas 8, 10, 12, 14, 16" },
		cifra: "9 variantes",
		estado: { texto: "Por imprimir" },
		accion: { texto: "Imprimir", alTocar: () => undefined },
	},
];

/** Las filas de la tabla de ejemplo. */
const filas = [
	{ id: "1", folio: "PE-0145", cliente: "Colegio Morelos", piezas: 160 },
	{ id: "2", folio: "PE-0146", cliente: "Instituto Juan Pablo II", piezas: 90 },
	{ id: "3", folio: "PE-0150", cliente: "Técnica 12", piezas: 40 },
];

/** El catálogo completo. */
export function Catalogo() {
	const abrir = new URLSearchParams(window.location.search).get("abrir");
	const [interruptor, setInterruptor] = useState(true);
	const [casilla, setCasilla] = useState(false);
	const [filtro, setFiltro] = useState("todos");
	const [pestana, setPestana] = useState("pendientes");
	const [aviso, setAviso] = useState(true);
	const [cajon, setCajon] = useState(abrir === "cajon");
	const [ventana, setVentana] = useState(abrir === "ventana");
	const departamento = (clave: string, nombre: string, icono: typeof Package, conteo: number | null, rojo = false) => ({
		clave,
		nombre,
		icono,
		conteo,
		rojo,
		activo: clave === "bodega",
		alTocar: () => undefined,
	});
	return (
		<Armazon
			grupos={[
				{ nombre: null, departamentos: [departamento("direccion", "Dirección", LayoutDashboard, 4)] },
				{
					nombre: "Operación",
					departamentos: [
						departamento("compras", "Compras", ShoppingCart, 7),
						departamento("linea", "Tienda en línea", Globe, 2, true),
					],
				},
				{
					nombre: "Almacén",
					departamentos: [
						departamento("aduana", "Aduana", Factory, null),
						departamento("bodega", "Bodega", Warehouse, 11, true),
					],
				},
			]}
			migas={["Almacén", "Bodega"]}
			cuenta={
				<span data-prueba="cuenta" className="flex items-center gap-2.5">
					<span className="grid size-8 place-items-center rounded-full bg-tinta font-bold text-white text-xs">CV</span>
					<span className="flex flex-col leading-tight">
						<b>Carmen Villaseñor</b>
						<span className="text-etiqueta text-tinta3">Administradora principal</span>
					</span>
				</span>
			}
			accion={
				<Boton variante="principal" icono={Plus}>
					Nuevo producto
				</Boton>
			}
		>
			<PaginaDepartamento
				titulo="Bodega"
				pestanas={[
					{ clave: "pendientes", texto: "Pendientes", conteo: 11, rojo: true },
					{ clave: "existencias", texto: "Existencias" },
					{ clave: "diferencias", texto: "Diferencias", conteo: 2 },
				]}
				activa={pestana}
				alEscoger={setPestana}
			>
				<BarraIndicadores
					cifras={[
						{
							clave: "surtir",
							nombre: "Por surtir",
							icono: Package,
							color: "ambar",
							numero: 6,
							unidad: "pedidos",
							contexto: [{ texto: "1 en línea sale hoy", tono: "rojo" }, { texto: "5 externos" }],
							serie: [3, 5, 2, 6],
							alTocar: () => undefined,
						},
						{
							clave: "avance",
							nombre: "Pedidos",
							icono: BarChart3,
							color: "azul",
							numero: 14,
							reparto: [
								{ etiqueta: "Entregado", valor: 5, color: "verde" },
								{ etiqueta: "En producción", valor: 7, color: "ambar" },
								{ etiqueta: "Vencido", valor: 2, color: "rojo" },
							],
							alTocar: () => undefined,
						},
					]}
				/>
				<PanelPendientes
					pendientes={pendientes}
					filtros={[
						{ clave: "todos", texto: "Todos", conteo: 2 },
						{ clave: "productos", texto: "Productos", conteo: 1, punto: "bg-rojo" },
						{ clave: "etiquetas", texto: "Etiquetas", conteo: 1, punto: "bg-azul" },
					]}
					filtro={filtro}
					alEscogerFiltro={setFiltro}
					columnaCifra="Cantidad"
				/>
				<section data-prueba="botones" className="flex flex-wrap items-center gap-3">
					<Boton variante="principal" data-prueba="boton-principal" onClick={() => setCajon(true)}>
						Abrir cajón
					</Boton>
					<Boton variante="secundario" onClick={() => setVentana(true)}>
						Abrir ventana
					</Boton>
					<Boton variante="fantasma">Cancelar</Boton>
					<Boton variante="peligro">Rechazar</Boton>
					<BotonDeArchivo variante="secundario" chico acepta="image/*" alEscoger={() => undefined}>
						Subir foto
					</BotonDeArchivo>
					<Boton variante="principal" chico data-prueba="boton-chico">
						Surtir
					</Boton>
					<Boton variante="principal" disabled>
						Guardar
					</Boton>
					<BotonConCifra cifra={3} texto="lotes en producción" icono={Factory} alTocar={() => undefined} />
					<BotonConCifra cifra={2} texto="solicitudes que la piden" />
					<Enlace onClick={() => undefined}>Llenar desde una talla</Enlace>
					<Enlace fuerte onClick={() => undefined}>
						PE-0150
					</Enlace>
				</section>
				<section data-prueba="estados" className="flex flex-wrap gap-3">
					{estadosDeMuestra.map((texto) => (
						<Estado key={texto} texto={texto} />
					))}
					<Estado texto="En producción" abajo="Atrasado 3 días" />
				</section>
				<section className="grid max-w-[720px] grid-cols-2 gap-4 max-telefono:grid-cols-1">
					<Campo etiqueta="Folio" placeholder="PE-0145" data-prueba="campo" />
					<Campo etiqueta="Motivo" defaultValue="No" error="Escribe al menos 5 letras." data-prueba="campo-error" />
					<CampoDeArchivo
						etiqueta="Comprobante"
						acepta="image/*,application/pdf"
						archivo={null}
						alEscoger={() => undefined}
					/>
					<Selector
						etiqueta="Ubicación"
						vacio="Todas"
						opciones={[
							{ valor: "bod", texto: "Bodega" },
							{ valor: "adu", texto: "Aduana" },
						]}
					/>
					<div className="flex flex-col justify-end gap-3">
						<Interruptor etiqueta="Se vende en línea" prendido={interruptor} alCambiar={setInterruptor} />
						<Casilla etiqueta="R-0432 · 88.5 m" marcada={casilla} alCambiar={setCasilla} />
					</div>
				</section>
				<Filtros
					nombre="Filtrar ejemplo"
					filtros={[
						{ clave: "todos", texto: "Todos", conteo: 5 },
						{ clave: "uno", texto: "Productos", conteo: 3, punto: "bg-rojo" },
					]}
					activo="todos"
					alEscoger={() => undefined}
				/>
				<section data-prueba="tabla" className="rounded-grande bg-panel p-4 shadow-panel">
					<Tabla
						nombre="Pedidos de ejemplo"
						filas={filas}
						claveDeFila={(fila) => fila.id}
						alSeleccionar={() => undefined}
						columnas={[
							{
								clave: "folio",
								encabezado: "Folio",
								celda: (fila) => <b>{fila.folio}</b>,
								ordenarPor: (fila) => fila.folio,
							},
							{
								clave: "cliente",
								encabezado: "Cliente",
								celda: (fila) => fila.cliente,
								ordenarPor: (fila) => fila.cliente,
							},
							{
								clave: "piezas",
								encabezado: "Piezas",
								alinear: "derecha",
								celda: (fila) => fila.piezas,
								ordenarPor: (fila) => fila.piezas,
								suma: 290,
							},
						]}
					/>
				</section>
				<section className="flex flex-col gap-4 rounded-grande bg-panel p-4 shadow-panel">
					<Hilo
						paradas={[
							{ parada: "pedido", piezas: 160, linea: "10 por mandar", tono: "ambar" },
							{ parada: "corte", piezas: 150, linea: "13 oct", tono: "normal" },
							{ parada: "costura", piezas: 40, linea: "40 de 150 listas", tono: "ambar" },
							{ parada: "calidad", piezas: 0, linea: "", tono: "normal" },
							{ parada: "aduana", piezas: 0, linea: "", tono: "normal" },
							{ parada: "entrega", piezas: 0, linea: "para el 20 nov", tono: "normal" },
						]}
					/>
					<BarraAvance
						segmentos={[
							{ etiqueta: "Entregado", valor: 70, color: "verde" },
							{ etiqueta: "Listo en aduana", valor: 20, color: "morado" },
							{ etiqueta: "En producción", valor: 70, color: "ambar" },
						]}
					/>
					<Pasos pasos={["Borrador", "Confirmado", "En producción", "Entregado"]} actual={2} />
					<Grafica
						tipo="barras"
						periodos={["S41", "S42", "S43", "S44"]}
						series={[
							{ clave: "t1", nombre: "Tienda 1", color: "azul", valores: [12, 15, 9, 18] },
							{ clave: "t2", nombre: "Tienda 2", color: "verde", valores: [8, 11, 14, 10] },
						]}
					/>
				</section>
				<section className="flex flex-col gap-4">
					<EstadoDePantalla tipo="cargando" renglones={2} />
					<EstadoDePantalla tipo="vacio" texto="Sin pedidos en línea" />
					<EstadoDePantalla tipo="error" alReintentar={() => undefined} />
					<EstadoDePantalla tipo="sin_permiso" />
					<EstadoDePantalla tipo="sin_conexion" />
					<EstadoDePantalla tipo="choque" documento="PE-0145" />
					<EstadoDePantalla tipo="version_vieja" alActualizar={() => undefined} />
				</section>
			</PaginaDepartamento>
			{aviso ? (
				<Aviso
					texto="PE-0150 confirmado para Colegio Morelos. El precio quedó congelado"
					como="bien"
					alCerrar={() => setAviso(false)}
				/>
			) : null}
			<Cajon
				abierto={cajon}
				alCerrar={() => setCajon(false)}
				contexto="PE-0145 · Colegio Morelos"
				titulo="Pedido PE-0145"
				conCambios
				relacionados={<BotonConCifra cifra={3} texto="lotes en producción" icono={Factory} alTocar={() => undefined} />}
				accion={<Boton variante="principal">Guardar versión 2</Boton>}
			>
				<p className="m-0 text-tinta2">El detalle del pedido.</p>
			</Cajon>
			<Ventana
				abierta={ventana}
				alCerrar={() => setVentana(false)}
				titulo="Rechazar"
				subtitulo="Ajuste AJ-0012 · 3 piezas"
				accion={<Boton variante="peligro">Rechazar</Boton>}
			>
				<Campo etiqueta="Motivo" enVentana />
			</Ventana>
		</Armazon>
	);
}
