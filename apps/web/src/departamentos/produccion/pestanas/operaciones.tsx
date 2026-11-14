/**
 * La pestaña Operaciones: «Nuevo flujo» arriba y una tarjeta por flujo con su nombre, «{n} operaciones», las prendas que
 * lo usan y la tabla # · Operación · La hace (y Tarifa, solo si la cuenta la ve); al pie, «Agregar operación», y una ×
 * en cada operación menos el corte. Un flujo con lotes en proceso lleva su candado y sus botones apagados.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Operaciones»)
 */

import { quitarOperacionFlujo } from "@uniformame/compartido/contratos/produccion/flujos";
import { operacionesDeProduccion } from "@uniformame/compartido/contratos/produccion/operaciones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useAccion, useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { loQueCambiaEnProduccion } from "../invalidar.ts";
import { PaginaDeProduccion } from "../pagina.tsx";
import { VentanaFlujoNuevo } from "../ventanas/flujo-nuevo.tsx";
import { VentanaOperacionNueva } from "../ventanas/operacion-nueva.tsx";

/** Lo que regresa `produccion.operaciones`. */
type Operaciones = z.infer<typeof operacionesDeProduccion.resultado>;
/** Un flujo. */
type Flujo = Operaciones["flujos"][number];

/**
 * Las prendas de un flujo como las dice su tarjeta: «A, B y 2 más».
 * @param prendas Las prendas.
 */
function textoDePrendas(prendas: readonly string[]): string {
	if (prendas.length === 0) return "Ninguna prenda lo usa";
	if (prendas.length <= 2) return prendas.join(" y ");
	return `${prendas.slice(0, 2).join(", ")} y ${prendas.length - 2} más`;
}

/** La pestaña Operaciones. */
export function PestanaOperaciones() {
	const consulta = useConsulta(operacionesDeProduccion, {});
	const [nuevo, setNuevo] = useState(false);
	const [agregarA, setAgregarA] = useState<Flujo | null>(null);
	return (
		<PaginaDeProduccion activa="operaciones">
			<div className="flex">
				<Boton variante="principal" icono={Plus} onClick={() => setNuevo(true)}>
					Nuevo flujo
				</Boton>
			</div>
			<SegunConsulta consulta={consulta}>
				{(operaciones) =>
					operaciones.flujos.length === 0 ? (
						<EstadoDePantalla tipo="vacio" texto="Sin flujos" />
					) : (
						<>
							<div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-4 max-telefono:grid-cols-1">
								{operaciones.flujos.map((flujo) => (
									<TarjetaDeFlujo key={flujo.flujo_id} flujo={flujo} alAgregar={() => setAgregarA(flujo)} />
								))}
							</div>
							<VentanaFlujoNuevo abierta={nuevo} alCerrar={() => setNuevo(false)} operaciones={operaciones} />
							<VentanaOperacionNueva flujo={agregarA} alCerrar={() => setAgregarA(null)} operaciones={operaciones} />
						</>
					)
				}
			</SegunConsulta>
		</PaginaDeProduccion>
	);
}

/**
 * La tarjeta de un flujo.
 * @param props El flujo y qué hacer al agregarle una operación.
 */
function TarjetaDeFlujo({ flujo, alAgregar }: { flujo: Flujo; alAgregar: () => void }) {
	const conConexion = useConConexion();
	const quitar = useAccion(quitarOperacionFlujo, loQueCambiaEnProduccion);
	const conCandado = flujo.lotes_en_proceso > 0;
	const enProceso = flujo.lotes_en_proceso === 1 ? "1 lote en proceso" : `${flujo.lotes_en_proceso} lotes en proceso`;
	const conTarifa = flujo.operaciones.some((operacion) => operacion.tarifa_centavos !== undefined);
	type Operacion = Flujo["operaciones"][number];
	return (
		<article className="flex flex-col gap-3 rounded-grande bg-panel p-5 shadow-panel">
			<header className="flex flex-wrap items-start gap-3">
				<div className="flex min-w-0 flex-1 flex-col">
					<b className="text-subtitulo">{flujo.nombre}</b>
					<span className="text-etiqueta text-tinta2">
						{flujo.operaciones.length} operaciones · {textoDePrendas(flujo.prendas)}
					</span>
				</div>
				{conCandado ? <Estado texto={enProceso} color="gris" /> : null}
			</header>
			<Tabla
				nombre={`Operaciones de ${flujo.nombre}`}
				filas={flujo.operaciones}
				claveDeFila={(operacion) => operacion.flujo_operacion_id}
				columnas={[
					{
						clave: "numero",
						encabezado: "#",
						alinear: "derecha",
						celda: (operacion) => flujo.operaciones.indexOf(operacion) + 1,
					},
					{
						clave: "operacion",
						encabezado: "Operación",
						celda: (operacion) => (
							<span className="flex flex-wrap items-center gap-2">
								{operacion.operacion}
								{operacion.sin_tarifa ? <Estado texto="Sin tarifa" color="ambar" /> : null}
							</span>
						),
					},
					{ clave: "hace", encabezado: "La hace", celda: (operacion) => operacion.persona },
					...(conTarifa
						? [
								{
									clave: "tarifa",
									encabezado: "Tarifa",
									alinear: "derecha" as const,
									celda: (operacion: Operacion) => montoEnPantalla(operacion.tarifa_centavos),
								},
							]
						: []),
					{
						clave: "quitar",
						encabezado: "",
						alinear: "derecha",
						celda: (operacion) =>
							operacion.es_corte ? null : (
								<Boton
									chico
									variante="fantasma"
									icono={X}
									aria-label={`Quitar ${operacion.operacion}`}
									disabled={conCandado || !conConexion || quitar.isPending}
									onClick={() =>
										quitar.mutate({
											datos: { flujo_operacion_id: operacion.flujo_operacion_id },
											version: flujo.version,
										})
									}
								/>
							),
					},
				]}
			/>
			{conCandado ? (
				<LineaDeAviso tono="advertencia">
					{enProceso} {flujo.lotes_en_proceso === 1 ? "usa" : "usan"} este flujo: cámbialo cuando terminen o haz un
					flujo nuevo
				</LineaDeAviso>
			) : null}
			<div className="flex">
				<Boton chico icono={Plus} disabled={conCandado || !conConexion} onClick={alAgregar}>
					Agregar operación
				</Boton>
			</div>
		</article>
	);
}
