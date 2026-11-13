/**
 * La ventana «Otro proveedor para {material}»: el proveedor (los que todavía no lo surten, «{nombre} · {lo que surte}»)
 * y el precio por su unidad («La última compra fue a ${precio}»). «Agregar» llama `compras.agregar_proveedor_material`.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Ventanas», «Otro proveedor para {material}») y
 * docs/modulos/compras/proveedores-y-precios.md («`compras.agregar_proveedor_material`»)
 */

import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { agregarProveedorMaterial } from "@uniformame/compartido/contratos/compras/materiales";
import { pesos } from "@uniformame/compartido/contratos/compras/textos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useForm } from "react-hook-form";
import { useAccion } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { erroresDeLaAccion, validadorDelContrato } from "../comun.tsx";

/** Lo capturado, como texto. */
interface Capturado {
	proveedor_id: string;
	precio_centavos: string;
}

/** Lo que recibe la ventana. */
interface PropsDeOtroProveedor {
	abierta: boolean;
	alCerrar: () => void;
	material: { material_id: string; nombre: string; unidad: string; version: number };
	otros: readonly { proveedor_id: string; nombre: string; surte: string | null }[];
	ultimoPrecio: number | null;
}

/**
 * La ventana «Otro proveedor para {material}».
 * @param props Si está abierta, el material con su versión, los proveedores que no lo surten y su última compra.
 */
export function VentanaOtroProveedor({ abierta, alCerrar, material, otros, ultimoPrecio }: PropsDeOtroProveedor) {
	const conConexion = useConConexion();
	const agregar = useAccion(agregarProveedorMaterial, ["compras.material", "compras.materiales"]);
	const aDatos = (valores: Capturado) => ({
		material_id: material.material_id,
		proveedor_id: valores.proveedor_id === "" ? undefined : valores.proveedor_id,
		precio_centavos: pesosACentavos(valores.precio_centavos) ?? undefined,
	});
	const { register, handleSubmit, setError, reset, formState } = useForm<Capturado>({
		resolver: validadorDelContrato(agregarProveedorMaterial.entrada, aDatos),
		defaultValues: { proveedor_id: "", precio_centavos: "" },
	});
	const cerrar = () => {
		reset();
		alCerrar();
	};
	const enviar = handleSubmit((valores) =>
		agregar.mutate(
			{ datos: agregarProveedorMaterial.entrada.parse(aDatos(valores)), version: material.version },
			{
				onSuccess: cerrar,
				onError: (falla) =>
					erroresDeLaAccion(falla, valores, setError, {
						ya_lo_surte: "proveedor_id",
						proveedor_dado_de_baja: "proveedor_id",
					}),
			},
		),
	);
	return (
		<Ventana
			abierta={abierta}
			alCerrar={cerrar}
			titulo={`Otro proveedor para ${material.nombre}`}
			accion={
				<Boton variante="principal" disabled={!conConexion || agregar.isPending} onClick={enviar}>
					Agregar
				</Boton>
			}
		>
			<form className="flex flex-col gap-3" onSubmit={enviar}>
				<Selector
					etiqueta="Proveedor"
					enVentana
					vacio="Escoge el proveedor"
					opciones={otros.map((otro) => ({
						valor: otro.proveedor_id,
						texto: otro.surte === null ? otro.nombre : `${otro.nombre} · ${otro.surte}`,
					}))}
					error={formState.errors.proveedor_id?.message}
					{...register("proveedor_id")}
				/>
				<Campo
					etiqueta={`Precio por ${material.unidad}`}
					enVentana
					inputMode="decimal"
					error={formState.errors.precio_centavos?.message}
					{...register("precio_centavos")}
				/>
				{ultimoPrecio === null ? null : (
					<span className="text-etiqueta text-tinta2">La última compra fue a {pesos(ultimoPrecio)}</span>
				)}
			</form>
		</Ventana>
	);
}
