/**
 * El cajón Rendimiento (ancho), que se abre con `?cajon=rendimiento&id={producto}`: «Rendimiento · {tela}» y la
 * prenda; tres cifras (lo que dice el patrón en la talla de en medio, lo que se gasta en el tendido, en rojo si es alto,
 * y el desperdicio con sus lotes); con pocos lotes, «Con {n} lotes el dato todavía es flojo.»; y «Por talla». «Cerrar»
 * y «Abrir receta».
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Cajones»: Rendimiento)
 */

import { rendimientoDeUnaPrenda } from "@uniformame/compartido/contratos/patronaje/rendimiento";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useConsulta } from "../../../comun/api.tsx";
import { direcciones, useDireccion } from "../direccion.ts";
import { TablaPatronContraCorte } from "../patron-contra-corte.tsx";

/** El cajón Rendimiento de una prenda. */
export function CajonRendimiento() {
	const { abierto, cerrar, irA } = useDireccion();
	const productoId = abierto("rendimiento");
	const consulta = useConsulta(rendimientoDeUnaPrenda, { producto_id: productoId ?? "" }, productoId !== undefined);
	const datos = consulta.data;
	return (
		<Cajon
			abierto={productoId !== undefined}
			alCerrar={cerrar}
			ancho
			contexto={datos === undefined ? "Rendimiento" : `Rendimiento · ${datos.tela}`}
			titulo={datos?.prenda ?? ""}
			accion={
				<Boton variante="principal" onClick={() => irA(direcciones.receta(productoId ?? ""))}>
					Abrir receta
				</Boton>
			}
		>
			{consulta.isPending ? (
				<EstadoDePantalla tipo="cargando" />
			) : datos === undefined ? (
				<EstadoDePantalla tipo="error" alReintentar={() => void consulta.refetch()} />
			) : datos.medido === null ? (
				<EstadoDePantalla tipo="vacio" texto="Todavía no se corta con esta receta" />
			) : (
				<div className="flex flex-col gap-5">
					<dl className="m-0 grid grid-cols-3 gap-3 max-telefono:grid-cols-1">
						{[
							{ texto: datos.medido.patron, rojo: false },
							{ texto: datos.medido.real, rojo: datos.medido.alto },
							{ texto: datos.medido.desperdicio, rojo: false },
						].map((cifra) => {
							const [numero, explicacion] = cifra.texto.split(" · ");
							return (
								<div key={cifra.texto} className="flex flex-col gap-1 rounded-mediano bg-suave p-4">
									<dt className="text-etiqueta text-tinta2">{explicacion}</dt>
									<dd
										className={`m-0 font-bold text-subtitulo tabular-nums ${cifra.rojo ? "text-texto-error" : "text-tinta"}`}
									>
										{numero}
									</dd>
								</div>
							);
						})}
					</dl>
					{datos.medido.flojo === null ? null : (
						<p className="m-0 font-semibold text-texto-advertencia">{datos.medido.flojo}</p>
					)}
					<h3 className="m-0 font-bold text-subtitulo">Por talla</h3>
					<TablaPatronContraCorte tallas={datos.medido.tallas} />
				</div>
			)}
		</Cajon>
	);
}
