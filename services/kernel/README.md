Servicio Python (build123d) que ejecuta scripts en un sandbox y devuelve malla GLB, medidas, validez y errores por JSON.
Expone `python -m furnus_kernel` (servicio HTTP local) y la librería `furnus` para los scripts.
NO debe importar nada del lado TypeScript; solo comparte el contrato JSON de `docs/ARCHITECTURE.md`.
