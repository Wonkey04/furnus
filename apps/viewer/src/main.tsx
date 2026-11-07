import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./estilos/base.css";
import "./estilos/pantallas.css";
import { Conectar } from "./pantallas/Conectar";
import { MisPiezas } from "./pantallas/MisPiezas";
import { PantallaPieza } from "./pantallas/Pieza";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MisPiezas />} />
        <Route path="/pieza/:id" element={<PantallaPieza />} />
        <Route path="/conectar" element={<Conectar />} />
        <Route path="*" element={<MisPiezas />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
