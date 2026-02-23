
import { BasicCrawler, Dataset, log } from 'crawlee';
import { load } from 'cheerio';
import dotenv from 'dotenv';
import { URL } from 'url';

// Cargar variables de entorno
dotenv.config();

// Configuración de Bright Data Web Unlocker
const BRIGHT_DATA_TOKEN = process.env.BRIGHT_DATA_API_TOKEN;
const BRIGHT_DATA_ZONE = process.env.BRIGHT_DATA_ZONE || 'web_unlocker1';

if (!BRIGHT_DATA_TOKEN) {
    console.error('❌ ERROR: Falta BRIGHT_DATA_API_TOKEN en .env');
    process.exit(1);
}

// URLs Objetivo Iniciales
const targetUrl = process.argv[2] || 'https://www.idealista.com/pro/sa-roqueta-investments/venta-viviendas/chipiona-cadiz/';
const START_URLS = [
    {
        url: targetUrl,
        userData: { label: 'LISTING' }
    }
];

const crawler = new BasicCrawler({
    maxConcurrency: 3,

    async requestHandler({ request, log, addRequests }) {
        const { url, userData } = request;
        const { label } = userData;

        log.info(`Processing [${label}] ${url}...`);

        try {
            // 1. LLAMADA A BRIGHT DATA API (Común)
            log.info(`📡 Enviando solicitud a Bright Data Web Unlocker API...`);

            const response = await fetch('https://api.brightdata.com/request', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${BRIGHT_DATA_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    zone: BRIGHT_DATA_ZONE,
                    url: url,
                    format: 'raw',
                })
            });

            if (!response.ok) {
                throw new Error(`Bright Data API Error: ${response.status} ${response.statusText}`);
            }

            const html = await response.text();

            if (!html || html.length < 100) {
                log.warning('⚠️ Respuesta vacía o muy corta de Web Unlocker');
                return;
            }

            const $ = load(html);
            const pageTitle = $('title').text();
            log.info(`✅ HTML Recibido: "${pageTitle.trim()}"`);


            // 2. LÓGICA SEGÚN TIPO DE PÁGINA

            if (label === 'LISTING') {
                // --- PROCESAR LISTADO ---
                log.info('📂 Procesando página de listado...');

                const detailRequests = [];

                $('article.item').each((i, el) => {
                    const $el = $(el);
                    const relativeLink = $el.find('a.item-link').attr('href');

                    if (relativeLink) {
                        const fullLink = `https://www.idealista.com${relativeLink}`;
                        log.info(`   -> Encontrada propiedad: ${fullLink}`);

                        detailRequests.push({
                            url: fullLink,
                            userData: { label: 'DETAIL' }
                        });
                    }
                });

                if (detailRequests.length > 0) {
                    log.info(`✨ Encolando ${detailRequests.length} propiedades para detalle...`);
                    await addRequests(detailRequests);
                } else {
                    log.warning('⚠️ No se encontraron propiedades en el listado. Revisa selectores.');
                }

            } else if (label === 'DETAIL') {
                // --- PROCESAR DETALLE Y MAPEAR COLUMNAS ---
                log.info('🏠 Extrayendo datos de detalle y mapeando columnas...');

                // Extracción cruda
                const title = $('.main-info__title-main').text().trim();
                const price = $('.info-data-price span.txt-bold').first().text().replace('€', '').trim(); // Limpiar €
                const address = $('.main-info__title-minor').text().trim();

                const features = [];
                $('.details-property-feature-one').each((i, el) => {
                    features.push($(el).text().trim());
                });
                const featuresText = features.join(' ').toLowerCase();

                const ref = $('.ad-reference-container .txt-ref').text().replace('Ref.', '').trim();

                // --- MAPEADO DE COLUMNAS SOLICITADAS ---

                // 1. Fecha reg (DD/MM/YYYY)
                const today = new Date();
                const fechaReg = today.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: 'numeric' });

                // 2. ID (Extraer de URL)
                // URL ejemplo: .../inmueble/103882353/
                const matches = url.match(/\/inmueble\/(\d+)\/?/);
                const id = matches ? matches[1] : ref;

                // 3. Entidad
                const entidad = 'Idealista';

                // 4. Tipo (Deducir del título o características)
                let tipo = 'VIVIENDA'; // Valor por defecto
                const lowerTitle = title.toLowerCase();
                if (lowerTitle.includes('chalet') || lowerTitle.includes('casa')) tipo = 'CASA/CHALET';
                else if (lowerTitle.includes('piso')) tipo = 'PISO';
                else if (lowerTitle.includes('ático')) tipo = 'ÁTICO';
                else if (lowerTitle.includes('dúplex')) tipo = 'DÚPLEX';
                else if (lowerTitle.includes('estudio')) tipo = 'ESTUDIO';
                else if (lowerTitle.includes('garaje')) tipo = 'GARAJE';
                else if (lowerTitle.includes('local')) tipo = 'LOCAL';
                else if (lowerTitle.includes('terreno') || lowerTitle.includes('parcela')) tipo = 'TERRENO';

                // 5. Estado (Conservación / Obra nueva)
                let estado = 'SEGUNDA MANO';
                if (featuresText.includes('obra nueva')) estado = 'OBRA NUEVA';
                else if (featuresText.includes('reformar')) estado = 'A REFORMAR';
                else if (featuresText.includes('buen estado')) estado = 'BUEN ESTADO';

                // 6. Localidad (Última parte de la dirección)
                // Ej: "Calle Naranjo, Santuario, Chipiona" -> "Chipiona"
                const addressParts = address.split(',');
                const localidad = addressParts.length > 0 ? addressParts[addressParts.length - 1].trim() : address;

                // 7. Dirección
                const direccion = address; // Dirección completa

                // 8. Enlace a google maps (Construido)
                const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ' ' + localidad)}`;

                // 9. Ref. Catastral/registral
                const refCatastral = ref || 'No disponible';

                // 10. PRECIO
                const precioFinal = price;

                // 11. LINK ANUNCIO
                const linkAnuncio = url;

                // Construcción del Objeto Final
                const finalData = {
                    "Fecha reg": fechaReg,
                    "ID": id,
                    "Entidad": entidad,
                    "Estado": estado,
                    "Tipo": tipo,
                    "Localidad": localidad,
                    "Dirección": direccion,
                    "Enlace a google maps": googleMapsLink,
                    "Ref. Catastral/registral": refCatastral,
                    "PRECIO": precioFinal,
                    "LINK ANUNCIO": linkAnuncio
                };

                // Validar
                if (title || price) {
                    log.info(`💾 Guardando [${id}]: ${title} - ${price} €`);
                    await Dataset.pushData(finalData);
                } else {
                    log.warning('⚠️ Datos insuficientes en página de detalle.');
                }
            }

        } catch (error) {
            log.error(`❌ Falló la solicitud para ${url}: ${error.message}`);
            throw error;
        }
    },
});

log.info('🚀 Iniciando Crawler con Mapeo de Columnas Personalizado...');
await crawler.run(START_URLS);
log.info('✅ Finalizado.');
