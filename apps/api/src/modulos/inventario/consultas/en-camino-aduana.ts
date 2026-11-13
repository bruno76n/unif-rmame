/**
 * `inventario.en_camino_aduana`: lo que ya salió de Bodega o de una tienda hacia aduana y Aduana no ha recibido, lo
 * más viejo primero, por páginas. Es una ubicación: entra al cuadre y responde quien lo mandó.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («En camino a aduana») y docs/modulos/inventario/traspasos.md («La
 * antigüedad en aduana y lo que no se confirma»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { enCaminoAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { paginarLista } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	cuantoViene,
	destinoEnCamino,
	diasDesde,
	leerEnCamino,
	parametrosDeAduana,
	queViene,
	quienLoManda,
	sinConfirmar,
	tipoEscrito,
} from "./aduana-comun.ts";

/** Cuántos renglones por página, si no se pide otro número. */
const limitePorOmision = 50;

export const consultaEnCaminoAduana = implementarConsulta(enCaminoAduana, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const filas = await leerEnCamino(accion, { soloEnCamino: true });
		const { diasSinConfirmarRojo } = await parametrosDeAduana(accion);
		const pagina = paginarLista(filas, parametros.cursor, parametros.limite ?? limitePorOmision);
		return {
			renglones: pagina.renglones.map((fila) => ({
				traspaso_id: fila.id,
				folio: fila.folio,
				fecha: fila.enviado_dia === null ? "—" : textoDeDiaCorto(fila.enviado_dia),
				que: queViene(fila),
				detalle: `${tipoEscrito(fila.tipo)} · va a ${destinoEnCamino(fila).destino}`,
				cantidad: cuantoViene(fila),
				responde: quienLoManda(fila),
				salio: sinConfirmar(
					fila.enviado_dia === null ? 0 : diasDesde(accion.diaDeNegocio, fila.enviado_dia),
					diasSinConfirmarRojo,
				),
			})),
			cursor: pagina.cursor,
			hay_mas: pagina.hay_mas,
		};
	}),
}));
