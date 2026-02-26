
import { PlaywrightCrawler, Dataset } from 'crawlee';
import { router } from './routes.js';

// Selectores globales (Cookies, Popups)
const GLOBAL_SELECTORS = {
    // El selector que identificamos con el agente: #onetrust-accept-btn-handler
    COOKIES_ACCEPT: '#onetrust-accept-btn-handler, #onetrust-accept-btn-handler',
    // Popups genéricos de "Alerta" o newsletter que a veces salen
    MODAL_CLOSE: '.solvia-common-modal-close, button.modal-close, [aria-label="Cerrar"]'
};

const crawler = new PlaywrightCrawler({
    // Headless: false para ver que está pasando (útil al principio)
    // Cambiar a true cuando esté estable.
    headless: true,

    // Router importado de routes.js
    requestHandler: router,

    // Hook para manejar cookies y popups ANTES de intentar extraer nada
    preNavigationHooks: [
        async ({ page, log }) => {
            // 🛑 RETARDO ALEATORIO (Human Behavior)
            // Espera entre 1 y 10 segundos antes de cada navegación
            const waitTime = Math.floor(Math.random() * 9000) + 1000;
            log.info(`⏳ Esperando ${waitTime / 1000}s para parecer humano...`);
            await new Promise(r => setTimeout(r, waitTime));

            // 1. Manejo de Cookies (OneTrust)
            try {
                const cookieBtn = page.locator(GLOBAL_SELECTORS.COOKIES_ACCEPT);
                // Esperamos un poco a ver si aparece (timeout corto para no frenar si ya no está)
                if (await cookieBtn.isVisible({ timeout: 3000 })) {
                    await cookieBtn.click();
                    log.info('🍪 Cookies aceptadas');
                }
            } catch (e) {
                // Ignorar si no aparece
            }

            // 2. Manejo de Popups intrusivos
            try {
                const modalClose = page.locator(GLOBAL_SELECTORS.MODAL_CLOSE);
                if (await modalClose.isVisible({ timeout: 2000 })) {
                    await modalClose.first().click();
                    log.info('🛑 Popup cerrado');
                }
            } catch (e) {
                // Ignorar
            }
        }
    ],

    // Limitar concurrencia para evitar bloqueos agresivos iniciales
    maxConcurrency: 2,
});

// URL Inicial: Listado de viviendas en Cádiz
const targetUrl = process.argv[2] || 'https://www.solvia.es/es/comprar/viviendas/cadiz';
await crawler.run([targetUrl]);

console.log('✅ Scraping finalizado.');
