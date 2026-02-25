---
sidebar_position: 2
---

# API Reference

This page documents the single HTTP endpoint provided by the Scraper server.

## POST `/api/scrape`

Submits a URL to be scraped by the internal headless browser automation and returns a consolidated array of properties.

### Request Body

- **`url`** (string, required): The URL of the specific property or property list to be scraped. The backend will automatically infer which scraper implementation to use based on the domain (idealista, fotocasa, etc.)

**Example JSON Payload:**
```json
{
  "url": "https://www.alisedainmobiliaria.com/comprar-viviendas/andalucia/cadiz/puerto-de-santa-maria-el"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/scrape \
     -H "Content-Type: application/json" \
     -d '{"url":"https://www.alisedainmobiliaria.com/comprar-viviendas/andalucia/cadiz/puerto-de-santa-maria-el"}'
```

### Supported Scraper Domains
The server detects the targeted portal automatically by checking the URL:
- `idealista.com`
- `altamirainmuebles.com`
- `fotocasa.es`
- `solvia.es`
- `alisedainmobiliaria.com`

### Response (200 OK)

The request stays open while the scraper processes the data (which can take a few minutes depending on the pagination size).

Once complete, it returns a total combined array of the extracted results.

```json
{
  "success": true,
  "scraper": "aliseda",
  "data": [
    {
      "Fecha reg": "25/2/2026",
      "ID": "5129384",
      "Entidad": "Aliseda",
      "Estado": "SEGUNDA MANO",
      "Tipo": "PISO",
      "Localidad": "Puerto De Santa Maria (el)",
      "Dirección": "Calle Falsa 123",
      "Enlace a google maps": "https://www.google.com/maps/...",
      "PRECIO": "120000",
      "M2": "90",
      "Habitaciones": "3",
      "LINK ANUNCIO": "https://www.alisedainmobiliaria.com/..."
    }
  ]
}
```

### Errors

**400 Bad Request**
- If the `url` parameter is missing.
- If the domain does not map to any supported scrapers.

```json
{
  "error": "No se pudo determinar un scraper válido para esta URL."
}
```

**500 Internal Server Error**
- If an internal process crashes or the scraper script file is missing.

---

## Server Logs Endpoint (Optional)

If the `POST /api/scrape` takes too long, you can optionally stream real-time logs using SSE (Server-Sent Events) via `GET /api/logs/:jobId`. However, this requires pre-generating a jobId which the current synchronized flow bypasses. For full bidirectional scraping flows, this endpoint helps monitor standard output and errors natively from the process execution.
