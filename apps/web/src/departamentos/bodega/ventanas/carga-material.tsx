/**
 * La ventana «Carga inicial de material»: el material (los que no tienen carga ni movimientos), «Cuánto hay» en su
 * unidad y, en tela, sus rollos (metros y partida, con «Otro rollo»), que tienen que sumar lo que hay. «Registrar carga
 * inicial» llama `inventario.registrar_carga_inicial_material`.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Ventanas») y docs/modulos/inventario/conteos.md
 * («`inventario.registrar_carga_inicial_material`»)
 */

import type { materialesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { registrarCargaInicialMaterial } from "@uniformame/compartido/contratos/inventario/diferencias";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../comun.tsx";

/** Un material sin carga inicial. */
type SinCarga = z.infer<typeof materialesDeBodega.resultado>["sin_carga"][number];

/** Un rollo que se captura. */
interface RolloCapturado {
	clave: number;
	metros: string;
	partida: string;
}

/**
 * La ventana «Carga inicial de material».
 * @param props Los materiales sin carga y cómo cerrar la ventana.
 */
export function VentanaCargaMaterial({
	materiales,
	alCerrar,
}: {
	materiales: readonly SinCarga[];
	alCerrar: () => void;
}) {
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(registrarCargaInicialMaterial);
	const [materialId, setMaterialId] = useState(materiales[0]?.material_id ?? "");
	const [cantidad, setCantidad] = useState("");
	const [rollos, setRollos] = useState<readonly RolloCapturado[]>([]);
	const [errores, setErrores] = useState<Record<string, string>>({});
	const material = materiales.find((suyo) => suyo.material_id === materialId);
	const suma = rollos.reduce((total, rollo) => total + (Number(rollo.metros) || 0), 0);
	/** Cambia un rollo capturado. */
	const cambiar = (clave: number, cambios: Partial<RolloCapturado>) =>
		setRollos((antes) => antes.map((rollo) => (rollo.clave === clave ? { ...rollo, ...cambios } : rollo)));
	const mandar = async () => {
		const salio = await enviar(
			{
				datos: {
					material_id: materialId,
					cantidad: cantidad.trim(),
					...(material?.es_tela === true && rollos.length > 0
						? {
								rollos: rollos.map((rollo) => ({
									metros: rollo.metros.trim(),
									...(rollo.partida.trim() === "" ? {} : { partida: rollo.partida.trim() }),
								})),
							}
						: {}),
				},
			},
			(falla) => setErrores(falla.campos),
		);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			ancha
			alCerrar={alCerrar}
			titulo="Carga inicial de material"
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || material === undefined || cantidad.trim() === ""}
					onClick={() => void mandar()}
				>
					Registrar carga inicial
				</Boton>
			}
		>
			<div className="flex flex-col gap-3">
				<Selector
					etiqueta="Material"
					enVentana
					opciones={materiales.map((suyo) => ({ valor: suyo.material_id, texto: suyo.nombre }))}
					value={materialId}
					onChange={(evento) => {
						setMaterialId(evento.target.value);
						setRollos([]);
					}}
				/>
				<Campo
					etiqueta={`Cuánto hay${material === undefined ? "" : `, en ${material.unidad}`}`}
					enVentana
					inputMode="decimal"
					value={cantidad}
					error={errores.cantidad}
					onChange={(evento) => setCantidad(evento.target.value)}
				/>
				{material?.es_tela === true ? (
					<div className="flex flex-col gap-2">
						<b className="font-bold">Rollos</b>
						{rollos.map((rollo, indice) => (
							<div key={rollo.clave} className="grid grid-cols-2 gap-2">
								<Campo
									etiqueta={`Metros del rollo ${indice + 1}`}
									enVentana
									inputMode="decimal"
									value={rollo.metros}
									error={errores[`rollos.${indice}.metros`]}
									onChange={(evento) => cambiar(rollo.clave, { metros: evento.target.value })}
								/>
								<Campo
									etiqueta="Partida"
									enVentana
									value={rollo.partida}
									error={errores[`rollos.${indice}.partida`]}
									onChange={(evento) => cambiar(rollo.clave, { partida: evento.target.value })}
								/>
							</div>
						))}
						<div className="flex items-center justify-between gap-3">
							<Boton
								chico
								icono={Plus}
								onClick={() => setRollos((antes) => [...antes, { clave: Date.now(), metros: "", partida: "" }])}
							>
								Otro rollo
							</Boton>
							{rollos.length === 0 ? null : (
								<TextoConTono tono={Number(cantidad) === suma ? "normal" : "ambar"}>
									{`Suman ${Number(suma.toFixed(3))} m`}
								</TextoConTono>
							)}
						</div>
					</div>
				) : null}
			</div>
		</Ventana>
	);
}
