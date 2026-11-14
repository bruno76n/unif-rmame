/**
 * La ventana «Otro proveedor para {material}»: el proveedor (los que todavía no lo surten, «{nombre} · {lo que surte}»)
 * y el precio por su unidad («La última compra fue a ${precio}»). «Agregar» llama `compras.agregar_proveedor_material`.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Ventanas», «Otro proveedor para {material}») y
 * docs/modulos/compras/proveedores-y-precios.md («`compras.agregar_proveedor_material`»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { agregarProveedorMaterial } from "@uniformame/compartido/contratos/compras/materiales";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { erroresEnSusCampos, useEnvioConCampos } from "../../../comun/envio.ts";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";

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
	const agregar = useEnvioConCampos(agregarProveedorMaterial, ["compras.material", "compras.materiales"]);
	// Lo capturado se revisa con la entrada de `compras.agregar_proveedor_material`, como la revisa la API.
	const esquema = z
		.custom<Capturado>()
		.transform((valores): unknown => ({
			material_id: material.material_id,
			proveedor_id: valores.proveedor_id === "" ? undefined : valores.proveedor_id,
			precio_centavos: pesosACentavos(valores.precio_centavos) ?? undefined,
		}))
		.pipe(agregarProveedorMaterial.entrada);
	const formulario = useForm<Capturado, unknown, z.output<typeof esquema>>({
		resolver: zodResolver(esquema),
		defaultValues: { proveedor_id: "", precio_centavos: "" },
	});
	const { register, handleSubmit, setError, reset, formState } = formulario;
	const cerrar = () => {
		reset();
		alCerrar();
	};
	const enviar = handleSubmit(async (datos) => {
		const salio = await agregar.enviar(
			{ datos, version: material.version },
			(campos) => erroresEnSusCampos(campos, formulario),
			(falla) => {
				// Los errores del proveedor escogido van junto a él.
				if (falla.codigo === "ya_lo_surte" || falla.codigo === "proveedor_dado_de_baja") {
					setError("proveedor_id", { message: falla.mensaje });
				}
			},
		);
		if (salio !== undefined) cerrar();
	});
	return (
		<Ventana
			abierta={abierta}
			alCerrar={cerrar}
			titulo={`Otro proveedor para ${material.nombre}`}
			accion={
				<Boton variante="principal" disabled={!conConexion || agregar.enviando} onClick={enviar}>
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
					<span className="text-etiqueta text-tinta2">La última compra fue a {montoEnPantalla(ultimoPrecio)}</span>
				)}
			</form>
		</Ventana>
	);
}
