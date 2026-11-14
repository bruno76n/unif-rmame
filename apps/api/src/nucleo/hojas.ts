/**
 * Lo que lleva toda hoja en PDF además de su contenido: los datos de la empresa (lectura `admin.empresa`) y «Sacada el
 * {fecha} a las {hora} por {nombre}», con la hora de México y el nombre de quien la pide (`nombreDeCuenta`). Lo usan
 * los tipos de hoja de cada módulo antes de dibujar.
 * Fase 20 · docs/impresos/hojas.md (reglas 2 y 3)
 */

import { diaDeNegocio, textoDeDiaConAnio, textoDeHora } from "@uniformame/compartido/calculos/fechas";
import { z } from "zod";
import type { MarcoDeLaHoja } from "../impresos/hoja.ts";
import { nombreDeCuenta } from "./acciones/comunes.ts";
import type { ContextoDeConsulta } from "./modulos.ts";

/** Lo que regresa `admin.empresa`. */
const deLaEmpresa = z.object({
	nombre_comercial: z.string(),
	razon_social: z.string(),
	rfc: z.string(),
	domicilio: z.string(),
});

/**
 * El marco de una hoja: la empresa, su nombre, su folio y su fecha, y quién la sacó y cuándo.
 * @param contexto El contexto de quien pide la hoja.
 * @param hoja Su nombre («Orden de compra»), su folio y lo que va debajo del folio.
 */
export async function marcoDeLaHoja(
	contexto: ContextoDeConsulta,
	hoja: Pick<MarcoDeLaHoja, "nombre" | "folio" | "fecha">,
): Promise<MarcoDeLaHoja> {
	const empresa = deLaEmpresa.parse(await contexto.lectura("admin.empresa", {}));
	const { quien } = contexto;
	const nombre =
		quien.tipo === "cuenta" ? await contexto.comoAccion((accion) => nombreDeCuenta(accion, quien.usuarioId)) : null;
	const hoy = diaDeNegocio(contexto.ahora);
	const hora = textoDeHora(contexto.ahora);
	return {
		...hoja,
		empresa: {
			nombreComercial: empresa.nombre_comercial,
			razonSocial: empresa.razon_social,
			rfc: empresa.rfc,
			domicilio: empresa.domicilio,
		},
		sacada: `Sacada el ${textoDeDiaConAnio(hoy)} a las ${hora}${nombre === null ? "" : ` por ${nombre}`}`,
	};
}
