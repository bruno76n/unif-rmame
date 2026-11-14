/**
 * La ventana «Nuevo material»: nombre, tipo, en qué se mide, su presentación y su color, la unidad de la receta si es
 * otra, su proveedor y su costo, cómo se pide y, en un consumible, su unidad de la tablet. «Agregar material» llama
 * `compras.crear_material` y lleva a Materiales con el material resaltado. Nace en 0: lo que haya lo registra Bodega.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Ventanas», «Nuevo material») y docs/modulos/compras/materiales.md
 * («`compras.crear_material`»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import type { materialesDeCompras } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { crearMaterial, tiposDeMaterial, unidadesDeReceta } from "@uniformame/compartido/contratos/compras/materiales";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { type Path, useForm } from "react-hook-form";
import { z } from "zod";
import { erroresEnSusCampos, useEnvioConCampos } from "../../../comun/envio.ts";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { rutaDePestana } from "../../../comun/pagina-de-departamento.tsx";
import { numeroEscrito } from "../comun.tsx";
import { useDireccionDeCompras } from "../direccion.ts";

/** Lo que pide la ventana, de `compras.materiales`. */
type ParaNuevo = z.infer<typeof materialesDeCompras.resultado>["para_nuevo"];

/** Lo capturado, como texto. */
interface Capturado {
	nombre: string;
	tipo: string;
	unidad: string;
	presentacion: string;
	color: string;
	unidad_receta: string;
	factor_receta: string;
	proveedor_id: string;
	costo_centavos: string;
	minimo: string;
	multiplo_compra: string;
	dias_cubre: string;
	consumo_diario_inicial: string;
	unidad_tablet: string;
	factor_tablet: string;
}

/** Cómo se dice cada tipo. */
const nombresDeTipo: Readonly<Record<(typeof tiposDeMaterial)[number], string>> = {
	tela: "Tela",
	avio: "Avío",
	consumible: "Consumible del taller",
};

/** Los errores de regla de `compras.crear_material` que van junto a un campo, por su código. */
const campoDelCodigo: Readonly<Record<string, Path<Capturado>>> = {
	nombre_repetido: "nombre",
	unidad_no_existe: "unidad",
	tela_en_metros: "unidad",
	proveedor_dado_de_baja: "proveedor_id",
};

/** Lo capturado se revisa con la entrada de `compras.crear_material`, como la revisa la API. */
const formularioDeMaterial = z
	.custom<Capturado>()
	.transform((valores): unknown => aDatos(valores))
	.pipe(crearMaterial.entrada);

/**
 * Lo capturado como los datos de `compras.crear_material`: lo vacío no va; el costo se escribe en pesos.
 * @param valores Lo capturado.
 */
function aDatos(valores: Capturado) {
	const opcional = (texto: string) => (texto.trim() === "" ? undefined : texto.trim());
	return {
		nombre: valores.nombre,
		tipo: valores.tipo === "" ? undefined : valores.tipo,
		unidad: valores.unidad,
		presentacion: opcional(valores.presentacion),
		color: opcional(valores.color),
		unidad_receta: opcional(valores.unidad_receta),
		factor_receta: opcional(valores.factor_receta),
		unidad_tablet: opcional(valores.unidad_tablet),
		factor_tablet: opcional(valores.factor_tablet),
		proveedor_id: valores.proveedor_id === "" ? undefined : valores.proveedor_id,
		costo_centavos: pesosACentavos(valores.costo_centavos) ?? undefined,
		minimo: numeroEscrito(valores.minimo),
		multiplo_compra: numeroEscrito(valores.multiplo_compra),
		dias_cubre: numeroEscrito(valores.dias_cubre),
		consumo_diario_inicial: opcional(valores.consumo_diario_inicial),
	};
}

/**
 * La ventana «Nuevo material».
 * @param props Si está abierta, cómo cerrarla y lo que pide (unidades, proveedores y los días que propone).
 */
export function VentanaNuevoMaterial({
	abierta,
	alCerrar,
	paraNuevo,
}: {
	abierta: boolean;
	alCerrar: () => void;
	paraNuevo: ParaNuevo;
}) {
	const { ir } = useDireccionDeCompras();
	const conConexion = useConConexion();
	const crear = useEnvioConCampos(crearMaterial, ["compras.materiales", "compras.pendientes", "compras.por_pedir"]);
	const formulario = useForm<Capturado, unknown, z.output<typeof formularioDeMaterial>>({
		resolver: zodResolver(formularioDeMaterial),
		defaultValues: {
			nombre: "",
			tipo: "",
			unidad: "",
			presentacion: "",
			color: "",
			unidad_receta: "",
			factor_receta: "",
			proveedor_id: "",
			costo_centavos: "",
			minimo: "0",
			multiplo_compra: "1",
			dias_cubre: String(paraNuevo.dias_cubre_inicial),
			consumo_diario_inicial: "",
			unidad_tablet: "",
			factor_tablet: "",
		},
	});
	const { register, handleSubmit, watch, setError, reset, formState } = formulario;
	const error = (campo: keyof Capturado) => formState.errors[campo]?.message;
	const tipo = watch("tipo");
	const unidadReceta = watch("unidad_receta");
	const cerrar = () => {
		reset();
		alCerrar();
	};
	const agregar = handleSubmit(async (datos) => {
		const salio = await crear.enviar(
			{ datos },
			(campos) => erroresEnSusCampos(campos, formulario),
			(falla) => {
				const campo = falla.codigo === null ? undefined : campoDelCodigo[falla.codigo];
				if (campo !== undefined) setError(campo, { message: falla.mensaje });
			},
		);
		if (salio === undefined) return;
		cerrar();
		ir({ resaltar: salio.material_id }, rutaDePestana("compras", "materiales"));
	});
	return (
		<Ventana
			abierta={abierta}
			alCerrar={cerrar}
			titulo="Nuevo material"
			ancha
			accion={
				<Boton variante="principal" disabled={!conConexion || crear.enviando} onClick={agregar}>
					Agregar material
				</Boton>
			}
		>
			<form className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1" onSubmit={agregar}>
				<div className="col-span-2 max-telefono:col-span-1">
					<Campo etiqueta="Nombre" enVentana error={error("nombre")} {...register("nombre")} />
				</div>
				<Selector
					etiqueta="Tipo"
					enVentana
					vacio="Escoge el tipo"
					opciones={tiposDeMaterial.map((valor) => ({ valor, texto: nombresDeTipo[valor] }))}
					error={error("tipo")}
					{...register("tipo")}
				/>
				<Selector
					etiqueta="Se mide en"
					enVentana
					vacio="Escoge cómo se mide"
					opciones={paraNuevo.unidades.map((unidad) => ({ valor: unidad.clave, texto: unidad.nombre }))}
					error={error("unidad")}
					{...register("unidad")}
				/>
				<Campo
					etiqueta="Medida o presentación (opcional)"
					enVentana
					placeholder="Ancho 1.50 m"
					error={error("presentacion")}
					{...register("presentacion")}
				/>
				<Campo
					etiqueta="Color (opcional)"
					enVentana
					placeholder="#1F2A5C"
					error={error("color")}
					{...register("color")}
				/>
				<Selector
					etiqueta="Patronaje lo captura en"
					enVentana
					vacio="La misma unidad"
					opciones={unidadesDeReceta.map((valor) => ({ valor, texto: valor }))}
					error={error("unidad_receta")}
					{...register("unidad_receta")}
				/>
				{unidadReceta === "" ? (
					<span />
				) : (
					<Campo
						etiqueta={`Cuántas ${unidadReceta} trae cada unidad`}
						enVentana
						inputMode="decimal"
						error={error("factor_receta")}
						{...register("factor_receta")}
					/>
				)}
				<Selector
					etiqueta="Proveedor"
					enVentana
					vacio="Escoge el proveedor"
					opciones={paraNuevo.proveedores.map((proveedor) => ({
						valor: proveedor.proveedor_id,
						texto: proveedor.nombre,
					}))}
					error={error("proveedor_id")}
					{...register("proveedor_id")}
				/>
				<Campo
					etiqueta="Costo por unidad"
					enVentana
					inputMode="decimal"
					placeholder="78"
					error={error("costo_centavos")}
					{...register("costo_centavos")}
				/>
				<Campo etiqueta="Mínimo" enVentana inputMode="numeric" error={error("minimo")} {...register("minimo")} />
				<Campo
					etiqueta="Se compra de … en …"
					enVentana
					inputMode="numeric"
					error={error("multiplo_compra")}
					{...register("multiplo_compra")}
				/>
				<Campo
					etiqueta="Cada pedido cubre (días)"
					enVentana
					inputMode="numeric"
					error={error("dias_cubre")}
					{...register("dias_cubre")}
				/>
				<Campo
					etiqueta="Consumo por día mientras no se mide (opcional)"
					enVentana
					inputMode="decimal"
					error={error("consumo_diario_inicial")}
					{...register("consumo_diario_inicial")}
				/>
				{tipo === "consumible" ? (
					<>
						<Campo
							etiqueta="La tablet lo toma en"
							enVentana
							placeholder="agujas"
							error={error("unidad_tablet")}
							{...register("unidad_tablet")}
						/>
						<Campo
							etiqueta="Cuántas hacen una unidad"
							enVentana
							inputMode="decimal"
							error={error("factor_tablet")}
							{...register("factor_tablet")}
						/>
					</>
				) : null}
			</form>
		</Ventana>
	);
}
