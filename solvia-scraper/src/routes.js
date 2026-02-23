
import { createPlaywrightRouter, Dataset } from 'crawlee';

export const router = createPlaywrightRouter();

// Selectores específicos que validamos con el agente
const SELECTORS = {
    // Listado
    CARD_ITEM: '.house-card, figure.house-card',
    CARD_LINK: 'a', // Dentro de la card
    PAGINATION_NEXT: 'li.pagination-next a',

    // Detalle
    TITLE: 'h2.foot-title, h1.property-title',
    PRICE: '.price-container, label', // A refinar en ejecución si trae basura
    FEATURES: '.sumUpFeatures_div .iconAndTextDiv',
    DESCRIPTION: 'span.descriptionText'
};

// --- HANDLER: LISTADO (Default) ---
router.addDefaultHandler(async ({ page, enqueueLinks, log }) => {
    log.info(`📋 Procesando listado: ${page.url()}`);

    // 1. Esperar a que carguen las cards
    await page.waitForSelector(SELECTORS.CARD_ITEM);

    // 2. Encontrar y encolar los enlaces a DETALLE
    // Crawlee busca automáticamente <a href="..."> dentro de los elementos que coincidan con el selector
    await enqueueLinks({
        selector: `${SELECTORS.CARD_ITEM} ${SELECTORS.CARD_LINK}`,
        label: 'DETAIL', // Irán al handler 'DETAIL'
    });

    // 3. Paginación: Encontrar el botón "Siguiente" y encolarlo como 'Default' (Listado)
    const nextBtn = page.locator(SELECTORS.PAGINATION_NEXT);
    if (await nextBtn.isVisible()) {
        const nextUrl = await nextBtn.getAttribute('href');
        if (nextUrl) {
            log.info(`➡️ Encontrada siguiente página: ${nextUrl}`);
            await enqueueLinks({
                selector: SELECTORS.PAGINATION_NEXT,
                // Sin label explícito va al DefaultHandler (recursivo)
            });
        }
    }
});

// --- HANDLER: DETALLE DE VIVIENDA ---
router.addHandler('DETAIL', async ({ page, request, log }) => {
    log.info(`🏠 Extrayendo vivienda: ${request.url}`);

    // Esperar elemento esencial (Precio o Título)
    await page.waitForSelector(SELECTORS.TITLE);

    // --- EXTRACCIÓN DE DATOS ---

    // 1. Fecha Reg (Hoy)
    const fechaReg = new Date().toLocaleDateString('es-ES'); // DD/MM/YYYY

    // 2. ID (scacado de la URL)
    const urlIdMatch = request.url.match(/-(\d+)(?:-\d+)?$/);
    const id = urlIdMatch ? urlIdMatch[1] : 'N/A';

    // 3. Entidad
    const entidad = 'Solvia';

    // 4. Tipo / Estado
    const title = await page.locator(SELECTORS.TITLE).first().textContent().catch(() => '');
    const cleanTitle = title.trim();
    // Heurística simple: Primer palabra suele ser el tipo
    const tipo = cleanTitle.split(' ')[0].toUpperCase();
    const estado = 'VIVIENDA';

    // 5. Dirección y Localidad
    // Solvia suele poner "Piso en C/ Loquesea, Jerez de la Frontera" en el subtitulo
    // Selector probable: h1.foot-subtitle o h2.foot-subtitle
    const subtitle = await page.locator('h1.foot-subtitle, h2.foot-subtitle, .property-subtitle').first().textContent().catch(() => '');
    let fullAddress = subtitle.trim();

    // Intento de separar dirección de localidad
    let direccion = fullAddress;
    let localidad = 'Cádiz'; // Default fall-back

    if (fullAddress.includes(',')) {
        const parts = fullAddress.split(',');
        localidad = parts[parts.length - 1].trim();
        direccion = parts.slice(0, -1).join(',').trim();
    } else if (fullAddress.includes('-')) {
        const parts = fullAddress.split('-');
        localidad = parts[parts.length - 1].trim();
        direccion = parts.slice(0, -1).join('-').trim();
    }

    // 6. Enlace Google Maps
    const encodedAddress = encodeURIComponent(`${direccion}, ${localidad}`);
    const gmapsLink = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

    // 7. Ref Catastral/Registral
    // Buscamos texto "Ref. Catastral" o similar en descripción o características
    const description = await page.locator(SELECTORS.DESCRIPTION).textContent().catch(() => '');
    const refMatch = description.match(/Referencia\s*Catastral\s*:?\s*([0-9A-Z]+)/i);
    const refCatastral = refMatch ? refMatch[1] : 'Consultar';

    // 8. Precio
    const priceText = await page.locator(SELECTORS.PRICE)
        .filter({ hasText: '€' })
        .first()
        .textContent()
        .catch(() => '0');
    // Limpiar precio para formato numérico europeo standard "119.000,00"
    // Mantener sólo dígitos y coma
    const cleanPrice = priceText.replace(/[^\d.,]/g, '').trim();

    // Guardar con las columnas solicitadas
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
});
