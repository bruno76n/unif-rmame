/**
 * La ventana «Nuevo proveedor»: nombre, RFC (opcional), ciudad, teléfono a 10 dígitos, condición de pago (días de
 * crédito; 0 es contado), días que dice tardar y qué surte (opcional). «Agregar proveedor» llama
 * `compras.crear_proveedor` y lleva a Proveedores con el proveedor resaltado.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Ventanas», «Nuevo proveedor») y
 * docs/modulos/compras/proveedores-y-precios.md («`compras.crear_proveedor`»)
 */

import { crearProveedor } from "@uniformame/compartido/contratos/compras/proveedores";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useForm } from "react-hook-form";
import { useAccion } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { rutaDePestana } from "../../../comun/pagina-de-departamento.tsx";
import { erroresDeLaAccion, numeroEscrito, validadorDelContrato } from "../comun.tsx";
import { useDireccionDeCompras } from "../direccion.ts";

/** Lo capturado, como texto. */
interface Capturado {
	nombre: string;
	rfc: string;
	ciudad: string;
	telefono: string;
	dias_credito: string;
	dias_dice_tardar: string;
	surte: string;
}

/**
 * Lo capturado como los datos de `compras.crear_proveedor`: lo opcional vacío no va.
 * @param valores Lo capturado.
 */
function aDatos(valores: Capturado) {
	return {
		nombre: valores.nombre,
		ciudad: valores.ciudad,
		telefono: valores.telefono,
		dias_credito: numeroEscrito(valores.dias_credito),
		dias_dice_tardar: numeroEscrito(valores.dias_dice_tardar),
		...(valores.rfc.trim() === "" ? {} : { rfc: valores.rfc }),
		...(valores.surte.trim() === "" ? {} : { surte: valores.surte }),
	};
}

/**
 * La ventana «Nuevo proveedor».
 * @param props Si está abierta y cómo cerrarla.
 */
export function VentanaNuevoProveedor({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
	const { ir } = useDireccionDeCompras();
	const conConexion = useConConexion();
	const crear = useAccion(crearProveedor, ["compras.proveedores", "compras.pendientes", "compras.materiales"]);
	const { register, handleSubmit, setError, reset, formState } = useForm<Capturado>({
		resolver: validadorDelContrato(crearProveedor.entrada, aDatos),
		defaultValues: {
			nombre: "",
			rfc: "",
			ciudad: "",
			telefono: "",
			dias_credito: "0",
			dias_dice_tardar: "",
			surte: "",
		},
	});
	const error = (campo: keyof Capturado) => formState.errors[campo]?.message;
	const cerrar = () => {
		reset();
		alCerrar();
	};
	const agregar = handleSubmit((valores) =>
		crear.mutate(
			{ datos: crearProveedor.entrada.parse(aDatos(valores)) },
			{
				onSuccess: ({ proveedor_id: id }) => {
					cerrar();
					ir({ resaltar: id }, rutaDePestana("compras", "proveedores"));
				},
				onError: (falla) => erroresDeLaAccion(falla, valores, setError, { proveedor_repetido: "nombre" }),
			},
		),
	);
	return (
		<Ventana
			abierta={abierta}
			alCerrar={cerrar}
			titulo="Nuevo proveedor"
			accion={
				<Boton variante="principal" disabled={!conConexion || crear.isPending} onClick={agregar}>
					Agregar proveedor
				</Boton>
			}
		>
			<form className="flex flex-col gap-3" onSubmit={agregar}>
				<Campo etiqueta="Nombre" enVentana error={error("nombre")} {...register("nombre")} />
				<Campo etiqueta="RFC (opcional)" enVentana error={error("rfc")} {...register("rfc")} />
				<Campo etiqueta="Ciudad" enVentana error={error("ciudad")} {...register("ciudad")} />
				<Campo etiqueta="Teléfono" enVentana inputMode="tel" error={error("telefono")} {...register("telefono")} />
				<Campo
					etiqueta="Condición de pago (días de crédito; 0 es contado)"
					enVentana
					inputMode="numeric"
					error={error("dias_credito")}
					{...register("dias_credito")}
				/>
				<Campo
					etiqueta="Días que dice tardar"
					enVentana
					inputMode="numeric"
					error={error("dias_dice_tardar")}
					{...register("dias_dice_tardar")}
				/>
				<Campo etiqueta="Qué surte (opcional)" enVentana error={error("surte")} {...register("surte")} />
			</form>
		</Ventana>
	);
}
