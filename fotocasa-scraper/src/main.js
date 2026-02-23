import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

chromium.use(stealthPlugin());

const TARGET_URL = process.argv[2] || 'https://www.fotocasa.es/es/comprar/viviendas/barbate/todas-las-zonas/l?occupancyStatus=OCCUPIED&propertySubtypeIds=1%3B2%3B6%3B7%3B8%3B52%3B54%3B3%3B9%3B5';

(async () => {
    console.log('🚀 Script starting (Pure Playwright)...');

    // Launch browser
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    try {
        console.log(`Processing ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Aceptar cookies
        try {
            const cookieBtn = await page.getByText('Aceptar y cerrar', { exact: false }).or(page.getByText('Aceptar todas', { exact: false })).first();
            if (await cookieBtn.isVisible()) {
                await cookieBtn.click();
                console.log('🍪 Cookies aceptadas');
            }
        } catch (e) { }

        // ESTRATEGIA JSON
        const scriptHandle = await page.$('#sui-scripts');
        const scriptContent = scriptHandle ? await scriptHandle.textContent() : null;

        let properties = [];


        if (scriptContent) {
            console.log(`📜 Script content found. Length: ${scriptContent.length}`);

            try {

                // Regex for JSON.parse("...")
                // Capture everything inside the parentheses, non-greedy
                const jsonMatch = scriptContent.match(/window\.__INITIAL_DATA__\s*=\s*JSON\.parse\((.*?)\);/s);

                if (jsonMatch && jsonMatch[1]) {
                    console.log('🔍 JSON.parse Regex match successful.');
                    // The match contains the string literal
                    let jsonStringEncoded = jsonMatch[1];

                    // If it is wrapped in quotes, remove them?
                    // Usually JSON.parse("...")
                    // But regex capture group 1 inside ( ) includes the quotes if I used ("(.*)")? No.
                    // (.*?) matches what is inside ( ).
                    // If the source is: JSON.parse("foo");
                    // The match is: "foo" (including quotes) because I didn't match quotes outside.
                    // Wait, JSON.parse takes a string. 
                    // If I pass `"{\"a\":1}"` to JSON.parse in JS, it works.
                    // So I should pass exactly what is inside ().

                    const jsonData = JSON.parse(jsonStringEncoded);
                    console.log('✅ JSON Parsed successfully.');

                    const realEstates = jsonData?.initialResults?.realEstates || [];
                    console.log(`🏠 Num properties found in JSON: ${realEstates.length}`);

                    properties = realEstates.map(item => {
                        const features = item.features || {};
                        const address = item.address || {};

                        return {
                            "Fecha reg": new Date().toLocaleDateString('es-ES'),
                            "ID": item.id?.toString() || '',
                            "Entidad": "Fotocasa",
                            "Estado": "SEGUNDA MANO",
                            "Tipo": item.propertyType?.replace('_', ' ').toUpperCase() || 'VIVIENDA',
                            "Localidad": address.location?.level4 || 'Barbate',
                            "Dirección": address.ubication || '',
                            "Enlace a google maps": `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.ubication || '')}`,
                            "Ref. Catastral/registral": item.id?.toString() || '',
                            "PRECIO": item.transactions?.[0]?.value?.[0]?.toString() || '0',
                            "M2": features.surface?.toString() || '',
                            "Habitaciones": features.rooms?.toString() || '',
                            "LINK ANUNCIO": `https://www.fotocasa.es${item.detail?.es || ''}`
                        };
                    });
                }
            } catch (e) {
                console.warn(`⚠️ Error parseando JSON: ${e.message}`);
            }
        }


        // FALLBACK DOM (Si JSON falla o no trae nada)
        if (properties.length === 0) {
            console.log('⚠️ JSON no trajo propiedades. Usando Fallback DOM...');

            // Esperar a que carguen las cards
            try {
                await page.waitForSelector('article', { timeout: 10000 });
            } catch (e) {
                console.log('⚠️ Timeout esperando articles en DOM.');
            }

            const cards = await page.$$('article');
            console.log(`DOM: Encontradas ${cards.length} cards.`);

            for (const card of cards) {
                try {
                    // Link
                    const linkHandle = await card.$('a[href*="/vivienda/"]');
                    const link = linkHandle ? await linkHandle.getAttribute('href') : '';
                    if (!link) continue;

                    const fullLink = link.startsWith('http') ? link : `https://www.fotocasa.es${link}`;

                    // ID (from URL usually)
                    const idMatch = fullLink.match(/\/(\d+)\//);
                    const id = idMatch ? idMatch[1] : 'unknown';

                    // Price
                    // Buscamos texto que tenga coincidencia con precio
                    const priceEl = await card.$('.re-CardPrice'); // Clase común, o buscar por texto
                    let price = '0';
                    if (priceEl) {
                        price = await priceEl.innerText();
                    } else {
                        // Fallback genérico por texto
                        const text = await card.innerText();
                        const priceMatch = text.match(/([0-9.]+)\s?€/);
                        if (priceMatch) price = priceMatch[1];
                    }

                    // Features (Habitaciones, M2, Baños)
                    const text = await card.innerText();
                    // Regex para features en texto plano del card
                    const roomsMatch = text.match(/(\d+)\s*habs/i);
                    const rooms = roomsMatch ? roomsMatch[1] : '';

                    const m2Match = text.match(/(\d+)\s*m²/i);
                    const m2 = m2Match ? m2Match[1] : '';

                    // Title/Type
                    const titleEl = await card.$('.re-CardTitle');
                    const title = titleEl ? await titleEl.innerText() : 'Vivienda';

                    properties.push({
                        "Fecha reg": new Date().toLocaleDateString('es-ES'),
                        "ID": id,
                        "Entidad": "Fotocasa",
                        "Estado": "SEGUNDA MANO",
                        "Tipo": title.toUpperCase(),
                        "Localidad": "Barbate",
                        "Dirección": "", // Difícil de sacar del listing a veces
                        "Enlace a google maps": "",
                        "Ref. Catastral/registral": id,
                        "PRECIO": price.replace(/[^0-9]/g, ''),
                        "M2": m2,
                        "Habitaciones": rooms,
                        "LINK ANUNCIO": fullLink
                    });
                } catch (e) {
                    console.error('Error parsing card:', e.message);
                }
            }
        }

        // Guardar via FS
        if (properties.length > 0) {
            const dir = 'storage/datasets/default';
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Save as individual files nicely
            properties.forEach((prop, index) => {
                const filename = path.join(dir, `${String(index + 1).padStart(9, '0')}.json`);
                fs.writeFileSync(filename, JSON.stringify(prop, null, 2));
            });
            console.log(`💾 Guardadas ${properties.length} propiedades en ${dir}.`);
        } else {
            console.warn('❌ No se encontraron propiedades (ni JSON ni DOM).');
            // Screenshot para debugging visual
            await page.screenshot({ path: 'debug_fotocasa_failed.png', fullPage: true });
        }

    } catch (error) {
        console.error(`❌ Error general: ${error.message}`);
    } finally {
        await browser.close();
        console.log('✅ Finalizado.');
    }
})();
