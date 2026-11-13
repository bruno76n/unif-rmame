/**
 * La ventana «{lista} · Agregar»: el nombre (y, en «Unidades de material», «Se cuenta entera»), que llama a
 * `admin.agregar_a_lista`; en las secciones del catálogo, además «Lleva receta» y el tipo de prenda que propone, que
 * llama a `catalogo.agregar_seccion`.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Ventanas»: «{lista} · Agregar») y
 * docs/modulos/admin/configuracion.md («`admin.agregar_a_lista`»)
 */

import { agregarALista } from "@uniformame/compartido/contratos/admin/configuracion";
import { agregarSeccion } from "@uniformame/compartido/contratos/catalogo/escuelas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";
import type { Configuracion, Lista } from "../pestanas/configuracion.tsx";

/** La clave de las unidades de material: su valor lleva «Se cuenta entera». */
const unidadesDeMaterial = "unidades_material";
/** La clave con que llegan las secciones del catálogo. */
const seccionesDelCatalogo = "secciones_catalogo";

/**
 * La ventana para agregar un valor a una lista.
 * @param props La lista, los tipos de prenda (para una sección del catálogo) y qué hacer al cerrar.
 */
export function VentanaAgregarALista({
	lista,
	tiposPrenda,
	alCerrar,
}: {
	lista: Lista;
	tiposPrenda: Configuracion["tipos_prenda"];
	alCerrar: () => void;
}) {
	const aLista = useEnvio(agregarALista);
	const aCatalogo = useEnvio(agregarSeccion);
	const conConexion = useConConexion();
	const [nombre, setNombre] = useState("");
	const [entera, setEntera] = useState(false);
	const [llevaReceta, setLlevaReceta] = useState(true);
	const [tipoPrenda, setTipoPrenda] = useState("");
	const [error, setError] = useState<string | undefined>(undefined);
	const esSeccion = lista.clave === seccionesDelCatalogo;
	const esUnidad = lista.clave === unidadesDeMaterial;
	/** Agrega a la lista o, si son las secciones, a Catálogo. */
	const agregar = async () => {
		const alCampos = (campos: Record<string, string>) => setError(campos.nombre);
		const salio = esSeccion
			? await aCatalogo.enviar(
					{
						datos: {
							nombre,
							lleva_receta: llevaReceta,
							...(tipoPrenda === "" ? {} : { tipo_prenda_defecto_id: tipoPrenda }),
						},
					},
					alCampos,
				)
			: await aLista.enviar(
					{ datos: { lista: lista.clave, nombre, ...(esUnidad ? { se_cuenta_entera: entera } : {}) } },
					alCampos,
				);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`${lista.nombre} · Agregar`}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || aLista.enviando || aCatalogo.enviando}
					onClick={() => void agregar()}
				>
					Agregar
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				<Campo
					enVentana
					etiqueta="Nombre"
					maxLength={esUnidad ? 20 : 40}
					value={nombre}
					error={error}
					onChange={(evento) => setNombre(evento.target.value)}
				/>
				{esUnidad ? <Casilla etiqueta="Se cuenta entera" marcada={entera} alCambiar={setEntera} /> : null}
				{esSeccion ? (
					<>
						<Casilla etiqueta="Lleva receta" marcada={llevaReceta} alCambiar={setLlevaReceta} />
						<Selector
							enVentana
							etiqueta="Tipo de prenda que propone"
							vacio="Ninguno"
							opciones={tiposPrenda.map((tipo) => ({ valor: tipo.id, texto: tipo.nombre }))}
							value={tipoPrenda}
							onChange={(evento) => setTipoPrenda(evento.target.value)}
						/>
					</>
				) : null}
			</div>
		</Ventana>
	);
}
