/**
 * La entrada de la tablet: registra su service worker, arranca su motor (que baja su foto, sube su cola y escucha sus
 * avisos) y pinta la Puerta del taller.
 * Fase 20 · docs/apps/tablet.md y docs/interfaz/tablet.md
 */

import "./estilos.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { base } from "./copia/base.ts";
import { Tablet } from "./pantallas/tablet.tsx";
import { aplicarVersionNueva, registrarServiceWorker } from "./service-worker/registrar.ts";
import { crearMotor } from "./sincronizacion/motor.ts";

/** La tablet llama a la API en su mismo origen. */
const conexion = { urlBase: "" };

/** El motor de la tablet: uno solo. */
const motor = crearMotor(base, conexion);

const registroDelServiceWorker = registrarServiceWorker();
void motor.arrancar();

const raiz = document.getElementById("raiz");
if (raiz !== null) {
	createRoot(raiz).render(
		<StrictMode>
			<Tablet
				base={base}
				conexion={conexion}
				motor={motor}
				alActualizar={() => void registroDelServiceWorker.then(aplicarVersionNueva)}
			/>
		</StrictMode>,
	);
}
