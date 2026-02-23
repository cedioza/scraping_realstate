
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
console.log('Imports successful');
try {
    chromium.use(stealthPlugin());
    console.log('Plugin usage successful');
} catch (e) {
    console.error(e);
}
