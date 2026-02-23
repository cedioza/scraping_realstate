
import { createPlaywrightRouter, Dataset } from 'crawlee';

export const router = createPlaywrightRouter();

// Selectores específicos de Idealista (validados navegando la web)
const SELECTORS = {
    // Listado
    CARD_ITEM: 'article.item',
    CARD_LINK: 'a.item-link',
    PAGINATION_NEXT: '.pagination .next a',

    // Detalle
    TITLE: '.main-info__title-main',
    PRICE: '.info-data-price',
    ADDRESS: '.main-info__title-minor',
    FEATURES: '.details-property-feature-one, .info-features span',
    DESCRIPTION: '.comment p, .adCommentsLanguage',
    REFERENCE: '.ad-reference-container .txt-ref'
};

// --- HANDLER: LISTADO (Default) ---
router.addDefaultHandler(async ({ page, enqueueLinks, log }) => {
    log.info(`📋 Procesando listado Idealista: ${page.url()}`);

    // 1. Esperar a que carguen las cards
    try {
        await page.waitForSelector(SELECTORS.CARD_ITEM, { timeout: 15000 });
    } catch (e) {
        log.warning('⚠️ No se encontraron propiedades en esta página');
        return;
    }

    // 2. Contar propiedades encontradas
    const cardCount = await page.locator(SELECTORS.CARD_ITEM).count();
    log.info(`🏘️ Encontradas ${cardCount} propiedades en esta página`);

    // 3. Encolar los enlaces a DETALLE usando enqueueLinks
    await enqueueLinks({
        selector: SELECTORS.CARD_LINK,
        label: 'DETAIL',
        // Transformar URLs relativas a absolutas
        transformRequestFunction(req) {
            // Solo encolar URLs de detalle de inmueble
            if (req.url.includes('/inmueble/')) {
                return req;
            }
            return false;
        },
    });

    // 4. Paginación: buscar botón "Siguiente" y encolar
    try {
        const nextBtn = page.locator(SELECTORS.PAGINATION_NEXT);
        if (await nextBtn.isVisible({ timeout: 3000 })) {
            await enqueueLinks({
                selector: SELECTORS.PAGINATION_NEXT,
                // Sin label → DefaultHandler (listado recursivo)
            });
            log.info('➡️ Encolada siguiente página');
        }
    } catch (e) {
        log.info('📄 No hay más páginas');
    }
});

// --- HANDLER: DETALLE DE VIVIENDA ---
router.addHandler('DETAIL', async ({ page, request, log }) => {
    log.info(`🏠 Extrayendo vivienda Idealista: ${request.url}`);

    // Esperar elemento esencial
    try {
        await page.waitForSelector(SELECTORS.TITLE, { timeout: 10000 });
    } catch (e) {
        log.warning(`⚠️ No se pudo cargar el detalle: ${request.url}`);
        return;
    }

    // --- EXTRACCIÓN DE DATOS ---

    // 1. Fecha Reg (Hoy)
    const fechaReg = new Date().toLocaleDateString('es-ES');

    // 2. ID (extraído de la URL: /inmueble/XXXXXXX/)
    const urlIdMatch = request.url.match(/\/inmueble\/(\d+)/);
    const id = urlIdMatch ? urlIdMatch[1] : 'N/A';

    // 3. Entidad
    const entidad = 'Idealista';

    // 4. Título → Tipo
    const title = await page.locator(SELECTORS.TITLE).first().textContent().catch(() => '');
    const cleanTitle = title.trim();
    let tipo = 'VIVIENDA';
    const titleLower = cleanTitle.toLowerCase();
    if (titleLower.includes('piso')) tipo = 'PISO';
    else if (titleLower.includes('casa') || titleLower.includes('chalet')) tipo = 'CASA';
    else if (titleLower.includes('ático') || titleLower.includes('atico')) tipo = 'ÁTICO';
    else if (titleLower.includes('dúplex') || titleLower.includes('duplex')) tipo = 'DÚPLEX';
    else if (titleLower.includes('estudio')) tipo = 'ESTUDIO';
    else if (titleLower.includes('finca') || titleLower.includes('rústica')) tipo = 'FINCA';

    const estado = 'VIVIENDA';

    // 5. Dirección y Localidad
    const addressText = await page.locator(SELECTORS.ADDRESS).first().textContent().catch(() => '');
    let fullAddress = addressText.trim();

    let direccion = fullAddress;
    let localidad = 'Chipiona'; // Default

    if (fullAddress.includes(',')) {
        const parts = fullAddress.split(',');
        localidad = parts[parts.length - 1].trim();
        direccion = parts.slice(0, -1).join(',').trim();
    }

    // 6. Enlace Google Maps
    const encodedAddress = encodeURIComponent(`${direccion}, ${localidad}, Cádiz`);
    const gmapsLink = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

    // 7. Ref. Catastral/Registral
    let refCatastral = 'Consultar';
    try {
        const refText = await page.locator(SELECTORS.REFERENCE).textContent();
        if (refText) refCatastral = refText.trim();
    } catch (e) {
        // Buscar en descripción como fallback
        try {
            const description = await page.locator(SELECTORS.DESCRIPTION).first().textContent();
            const refMatch = description.match(/Referencia\s*Catastral\s*:?\s*([0-9A-Z]+)/i);
            if (refMatch) refCatastral = refMatch[1];
        } catch (e2) {
            // Mantener 'Consultar'
        }
    }

    // 8. Precio
    let cleanPrice = '0';
    try {
        const priceEl = page.locator(SELECTORS.PRICE);
        const priceText = await priceEl.textContent();
        // Limpiar precio: mantener solo dígitos y separadores
        cleanPrice = priceText.replace(/[^\d.,]/g, '').trim();
    } catch (e) {
        log.warning('⚠️ No se encontró precio');
    }

    // Guardar con las mismas columnas que Solvia
    await Dataset.pushData({
        "Fecha reg": fechaReg,
        "ID": id,
        "Entidad": entidad,
        "Estado": estado,
        "Tipo": tipo,
        "Localidad": localidad,
        "Dirección": direccion,
        "Enlace a google maps": gmapsLink,
        "Ref. Catastral/registral": refCatastral,
        "PRECIO": cleanPrice,
        "LINK ANUNCIO": request.url
    });

    log.info(`✅ Guardada propiedad: ${id} - ${tipo} en ${localidad} - ${cleanPrice}€`);
});
