/**
 * La ventana «Cambiar precios en bloque»: la lista (solo donde alguno tiene precio), subir o bajar, por ciento o pesos,
 * la cantidad y «Redondear a $5». La vista previa sale de `catalogo.cambio_en_bloque_previo`, con la misma cuenta que
 * la acción; «Confirmar con Google y aplicar a {n} precios» → `catalogo.cambiar_precios_en_bloque`.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Ventanas») y docs/modulos/catalogo/precios.md
 */

import { cambioEnBloquePrevio } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { cambiarPreciosEnBloque } from "@uniformame/compartido/contratos/catalogo/precios";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Interruptor } from "@uniformame/interfaz/captura/interruptor";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { errorDeCampo, esperar, type Salida, useAccionDeCatalogo } from "../acciones.ts";
import { cuantos, pesos } from "../textos.ts";

/** Un producto escogido, con la versión que se leyó. */
export interface ProductoQueCambiaDePrecio {
	id: string;
	version: number;
}

/**
 * La ventana del cambio de precios en bloque.
 * @param props Los productos, la lista con que abre, si está abierta y qué hacer al cerrar o al terminar.
 */
export function VentanaCambiarPrecios({
	productos,
	listaInicial,
	abierta,
	alCerrar,
	alTerminar,
}: {
	productos: readonly ProductoQueCambiaDePrecio[];
	listaInicial?: string | undefined;
	abierta: boolean;
	alCerrar: () => void;
	alTerminar: () => void;
}) {
	const [lista, setLista] = useState(listaInicial);
	const [direccion, setDireccion] = useState<"subir" | "bajar">("subir");
	const [modo, setModo] = useState<"por_ciento" | "pesos">("por_ciento");
	const [cantidad, setCantidad] = useState("");
	const [redondear, setRedondear] = useState(true);
	const [salida, setSalida] = useState<Salida<unknown>>();
	const conConexion = useConConexion();
	const numero = Number(cantidad);
	const valida = /^\d{1,3}$/.test(cantidad) && numero >= 1;
	const previo = useConsulta(
		cambioEnBloquePrevio,
		{
			productos: productos.map((producto) => producto.id).join(","),
			...(lista === undefined ? {} : { lista_id: lista }),
			direccion,
			modo,
			cantidad: valida ? numero : 1,
			redondear: redondear ? "si" : "no",
		},
		abierta && productos.length > 0,
	);
	const accion = useAccionDeCatalogo(cambiarPreciosEnBloque);
	const datos = previo.data;
	const aplicar = async () => {
		if (datos?.lista == null) return;
		const resultado = await esperar(
			accion.mutateAsync({
				datos: {
					lista_id: datos.lista.id,
					productos: productos.map((producto) => ({ producto_id: producto.id, version: producto.version })),
					direccion,
					modo,
					cantidad: numero,
					redondear,
				},
			}),
		);
		setSalida(resultado);
		if (resultado.bien) alTerminar();
	};
	return (
		<Ventana
			abierta={abierta}
			alCerrar={alCerrar}
			ancha
			titulo="Cambiar precios en bloque"
			subtitulo={cuantos(productos.length, "producto escogido", "productos escogidos")}
			accion={
				<Boton
					disabled={!valida || datos === undefined || datos.error !== null || accion.isPending || !conConexion}
					onClick={() => void aplicar()}
				>
					{`Confirmar con Google y aplicar a ${cuantos(datos?.precios ?? 0, "precio", "precios")}`}
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				<Selector
					etiqueta="Lista"
					enVentana
					opciones={(datos?.listas ?? []).map((una) => ({ valor: una.id, texto: una.nombre }))}
					value={datos?.lista?.id ?? ""}
					onChange={(evento) => setLista(evento.target.value)}
				/>
				<div className="flex flex-wrap gap-4">
					<Filtros
						nombre="Subir o bajar"
						filtros={[
							{ clave: "subir", texto: "Subir" },
							{ clave: "bajar", texto: "Bajar" },
						]}
						activo={direccion}
						alEscoger={(clave) => setDireccion(clave === "bajar" ? "bajar" : "subir")}
					/>
					<Filtros
						nombre="Por ciento o pesos"
						filtros={[
							{ clave: "por_ciento", texto: "Por ciento" },
							{ clave: "pesos", texto: "Pesos" },
						]}
						activo={modo}
						alEscoger={(clave) => setModo(clave === "pesos" ? "pesos" : "por_ciento")}
					/>
				</div>
				<Campo
					etiqueta={modo === "pesos" ? "Cantidad, en pesos" : "Cantidad, por ciento"}
					enVentana
					inputMode="numeric"
					value={cantidad}
					error={cantidad !== "" && !valida ? "Solo números, hasta 3 cifras." : errorDeCampo(salida, "cantidad")}
					onChange={(evento) => setCantidad(evento.target.value.trim())}
				/>
				<Interruptor
					etiqueta={`Redondear a ${pesos(datos?.redondeo_centavos ?? 0)}`}
					prendido={redondear}
					alCambiar={setRedondear}
				/>
				{valida && datos !== undefined ? <VistaPrevia datos={datos} /> : null}
			</div>
		</Ventana>
	);
}

/** Lo que regresa la vista previa. */
type DatosDelPrevio = NonNullable<ReturnType<typeof useConsulta<typeof cambioEnBloquePrevio>>["data"]>;

/**
 * La vista previa: hasta 5 renglones, cuántos cambian, cuántos se dejan igual y, en rojo, por qué no se puede.
 * @param props Lo que dio la consulta.
 */
function VistaPrevia({ datos }: { datos: DatosDelPrevio }) {
	if (datos.error !== null) return <p className="m-0 font-semibold text-texto-error">{datos.error.mensaje}</p>;
	return (
		<div className="flex flex-col gap-1.5 rounded-mediano bg-suave px-4 py-3">
			{datos.renglones.map((renglon) => (
				<div key={`${renglon.producto}-${renglon.escuela}`} className="flex justify-between gap-3">
					<span>
						{renglon.producto} <span className="text-tinta2">{renglon.escuela ?? ""}</span>
					</span>
					<span className="tabular-nums">
						{pesos(renglon.antes_centavos)} → <b>{pesos(renglon.despues_centavos)}</b>
					</span>
				</div>
			))}
			<p className="m-0 mt-1 text-tinta2">
				{`${datos.cambian} de ${cuantos(datos.escogidos, "producto cambia", "productos cambian")} en ${datos.lista?.nombre ?? ""}.`}
			</p>
			{datos.sin_precio === 0 ? null : (
				<p className="m-0 text-tinta2">
					{datos.sin_precio === 1
						? "1 no tiene precio en esta lista y se deja igual."
						: `${datos.sin_precio} no tienen precio en esta lista y se dejan igual.`}
				</p>
			)}
		</div>
	);
}
