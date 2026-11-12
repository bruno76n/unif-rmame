/// <reference types="vite/client" />
/**
 * Arranca el catálogo del sistema de diseño en el navegador, para su prueba y para el revisor de diseño.
 * Fase 19 · docs/interfaz/DISENO.md y docs/cimientos/ESTRUCTURA.md («El sistema de diseño por dentro»)
 */

import { createRoot } from "react-dom/client";
import { Catalogo } from "./catalogo.tsx";
import "./estilos.css";

const raiz = document.getElementById("raiz");
if (raiz === null) throw new Error("falta el elemento raíz del catálogo");
createRoot(raiz).render(<Catalogo />);
