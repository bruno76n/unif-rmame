/**
 * Pedidos de Tienda en línea: el buscador «Folio o cliente», el tablero por etapa (esperando pago, solo si hay alguno;
 * por surtir; esperando prendas; listo para empacar) con una tarjeta por W-, y abajo los cerrados con «Ver más». Cada
 * tarjeta y cada cerrado abren el cajón del pedido.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Pedidos»)
 *
 * Todo llega armado de `linea.pedidos`: la etapa, la promesa y dónde está cada prenda. Las páginas que siguen solo
 * traen cerrados. El buscador va en la dirección.
 */

import { pedidosLinea } from "@uniformame/compartido/contratos/linea/consultas";
import { Buscador } from "@uniformame/interfaz/captura/buscador";
import { unirClases } from "@uniformame/interfaz/clases";
import { puntoDelEstado } from "@uniformame/interfaz/estados/colores";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Check, Clock } from "lucide-react";
import type { ReactNode } from "react";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunPaginas } from "../../../comun/segun-paginas.tsx";
import { useDireccionDeLinea } from "../direccion.ts";

/** Lo que da una página de la consulta. */
type Pedidos = z.infer<typeof pedidosLinea.resultado>;
/** Una columna del tablero. */
type Columna = Pedidos["columnas"][number];
/** Una tarjeta. */
type Tarjeta = Columna["pedidos"][number];

/** El color del texto de cada promesa. */
const textoDeLaPromesa = { verde: "text-texto-bien", ambar: "text-texto-advertencia" } as const;

/**
 * Una tarjeta del tablero: el folio y su fecha, el cliente, cada prenda con palomita o reloj, el total y la promesa.
 * @param props La tarjeta y qué hacer al tocarla.
 */
function TarjetaDePedido({ tarjeta, alAbrir }: { tarjeta: Tarjeta; alAbrir: () => void }) {
	return (
		<button
			type="button"
			onClick={alAbrir}
			className="flex w-full flex-col gap-2 rounded-grande bg-panel p-4 text-left shadow-panel hover:bg-suave"
		>
			<span className="flex items-baseline justify-between gap-2">
				<b className="font-bold tabular-nums">{tarjeta.folio}</b>
				<span className="text-etiqueta text-tinta3">{tarjeta.fecha}</span>
			</span>
			<b className="font-semibold">{tarjeta.cliente}</b>
			<span className="flex flex-col gap-1">
				{tarjeta.prendas.map((prenda) => (
					<span
						key={`${prenda.prenda}-${prenda.talla}`}
						className={unirClases(
							"flex items-center gap-1.5 text-etiqueta",
							prenda.en_aduana ? "text-texto-bien" : "text-tinta2",
						)}
						title={prenda.donde ?? undefined}
					>
						{prenda.en_aduana ? (
							<Check aria-label="En aduana" size={13} strokeWidth={1.9} />
						) : (
							<Clock aria-label="Falta" size={13} strokeWidth={1.9} />
						)}
						{prenda.prenda} · {prenda.talla}
						{prenda.piezas > 1 ? ` × ${prenda.piezas}` : ""}
					</span>
				))}
			</span>
			<span className="flex items-center justify-between gap-2 border-linea border-t pt-2">
				<b className="font-bold tabular-nums">{montoEnPantalla(tarjeta.total_centavos)}</b>
				{tarjeta.promesa === null ? null : (
					<span
						className={unirClases(
							"font-semibold text-etiqueta",
							tarjeta.promesa.color === "verde" ? textoDeLaPromesa.verde : textoDeLaPromesa.ambar,
						)}
					>
						{tarjeta.promesa.texto}
					</span>
				)}
			</span>
		</button>
	);
}

/**
 * Una columna del tablero, con su conteo; vacía, «Ninguno».
 * @param props La columna y qué hacer al tocar una tarjeta.
 */
function ColumnaDelTablero({ columna, alAbrir }: { columna: Columna; alAbrir: (id: string) => void }) {
	return (
		<section aria-label={columna.texto} className="flex min-w-0 flex-col gap-3 rounded-grande bg-riel p-3">
			<header className="flex items-center gap-2 px-1">
				<span aria-hidden="true" className={unirClases("size-2.5 rounded-full", puntoDelEstado[columna.color])} />
				<b className="font-bold">{columna.texto}</b>
				<span className="ml-auto font-bold text-tinta2 tabular-nums">{columna.pedidos.length}</span>
			</header>
			{columna.pedidos.length === 0 ? (
				<p className="m-0 px-1 py-3 text-tinta3">Ninguno</p>
			) : (
				columna.pedidos.map((tarjeta) => (
					<TarjetaDePedido
						key={tarjeta.pedido_linea_id}
						tarjeta={tarjeta}
						alAbrir={() => alAbrir(tarjeta.pedido_linea_id)}
					/>
				))
			)}
		</section>
	);
}

/**
 * Los cerrados: cancelados y vencidos, el más reciente arriba, con «Ver más».
 * @param props Los cerrados de las páginas leídas, su «Ver más» (si hay otra página) y qué hacer al tocar uno.
 */
function Cerrados({
	cerrados,
	verMas,
	alAbrir,
}: {
	cerrados: Pedidos["cerrados"];
	verMas: ReactNode;
	alAbrir: (id: string) => void;
}) {
	if (cerrados.length === 0) return null;
	return (
		<section aria-label="Cerrados">
			<Panel titulo="Cerrados">
				<ul className="m-0 flex list-none flex-col divide-y divide-linea p-0">
					{cerrados.map((cerrado) => (
						<li key={cerrado.pedido_linea_id}>
							<button
								type="button"
								onClick={() => alAbrir(cerrado.pedido_linea_id)}
								className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-4 py-3 text-left hover:bg-suave max-telefono:grid-cols-[auto_1fr]"
							>
								<b className="font-bold tabular-nums">{cerrado.folio}</b>
								<span className="text-tinta2">{cerrado.detalle}</span>
								<Estado texto={cerrado.estado_texto.texto} color={cerrado.estado_texto.color} />
								<b className="text-right font-bold tabular-nums">{montoEnPantalla(cerrado.total_centavos)}</b>
							</button>
						</li>
					))}
				</ul>
				{verMas === null ? null : <div className="flex justify-center pt-3">{verMas}</div>}
			</Panel>
		</section>
	);
}

/** Pedidos de Tienda en línea. */
export function PestanaPedidos() {
	const { busqueda, navegar, abrir } = useDireccionDeLinea();
	const parametros = busqueda.buscar === undefined ? {} : { buscar: busqueda.buscar };
	const paginas = usePaginas(pedidosLinea, parametros);
	return (
		<div className="flex flex-col gap-5">
			<div className="max-w-md">
				<Buscador
					etiqueta="Buscar pedidos"
					ayuda="Folio o cliente"
					valor={busqueda.buscar ?? ""}
					alBuscar={(texto) => navegar({ buscar: texto.trim() || undefined })}
				/>
			</div>
			<SegunPaginas paginas={paginas}>
				{({ primera, todas, verMas }) => {
					const cerrados = todas.flatMap((pagina) => pagina.cerrados);
					const sinResultados =
						busqueda.buscar !== undefined &&
						cerrados.length === 0 &&
						primera.columnas.every((columna) => columna.pedidos.length === 0);
					return sinResultados ? (
						<EstadoDePantalla tipo="vacio" texto="Ningún pedido con ese folio o cliente" />
					) : (
						<>
							<div className="grid auto-cols-[minmax(250px,1fr)] grid-flow-col items-start gap-4 overflow-x-auto pb-1">
								{primera.columnas.map((columna) => (
									<ColumnaDelTablero key={columna.estado} columna={columna} alAbrir={abrir} />
								))}
							</div>
							<Cerrados cerrados={cerrados} verMas={verMas} alAbrir={abrir} />
						</>
					);
				}}
			</SegunPaginas>
		</div>
	);
}
