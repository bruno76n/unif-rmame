/**
 * `compras.conciliacion_facturas`: las facturas de proveedor que no cuadran con su orden y su recepción, y las órdenes
 * recibidas cuya factura no ha llegado. Solo consulta: se resuelve en Contaduría. Los mismos renglones salen en
 * Pendientes como «No cuadra» y «Esperando factura».
 * Fase 19 · docs/interfaz/fabrica/compras.md («Conciliación de facturas») y
 * docs/modulos/contaduria/facturas-de-proveedor.md (reglas 4 y 5, «`contaduria.facturacion_de_orden`»)
 *
 * Una factura detenida dice a cargo de quién está y por qué (lo guardó Contaduría al revisar sus tres puntas); una
 * orden recibida sin factura no cancelada espera al proveedor. Las facturas se leen de su tabla, sin escribir.
 */

import { conciliacionFacturas } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { renglonesDeConciliacion } from "../dominio/conciliacion.ts";

export const consultaConciliacionFacturas = implementarConsulta(conciliacionFacturas, async (contexto) => ({
	resultado: {
		renglones: await contexto.comoAccion(renglonesDeConciliacion),
	},
}));
