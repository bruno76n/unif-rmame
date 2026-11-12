/**
 * `admin.cambiar_parametro`: la dueña cambia el valor de un parámetro.
 * Fase 4 · docs/modulos/admin/configuracion.md («`admin.cambiar_parametro`»)
 *
 * Revisa el valor contra su tipo y sus límites, guarda el nuevo con `estado_decision = decidido`, escribe
 * su historial y su bitácora y guarda `parametro.cambiado`. El mismo valor que ya tenía responde bien sin
 * escribir nada. Si el parámetro decide qué baja a un aparato (lo dice la bajada de su módulo), pide la foto
 * a esos aparatos. Si es el día de pago de la nómina, Contaduría mueve las fechas de pago de las nóminas por pagar y
 * deja un renglón por cada una.
 * Fase 17 · `contaduria.mover_fecha_pago_nomina` (docs/modulos/contaduria/nomina.md, regla 12)
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { cambiarParametro } from "@uniformame/compartido/contratos/admin/configuracion";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { revisarVersion, tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import {
	columnasDelValor,
	type TipoDeParametro,
	textoCanonico,
	tipoDeParametro,
	type ValorDeParametro,
	valorDelRenglon,
} from "../../../nucleo/parametros.ts";
import { pedirLaFoto } from "../dominio/dispositivos.ts";
import { parametros, parametrosHistorial } from "../tablas.ts";

/** Un parámetro como lo lee esta acción. */
type Parametro = typeof parametros.$inferSelect;

/** Lo que regresa `contaduria.mover_fecha_pago_nomina`. */
const nominasMovidas = z.object({
	nominas: z.array(z.object({ nomina_id: z.uuid(), descripcion: z.string(), antes: z.string(), despues: z.string() })),
});

/** Una hora «HH:MM» de 00:00 a 23:59. */
const horaValida = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Revisa un número contra los límites del parámetro.
 * @throws `400` en `valor` con el mensaje de la casilla.
 */
function revisarNumero(parametro: Parametro, valor: unknown, entero: boolean): number {
	const numero = typeof valor === "number" ? valor : Number.NaN;
	if (!Number.isFinite(numero) || numero <= 0 || (entero && !Number.isInteger(numero))) {
		throw errorDeCampo("valor", "Escribe un número mayor que cero");
	}
	const { minimo, maximo } = parametro;
	if ((minimo !== null && numero < minimo) || (maximo !== null && numero > maximo)) {
		throw errorDeCampo(
			"valor",
			maximo === null ? `Escribe un número de ${minimo} o más` : `Escribe un número de ${minimo ?? 1} a ${maximo}`,
		);
	}
	return numero;
}

/**
 * Revisa el valor que llegó contra el tipo y los límites del parámetro.
 * @returns El valor ya con su tipo; `null` si quedó vacío y lo acepta.
 * @throws `400` en `valor` con el mensaje de la casilla.
 */
function revisarValor(parametro: Parametro, tipo: TipoDeParametro, valor: unknown): ValorDeParametro {
	if (valor === null || valor === "") {
		if (parametro.permiteVacio) return null;
		if (tipo === "opcion") throw errorDeCampo("valor", "Escoge una de las opciones.");
		throw errorDeCampo(
			"valor",
			tipo === "texto" || tipo === "hora" ? "Escribe el valor." : "Escribe un número mayor que cero",
		);
	}
	if (tipo === "entero" || tipo === "centavos") return revisarNumero(parametro, valor, true);
	if (tipo === "porcentaje") return revisarNumero(parametro, valor, false);
	if (tipo === "booleano") {
		if (typeof valor !== "boolean") throw errorDeCampo("valor", "Escoge sí o no.");
		return valor;
	}
	if (typeof valor !== "string") throw errorDeCampo("valor", "Escribe el valor.");
	if (tipo === "opcion" && !(parametro.opciones ?? []).includes(valor)) {
		throw errorDeCampo("valor", "Escoge una de las opciones.");
	}
	if (tipo === "hora" && !horaValida.test(valor)) throw errorDeCampo("valor", "Escribe la hora como HH:MM.");
	return valor;
}

/**
 * Un valor como se lee en la bitácora y en pantalla: `$450`, `3 días`, `Sí`, `12.5 %`.
 * @param parametro El parámetro, por su tipo y su unidad.
 * @param valor El valor.
 */
export function valorParaLeer(parametro: Pick<Parametro, "tipoValor" | "unidad">, valor: ValorDeParametro): string {
	if (valor === null) return "vacío";
	if (parametro.tipoValor === "centavos" && typeof valor === "number") return centavosATexto(centavos(valor));
	if (typeof valor === "boolean") return valor ? "Sí" : "No";
	if (parametro.tipoValor === "porcentaje") return `${valor} %`;
	return parametro.unidad === null ? String(valor) : `${valor} ${parametro.unidad}`;
}

export const accionCambiarParametro = implementarAccion(cambiarParametro, async (contexto, datos, version) => {
	const deEste = and(
		eq(parametros.clave, datos.clave),
		datos.ubicacion_id === undefined ? isNull(parametros.ubicacionId) : eq(parametros.ubicacionId, datos.ubicacion_id),
	);
	const leer = async () => (await contexto.transaccion.select().from(parametros).where(deEste))[0];
	const antes = await leer();
	if (antes === undefined) throw noExiste();
	const tipo = tipoDeParametro(antes.tipoValor);
	const nuevo = revisarValor(antes, tipo, datos.valor);
	const anterior = valorDelRenglon(antes);
	const visible = async () => {
		const ahora = await leer();
		return ahora === undefined ? undefined : { clave: ahora.clave, valor: valorDelRenglon(ahora) };
	};
	// El mismo valor que ya tenía: responde bien sin escribir nada.
	if (textoCanonico(anterior) === textoCanonico(nuevo)) {
		await revisarVersion(contexto, parametros, antes.id, version, visible);
		return { resultado: { mensaje: "Parámetro guardado", version: antes.version }, sinBitacora: true };
	}
	await tomarVersion(contexto, parametros, antes.id, version, visible);
	await contexto.transaccion
		.update(parametros)
		.set({ ...columnasDelValor(tipo, nuevo), estadoDecision: "decidido" })
		.where(eq(parametros.id, antes.id));
	const { quien } = contexto;
	await contexto.transaccion.insert(parametrosHistorial).values({
		id: uuidv7(),
		parametroId: antes.id,
		valorAnterior: textoCanonico(anterior),
		valorNuevo: textoCanonico(nuevo),
		creadoPor: quien.tipo === "cuenta" ? quien.usuarioId : null,
	});
	// Un parámetro que decide qué baja a un aparato pide la foto completa a esos aparatos.
	const tipos = [...contexto.registro.bajada]
		.filter(([, tablas]) => tablas.some((tabla) => (tabla.parametros ?? []).includes(antes.clave)))
		.map(([tipo]) => tipo);
	if (tipos.length > 0) await pedirLaFoto(contexto, tipos, "parametro");
	// El día de pago de la nómina mueve las nóminas por pagar, cada una con su renglón y la misma clave.
	const movidas =
		antes.clave === "nomina.dia_pago"
			? nominasMovidas.parse(await contexto.interna("contaduria.mover_fecha_pago_nomina", { dia_pago: nuevo })).nominas
			: [];
	const texto =
		antes.seccion === "decision_operacion"
			? `${antes.nombre}: ${valorParaLeer(antes, nuevo)}`
			: `Cambió el parámetro «${antes.nombre}»: ${valorParaLeer(antes, anterior)} → ${valorParaLeer(antes, nuevo)}`;
	contexto.bitacora({
		descripcion: texto,
		entidad: "parametros",
		entidadId: antes.id,
		antes: anterior,
		despues: nuevo,
	});
	for (const movida of movidas) {
		contexto.bitacora({
			descripcion: movida.descripcion,
			entidad: "nominas",
			entidadId: movida.nomina_id,
			antes: { fecha_pago: movida.antes },
			despues: { fecha_pago: movida.despues },
		});
	}

	contexto.guardarEvento({
		tipo: "parametro.cambiado",
		datos: { clave: antes.clave, baja_a: antes.bajaA.join(",") },
		tablas: ["parametros"],
		entidad: "parametros",
		entidadId: antes.id,
	});
	return {
		resultado: {
			mensaje: antes.seccion === "decision_operacion" ? texto : "Parámetro guardado",
			version: await versionActual(contexto.transaccion, parametros, antes.id),
		},
		entidad: { nombre: "parametros", id: antes.id },
	};
});
