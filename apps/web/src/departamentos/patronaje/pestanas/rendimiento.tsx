/**
 * La pestaña Rendimiento: «Tela por pieza: patrón contra lo que se gasta en el tendido», su leyenda y tres grupos
 * («Desperdicio arriba de {pct}%», «Desperdicio normal» y «Sin medir en corte», este plegado), de mayor a menor
 * desperdicio. Un renglón medido abre el cajón Rendimiento; uno sin medir, su receta.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Rendimiento»)
 */

import { rendimientoDePatronaje } from "@uniformame/compartido/contratos/patronaje/rendimiento";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { direcciones, useDireccion } from "../direccion.ts";
import { GrupoDePrendas } from "../grupo.tsx";
import { PaginaDePatronaje } from "../pagina.tsx";
import { Respaldo } from "../patron-contra-corte.tsx";

/** Una prenda medida. */
type Medida = z.infer<typeof rendimientoDePatronaje.resultado>["altos"][number];

/** La pestaña Rendimiento. */
export function PestanaRendimiento() {
	const consulta = useConsulta(rendimientoDePatronaje, {});
	return (
		<PaginaDePatronaje activa="rendimiento">
			<header className="flex flex-col gap-1">
				<h2 className="m-0 font-bold text-subtitulo">Tela por pieza: patrón contra lo que se gasta en el tendido</h2>
				<p className="m-0 text-tinta2">
					Metros del rollo entre piezas cortadas, lote por lote, en la talla de en medio
				</p>
			</header>
			<ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-etiqueta text-tinta2">
				{/* Cada leyenda con el color de su tramo en la barra: el patrón en gris y lo de más en ámbar (rojo si es alto). */}
				<li className="inline-flex items-center gap-2">
					<span aria-hidden="true" className="h-1.5 w-5 rounded-full bg-estado-gris" />
					Patrón: el piso
				</li>
				<li className="inline-flex items-center gap-2">
					<span aria-hidden="true" className="h-1.5 w-5 rounded-full bg-estado-ambar" />
					Lo que se gasta de más
				</li>
				<li className="font-semibold text-texto-advertencia">Pocos lotes: dato flojo</li>
			</ul>
			<SegunConsulta consulta={consulta}>{(datos) => <GruposDeRendimiento datos={datos} />}</SegunConsulta>
		</PaginaDePatronaje>
	);
}

/**
 * Los tres grupos.
 * @param props Lo que regresa `patronaje.rendimiento`.
 */
function GruposDeRendimiento({ datos }: { datos: z.infer<typeof rendimientoDePatronaje.resultado> }) {
	const { irA } = useDireccion();
	return (
		<>
			<GrupoDePrendas titulo={`Desperdicio arriba de ${datos.pct_alto}%`} color="rojo" prendas={datos.altos.length}>
				<TablaDeMedidas nombre="Desperdicio alto" medidas={datos.altos} />
			</GrupoDePrendas>
			<GrupoDePrendas titulo="Desperdicio normal" color="azul" prendas={datos.normales.length}>
				<TablaDeMedidas nombre="Desperdicio normal" medidas={datos.normales} />
			</GrupoDePrendas>
			<GrupoDePrendas titulo="Sin medir en corte" color="gris" prendas={datos.sin_medir.length} plegadoAlEmpezar>
				<Tabla
					nombre="Sin medir en corte"
					filas={datos.sin_medir}
					claveDeFila={(prenda) => prenda.producto_id}
					alTocarFila={(prenda) => irA(direcciones.receta(prenda.producto_id))}
					columnas={[
						{
							clave: "prenda",
							encabezado: "Prenda",
							celda: (prenda) => <DosRenglones arriba={<b>{prenda.prenda}</b>} abajo={prenda.detalle} />,
						},
						{
							clave: "motivo",
							encabezado: "Tela por pieza",
							celda: (prenda) => <span className="text-tinta3">{prenda.motivo}</span>,
						},
					]}
				/>
			</GrupoDePrendas>
		</>
	);
}

/**
 * La tabla de un grupo medido: Prenda · Tela por pieza · Desperdicio · Respaldo · Último corte.
 * @param props Su nombre y sus prendas. La barra reparte la tela por pieza: el patrón y lo que se gasta de más.
 */
function TablaDeMedidas({ nombre, medidas }: { nombre: string; medidas: readonly Medida[] }) {
	const { ir } = useDireccion();
	return (
		<Tabla
			nombre={nombre}
			filas={medidas}
			claveDeFila={(medida) => medida.producto_id}
			alTocarFila={(medida) => ir({ cajon: "rendimiento", id: medida.producto_id })}
			columnas={[
				{
					clave: "prenda",
					encabezado: "Prenda",
					celda: (medida) => <DosRenglones arriba={<b>{medida.prenda}</b>} abajo={medida.detalle} />,
				},
				{
					clave: "tela",
					encabezado: "Tela por pieza",
					celda: (medida) => (
						<span className="flex min-w-56 flex-col gap-1">
							<BarraAvance
								segmentos={[
									{ etiqueta: "Patrón", valor: Number(medida.patron), color: "gris" },
									{
										etiqueta: "Lo que se gasta de más",
										valor: Number(medida.real) - Number(medida.patron),
										color: medida.alto ? "rojo" : "ambar",
									},
								]}
							/>
							<span className="flex justify-between text-etiqueta text-tinta2">
								<span>
									Patrón <b className="tabular-nums">{medida.patron} m</b>
								</span>
								<span>
									Real <b className={`tabular-nums ${medida.alto ? "text-texto-error" : ""}`}>{medida.real} m</b>
								</span>
							</span>
						</span>
					),
				},
				{
					clave: "desperdicio",
					encabezado: "Desperdicio",
					alinear: "derecha",
					celda: (medida) => <b className={medida.alto ? "text-texto-error" : undefined}>{medida.desperdicio}</b>,
				},
				{
					clave: "respaldo",
					encabezado: "Respaldo",
					celda: (medida) => <Respaldo lotes={medida.lotes} flojo={medida.flojo} />,
				},
				{ clave: "ultimo", encabezado: "Último corte", celda: (medida) => medida.ultimo_corte ?? "—" },
			]}
		/>
	);
}
