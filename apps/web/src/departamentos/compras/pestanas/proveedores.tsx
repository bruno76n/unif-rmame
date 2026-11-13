/**
 * Proveedores: el buscador (proveedor, ciudad o lo que surte), cuántos son, «Nuevo proveedor» y «Dados de baja», y la
 * tabla Proveedor · Surte · Plazo: dice y real · Entregas · Pago · Teléfono. «Dados de baja» muestra los dados de baja
 * con «Reactivar». Tocar un renglón abre el cajón del proveedor.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Proveedores»)
 */

import type { proveedoresDeCompras } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { reactivarProveedor } from "@uniformame/compartido/contratos/compras/proveedores";
import { plural } from "@uniformame/compartido/contratos/compras/textos";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useAccion } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { Buscador } from "../comun.tsx";
import { useDireccionDeCompras } from "../direccion.ts";
import { VentanaNuevoProveedor } from "../ventanas/nuevo-proveedor.tsx";

/** Un proveedor de la lista. */
type ProveedorDeLaLista = z.infer<typeof proveedoresDeCompras.resultado>["proveedores"][number];

/** El texto de cada tono del plazo y de las entregas. */
export const textoDelTono = {
	verde: "text-texto-bien",
	ambar: "text-texto-advertencia",
	rojo: "text-texto-error",
	gris: "text-tinta3",
} as const;

/** El color de la barra de las entregas. */
const colorDeEntregas = { verde: "verde", ambar: "ambar", rojo: "rojo", gris: "gris" } as const;

/**
 * Lo que dice que tarda contra lo que tarda: «Dice {n} días · Tarda {n}», en el tono de la regla; sin entregas, en gris
 * «Sin entregas todavía».
 * @param props El proveedor.
 */
export function PlazoDiceYReal({
	proveedor,
}: {
	proveedor: Pick<ProveedorDeLaLista, "dice" | "tarda" | "tono_plazo">;
}) {
	if (proveedor.tarda === null) return <span className="text-tinta3">Sin entregas todavía</span>;
	return (
		<span>
			<span className="text-tinta2">Dice {plural(proveedor.dice, "día", "días")}</span> ·{" "}
			<b className={`font-bold ${textoDelTono[proveedor.tono_plazo]}`}>Tarda {proveedor.tarda}</b>
		</span>
	);
}

/**
 * La pestaña Proveedores.
 * @param props Lo de `compras.proveedores`.
 */
export function ProveedoresDeCompras({ proveedores }: { proveedores: ProveedorDeLaLista[] }) {
	const { busqueda, ir } = useDireccionDeCompras();
	const conConexion = useConConexion();
	const [nuevo, setNuevo] = useState(false);
	const reactivar = useAccion(reactivarProveedor, ["compras.proveedores", "compras.pendientes"]);
	const dadosDeBaja = busqueda.bajas === "si";
	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-end gap-3">
				<Buscador etiqueta="Buscar" ejemplo="Proveedor, ciudad o lo que surte" />
				<Filtros
					nombre="Cuáles proveedores"
					activo={dadosDeBaja ? "bajas" : "activos"}
					alEscoger={(clave) => ir({ bajas: clave === "bajas" ? "si" : undefined })}
					filtros={[
						{ clave: "activos", texto: "Activos" },
						{ clave: "bajas", texto: "Dados de baja" },
					]}
				/>
				<span className="ml-auto rounded-mediano bg-riel px-3 py-1.5 font-semibold text-sm">
					{plural(proveedores.length, "proveedor", "proveedores")}
				</span>
				<Boton icono={Plus} disabled={!conConexion} onClick={() => setNuevo(true)}>
					Nuevo proveedor
				</Boton>
			</div>
			{proveedores.length === 0 ? (
				<EstadoDePantalla
					tipo="vacio"
					texto={
						busqueda.buscar !== undefined
							? "Ningún proveedor cumple esa búsqueda."
							: dadosDeBaja
								? "Sin proveedores dados de baja"
								: "Sin proveedores"
					}
				/>
			) : (
				<div className="rounded-grande bg-panel px-2 shadow-panel">
					<Tabla
						nombre="Proveedores"
						filas={proveedores}
						claveDeFila={(proveedor) => proveedor.proveedor_id}
						alTocarFila={(proveedor) => ir({ cajon: "proveedor", id: proveedor.proveedor_id })}
						columnas={[
							{
								clave: "proveedor",
								encabezado: "Proveedor",
								celda: (proveedor) => (
									<span className="flex flex-col">
										<b className="font-bold">{proveedor.nombre}</b>
										<span className="text-etiqueta text-tinta2">{proveedor.ciudad}</span>
									</span>
								),
							},
							{ clave: "surte", encabezado: "Surte", celda: (proveedor) => proveedor.surte ?? "—" },
							{
								clave: "plazo",
								encabezado: "Plazo: dice y real",
								celda: (proveedor) => <PlazoDiceYReal proveedor={proveedor} />,
							},
							{
								clave: "entregas",
								encabezado: "Entregas",
								celda: (proveedor) =>
									proveedor.entregas === 0 ? (
										<span className="text-tinta3">Sin entregas todavía</span>
									) : (
										<span className="flex w-48 flex-col gap-1.5">
											<b className="font-semibold">
												{proveedor.a_tiempo} de {proveedor.entregas} llegaron a tiempo
											</b>
											<BarraAvance
												segmentos={[
													{
														etiqueta: "A tiempo",
														valor: proveedor.a_tiempo,
														color: colorDeEntregas[proveedor.tono_entregas],
													},
													{ etiqueta: "Tarde", valor: proveedor.entregas - proveedor.a_tiempo, color: "gris" },
												]}
											/>
										</span>
									),
							},
							{ clave: "pago", encabezado: "Pago", celda: (proveedor) => proveedor.condicion },
							{
								clave: "telefono",
								encabezado: dadosDeBaja ? "" : "Teléfono",
								alinear: dadosDeBaja ? "derecha" : "izquierda",
								celda: (proveedor) =>
									dadosDeBaja ? (
										<Boton
											chico
											disabled={!conConexion}
											onClick={(evento) => {
												evento.stopPropagation();
												reactivar.mutate({
													datos: { proveedor_id: proveedor.proveedor_id },
													version: proveedor.version,
												});
											}}
										>
											Reactivar
										</Boton>
									) : (
										<span className="tabular-nums">{proveedor.telefono}</span>
									),
							},
						]}
					/>
				</div>
			)}
			<VentanaNuevoProveedor abierta={nuevo} alCerrar={() => setNuevo(false)} />
		</div>
	);
}
