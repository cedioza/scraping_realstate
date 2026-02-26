---
sidebar_position: 2
---

# Referencia de la API

Esta página documenta el endpoint HTTP principal proporcionado por el servidor de Scraping Inmobiliario.

## POST `/api/scrape`

Envía una URL para ser extraída por el navegador automatizado interno.

### Cuerpo del Request (JSON)

- **`url`** (string, obligatorio): La URL de la propiedad específica o lista de propiedades a extraer. El backend detectará automáticamente qué portal usar (idealista, fotocasa, etc.)
- **`webhookUrl`** (string, opcional): La URL a la que el servidor enviará (vía POST) los resultados extraídos al finalizar (Flujo Asíncrono).

**Ejemplo JSON Payload (Modo Asíncrono para n8n):**
```json
{
  "url": "https://www.alisedainmobiliaria.com/comprar-viviendas/andalucia/cadiz/puerto-de-santa-maria-el",
  "webhookUrl": "https://min8n.dominio.com/webhook/c347-1234-5678"
}
```

### Respuestas

#### 1. Respuesta Inmediata (Con `webhookUrl` - 202 Accepted)
Si proporcionas un `webhookUrl`, la API **no bloquea la petición**. Inmediatamente te devolverá un HTTP 202 para que tu flujo (ej. n8n) pueda continuar, y procesará el scraper en segundo plano.

```json
{
  "success": true,
  "message": "Proceso de scraping iniciado en segundo plano.",
  "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "webhookUrl": "https://min8n.dominio.com/webhook/c347-1234-5678"
}
```

#### 2. Respuesta Final (Enviada a tu `webhookUrl` o devuelta sincrónicamente - 200 OK)
Una vez que el scraper finaliza (puede tardar minutos), enviará un payload JSON con toda la data extraída a tu webhook (o mediante el request HTTP original si no usaste `webhookUrl`).

```json
{
  "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "COMPLETED",
  "scraper": "aliseda",
  "url": "https://www.alisedainmobiliaria.com/...",
  "data": [
    {
      "Fecha reg": "25/2/2026",
      "ID": "5129384",
      "Entidad": "Aliseda",
      "Estado": "SEGUNDA MANO",
      "Tipo": "PISO",
      "PRECIO": "120000",
      ...
    }
  ],
  "error": null
}
```

### Errores Comunes

**400 Bad Request**
- Si falta el parámetro `url`.
- Si el dominio no pertenece a `idealista.com`, `fotocasa.es`, `altamirainmuebles.com`, `alisedainmobiliaria.com` o `solvia.es`.

**500 Internal Server Error**
- Falla interna del servidor o script no encontrado. (Nota: los errores de scrapeo del bot que no logran completarse llegarán a tu `webhookUrl` con `"status": "FAILED"` y la descripción del error).
