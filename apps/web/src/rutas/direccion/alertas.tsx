/**
 * Alertas cruzadas de Dirección (`/direccion/alertas`): lee `direccion.alertas` y lleva «Ver» a la dirección del otro
 * departamento (su pestaña y, en la de un lote, su cajón), sin importar su componente.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Alertas cruzadas») y docs/fases/19-web-principal.md («Cómo se
 * construye»: un cajón de otro departamento se abre por su dirección)
 */

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { alertas } from "@uniformame/compartido/contratos/direccion/alertas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { PaginaDeDireccion } from "../../departamentos/direccion/pagina-de-direccion.tsx";
import { PestanaAlertas } from "../../departamentos/direccion/pestanas/alertas.tsx";

/** La ruta de Alertas cruzadas. */
function Alertas() {
	const router = useRouter();
	const leida = useConsulta(alertas, {});
	return (
		<PaginaDeDireccion activa="alertas">
			<SegunConsulta consulta={leida}>
				{(datos) => <PestanaAlertas datos={datos} ir={(ruta) => router.history.push(`/${ruta}`)} />}
			</SegunConsulta>
		</PaginaDeDireccion>
	);
}

export const Route = createFileRoute("/direccion/alertas")({ component: Alertas });
