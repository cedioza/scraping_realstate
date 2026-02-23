console.log('🚀 Script starting...');
import { PlaywrightCrawler, Dataset, log } from 'crawlee';
import dotenv from 'dotenv';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

console.log('📦 Imports loaded.');

try {
    chromium.use(stealthPlugin());
    console.log('🥷 Stealth plugin loaded.');
} catch (e) {
    console.error('❌ Error loading stealth plugin:', e);
}

// Cargar variables de entorno
dotenv.config();

// URLs Objetivo
const targetUrl = process.argv[2] || 'https://www.alisedainmobiliaria.com/comprar-viviendas/andalucia/cadiz/puerto-de-santa-maria-el';
const START_URLS = [
    targetUrl
];

// Helper para extraer ID de URL o Texto
const extractId = (url, text) => {
    // Intentar buscar "Ref: 12345" en texto
    if (text) {
        const match = text.match(/Ref[:\s]*([A-Z0-9]+)/i);
        if (match) return match[1];
    }
    // Fallback a URL
    try {
        const parts = url.split('/');
        // Buscar parte numérica o alfanumérica larga
        return parts[parts.length - 1] || 'UNKNOWN';
    } catch (e) {
        return 'UNKNOWN';
    }
};

const crawler = new PlaywrightCrawler({
    launchContext: {
        launcher: chromium,
        launchOptions: {
            headless: true, // Debugging visual si es necesario
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

            // Cookies: Aceptar si aparece
            try {
                const cookieBtn = await page.waitForSelector('#cs-accept, .banner-cookie__accept', { timeout: 5000 });
                if (cookieBtn) {
                    await cookieBtn.click();
                    log.info('🍪 Cookies aceptadas');
                    await page.waitForTimeout(1000); // Esperar desaparición
                }
            } catch (e) { }

            if (label === 'LISTING') {
                log.info('📂 Procesando listado DOM...');

                // Esperar carga de cards
                await page.waitForSelector('a.card, .property-card', { timeout: 20000 }).catch(() => log.warning('Timeout waiting for cards'));

                // Scroll para cargar más (lazy loading)
                await page.evaluate(async () => {
                    for (let i = 0; i < 3; i++) {
                        window.scrollBy(0, window.innerHeight);
                        await new Promise(r => setTimeout(r, 1000));
                    }
                });

                const listings = await page.$$eval('a.card', (cards) => {
                    return cards.map(card => {
                        const url = card.getAttribute('href');

                        // FILTRO: Solo inmuebles reales
                        if (!url || !url.includes('/inmueble/')) return null;

                        const infoNode = card.querySelector('.card__title'); // Updated selector
                        const priceNode = card.querySelector('.card__price--bold'); // Specific price class
                        const featuresNodes = Array.from(card.querySelectorAll('.card__characteristics span')); // Updated characteristics

                        const titleFull = infoNode ? infoNode.innerText.trim() : '';
                        const priceText = priceNode ? priceNode.innerText.trim() : '0';
                        const price = priceText.replace(/[^0-9,.]/g, '').replace('.', '').trim();

                        // Features parsing
                        let m2 = '';
                        let rooms = '';
                        let baths = '';

                        featuresNodes.forEach(f => {
                            const txt = f.innerText.toLowerCase();
                            // Ej: "Sup. Total 101 m²" -> "101"
                            if (txt.includes('m²')) {
                                const match = txt.match(/([0-9.,]+)\s*m²/);
                                m2 = match ? match[1] : txt.replace(/[^0-9,.]/g, '');
                            }
                            // Ej: "3 Habitaciones" -> "3"
                            if (txt.includes('habit')) rooms = txt.replace(/[^0-9]/g, '');
                            if (txt.includes('baño') || txt.includes('aseo')) baths = txt.replace(/[^0-9]/g, '');
                        });

                        // Extract REF from URL
                        // href="/inmueble/52715780"
                        const idMatch = url.match(/\/(\d+)$/);
                        const ref = idMatch ? idMatch[1] : '';

                        return {
                            url: url.startsWith('http') ? url : `https://www.alisedainmobiliaria.com${url}`,
                            title: titleFull,
                            price,
                            m2,
                            rooms,
                            baths,
                            ref, // Listing has REF!
                            originalPrice: priceText
                        };
                    }).filter(item => item !== null);
                });

                log.info(`✅ Encontradas ${listings.length} propiedades.`);

                const detailRequests = [];
                for (const item of listings) {
                    detailRequests.push({
                        url: item.url,
                        userData: {
                            label: 'DETAIL',
                            listingData: item // Backup robusto
                        }
                    });
                }

                if (detailRequests.length > 0) {
                    await addRequests(detailRequests);
                }

                // Paginación (Siguiente página)
                const nextBtn = await page.locator('a.pagination__item--arrow:has-text("Siguiente"), a[title="Página siguiente"]').first();
                if (await nextBtn.count() > 0) {
                    const nextUrl = await nextBtn.getAttribute('href');
                    if (nextUrl) {
                        log.info(`➡️ Paginación encontrada: ${nextUrl}`);
                        await addRequests([{
                            url: nextUrl.startsWith('http') ? nextUrl : `https://www.alisedainmobiliaria.com${nextUrl}`,
                            userData: { label: 'LISTING' }
                        }]);
                    }
                }

            } else if (label === 'DETAIL') {
                log.info('🏠 Procesando detalle DOM...');
                const { listingData } = userData;

                let detailData = {};
                let scrapeSuccess = false;

                try {
                    await page.waitForSelector('body', { timeout: 10000 });

                    // Intentar extraer título H1
                    let title = '';
                    try {
                        title = await page.locator('h1').first().innerText({ timeout: 5000 });
                    } catch (e) { }
                    if (!title) title = await page.title();

                    // Intentar extraer descripción
                    const desc = await page.locator('.property-detail__description, .description').innerText().catch(() => '');

                    // Intentar ref
                    let ref = '';
                    const refNode = await page.locator('.reference').first();
                    if (await refNode.count() > 0) ref = await refNode.innerText();
                    if (!ref && desc) ref = extractId(request.url, desc);
                    if (!ref) ref = extractId(request.url, null);

                    detailData = { title, description: desc, ref };
                    scrapeSuccess = !!title && !title.includes('Aliseda Inmobiliaria'); // Check genérico

                } catch (e) {
                    log.warning(`⚠️ Error parcial detalle: ${e.message}`);
                }

                // COMBINAR DATOS (Listing + Detail + Fallbacks)
                const today = new Date();
                const fechaReg = today.toLocaleDateString('es-ES');

                const finalTitle = (scrapeSuccess && detailData.title) ? detailData.title : listingData.title || '';
                const finalRef = detailData.ref || extractId(request.url, null);

                // Dirección: Del título si no hay otra
                let address = finalTitle.replace(/en venta en/i, '').trim();
                if (address.length < 5 && listingData.title) address = listingData.title.replace(/en venta en/i, '').trim();

                // Tipo
                let tipo = 'VIVIENDA';
                const tLower = finalTitle.toLowerCase();
                if (tLower.includes('piso')) tipo = 'PISO';
                else if (tLower.includes('casa') || tLower.includes('chalet') || tLower.includes('adosado')) tipo = 'CASA/CHALET';
                else if (tLower.includes('local')) tipo = 'LOCAL';
                else if (tLower.includes('garaje')) tipo = 'GARAJE';
                else if (tLower.includes('suelo') || tLower.includes('parcela')) tipo = 'TERRENO';

                // Estado
                let estado = 'SEGUNDA MANO';
                if (listingData.m2 === '0' && listingData.price === '0') estado = 'CONSULTAR'; // Heurística
                if (finalTitle.toLowerCase().includes('obra nueva')) estado = 'OBRA NUEVA';

                // Features combinadas
                const m2 = listingData.m2 || '';
                const rooms = listingData.rooms || '';

                const finalData = {
                    "Fecha reg": fechaReg,
                    "ID": finalRef,
                    "Entidad": "Aliseda",
                    "Estado": estado,
                    "Tipo": tipo,
                    "Localidad": "Cádiz",
                    "Dirección": address,
                    "Enlace a google maps": `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
                    "Ref. Catastral/registral": finalRef,
                    "PRECIO": listingData.price,
                    "M2": m2,
                    "Habitaciones": rooms,
                    "LINK ANUNCIO": request.url
                };

                log.info(`💾 Guardando [${finalData.ID}]: ${finalData.Tipo} - ${finalData.PRECIO} €`);
                await Dataset.pushData(finalData);
            }

        } catch (error) {
            log.error(`❌ Error general en ${request.url}: ${error.message}`);
        }
    },
    maxConcurrency: 1, // Stealth requiere baja concurrencia
});

log.info('🚀 Iniciando Scraper Aliseda (Stealth + Robust DOM)...');
await crawler.run(START_URLS);
log.info('✅ Finalizado.');
