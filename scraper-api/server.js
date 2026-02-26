import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import fs from 'fs';
import { EventEmitter } from 'events';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Cargar Swagger
let swaggerDocument;
try {
    swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (err) {
    console.log("No se pudo cargar swagger.yaml. Documentación no disponible.");
}

// Emisor de eventos global para logs
const logEmitter = new EventEmitter();
// Evitar límite de listeners si hay muchos procesos
logEmitter.setMaxListeners(0);

// Servir estáticos de Docusaurus si existen (Integración para Producción Dokploy)
const docusaurusBuildPath = path.resolve(__dirname, '../api-docs/build');
if (fs.existsSync(docusaurusBuildPath)) {
    console.log(`📄 Sirviendo documentación Docusaurus desde: ${docusaurusBuildPath}`);
    app.use(express.static(docusaurusBuildPath));
} else {
    console.log(`⚠️ Build de Docusaurus no encontrado en ${docusaurusBuildPath}. Ejecuta 'npm run build' en api-docs si lo requieres.`);
}

const SCRAPERS = {
    idealista: '../idealista-scraper',
    altamira: '../altamira-scraper',
    fotocasa: '../fotocasa-scraper',
    solvia: '../solvia-scraper',
    aliseda: '../aliseda-scraper'
};

const detectScraper = (url) => {
    if (!url) return null;
    if (url.includes('idealista.com')) return 'idealista';
    if (url.includes('altamirainmuebles.com')) return 'altamira';
    if (url.includes('fotocasa.es')) return 'fotocasa';
    if (url.includes('solvia.es')) return 'solvia';
    if (url.includes('alisedainmobiliaria.com')) return 'aliseda';
};

app.post('/api/scrape', async (req, res) => {
    const { url, webhookUrl } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'Falta la URL objetivo' });
    }

    const scraper = detectScraper(url);

    if (!scraper || !SCRAPERS[scraper]) {
        return res.status(400).json({ error: `No se pudo determinar un scraper válido para esta URL. Portales soportados: idealista, altamira, fotocasa, solvia, aliseda.` });
    }

    const scraperDir = path.resolve(__dirname, SCRAPERS[scraper]);
    const scriptPath = path.join(scraperDir, 'src', 'main.js');

    if (!fs.existsSync(scriptPath)) {
        return res.status(500).json({ error: `No se encuentra el script ${scriptPath}` });
    }

    const jobId = crypto.randomUUID();
    const crawleeStorageDir = path.resolve(__dirname, 'storage', 'jobs', jobId);

    // If a webhookUrl is provided, return 202 immediately to prevent timeout.
    // Otherwise, maintain synchronous behavior (useful for local development or fast queries).
    if (webhookUrl) {
        res.status(202).json({
            success: true,
            message: 'Proceso de scraping iniciado en segundo plano.',
            jobId,
            webhookUrl
        });
    }

    try {
        logEmitter.emit(`log_${jobId}`, `🚀 Iniciando proceso de scraping (JobID: ${jobId}, Scraper: ${scraper})...`);

        // Ejecutar proceso hijo con variable de entorno para storage de crawlee
        const child = spawn('node', ['src/main.js', url], {
            cwd: scraperDir,
            env: {
                ...process.env,
                CRAWLEE_DISABLE_SYSTEM_INFO: '1',
                CRAWLEE_STORAGE_DIR: crawleeStorageDir
            }
        });

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim().length > 0);
            lines.forEach(line => {
                console.log(`[${scraper}-${jobId}] ${line}`);
                logEmitter.emit(`log_${jobId}`, line);
            });
        });

        child.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim().length > 0);
            lines.forEach(line => {
                console.error(`[${scraper}-${jobId} ERROR] ${line}`);
                logEmitter.emit(`log_${jobId}`, `ERROR: ${line}`);
            });
        });

        child.on('close', async (code) => {
            const finishMsg = `Proceso finalizado con código ${code}`;
            console.log(`[${scraper}-${jobId}] ${finishMsg}`);
            logEmitter.emit(`log_${jobId}`, finishMsg);

            let results = [];
            let status = code === 0 ? 'COMPLETED' : 'FAILED';

            // Buscar resultados en el directorio temporal
            const datasetDir = path.join(crawleeStorageDir, 'datasets', 'default');
            if (fs.existsSync(datasetDir)) {
                const files = fs.readdirSync(datasetDir).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    try {
                        const fileContent = fs.readFileSync(path.join(datasetDir, file), 'utf-8');
                        const data = JSON.parse(fileContent);
                        results.push(data);
                    } catch (err) {
                        console.error(`Error parseando ${file}:`, err);
                    }
                }
            }

            // Eliminar directorio temporal
            try {
                if (fs.existsSync(crawleeStorageDir)) {
                    fs.rmSync(crawleeStorageDir, { recursive: true, force: true });
                }
            } catch (err) {
                console.error(`Error eliminando storage temporal ${crawleeStorageDir}:`, err);
            }

            logEmitter.emit(`done_${jobId}`, status);

            const responsePayload = {
                jobId,
                status: status,
                scraper: scraper,
                url: url,
                data: results,
                error: code !== 0 ? 'Proceso de scraping fallido.' : null
            };

            if (webhookUrl) {
                try {
                    console.log(`[${jobId}] Enviando resultados por Webhook a ${webhookUrl}...`);
                    await axios.post(webhookUrl, responsePayload);
                    console.log(`[${jobId}] Webhook entregado con éxito.`);
                } catch (webhookErr) {
                    console.error(`[${jobId}] Error entregando Webhook a ${webhookUrl}:`, webhookErr.message);
                }
            } else {
                if (code === 0) {
                    return res.json(responsePayload);
                } else {
                    return res.status(500).json(responsePayload);
                }
            }
        });

    } catch (e) {
        console.error('Error general al iniciar scrape:', e);
        if (!webhookUrl) {
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    }
});


// Endpoint EventSource para logs (SSE)
app.get('/api/logs/:jobId', (req, res) => {
    const { jobId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: Conectado. Escuchando logs del Job ${jobId}...\n\n`);

    const logListener = (message) => {
        res.write(`data: ${message}\n\n`);
    };

    const doneListener = (status) => {
        res.write(`event: done\ndata: ${status}\n\n`);
        res.end();
        cleanup();
    };

    logEmitter.on(`log_${jobId}`, logListener);
    logEmitter.on(`done_${jobId}`, doneListener);

    req.on('close', () => cleanup());

    function cleanup() {
        logEmitter.off(`log_${jobId}`, logListener);
        logEmitter.off(`done_${jobId}`, doneListener);
    }
});

app.listen(PORT, () => {
    console.log(`✅ API Scraper escuchando en http://localhost:${PORT}`);
    console.log(`📚 Documentación de la API en http://localhost:${PORT}/api-docs`);
});
