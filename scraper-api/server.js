import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import fs from 'fs';
import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Cargar Swagger
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Emisor de eventos global para logs
const logEmitter = new EventEmitter();
// Evitar límite de listeners si hay muchos procesos
logEmitter.setMaxListeners(0);

const SCRAPERS = {
    idealista: '../idealista-scraper',
    altamira: '../altamira-scraper',
    fotocasa: '../fotocasa-scraper',
    solvia: '../solvia-scraper',
    aliseda: '../aliseda-scraper'
};

app.post('/api/scrape', async (req, res) => {
    const { scraper, url } = req.body;

    if (!scraper || !SCRAPERS[scraper]) {
        return res.status(400).json({ error: `Scraper inválido. Opciones válidas: ${Object.keys(SCRAPERS).join(', ')}` });
    }

    if (!url) {
        return res.status(400).json({ error: 'Falta la URL objetivo' });
    }

    const scraperDir = path.resolve(__dirname, SCRAPERS[scraper]);
    const scriptPath = path.join(scraperDir, 'src', 'main.js');

    if (!fs.existsSync(scriptPath)) {
        return res.status(500).json({ error: `No se encuentra el script ${scriptPath}` });
    }

    try {
        // 1. Registrar búsqueda en Base de Datos
        const searchRecord = await prisma.searchHistory.create({
            data: {
                portal: scraper,
                url: url,
                status: 'PROCESSING'
            }
        });

        const jobId = searchRecord.id.toString();
        logEmitter.emit(`log_${jobId}`, `🚀 Registrado en BD. Iniciando proceso de scraping (JobID: ${jobId})...`);

        // Ejecutar proceso hijo
        const child = spawn('node', ['src/main.js', url], { cwd: scraperDir });

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

            // 2. Procesar resultados si exitoso
            let status = code === 0 ? 'COMPLETED' : 'FAILED';

            if (code === 0) {
                const datasetDir = path.resolve(__dirname, SCRAPERS[scraper], 'storage', 'datasets', 'default');
                if (fs.existsSync(datasetDir)) {
                    const files = fs.readdirSync(datasetDir).filter(f => f.endsWith('.json'));
                    logEmitter.emit(`log_${jobId}`, `💾 Subiendo ${files.length} propiedades a PostgreSQL...`);

                    const propertiesToInsert = [];

                    for (const file of files) {
                        try {
                            const data = JSON.parse(fs.readFileSync(path.join(datasetDir, file), 'utf-8'));

                            // Mapear al Schema de Prisma
                            propertiesToInsert.push({
                                searchId: searchRecord.id,
                                fechaReg: data["Fecha reg"] || null,
                                refId: data["ID"] || data["Ref. Catastral/registral"] || null,
                                entidad: data["Entidad"] || scraper,
                                estado: data["Estado"] || null,
                                tipo: data["Tipo"] || null,
                                localidad: data["Localidad"] || null,
                                direccion: data["Dirección"] || null,
                                enlaceMaps: data["Enlace a google maps"] || null,
                                precio: data["PRECIO"]?.toString() || null,
                                m2: data["M2"]?.toString() || null,
                                habitaciones: data["Habitaciones"]?.toString() || null,
                                linkAnuncio: data["LINK ANUNCIO"] || null
                            });
                        } catch (err) {
                            console.error(`Error parseando ${file}:`, err);
                        }
                    }

                    if (propertiesToInsert.length > 0) {
                        await prisma.property.createMany({
                            data: propertiesToInsert,
                            skipDuplicates: true // Si tuvieramos unique constraints
                        });
                        logEmitter.emit(`log_${jobId}`, `✅ ${propertiesToInsert.length} propiedades insertadas en BD.`);
                    } else {
                        logEmitter.emit(`log_${jobId}`, `⚠️ No se encontraron inmuebles válidos para guardar.`);
                        status = 'FAILED';
                    }
                }
            }

            // Actualizar status final
            await prisma.searchHistory.update({
                where: { id: searchRecord.id },
                data: { status }
            });

            // Enviar evento de finalización al frontend y limpiar
            logEmitter.emit(`done_${jobId}`, status);
        });

        // 3. Responder al Frontend con el ID del job
        res.status(202).json({
            message: 'Proceso de scraping iniciado',
            jobId: jobId,
            scraper: scraper,
            url: url
        });

    } catch (e) {
        console.error('Error general al iniciar scrape:', e);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Endpoint EventSource para logs (SSE)
app.get('/api/logs/:jobId', (req, res) => {
    const { jobId } = req.params;

    // Cabeceras SSE obligatorias
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Avisar conexion inicial
    res.write(`data: Conectado. Escuchando logs del Job ${jobId}...\n\n`);

    const logListener = (message) => {
        // SSE manda los datos con "data: " por delante, y dos saltos de línea al final
        res.write(`data: ${message}\n\n`);
    };

    const doneListener = (status) => {
        res.write(`event: done\ndata: ${status}\n\n`);
        res.end(); // Cerrar la conexión
        cleanup();
    };

    logEmitter.on(`log_${jobId}`, logListener);
    logEmitter.on(`done_${jobId}`, doneListener);

    // Cliente se desconecta abruptamente
    req.on('close', () => {
        cleanup();
    });

    function cleanup() {
        logEmitter.off(`log_${jobId}`, logListener);
        logEmitter.off(`done_${jobId}`, doneListener);
    }
});

app.get('/api/results/all', async (req, res) => {
    try {
        const results = await prisma.searchHistory.findMany({
            include: { properties: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ API Scraper escuchando en http://localhost:${PORT}`);
    console.log(`📚 Documentación de la API en http://localhost:${PORT}/api-docs`);
});
