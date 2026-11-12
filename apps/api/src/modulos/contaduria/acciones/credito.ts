/**
 * `contaduria.cambiar_limite_credito`, `contaduria.cambiar_dias_credito` y `contaduria.cambiar_semaforo_credito`:
 * Contaduría cambia el crédito de un cliente.
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md (reglas 2 a 4, «Acciones»)
 *
 * Las tres toman la versión del crédito (su renglón queda bloqueado hasta el final) y, con el mismo valor, responden
 * bien sin escribir nada. El semáforo nunca cambia solo: el límite regresa el sugerido, pero solo
 * `cambiar_semaforo_credito` lo pone.
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import {
	cambiarDiasCredito,
	cambiarLimiteCredito,
	cambiarSemaforoCredito,
	semaforoDeCredito,
} from "@uniformame/compartido/contratos/contaduria/credito";
import { centavos } from "@uniformame/compartido/tipos/base";
import { eq } from "drizzle-orm";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { revisarVersion, subirVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { type CreditoConNombre, creditoDelCliente, semaforoDelCliente } from "../dominio/credito.ts";
import type { SemaforoDeCredito } from "../dominio/semaforo-sugerido.ts";
import { creditoClientes } from "../tablas.ts";

/** Cómo se lee cada semáforo, en minúsculas. */
const nombreDelSemaforo: Record<SemaforoDeCredito, string> = {
	al_corriente: "al corriente",
	cerca_del_limite: "cerca del límite",
	detenido: "detenido",
};

/** Un límite como se lee: «$80,000» o «sin crédito». */
const textoDelLimite = (limite: number) => (limite === 0 ? "sin crédito" : centavosATexto(centavos(limite)));

/**
 * Lee el crédito del cliente y revisa su versión: lo bloquea hasta el final de la acción. Si cambia, sube la versión.
 * @param contexto El contexto de la acción.
 * @param clienteId El cliente.
 * @param version La versión que trajo la acción.
 * @param cambia Si la acción va a escribir (con el mismo valor solo se revisa).
 * @returns El crédito como estaba antes del cambio.
 */
async function creditoConSuVersion(
	contexto: ContextoDeAccion,
	clienteId: string,
	version: number | undefined,
	cambia: (credito: CreditoConNombre) => boolean,
): Promise<{ credito: CreditoConNombre; cambio: boolean }> {
	// Se lee dos veces: la segunda, ya con el renglón bloqueado, es la que vale.
	const leido = await creditoDelCliente(contexto.transaccion, clienteId);
	const visible = async () => {
		const ahora = await creditoDelCliente(contexto.transaccion, clienteId);
		return {
			cliente_id: clienteId,
			limite_centavos: ahora.limiteCentavos,
			dias_credito: ahora.diasCredito,
			semaforo: ahora.semaforo,
		};
	};
	await revisarVersion(contexto, creditoClientes, leido.id, version, visible);
	const credito = await creditoDelCliente(contexto.transaccion, clienteId);
	const cambio = cambia(credito);
	if (cambio) await subirVersion(contexto.transaccion, creditoClientes, credito.id);
	return { credito, cambio };
}

export const accionCambiarLimiteCredito = implementarAccion(cambiarLimiteCredito, async (contexto, datos, version) => {
	const nuevo = datos.limite_centavos;
	const { credito, cambio } = await creditoConSuVersion(
		contexto,
		datos.cliente_id,
		version,
		(actual) => actual.limiteCentavos !== nuevo,
	);
	const antes = credito.limiteCentavos;
	if (cambio) {
		const quien = quienCambia(contexto);
		await contexto.transaccion
			.update(creditoClientes)
			.set({ limiteCentavos: nuevo, limiteCambiadoEn: contexto.ahora.toString(), limiteCambiadoPor: quien })
			.where(eq(creditoClientes.id, credito.id));
		contexto.guardarEvento({
			tipo: "credito.limite_cambiado",
			datos: { credito_cliente_id: credito.id, cliente_id: datos.cliente_id },
			tablas: ["credito_clientes"],
			entidad: "credito_clientes",
			entidadId: credito.id,
		});
		contexto.bitacora({
			descripcion: `Límite de crédito de ${credito.cliente}: ${textoDelLimite(antes)} → ${textoDelLimite(nuevo)}`,
			entidad: "credito_clientes",
			entidadId: credito.id,
			antes: { limite_centavos: antes },
			despues: { limite_centavos: nuevo },
		});
	}
	const { sugerido } = await semaforoDelCliente(contexto, datos.cliente_id, nuevo);
	const mensaje =
		nuevo === 0
			? `${credito.cliente} queda sin crédito: de contado o con anticipo`
			: `Límite de crédito de ${credito.cliente}: ${textoDelLimite(nuevo)}${antes === 0 && cambio ? ". Ventas ya le puede vender a crédito" : ""}`;
	return {
		resultado: {
			mensaje,
			credito_cliente_id: credito.id,
			semaforo_sugerido: sugerido,
			version: await versionActual(contexto.transaccion, creditoClientes, credito.id),
		},
		entidad: { nombre: "credito_clientes", id: credito.id },
		...(cambio ? {} : { sinBitacora: true }),
	};
});

export const accionCambiarDiasCredito = implementarAccion(cambiarDiasCredito, async (contexto, datos, version) => {
	const { credito, cambio } = await creditoConSuVersion(
		contexto,
		datos.cliente_id,
		version,
		(actual) => actual.diasCredito !== datos.dias_credito,
	);
	const mensaje = `Crédito de ${credito.cliente}: ${datos.dias_credito} días`;
	const resultado = { mensaje, credito_cliente_id: credito.id };
	const entidad = { nombre: "credito_clientes", id: credito.id };
	if (!cambio) {
		return {
			resultado: { ...resultado, version: credito.version },
			entidad,
			sinBitacora: true,
		};
	}
	// Los pedidos ya guardados congelaron sus días: no se tocan (regla 3).
	await contexto.transaccion
		.update(creditoClientes)
		.set({ diasCredito: datos.dias_credito })
		.where(eq(creditoClientes.id, credito.id));
	contexto.guardarEvento({
		tipo: "credito.dias_cambiados",
		datos: { credito_cliente_id: credito.id, cliente_id: datos.cliente_id },
		tablas: ["credito_clientes"],
		entidad: "credito_clientes",
		entidadId: credito.id,
	});
	contexto.bitacora({
		descripcion: `Días de crédito de ${credito.cliente}: ${credito.diasCredito} → ${datos.dias_credito}`,
		entidad: "credito_clientes",
		entidadId: credito.id,
		antes: { dias_credito: credito.diasCredito },
		despues: { dias_credito: datos.dias_credito },
	});
	return {
		resultado: { ...resultado, version: await versionActual(contexto.transaccion, creditoClientes, credito.id) },
		avisos: ["Los pedidos ya guardados conservan sus días"],
		entidad,
	};
});

export const accionCambiarSemaforoCredito = implementarAccion(
	cambiarSemaforoCredito,
	async (contexto, datos, version) => {
		const { credito, cambio } = await creditoConSuVersion(
			contexto,
			datos.cliente_id,
			version,
			(actual) => actual.semaforo !== datos.semaforo,
		);
		const mensaje = `Semáforo de crédito de ${credito.cliente}: ${nombreDelSemaforo[datos.semaforo]}`;
		const resultado = { mensaje, credito_cliente_id: credito.id };
		const entidad = { nombre: "credito_clientes", id: credito.id };
		if (!cambio) return { resultado: { ...resultado, version: credito.version }, entidad, sinBitacora: true };
		const antes = semaforoDeCredito.parse(credito.semaforo);
		await contexto.transaccion
			.update(creditoClientes)
			.set({
				semaforo: datos.semaforo,
				semaforoCambiadoEn: contexto.ahora.toString(),
				semaforoCambiadoPor: quienCambia(contexto),
			})
			.where(eq(creditoClientes.id, credito.id));
		// Va en vivo a quien lee el crédito: Ventas ve «Detenido por crédito» o «Cerca de su límite de crédito».
		contexto.guardarEvento({
			tipo: "credito.semaforo_cambiado",
			datos: { credito_cliente_id: credito.id, cliente_id: datos.cliente_id, semaforo: datos.semaforo },
			tablas: ["credito_clientes"],
			entidad: "credito_clientes",
			entidadId: credito.id,
		});
		contexto.bitacora({
			descripcion: `Semáforo de ${credito.cliente}: ${nombreDelSemaforo[antes]} → ${nombreDelSemaforo[datos.semaforo]}`,
			entidad: "credito_clientes",
			entidadId: credito.id,
			antes: { semaforo: antes },
			despues: { semaforo: datos.semaforo },
		});
		return {
			resultado: { ...resultado, version: await versionActual(contexto.transaccion, creditoClientes, credito.id) },
			entidad,
		};
	},
);
