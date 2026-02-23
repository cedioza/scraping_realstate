# Scraper Orchestrator

Este repositorio contiene un sistema unificado para ejecutar diversos scrapers inmobiliarios (Idealista, Fotocasa, Altamira, Solvia, Aliseda) desde una única plataforma mediante un panel web y una API REST centralizada.

## 🏗️ Estructura del Proyecto

- `scraper-api/`: Backend en Node.js (Express) que expone los endpoints para lanzar los scrapers.
- `scraper-frontend/`: Frontend moderno en Vanilla JS y CSS que sirve de panel de control (Dashboard).
- `idealista-scraper/`: Crawler para Idealista (usa Crawlee).
- `fotocasa-scraper/`: Crawler para Fotocasa (usa Playwright).
- `altamira-scraper/`, `solvia-scraper/`, `aliseda-scraper/`: Crawlers para las respectivas entidades (usan Crawlee y Playwright).

## 🚀 Requisitos Previos

1. Node.js instalado (v18 recomendada).
2. Tener configurado el archivo `.env` en cada scraper específico si requiere variables adicionales (ej. BrightData para Idealista).

## 💻 Instrucciones de Ejecución

Para iniciar el sistema completo, necesitas ejecutar la API en una terminal y el Frontend en otra.

### 1. Iniciar la API Backend

Abre una terminal, sitúate en la carpeta `scraper-api`, instala dependencias (si es primera vez) y arranca el servidor:

```bash
cd scraper-api
npm install
npm start
```

La API escuchará en **http://localhost:3000**
Puedes visitar la **Documentación Técnica Interactiva** (Swagger) en **http://localhost:3000/api-docs**.

### 2. Iniciar el Frontend (Panel de Control Web)

Abre otra terminal, sitúate en `scraper-frontend`, instala dependencias y arranca Vite:

```bash
cd scraper-frontend
npm install
npm run dev
```

Esto abrirá un servidor local (típicamente en **http://localhost:5173**). Ábrelo en tu navegador para ver la interfaz gráfica.

## ⚙️ Uso del Sistema

1. **Desde el Panel Web (Frontend):**
   - Entra a `http://localhost:5173`.
   - Selecciona el portal que deseas scrapear.
   - Pega la URL objetivo.
   - Haz clic en "Iniciar Scraping". El Frontend llamará a la API y el proceso iniciará en la terminal del backend. Los resultados finales en formato JSON se guardarán automáticamente en la subcarpeta `storage/datasets/default/` del scraper correspondiente.

2. **A través de la API directamente (Backend):**
   - Puedes consumir el servicio desde otros sistemas enviando un `POST` a `http://localhost:3000/api/scrape`:
     ```json
     {
       "scraper": "fotocasa",
       "url": "https://www.fotocasa.es/es/comprar/viviendas/barbate/todas-las-zonas/l"
     }
     ```
   - Puedes ver los resultados en `GET /api/results/{scraper}` (ej. `GET /api/results/fotocasa`).

## 📁 Estructura de Resultados
Todos los scrapers exportan propiedades estructuradas en formato JSON en sus directorios locales, normalizadas con campos comunes (`Fecha reg`, `ID`, `Entidad`, `Estado`, `Tipo`, `Localidad`, `Dirección`, `Enlace a google maps`, `Ref. Catastral/registral`, `PRECIO`, `LINK ANUNCIO`).
