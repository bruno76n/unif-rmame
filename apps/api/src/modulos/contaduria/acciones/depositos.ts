/**
 * `contaduria.aplicar_deposito_a_tercero`: lo que un cliente depositó en la cuenta de un tercero se aplica después a
 * una deuda con ese tercero.
 * Fase 17 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md (regla 4, «`contaduria.aplicar_deposito_a_tercero`»)
 */

import { aplicarDepositoATercero } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { eq } from "drizzle-orm";
import { nombreDeCuenta, quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { bloquearDocumentosDeCuentas } from "../dominio/cuentas-por-pagar.ts";
import { aplicarDeposito } from "../dominio/depositos.ts";
import { enPesos } from "../dominio/pagos.ts";
import { pagos } from "../tablas.ts";

export const accionAplicarDepositoATercero = implementarAccion(
	aplicarDepositoATercero,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		// Los documentos de la deuda primero, luego el pago con su versión y la cuenta.
		const documentos = await bloquearDocumentosDeCuentas(contexto, [datos.cuenta_por_pagar_id]);
		const [pago] = await transaccion.select().from(pagos).where(eq(pagos.id, datos.pago_id)).for("update");
		if (pago === undefined) throw noExiste();
		await tomarVersion(contexto, pagos, pago.id, version, async () => ({
			pago_id: pago.id,
			folio: pago.folio,
			estado: pago.estado,
		}));
		if (pago.medio !== "cuenta_tercero" || pago.terceroDepositoId === null) {
			throw errorDeRegla("pago_no_es_deposito_a_tercero", `${pago.folio} no fue a la cuenta de un tercero.`);
		}
		if (pago.estado === "cancelado") throw errorDeRegla("pago_cancelado", `${pago.folio} está cancelado.`);
		const aplicado = await aplicarDeposito(
			contexto,
			{ id: pago.id, folio: pago.folio, montoCentavos: pago.montoCentavos, terceroDepositoId: pago.terceroDepositoId },
			datos.cuenta_por_pagar_id,
			documentos,
		);
		contexto.guardarEvento({
			tipo: "pago.aplicado",
			datos: { pago_id: pago.id, cuenta_por_pagar_id: datos.cuenta_por_pagar_id },
			tablas: ["pagos", "aplicaciones_pago", "cuentas_por_pagar"],
			entidad: "pagos",
			entidadId: pago.id,
			entidadFolio: pago.folio,
		});
		contexto.bitacora({
			descripcion: `${await nombreDeCuenta(contexto, quienCambia(contexto))} aplicó ${pago.folio} a ${aplicado.documento} de ${aplicado.tercero}`,
			entidad: "pagos",
			entidadId: pago.id,
			entidadFolio: pago.folio,
			antes: { saldo_deuda_centavos: aplicado.saldoAntes },
			despues: {
				saldo_deuda_centavos: aplicado.saldoDespues,
				queda_centavos: aplicado.queda,
				...(aplicado.cambiaron.ordenes.length === 0 ? {} : { ordenes_cerradas: aplicado.cambiaron.ordenes }),
				...(aplicado.cambiaron.deudas.length === 0 ? {} : { deudas_saldadas: aplicado.cambiaron.deudas }),
			},
		});
		const sobra = aplicado.queda > 0 ? `. Quedan ${enPesos(aplicado.queda)} a favor con ${aplicado.tercero}` : "";
		return {
			resultado: {
				mensaje: `${pago.folio} aplicado a ${aplicado.documento} de ${aplicado.tercero}${sobra}`,
				pago_id: pago.id,
				queda_centavos: aplicado.queda,
			},
			entidad: { nombre: "pagos", id: pago.id },
		};
	},
);
