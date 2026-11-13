/**
 * `contaduria.ve_documento`: si quien llama puede ver un documento de `contaduria`, para abrir sus archivos.
 * Fase 19 · docs/modulos/admin/archivos.md (regla 7) y docs/interfaz/fabrica/contaduria.md («Gastos», «Cuentas por
 * pagar» y «Contador externo»)
 *
 * Los documentos de `contaduria` con archivo son el gasto (su comprobante), la factura de proveedor (su XML, su PDF y
 * su nota de crédito), el documento del contador y el paquete del mes (su ZIP). Los ve Contaduría: Compras solo recibe
 * el aviso de que una factura cambió, sin sus montos. El ZIP del paquete lleva la nómina del mes en su relación, así
 * que pide además «ven sueldos y tarifas», como la nómina del paquete en pantalla. Cualquier otro, nadie.
 */

import { z } from "zod";
import { tieneDepartamento, veSueldosYTarifas } from "../../../nucleo/acceso/quien.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";

/** Lo que recibe. */
const documento = z.object({ entidad: z.string(), entidad_id: z.uuid() });

/** Los documentos de Contaduría cuyos archivos ve quien tiene Contaduría. */
const documentosDeContaduria: readonly string[] = ["gastos", "facturas_proveedor", "documentos_contador"];

/**
 * Dice si quien llama ve el documento.
 * @param contexto El contexto de quien abre el archivo.
 * @param datos `entidad` y `entidad_id`.
 */
export async function veDocumento(contexto: ContextoDeAccion, datos: unknown): Promise<boolean> {
	const { entidad } = documento.parse(datos);
	const { quien } = contexto;
	if (!tieneDepartamento(quien, "contaduria")) return false;
	if (entidad === "paquetes_contador") return veSueldosYTarifas(quien);
	return documentosDeContaduria.includes(entidad);
}
