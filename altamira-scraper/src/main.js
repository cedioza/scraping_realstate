
import { PlaywrightCrawler, Dataset, log } from 'crawlee';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// URLs Objetivo
const targetUrl = process.argv[2] || 'https://www.altamirainmuebles.com/venta-viviendas/cadiz/cadiz';
const START_URLS = [
    targetUrl
];

// Helper para extraer ID de URL
const extractIdFromUrl = (url) => {
    try {
        const parts = url.split('/');
        // Buscar parte que parezca ID (ej: 9186_0047_PE0001)
        const idPart = parts.find(p => p.includes('_') && /\d/.test(p));
        return idPart || parts[parts.length - 2] || 'UNKNOWN';
    } catch (e) {
        return 'UNKNOWN';
    }
};

const crawler = new PlaywrightCrawler({
    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    },

    // Router
    async requestHandler({ page, request, log, addRequests }) {
        const { userData } = request;
        const label = userData.label || 'LISTING';

        log.info(`Processing [${label}] ${request.url}...`);

        try {
            await page.waitForLoadState('domcontentloaded');

            // Cookies
            try {
                const cookieBtn = await page.waitForSelector('#cookiescript_accept', { timeout: 3000 });
                if (cookieBtn) await cookieBtn.click();
            } catch (e) { }

            if (label === 'LISTING') {
                log.info('📂 Procesando listado DOM...');

                await page.waitForSelector('.minifichaLink', { timeout: 15000 }).catch(() => log.warning('Timeout waiting for cards'));

                const listings = await page.$$eval('.minifichaLink', (cards) => {
                    return cards.map(card => {
                        const url = card.getAttribute('href');
                        const title = card.querySelector('.titulo')?.innerText.trim() || '';
                        const price = card.querySelector('.valor-precio span')?.innerText.trim() || '0';
                        const features = Array.from(card.querySelectorAll('.caracteristicas-list li')).map(li => li.innerText.trim()).join(' ');
                        const tags = Array.from(card.querySelectorAll('.etiquetas span')).map(s => s.innerText.trim()).join(' ');

                        return {
                            url: url ? (url.startsWith('http') ? url : `https://www.altamirainmuebles.com${url}`) : null,
                            title,
                            price,
                            features,
                            tags
                        };
                    }).filter(item => item.url);
                });

                log.info(`✅ Encontradas ${listings.length} propiedades.`);

                const detailRequests = [];
                for (const item of listings) {
                    detailRequests.push({
                        url: item.url,
                        userData: {
                            label: 'DETAIL',
                            listingData: item // Pasamos datos del listado como backup
                        }
                    });
                }

                if (detailRequests.length > 0) {
                    await addRequests(detailRequests);
                }

                // Paginación (Simple click or check for next page)
                // Por ahora omitido para asegurar validación básica

            } else if (label === 'DETAIL') {
                log.info('🏠 Procesando detalle DOM...');
                const { listingData } = userData;

                let detailData = {};
                let scrapeSuccess = false;

                try {
                    // Intentar scraping profundo
                    await page.waitForSelector('body', { timeout: 10000 });

                    // Relaxed wait for Title/H1
                    let title = '';
                    try {
                        title = await page.locator('h1').first().innerText({ timeout: 5000 });
                    } catch (e) { }
                    if (!title) title = await page.title();

                    // Si tirulo es muy generico, es posible que no cargo bien
                    if (title.includes('Altamira Inmuebles')) {
                        log.warning('⚠️ Título genérico detectado, posible bloqueo/timeout.');
                    } else {
                        // Extraer más datos si la página parece válida
                        const refText = await page.locator('.referencia, .ref').first().innerText().catch(() => '');
                        if (refText) detailData.ref = refText.replace('Ref:', '').trim();

                        const desc = await page.locator('#descripcion-inmueble').innerText().catch(() => '');
                        if (desc) detailData.description = desc;

                        scrapeSuccess = true;
                    }

                } catch (e) {
                    log.warning(`⚠️ Falló scraping detalle: ${e.message}. Usando datos de listado.`);
                }

                // COMBINAR DATOS (Listing + Detail + Fallbacks)
                const today = new Date();
                const fechaReg = today.toLocaleDateString('es-ES');

                const finalTitle = (scrapeSuccess && detailData.title) ? detailData.title : listingData.title || '';
                const finalRef = detailData.ref || extractIdFromUrl(request.url);

                // Dirección: Del título si no hay otra
                const address = finalTitle.replace('en venta en', '').trim();

                // Tipo
                let tipo = 'VIVIENDA';
                const tLower = finalTitle.toLowerCase();
                if (tLower.includes('piso')) tipo = 'PISO';
                else if (tLower.includes('casa') || tLower.includes('chalet')) tipo = 'CASA/CHALET';
                else if (tLower.includes('local')) tipo = 'LOCAL';
                else if (tLower.includes('garaje')) tipo = 'GARAJE';

                // Estado
                let estado = 'SEGUNDA MANO';
                if ((listingData.tags && listingData.tags.toLowerCase().includes('obra nueva')) ||
                    (listingData.features && listingData.features.toLowerCase().includes('obra nueva'))) {
                    estado = 'OBRA NUEVA';
                }

                const finalData = {
                    "Fecha reg": fechaReg,
                    "ID": finalRef,
                    "Entidad": "Altamira",
                    "Estado": estado,
                    "Tipo": tipo,
                    "Localidad": "Cádiz", // Asumido por búsqueda, idealmente extraer
                    "Dirección": address,
                    "Enlace a google maps": `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
                    "Ref. Catastral/registral": finalRef, // Fallback a ref interna
                    "PRECIO": listingData.price,
                    "LINK ANUNCIO": request.url
                };

                log.info(`💾 Guardando [${finalData.ID}]: ${finalData.Tipo} - ${finalData.PRECIO} €`);
                await Dataset.pushData(finalData);
            }

        } catch (error) {
            log.error(`❌ Error general en ${request.url}: ${error.message}`);
        }
    },
    maxConcurrency: 1,
});

log.info('🚀 Iniciando Scraper Altamira (Robust DOM Mode)...');
await crawler.run(START_URLS);
log.info('✅ Finalizado.');
