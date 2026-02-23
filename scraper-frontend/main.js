const form = document.getElementById('scraper-form');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.querySelector('.btn-text');
const btnLoader = document.querySelector('.btn-loader');
const statusPanel = document.getElementById('status-panel');
const statusBadge = document.getElementById('status-badge');
const statusMessage = document.getElementById('status-message');
const progressBar = document.querySelector('.progress-bar');
const logTerminal = document.getElementById('log-terminal');
const logOutput = document.getElementById('log-output');

// Sidebar and Modal elements
const historyList = document.getElementById('history-list');
const dbModal = document.getElementById('db-modal');
const closeModalBtn = document.getElementById('close-modal');
const viewTotalBtn = document.getElementById('view-total-btn');
const dbTableBody = document.getElementById('db-table-body');

const API_URL = 'http://localhost:3000/api/scrape';
const RESULTS_URL = 'http://localhost:3000/api/results/all';
let eventSource = null;
let allResultsData = [];

// Cargar historial al cargar la página
document.addEventListener('DOMContentLoaded', loadHistory);

async function loadHistory() {
    try {
        const res = await fetch(RESULTS_URL);
        const data = await res.json();
        allResultsData = data;
        renderHistoryList(data);
    } catch (e) {
        console.error('Error fetching history:', e);
        historyList.innerHTML = '<div class="history-loading">Error al cargar el historial</div>';
    }
}

function renderHistoryList(data) {
    if (!data || data.length === 0) {
        historyList.innerHTML = '<div class="history-loading">Aún no hay búsquedas registradas.</div>';
        return;
    }

    historyList.innerHTML = '';
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';

        let statusSpan = `<span class="badge ${item.status === 'COMPLETED' ? 'success' : (item.status === 'FAILED' ? 'error' : '')}">
                            ${item.status}
                          </span>`;

        div.innerHTML = `
            <div class="history-item-header">
                <span class="history-portal">${item.portal}</span>
                <span class="history-date">${new Date(item.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="history-url" title="${item.url}">${item.url}</div>
            <div style="display: flex; justify-content: space-between; align-items: center">
                ${statusSpan}
                <span style="font-size: 0.75rem; color: var(--text-muted)">${item.properties ? item.properties.length : 0} props</span>
            </div>
        `;
        historyList.appendChild(div);
    });
}

// Eventos del Modal
viewTotalBtn.addEventListener('click', () => {
    openModal();
});

closeModalBtn.addEventListener('click', () => {
    dbModal.classList.add('hidden');
});

window.addEventListener('click', (e) => {
    if (e.target === dbModal) {
        dbModal.classList.add('hidden');
    }
});

function openModal() {
    dbModal.classList.remove('hidden');
    renderTable();
}

function renderTable() {
    dbTableBody.innerHTML = '';

    // Flatten all properties from all searches
    const allProperties = [];
    allResultsData.forEach(search => {
        if (search.properties) {
            search.properties.forEach(prop => {
                // Mix search data if needed
                allProperties.push({ ...prop, portal: search.portal });
            });
        }
    });

    if (allProperties.length === 0) {
        dbTableBody.innerHTML = '<tr><td colspan="8" class="text-center">No hay ninguna propiedad guardada en base de datos.</td></tr>';
        return;
    }

    allProperties.forEach(prop => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge" style="background:transparent; border-color:var(--border-light)">${prop.portal}</span></td>
            <td>${prop.entidad || '-'}</td>
            <td>${prop.estado || '-'}</td>
            <td>${prop.tipo || '-'}</td>
            <td>${prop.localidad || '-'}</td>
            <td><strong>${prop.precio || '-'}</strong></td>
            <td>${prop.m2 || '-'}</td>
            <td>${prop.linkAnuncio ? `<a href="${prop.linkAnuncio}" target="_blank">Ver Anuncio</a>` : '-'}</td>
        `;
        dbTableBody.appendChild(tr);
    });
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const scraper = document.getElementById('scraper-select').value;
    const url = document.getElementById('url-input').value;

    if (!scraper || !url) {
        showError('Por favor completa todos los campos.');
        return;
    }

    // Pre-UI changes
    setLoadingState(true);
    clearLogs();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ scraper, url })
        });

        const data = await response.json();

        if (response.ok && data.jobId) {
            // Iniciar escucha SSE
            startLogStream(data.jobId);
        } else {
            showError(data.error || 'Error desconocido al iniciar el scraping.');
            setLoadingState(false);
        }

    } catch (error) {
        showError('Error de red al conectar con el servidor backend.');
        console.error('Fetch error:', error);
        setLoadingState(false);
    }
});

function startLogStream(jobId) {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource(`http://localhost:3000/api/logs/${jobId}`);

    eventSource.onmessage = (event) => {
        appendLog(event.data);
    };

    eventSource.addEventListener('done', (event) => {
        const finalStatus = event.data; // 'COMPLETED' or 'FAILED'
        if (finalStatus === 'COMPLETED') {
            showSuccess('Proceso de scraping y guardado en Base de Datos finalizado satisfactoriamente.');
            loadHistory(); // Recargar historial automáticamente
        } else {
            showError('El proceso terminó con errores o no se encontraron propiedades para guardar.');
            loadHistory(); // Recargar de todos modos para actualizar status a FAILED
        }
        setLoadingState(false);
        eventSource.close();
        eventSource = null;
    });

    eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        appendLog('--- CONEXIÓN CON EL SERVIDOR PERDIDA ---', true);
        setLoadingState(false);
        eventSource.close();
        eventSource = null;
    }
}

function clearLogs() {
    logOutput.innerHTML = '';
    logTerminal.classList.remove('hidden');
}

function appendLog(message, isError = false) {
    const line = document.createElement('div');
    line.className = 'log-line';
    if (isError || message.includes('ERROR') || message.includes('❌') || message.includes('⚠️')) {
        line.classList.add('error');
    }
    line.textContent = message;
    logOutput.appendChild(line);

    // Auto-scroll to bottom
    logOutput.scrollTop = logOutput.scrollHeight;
}

function setLoadingState(isLoading) {
    if (isLoading) {
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        submitBtn.disabled = true;

        // Configurar panel de estado
        statusPanel.classList.remove('hidden');
        statusBadge.textContent = 'Procesando';
        statusBadge.className = 'badge'; // Reset classes
        statusMessage.textContent = 'Extrayendo propiedades y guardando en Postgres...';
        progressBar.className = 'progress-bar infinite';
    } else {
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        submitBtn.disabled = false;
    }
}

function showSuccess(message) {
    statusBadge.textContent = 'Completado';
    statusBadge.className = 'badge success';
    statusMessage.textContent = message;
    progressBar.className = 'progress-bar success';
}

function showError(message) {
    statusBadge.textContent = 'Error';
    statusBadge.className = 'badge error';
    statusMessage.textContent = message;
    progressBar.className = 'progress-bar error';
}
