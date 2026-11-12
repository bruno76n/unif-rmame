/**
 * Los gastos de la fábrica: registrarlos con su categoría, dónde se gastó, de dónde salió el dinero y su comprobante,
 * y cancelarlos con motivo. El de un servicio de Mantenimiento lo pone el sistema y se corrige desde Mantenimiento.
 * Fase 17 · docs/modulos/contaduria/gastos.md (reglas 1 a 3, «Acciones»)
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { cancelarGasto, registrarGasto } from "@uniformame/compartido/contratos/contaduria/gastos";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { nombreDeCuenta, quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { servicios } from "../../mantenimiento/tablas.ts";
import { folioDeGasto, valorDeLista } from "../dominio/gastos.ts";
import { cuentaFabricaEscogida } from "../dominio/pagos.ts";
import { listaDeCategoriasGasto, listaDeTiposComprobante } from "../siembra.ts";
import { gastos } from "../tablas.ts";

export const accionRegistrarGasto = implementarAccion(registrarGasto, async (contexto, datos) => {
	const { transaccion } = contexto;
	if (datos.fecha > contexto.diaDeNegocio.toString()) throw errorDeCampo("fecha", "La fecha no puede ser futura");
	// La categoría: de la lista, que se pueda escoger y vigente (regla 2).
	const categoria = await valorDeLista(transaccion, listaDeCategoriasGasto, datos.categoria_id);
	if (categoria === undefined) throw errorDeCampo("categoria_id", "Escoge la categoría.");
	if (!categoria.seleccionable) throw errorDeRegla("categoria_del_sistema", "Esa categoría la pone el sistema.");
	if (categoria.bajaEn !== null) throw errorDeRegla("categoria_de_baja", "Esa categoría ya no se usa.");
	// Dónde se gastó.
	if ((datos.area === "ubicacion") !== (datos.ubicacion_id !== undefined)) {
		throw errorDeCampo("ubicacion_id", "Escoge la ubicación");
	}
	if (datos.ubicacion_id !== undefined) {
		const [ubicacion] = await transaccion
			.select({ id: ubicaciones.id })
			.from(ubicaciones)
			.where(eq(ubicaciones.id, datos.ubicacion_id));
		if (ubicacion === undefined) throw errorDeCampo("ubicacion_id", "Escoge la ubicación");
	}
	const cuentaFabricaId =
		datos.medio === "cuenta_fabrica" ? await cuentaFabricaEscogida(transaccion, datos.cuenta_fabrica_id) : null;
	// El comprobante: sin archivo, «Sin comprobante» (regla 1).
	const tipoComprobante =
		datos.tipo_comprobante_id === undefined
			? datos.comprobante_archivo_id === undefined
				? await valorDeLista(transaccion, listaDeTiposComprobante, { clave: "sin_comprobante" })
				: undefined
			: await valorDeLista(transaccion, listaDeTiposComprobante, datos.tipo_comprobante_id);
	if (datos.tipo_comprobante_id !== undefined && tipoComprobante === undefined) {
		throw errorDeCampo("tipo_comprobante_id", "Escoge el tipo de comprobante.");
	}
	const folio = await folioDeGasto(contexto);
	const id = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(gastos).values({
		id,
		folio,
		fecha: datos.fecha,
		categoriaId: categoria.id,
		montoCentavos: datos.monto_centavos,
		area: datos.area,
		ubicacionId: datos.ubicacion_id ?? null,
		medio: datos.medio,
		cuentaFabricaId,
		comprobanteArchivoId: datos.comprobante_archivo_id ?? null,
		tipoComprobanteId: tipoComprobante?.id ?? null,
		origen: "manual",
		creadoPor: quien,
	});
	if (datos.comprobante_archivo_id !== undefined) {
		await contexto.interna("admin.ligar_archivo", {
			archivo_id: datos.comprobante_archivo_id,
			proposito: "comprobante",
			modulo: "contaduria",
			entidad: "gastos",
			entidad_id: id,
		});
	}
	contexto.guardarEvento({
		tipo: "gasto.registrado",
		datos: { gasto_id: id },
		tablas: ["gastos"],
		entidad: "gastos",
		entidadId: id,
		entidadFolio: folio,
	});
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} registró el gasto ${folio}: ${categoria.nombre}, ${enPesos(datos.monto_centavos)}`,
		entidad: "gastos",
		entidadId: id,
		entidadFolio: folio,
		despues: { fecha: datos.fecha, monto_centavos: datos.monto_centavos, area: datos.area, medio: datos.medio },
	});
	return { resultado: { mensaje: `${folio} registrado`, gasto_id: id, folio }, entidad: { nombre: "gastos", id } };
});

export const accionCancelarGasto = implementarAccion(cancelarGasto, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const { motivo } = datos;
	const [gasto] = await transaccion.select().from(gastos).where(eq(gastos.id, datos.gasto_id)).for("update");
	if (gasto === undefined) throw noExiste();
	await tomarVersion(contexto, gastos, gasto.id, version, async () => ({ gasto_id: gasto.id, estado: gasto.estado }));
	if (gasto.estado === "cancelado") throw errorDeRegla("gasto_cancelado", `${gasto.folio} ya está cancelado.`);
	// El de un servicio se corrige desde Mantenimiento (regla 3).
	if (gasto.origen === "mantenimiento" && gasto.servicioId !== null) {
		const [servicio] = await transaccion
			.select({ folio: servicios.folio })
			.from(servicios)
			.where(eq(servicios.id, gasto.servicioId));
		throw errorDeRegla(
			"gasto_de_mantenimiento",
			`Este gasto viene del servicio ${servicio?.folio ?? ""} de Mantenimiento.`,
		);
	}
	const quien = quienCambia(contexto);
	await transaccion
		.update(gastos)
		.set({
			estado: "cancelado",
			canceladoEn: contexto.ahora.toString(),
			canceladoPor: quien,
			motivoCancelacion: motivo,
		})
		.where(eq(gastos.id, gasto.id));
	contexto.guardarEvento({
		tipo: "gasto.cancelado",
		datos: { gasto_id: gasto.id },
		tablas: ["gastos"],
		entidad: "gastos",
		entidadId: gasto.id,
		entidadFolio: gasto.folio,
	});
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} canceló el gasto ${gasto.folio}: ${motivo}`,
		entidad: "gastos",
		entidadId: gasto.id,
		entidadFolio: gasto.folio,
		antes: { estado: gasto.estado },
		despues: { estado: "cancelado" },
	});
	return {
		resultado: { mensaje: `${gasto.folio} cancelado`, gasto_id: gasto.id },
		entidad: { nombre: "gastos", id: gasto.id },
	};
});
