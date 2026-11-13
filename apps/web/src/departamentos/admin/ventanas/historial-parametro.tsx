/**
 * La ventana del historial de un parámetro: sus valores anteriores, desde cuándo y quién, de `admin.historial_parametro`.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Configuración»: «Historial»)
 */

import { historialParametroDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-configuracion";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useConsulta } from "../../../comun/api.tsx";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import type { ParametroParaVer } from "../pestanas/casillas-de-configuracion.tsx";

/**
 * La ventana con el historial de un parámetro.
 * @param props El parámetro y qué hacer al cerrar.
 */
export function VentanaHistorialParametro({
	parametro,
	alCerrar,
}: {
	parametro: ParametroParaVer;
	alCerrar: () => void;
}) {
	const consulta = useConsulta(historialParametroDeAdmin, {
		clave: parametro.clave,
		...(parametro.ubicacion_id === null ? {} : { ubicacion_id: parametro.ubicacion_id }),
	});
	return (
		<Ventana abierta ancha alCerrar={alCerrar} titulo={`Historial · ${parametro.nombre}`} volver="Cerrar">
			<SegunConsulta consulta={consulta} renglones={3}>
				{(datos) => (
					<Tabla
						nombre="Historial"
						filas={datos.renglones}
						claveDeFila={(renglon) => `${renglon.desde}-${renglon.quien}-${renglon.valor ?? renglon.valor_centavos}`}
						columnas={[
							{
								clave: "valor",
								encabezado: "Valor",
								celda: (renglon) => <b>{renglon.valor ?? montoEnPantalla(renglon.valor_centavos)}</b>,
							},
							{ clave: "desde", encabezado: "Desde", celda: (renglon) => renglon.desde },
							{ clave: "quien", encabezado: "Quién", celda: (renglon) => renglon.quien },
						]}
					/>
				)}
			</SegunConsulta>
		</Ventana>
	);
}
