---
sidebar_position: 1
---

# Scraper API Documentation

Bienvenido a la API del Scraper Inmobiliario. Esta API te permite extraer datos de propiedades de varios portales simplemente proporcionando una URL.

## Características Principales

- **Ejecución Asíncrona (Webhooks)**: Ideal para automatizaciones como n8n o Make. Envía tu petición con una URL de webhook y la API te empujará los datos cuando termine, esquivando los timeouts HTTP de Cloudflare.
- **Múltiples Portales Soportados**:
  - Idealista
  - Fotocasa
  - Altamira
  - Aliseda
  - Solvia

## Flujo de Trabajo (Cómo usar la API)

### 1. Flujo Síncrono (Simple / Modo Desarrollo)
Perfecto para hacer pruebas rápidas locales en Postman donde no te importa esperar 30-60 segundos con la conexión HTTP abierta.
1. Haces un POST a `/api/scrape` enviando la `url`.
2. Esperas a que el scraper termine su ejecución.
3. Recibes la respuesta JSON completa en la misma petición HTTP.

### 2. Flujo Asíncrono con Webhooks (Modo Producción / n8n)
Obligatorio para entornos de producción y plataformas Cloud donde los balanceadores de carga (como los de Dokploy/AWS) cortan peticiones de larga duración (Timeout Error 504).
1. Haces un POST a `/api/scrape` enviando la `url` objetivo y tu `webhookUrl`.
2. El servidor detecta el webhook y **responde inmediatamente** con un estado `202 Accepted` y un `jobId`.
3. Tu automatización (ej. n8n) puede pausarse libremente sin mantener conexiones abiertas.
4. El scraper en el servidor se pelea con Cloudflare y navega por la página durante el tiempo que sea necesario en segundo plano (minutos si hace falta).
5. Cuando finaliza, el servidor realiza un POST de vuelta hacia tu `webhookUrl` inyectando todo el JSON resultante.
