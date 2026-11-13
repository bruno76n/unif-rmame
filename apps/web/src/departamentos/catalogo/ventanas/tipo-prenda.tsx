/**
 * La ventana de un tipo de prenda: nombre, sección (solo las que llevan receta) y flujo de Producción; sus medidas
 * iniciales viajan como están. «Guardar» → `catalogo.guardar_tipo_prenda`.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Escuelas y tallas») y docs/modulos/catalogo/tallas-y-tipos-de-prenda.md
 */

import type { escuelasYTallas } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { guardarTipoPrenda } from "@uniformame/compartido/contratos/catalogo/tallas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { errorDeCampo, esperar, type Salida, useAccionDeCatalogo } from "../acciones.ts";

/** Lo que regresa Escuelas y tallas. */
type DatosDeEscuelasYTallas = z.infer<typeof escuelasYTallas.resultado>;

/**
 * La ventana de un tipo de prenda: nuevo si no trae tipo.
 * @param props El tipo (o ninguno), las secciones y los flujos, si está abierta y qué hacer al cerrar.
 */
export function VentanaTipoPrenda({
	tipo,
	secciones,
	flujos,
	abierta,
	alCerrar,
}: {
	tipo?: DatosDeEscuelasYTallas["tipos"][number] | undefined;
	secciones: DatosDeEscuelasYTallas["secciones"];
	flujos: DatosDeEscuelasYTallas["flujos"];
	abierta: boolean;
	alCerrar: () => void;
}) {
	const [nombre, setNombre] = useState(tipo?.nombre ?? "");
	const [seccion, setSeccion] = useState(tipo?.seccion_id ?? "");
	const [flujo, setFlujo] = useState(tipo?.flujo_id ?? "");
	const [salida, setSalida] = useState<Salida<unknown>>();
	const accion = useAccionDeCatalogo(guardarTipoPrenda);
	const conConexion = useConConexion();
	const guardar = async () => {
		const resultado = await esperar(
			accion.mutateAsync({
				datos: {
					...(tipo === undefined ? {} : { tipo_prenda_id: tipo.id, version: tipo.version }),
					nombre,
					seccion_id: seccion,
					flujo_defecto_id: flujo === "" ? null : flujo,
					medidas: (tipo?.medidas ?? []).map((medida) => ({
						medida: medida.medida,
						orden: medida.orden,
						valores: medida.valores.map(({ talla_id, valor_cm }) => ({ talla_id, valor_cm })),
					})),
				},
			}),
		);
		setSalida(resultado);
		if (resultado.bien) alCerrar();
	};
	return (
		<Ventana
			abierta={abierta}
			alCerrar={alCerrar}
			titulo={tipo === undefined ? "Agregar tipo" : tipo.nombre}
			accion={
				<Boton disabled={accion.isPending || !conConexion} onClick={() => void guardar()}>
					Guardar
				</Boton>
			}
		>
			<div className="flex flex-col gap-3">
				<Campo
					etiqueta="Nombre"
					enVentana
					value={nombre}
					error={errorDeCampo(salida, "nombre")}
					onChange={(evento) => setNombre(evento.target.value)}
				/>
				<Selector
					etiqueta="Sección"
					enVentana
					vacio="Escoge la sección"
					opciones={secciones.filter((una) => una.lleva_receta).map((una) => ({ valor: una.id, texto: una.nombre }))}
					value={seccion}
					error={errorDeCampo(salida, "seccion_id")}
					onChange={(evento) => setSeccion(evento.target.value)}
				/>
				<Selector
					etiqueta="Flujo de Producción"
					enVentana
					vacio="Sin flujo"
					opciones={flujos.map((uno) => ({ valor: uno.id, texto: uno.nombre }))}
					value={flujo}
					onChange={(evento) => setFlujo(evento.target.value)}
				/>
			</div>
		</Ventana>
	);
}
