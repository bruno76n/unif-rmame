/**
 * `admin.editar_empresa`: la dueña cambia los datos de la empresa.
 * Fase 4 · docs/modulos/admin/configuracion.md («`admin.editar_empresa`»)
 *
 * La empresa es un solo renglón (lo cuida la base): esta acción lo cambia con su versión. El RFC llega ya
 * en mayúsculas y sin espacios desde su contrato.
 */

import { editarEmpresa } from "@uniformame/compartido/contratos/admin/configuracion";
import { eq } from "drizzle-orm";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { empresa } from "../tablas.ts";

/** Los datos de la empresa como se leen y se guardan en la bitácora. */
async function leerEmpresa(transaccion: Transaccion) {
	const [renglon] = await transaccion
		.select({
			id: empresa.id,
			razon_social: empresa.razonSocial,
			nombre_comercial: empresa.nombreComercial,
			rfc: empresa.rfc,
			domicilio: empresa.domicilio,
		})
		.from(empresa);
	return renglon;
}

export const accionEditarEmpresa = implementarAccion(editarEmpresa, async (contexto, datos, version) => {
	const antes = await leerEmpresa(contexto.transaccion);
	if (antes === undefined) throw noExiste();
	await tomarVersion(contexto, empresa, antes.id, version, () => leerEmpresa(contexto.transaccion));
	await contexto.transaccion
		.update(empresa)
		.set({
			razonSocial: datos.razon_social,
			nombreComercial: datos.nombre_comercial,
			rfc: datos.rfc,
			domicilio: datos.domicilio,
		})
		.where(eq(empresa.id, antes.id));
	const { id, ...anteriores } = antes;
	contexto.bitacora({
		descripcion: "Cambió los datos de la empresa",
		entidad: "empresa",
		entidadId: id,
		antes: anteriores,
		despues: datos,
	});
	contexto.guardarEvento({
		tipo: "empresa.cambiada",
		datos: {},
		tablas: ["empresa"],
		entidad: "empresa",
		entidadId: id,
	});
	return {
		resultado: {
			mensaje: "Datos de la empresa guardados",
			version: await versionActual(contexto.transaccion, empresa, id),
		},
		entidad: { nombre: "empresa", id },
	};
});
