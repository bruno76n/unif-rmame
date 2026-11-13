/**
 * Para quién es un lote en las pantallas de Producción: el cliente con el color de su escuela (o la tienda, o la
 * temporada) y su línea abajo.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Lotes»: la tarjeta)
 */

import { MuestraDeColor } from "@uniformame/interfaz/estados/muestra-de-color";

/**
 * Para quién es un lote: el cliente con su color (o la tienda, o la temporada) y su línea abajo.
 * @param props Lo que regresan las consultas en `para`.
 */
export function ParaQuien({ para }: { para: { nombre: string; color: string | null; linea: string } }) {
	return (
		<span className="flex min-w-0 items-center gap-2">
			<MuestraDeColor color={para.color} tamano="chico" sinColor="nada" />
			<span className="flex min-w-0 flex-col">
				<span className="truncate">{para.nombre}</span>
				<span className="text-etiqueta text-tinta2">{para.linea}</span>
			</span>
		</span>
	);
}
