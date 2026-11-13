/**
 * La ventana «Capturar receta»: «Prenda», en tres grupos («Sin receta», «Sin verificar», «Verificadas»), cada opción
 * «{prenda} · {escuela} · se corta el {fecha}», por fecha de corte y luego por nombre; al abrir, la primera sin receta.
 * «Abrir receta» lleva a su página. La lista es la de `patronaje.recetas`, ya ordenada. El selector del sistema no
 * agrupa opciones: cada una empieza con su grupo, en el orden de los grupos (se pidió al capataz que agrupe).
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Ventanas»: «Capturar receta»)
 */

import { listaDeRecetas } from "@uniformame/compartido/contratos/patronaje/lista-de-recetas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useEffect, useState } from "react";
import { useConsulta } from "../../../comun/api.tsx";
import { direcciones, useDireccion } from "../direccion.ts";

/** El nombre de cada grupo en la ventana. */
const nombresDeGrupo = { sin_receta: "Sin receta", sin_verificar: "Sin verificar", verificada: "Verificadas" } as const;

/**
 * La ventana para escoger la prenda de la receta.
 * @param props Si está abierta y qué hacer al cerrarla.
 */
export function VentanaCapturarReceta({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
	const { irA } = useDireccion();
	const consulta = useConsulta(listaDeRecetas, {}, abierta);
	const [escogida, setEscogida] = useState("");
	const grupos = consulta.data?.grupos ?? [];
	// Al abrir, la primera sin receta (o la primera que haya).
	useEffect(() => {
		if (!abierta) return;
		const primera = grupos.flatMap((grupo) => grupo.prendas)[0];
		setEscogida((antes) => (antes === "" ? (primera?.producto_id ?? "") : antes));
	}, [abierta, grupos]);
	return (
		<Ventana
			abierta={abierta}
			alCerrar={alCerrar}
			titulo="Capturar receta"
			accion={
				<Boton
					variante="principal"
					disabled={escogida === ""}
					onClick={() => {
						alCerrar();
						irA(direcciones.receta(escogida));
					}}
				>
					Abrir receta
				</Boton>
			}
		>
			{consulta.isPending ? (
				<EstadoDePantalla tipo="cargando" renglones={1} />
			) : consulta.data === undefined ? (
				<EstadoDePantalla tipo="error" alReintentar={() => void consulta.refetch()} />
			) : (
				<Selector
					etiqueta="Prenda"
					enVentana
					value={escogida}
					onChange={(evento) => setEscogida(evento.target.value)}
					opciones={grupos.flatMap((grupo) =>
						grupo.prendas.map((prenda) => ({
							valor: prenda.producto_id,
							texto: [
								nombresDeGrupo[grupo.clave],
								prenda.prenda,
								prenda.para,
								prenda.corte === null ? null : `se corta el ${prenda.corte.fecha}`,
							]
								.filter(Boolean)
								.join(" · "),
						})),
					)}
				/>
			)}
		</Ventana>
	);
}
