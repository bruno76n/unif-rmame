/**
 * La ventana «Descontinuar {producto}» o «Descontinuar {n} productos»: hasta 4 nombres («y {n} más») y el motivo.
 * «Descontinuar» → `catalogo.descontinuar_productos`; el aviso es el que regresa la acción.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Ventanas»)
 */

import { descontinuarProductos } from "@uniformame/compartido/contratos/catalogo/productos";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { errorDeCampo, esperar, useAccionDeCatalogo } from "../acciones.ts";

/** Un producto que se descontinúa, con la versión que se leyó. */
export interface ProductoQueSeDescontinua {
	id: string;
	version: number;
	nombre: string;
}

/** Cuántos nombres dice la ventana. */
const nombresQueSeDicen = 4;

/**
 * La ventana para descontinuar uno o varios productos.
 * @param props Los productos, si está abierta y qué hacer al cerrar o al terminar.
 */
export function VentanaDescontinuar({
	productos,
	abierta,
	alCerrar,
	alTerminar,
}: {
	productos: readonly ProductoQueSeDescontinua[];
	abierta: boolean;
	alCerrar: () => void;
	alTerminar: () => void;
}) {
	const accion = useAccionDeCatalogo(descontinuarProductos);
	const [uno] = productos;
	const titulo =
		productos.length === 1 && uno !== undefined
			? `Descontinuar ${uno.nombre}`
			: `Descontinuar ${productos.length} productos`;
	const dichos = productos.slice(0, nombresQueSeDicen).map((producto) => producto.nombre);
	const resto = productos.length - dichos.length;
	return (
		<VentanaConMotivo
			abierta={abierta}
			alCerrar={alCerrar}
			titulo={titulo}
			textoAccion="Descontinuar"
			peligro
			alConfirmar={async (motivo) => {
				const salida = await esperar(
					accion.mutateAsync({
						datos: {
							productos: productos.map((producto) => ({ producto_id: producto.id, version: producto.version })),
							motivo,
						},
					}),
				);
				if (salida.bien) alTerminar();
				return errorDeCampo(salida, "motivo");
			}}
		>
			<p className="m-0 text-tinta2">{resto > 0 ? `${dichos.join(", ")} y ${resto} más` : dichos.join(", ")}</p>
		</VentanaConMotivo>
	);
}
