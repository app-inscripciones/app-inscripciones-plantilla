# Inscripciones a eventos · plantilla para instituciones

Aplicación para **inscribir participantes a eventos**, **controlar el dinero cobrado** por cada colaborador y
**tomar asistencia en la puerta**. Funciona en computadoras y celulares, **sin internet** cuando hace falta, y está
pensada para voluntarios que manejan poca tecnología. La puede usar cualquier institución: iglesias, colegios,
universidades, clubes, asociaciones.

**Costo: cero.** Usa los planes gratuitos de Supabase (base de datos), Cloudflare Pages (publicación) y GitHub (tareas automáticas y respaldos).

## Cómo instalarla para tu institución

1. Seguí el **Manual de instalación y administración** (se entrega en PDF junto con este repositorio).
2. En resumen: creá el Gmail de la institución y las cuentas de GitHub, Supabase y Cloudflare; tocá
   **Use this template → Create a new repository** (elegí **Private**); cargá 4 claves en
   *Settings → Secrets and variables → Actions*; y tocá **Actions → Instalar → Run workflow**.
3. Al terminar, entrá al panel (la dirección aparece en el resumen de la instalación) y cargá el nombre, el logo y los colores.

Cada institución tiene su **propia copia privada**: sus datos quedan totalmente separados. Este repositorio no
contiene datos ni claves de nadie.

## Actualizaciones

Cuando salga una versión nueva, en tu copia: **Actions → Actualizar → Run workflow**. Trae el código nuevo,
actualiza las bases (sin perder datos) y vuelve a publicar la app.

## Qué hay adentro

| Carpeta | Para qué sirve |
|---|---|
| `src/` | La aplicación (React + Vite, instalable, funciona sin conexión) |
| `supabase/` | Tablas, reglas de seguridad y funciones de la base (PostgreSQL) |
| `herramientas/instalador/` | El instalador y el actualizador automáticos |
| `.github/workflows/` | Cáscaras de las tareas automáticas (cuándo corren) |
| `herramientas/tareas/` | Lo que hace cada tarea automática (se actualiza con «Actualizar») |
| `config/` | Datos públicos de la instalación (los completa el instalador) |
