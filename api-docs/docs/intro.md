---
sidebar_position: 1
---

# Scraper API Documentation

Welcome to the Scraper API! This API allows you to extract real estate data from various portals simply by providing a URL.

## Features

- **Direct JSON Responses**: Simply pass a URL and wait to receive a consolidated JSON containing the results of the complete scraping execution.
- **Stateless Execution**: Scraped data is generated and returned on the fly, saving server storage space and avoiding database synchronizations.
- **Multiple Supported Providers**:
  - Idealista
  - Fotocasa
  - Altamira
  - Aliseda
  - Solvia

## Getting Started

### 1. Starting the Scraper API Server

To use the API locally, you must first start the backend server:

```bash
cd scraper-api
npm install
npm start
```
The server will boot up and listen on `http://localhost:3000`.

### 2. Starting the Documentation Server (Optional)

If you want to read this documentation locally:

```bash
cd api-docs
npm install
npm start
```
The documentation will be available at `http://localhost:3001` (or whichever port it assigns).

### 3. Basic Flow of the API

1. **You** make an HTTP POST to `/api/scrape` providing the URL of a real estate property or list.
2. **The Server** validates and routes the request to the correct internal scraper.
3. **The Scraper** visits the site, bypasses antiscraping rules, pages through multiple results (if applicable), and extracts detailed information.
4. **The Response** arrives as a complete JSON structure detailing every scraped property.
