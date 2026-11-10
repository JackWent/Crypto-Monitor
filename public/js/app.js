const { createApp, reactive, ref, computed, onMounted, onUnmounted } = Vue;

// Chart.js plugin: draws a soft neon glow behind each line dataset.
const glowPlugin = {
    id: 'glow',
    beforeDatasetsDraw(chart, args, pluginOptions) {
        const { ctx } = chart;
        ctx.save();
        ctx.shadowColor = pluginOptions.color || 'rgba(34, 229, 204, 0.5)';
        ctx.shadowBlur = pluginOptions.blur ?? 10;
    },
    afterDatasetsDraw(chart) {
        chart.ctx.restore();
    }
};

function buildGradientFill(ctx, chartArea, colorRgb) {
    if (!chartArea) {
        return `rgba(${colorRgb}, 0.15)`;
    }
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, `rgba(${colorRgb}, 0.35)`);
    gradient.addColorStop(1, `rgba(${colorRgb}, 0)`);
    return gradient;
}

createApp({
    setup() {
        const currentPeriod = ref('24h');
        const periodOptions = [
            { value: '24h', label: '24h' },
            { value: '7d', label: '7d' },
            { value: '30d', label: '30d' },
            { value: '90d', label: '90d' },
            { value: '1y', label: '1y' }
        ];
        const workersLoading = ref(true);
        const activeWorkers = ref([]);
        const isAdminExpanded = ref(false);
        const isAdminAuthEnabled = ref(false);
        const isAdminAuthenticated = ref(false);
        const isAdminAuthenticating = ref(false);
        const adminPassword = ref('');
        const adminAuthMessage = ref('');
        const isSendingEmail = ref(false);
        const isSendingOfflineTestEmail = ref(false);
        const isManualUpdating = ref(false);
        const isExportingHistory = ref(false);
        const isImportingHistory = ref(false);
        const backupStatusMessage = ref('');
        const importStatusMessage = ref('');
        const xmrHistoryFile = ref(null);
        const hashrateHistoryFile = ref(null);
        const hashrateCanvas = ref(null);
        const xmrUsdCanvas = ref(null);
        const isHashrateZoomed = ref(false);
        const isXmrUsdZoomed = ref(false);
        const xmrHistoryInput = ref(null);
        const hashrateHistoryInput = ref(null);

        const isLive = ref(true);
        const minerStatsLoaded = ref(false);
        const xmrRateLoaded = ref(false);
        const isInitialStatsLoading = computed(() => !(minerStatsLoaded.value && xmrRateLoaded.value));

        const chartsLoadingCount = ref(0);
        const chartsLoading = computed(() => chartsLoadingCount.value > 0);

        const toasts = ref([]);
        let toastCounter = 0;

        const flash = reactive({
            hashrate: false,
            hashes: false,
            workers: false,
            balance: false,
            paid: false,
            reward: false,
            blocks: false,
            xmrUsd: false
        });
        const flashTimers = {};

        const stats = reactive({
            totalHashrate: 'Loading...',
            totalHashes: 'Loading...',
            totalWorkers: 'Loading...',
            pendingBalance: 'Loading...',
            totalPaid: 'Loading...',
            lastReward: 'Loading...',
            blocksFound: 'Loading...',
            currentXmrToUsd: 'Loading...',
            hashrateChange: '',
            hashrateChangeClass: '',
            xmrUsdChange: '',
            xmrUsdChangeClass: ''
        });

        const workerCounts = computed(() => {
            const counts = { online: 0, idle: 0, offline: 0 };
            for (const worker of activeWorkers.value) {
                const status = worker.status || 'online';
                if (counts[status] === undefined) {
                    counts.online += 1;
                } else {
                    counts[status] += 1;
                }
            }
            return counts;
        });

        let hashrateChart = null;
        let xmrUsdChart = null;
        let updateInterval = null;
        let statsUpdateInterval = null;
        let clockInterval = null;
        let hashrateHistoryAbortController = null;
        let xmrUsdHistoryAbortController = null;

        const currentTime = ref('');
        function updateClock() {
            currentTime.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }

        function triggerFlash(key) {
            flash[key] = false;
            requestAnimationFrame(() => {
                flash[key] = true;
                if (flashTimers[key]) {
                    clearTimeout(flashTimers[key]);
                }
                flashTimers[key] = setTimeout(() => {
                    flash[key] = false;
                }, 700);
            });
        }

        function pushToast(message, type = 'info', duration = 4500) {
            const id = ++toastCounter;
            toasts.value.push({ id, message, type });
            setTimeout(() => dismissToast(id), duration);
        }

        function dismissToast(id) {
            toasts.value = toasts.value.filter((toast) => toast.id !== id);
        }

        function toastIcon(type) {
            if (type === 'success') return '✓';
            if (type === 'error') return '✕';
            return 'ℹ';
        }

        function beginChartsLoading() {
            chartsLoadingCount.value += 1;
        }

        function endChartsLoading() {
            chartsLoadingCount.value = Math.max(0, chartsLoadingCount.value - 1);
        }

        function calculatePercentChange(currentValue, previousValue) {
            if (!previousValue) {
                return null;
            }
            return ((currentValue - previousValue) / previousValue) * 100;
        }

        function setPercentChange(percentChange, key) {
            if (percentChange === null || Number.isNaN(percentChange)) {
                if (key === 'hashrate') {
                    stats.hashrateChange = '';
                    stats.hashrateChangeClass = '';
                } else {
                    stats.xmrUsdChange = '';
                    stats.xmrUsdChangeClass = '';
                }
                return;
            }

            const formatted = percentChange > 0
                ? `+${percentChange.toFixed(2)}%`
                : `${percentChange.toFixed(2)}%`;
            const cssClass = percentChange >= 0 ? 'positive' : 'negative';

            if (key === 'hashrate') {
                stats.hashrateChange = formatted;
                stats.hashrateChangeClass = cssClass;
            } else {
                stats.xmrUsdChange = formatted;
                stats.xmrUsdChangeClass = cssClass;
            }
        }

        function formatDateForDisplay(timestamp, period) {
            const date = new Date(timestamp);
            if (period === '24h') {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            if (period === '7d') {
                return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
                    + ' '
                    + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            if (period === '1y') {
                return date.toLocaleDateString([], { month: 'short', year: '2-digit' });
            }
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }

        function formatLastShare(lastShare) {
            if (!lastShare) {
                return 'N/A';
            }
            return new Date(lastShare * 1000).toLocaleString();
        }

        function initializeCharts() {
            const sharedScales = {
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8b93b0', font: { family: "'JetBrains Mono', monospace", size: 11 } }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: {
                        color: '#8b93b0',
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            };

            const sharedTooltip = {
                mode: 'index',
                intersect: false,
                backgroundColor: '#12141f',
                borderColor: 'rgba(34, 229, 204, 0.3)',
                borderWidth: 1,
                titleColor: '#f5f7ff',
                bodyColor: '#f5f7ff',
                titleFont: { family: "'JetBrains Mono', monospace" },
                bodyFont: { family: "'JetBrains Mono', monospace" },
                padding: 10,
                cornerRadius: 8
            };

            hashrateChart = new Chart(hashrateCanvas.value, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Pool Hashrate (H/s)',
                        data: [],
                        borderColor: '#22e5cc',
                        backgroundColor: (context) => buildGradientFill(context.chart.ctx, context.chart.chartArea, '34, 229, 204'),
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: '#22e5cc',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { left: 8, right: 8, bottom: 12 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: sharedTooltip,
                        glow: { color: 'rgba(34, 229, 204, 0.45)', blur: 10 },
                        zoom: buildZoomOptions('rgba(34, 229, 204, 0.15)', 'rgba(34, 229, 204, 0.6)', () => {
                            isHashrateZoomed.value = true;
                        })
                    },
                    scales: sharedScales
                },
                plugins: [glowPlugin]
            });
            hashrateCanvas.value.addEventListener('dblclick', () => resetHashrateZoom());

            xmrUsdChart = new Chart(xmrUsdCanvas.value, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'XMR to USD',
                        data: [],
                        borderColor: '#ffb020',
                        backgroundColor: (context) => buildGradientFill(context.chart.ctx, context.chart.chartArea, '255, 176, 32'),
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: '#ffb020',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { left: 8, right: 8, bottom: 12 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: sharedTooltip,
                        glow: { color: 'rgba(255, 176, 32, 0.45)', blur: 10 },
                        zoom: buildZoomOptions('rgba(255, 176, 32, 0.15)', 'rgba(255, 176, 32, 0.6)', () => {
                            isXmrUsdZoomed.value = true;
                        })
                    },
                    scales: sharedScales
                },
                plugins: [glowPlugin]
            });
            xmrUsdCanvas.value.addEventListener('dblclick', () => resetXmrUsdZoom());
        }

        // Drag-to-zoom on the x-axis (time range), via chartjs-plugin-zoom.
        function buildZoomOptions(backgroundColor, borderColor, onZoomComplete) {
            return {
                pan: { enabled: false },
                zoom: {
                    wheel: { enabled: false },
                    pinch: { enabled: false },
                    drag: { enabled: true, backgroundColor, borderColor, borderWidth: 1 },
                    mode: 'x',
                    onZoomComplete
                }
            };
        }

        function resetHashrateZoom() {
            if (hashrateChart) {
                hashrateChart.resetZoom();
            }
            isHashrateZoomed.value = false;
        }

        function resetXmrUsdZoom() {
            if (xmrUsdChart) {
                xmrUsdChart.resetZoom();
            }
            isXmrUsdZoomed.value = false;
        }

        async function fetchMinerStats() {
            try {
                const response = await fetch('/api/miner-stats');
                if (!response.ok) {
                    throw new Error(`Failed to fetch miner stats: ${response.statusText}`);
                }
                const data = await response.json();
                const baseStats = data.stats || {};

                const newHashrate = baseStats.hashrate || '0 H/s';
                const newHashes = baseStats.hashes || '0';

                const workers = Array.isArray(data.perWorkerStats) ? data.perWorkerStats : [];
                const filteredWorkers = workers.filter((worker) => {
                    const hashrate = parseFloat(worker.hashrate);
                    return hashrate && hashrate > 0;
                });

                const newWorkers = filteredWorkers.length;
                const newBalance = `${((baseStats.balance || 0) / 1e12).toFixed(12)} XMR`;
                const newPaid = `${((baseStats.paid || 0) / 1e12).toFixed(12)} XMR`;
                const newReward = `${((baseStats.last_reward || 0) / 1e12).toFixed(12)} XMR`;
                const newBlocks = baseStats.blocksFound || '0';

                if (stats.totalHashrate !== newHashrate) triggerFlash('hashrate');
                if (stats.totalHashes !== newHashes) triggerFlash('hashes');
                if (stats.totalWorkers !== newWorkers) triggerFlash('workers');
                if (stats.pendingBalance !== newBalance) triggerFlash('balance');
                if (stats.totalPaid !== newPaid) triggerFlash('paid');
                if (stats.lastReward !== newReward) triggerFlash('reward');
                if (stats.blocksFound !== newBlocks) triggerFlash('blocks');

                stats.totalHashrate = newHashrate;
                stats.totalHashes = newHashes;
                stats.totalWorkers = newWorkers;
                stats.pendingBalance = newBalance;
                stats.totalPaid = newPaid;
                stats.lastReward = newReward;
                stats.blocksFound = newBlocks;

                activeWorkers.value = filteredWorkers;
                workersLoading.value = false;
                isLive.value = true;
                minerStatsLoaded.value = true;

                return data;
            } catch (error) {
                console.error('Error fetching miner stats:', error);
                workersLoading.value = false;
                activeWorkers.value = [];
                isLive.value = false;
                minerStatsLoaded.value = true;

                if (stats.totalHashrate === 'Loading...') {
                    stats.totalHashrate = 'Error';
                    stats.totalHashes = 'Error';
                    stats.totalWorkers = 'Error';
                    stats.pendingBalance = 'Error';
                    stats.totalPaid = 'Error';
                    stats.lastReward = 'Error';
                    stats.blocksFound = 'Error';
                }
                throw error;
            }
        }

        async function fetchXmrToUsd() {
            try {
                const response = await fetch('/api/xmr-usd-rate');
                if (!response.ok) {
                    throw new Error(`Failed to fetch XMR/USD rate: ${response.statusText}`);
                }
                const data = await response.json();
                const currentRate = Number(data.rate);
                const formatted = `$${currentRate.toFixed(2)}`;

                if (stats.currentXmrToUsd !== formatted) triggerFlash('xmrUsd');
                stats.currentXmrToUsd = formatted;
                isLive.value = true;
                xmrRateLoaded.value = true;

                return currentRate;
            } catch (error) {
                console.error('Error fetching XMR/USD rate:', error);
                stats.currentXmrToUsd = 'Error';
                isLive.value = false;
                xmrRateLoaded.value = true;
                throw error;
            }
        }

        async function fetchHashrateHistory(options = {}) {
            const { showLoader = true, signal } = options;
            const period = currentPeriod.value;
            if (showLoader) {
                beginChartsLoading();
            }
            try {
                const response = await fetch(`/api/hashrate-history?period=${period}`, { signal });
                if (!response.ok) {
                    throw new Error(`Failed to fetch hashrate history: ${response.statusText}`);
                }
                const data = await response.json();

                if (!Array.isArray(data.history) || data.history.length === 0) {
                    console.warn('No hashrate history data available');
                    return;
                }

                const labels = data.history.map((item) =>
                    formatDateForDisplay(item.timestamp, period)
                );
                const values = data.history.map((item) => item.hashrate);

                hashrateChart.data.labels = labels;
                hashrateChart.data.datasets[0].data = values;
                hashrateChart.update();

                if (values.length >= 2) {
                    const latest = values[values.length - 1];
                    const earliest = values[0];
                    setPercentChange(calculatePercentChange(latest, earliest), 'hashrate');
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    return;
                }
                console.error('Error fetching hashrate history:', error);
            } finally {
                if (showLoader) {
                    endChartsLoading();
                }
            }
        }

        async function fetchXmrUsdHistory(options = {}) {
            const { showLoader = true, signal } = options;
            const period = currentPeriod.value;
            if (showLoader) {
                beginChartsLoading();
            }
            try {
                const response = await fetch(`/api/xmr-usd-history?period=${period}`, { signal });
                if (!response.ok) {
                    throw new Error(`Failed to fetch XMR/USD history: ${response.statusText}`);
                }
                const data = await response.json();

                if (!Array.isArray(data.history) || data.history.length === 0) {
                    console.warn('No XMR/USD history data available');
                    return;
                }

                const labels = data.history.map((item) =>
                    formatDateForDisplay(item.timestamp, period)
                );
                const values = data.history.map((item) => item.rate);

                xmrUsdChart.data.labels = labels;
                xmrUsdChart.data.datasets[0].data = values;
                xmrUsdChart.update();

                if (values.length >= 2) {
                    const latest = values[values.length - 1];
                    const earliest = values[0];
                    setPercentChange(calculatePercentChange(latest, earliest), 'xmr');
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    return;
                }
                console.error('Error fetching XMR/USD history:', error);
            } finally {
                if (showLoader) {
                    endChartsLoading();
                }
            }
        }

        async function updateLiveStats() {
            try {
                await Promise.all([
                    fetchMinerStats(),
                    fetchXmrToUsd()
                ]);
            } catch (error) {
                console.error('Error updating live stats:', error);
            }
        }

        async function updateHistoryCharts(options = {}) {
            const { showLoader = false, cancelPrevious = false } = options;

            if (cancelPrevious) {
                if (hashrateHistoryAbortController) {
                    hashrateHistoryAbortController.abort();
                }
                if (xmrUsdHistoryAbortController) {
                    xmrUsdHistoryAbortController.abort();
                }
            }

            const hashrateController = new AbortController();
            const xmrController = new AbortController();
            hashrateHistoryAbortController = hashrateController;
            xmrUsdHistoryAbortController = xmrController;

            try {
                await Promise.all([
                    fetchHashrateHistory({ showLoader, signal: hashrateController.signal }),
                    fetchXmrUsdHistory({ showLoader, signal: xmrController.signal })
                ]);
            } finally {
                if (hashrateHistoryAbortController === hashrateController) {
                    hashrateHistoryAbortController = null;
                }
                if (xmrUsdHistoryAbortController === xmrController) {
                    xmrUsdHistoryAbortController = null;
                }
            }
        }

        async function updateDashboard() {
            try {
                await Promise.all([
                    fetchMinerStats(),
                    fetchXmrToUsd(),
                    updateHistoryCharts({ showLoader: true, cancelPrevious: true })
                ]);
            } catch (error) {
                console.error('Error updating dashboard:', error);
            }
        }

        async function setPeriod(period) {
            if (period === currentPeriod.value) {
                return;
            }

            currentPeriod.value = period;
            await updateHistoryCharts({ showLoader: true, cancelPrevious: true });
        }

        async function checkAdminSession() {
            try {
                const response = await fetch('/api/admin/session', {
                    credentials: 'same-origin'
                });
                if (!response.ok) {
                    throw new Error(`Admin session check failed: ${response.statusText}`);
                }

                const payload = await response.json();
                isAdminAuthEnabled.value = Boolean(payload?.enabled);
                isAdminAuthenticated.value = isAdminAuthEnabled.value
                    ? Boolean(payload?.authenticated)
                    : true;

                if (!isAdminAuthEnabled.value) {
                    adminAuthMessage.value = '';
                }
            } catch (error) {
                console.error('Error checking admin session:', error);
                isAdminAuthEnabled.value = true;
                isAdminAuthenticated.value = false;
                adminAuthMessage.value = `Admin auth check failed: ${error.message}`;
            }
        }

        async function loginAdmin() {
            if (isAdminAuthenticating.value) {
                return;
            }

            const password = adminPassword.value || '';
            if (!password) {
                adminAuthMessage.value = 'Enter admin password.';
                return;
            }

            try {
                isAdminAuthenticating.value = true;
                adminAuthMessage.value = 'Unlocking admin settings...';

                const response = await fetch('/api/admin/login', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ password })
                });

                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(payload?.error || `Unlock failed: ${response.statusText}`);
                }

                adminPassword.value = '';
                adminAuthMessage.value = '';
                isAdminAuthenticated.value = true;
            } catch (error) {
                console.error('Error unlocking admin settings:', error);
                isAdminAuthenticated.value = false;
                adminAuthMessage.value = `Unlock failed: ${error.message}`;
            } finally {
                isAdminAuthenticating.value = false;
            }
        }

        async function logoutAdmin() {
            try {
                await fetch('/api/admin/logout', {
                    method: 'POST',
                    credentials: 'same-origin'
                });
            } catch (error) {
                console.error('Error locking admin settings:', error);
            } finally {
                isAdminAuthenticated.value = false;
                adminPassword.value = '';
                adminAuthMessage.value = '';
                backupStatusMessage.value = '';
                importStatusMessage.value = '';
            }
        }

        async function sendDailyEmail() {
            if (isSendingEmail.value) {
                return;
            }

            try {
                isSendingEmail.value = true;
                const response = await fetch('/send-daily-email', {
                    credentials: 'same-origin'
                });
                if (!response.ok) {
                    throw new Error(`Failed to send daily email: ${response.statusText}`);
                }
                pushToast('Daily email sent successfully!', 'success');
            } catch (error) {
                console.error('Error sending daily email:', error);
                pushToast(`Failed to send daily email: ${error.message}`, 'error');
            } finally {
                isSendingEmail.value = false;
            }
        }

        async function sendTestOfflineAlert() {
            if (isSendingOfflineTestEmail.value) {
                return;
            }

            try {
                isSendingOfflineTestEmail.value = true;
                const response = await fetch('/test-offline-alert?workerId=test-rig&minutes=15', {
                    credentials: 'same-origin'
                });
                if (!response.ok) {
                    throw new Error(`Failed to send test offline alert: ${response.statusText}`);
                }
                pushToast('Test offline alert sent successfully!', 'success');
            } catch (error) {
                console.error('Error sending test offline alert:', error);
                pushToast(`Failed to send test offline alert: ${error.message}`, 'error');
            } finally {
                isSendingOfflineTestEmail.value = false;
            }
        }

        async function manualUpdate() {
            if (isManualUpdating.value) {
                return;
            }

            try {
                isManualUpdating.value = true;
                await updateDashboard();
                pushToast('Dashboard data updated successfully!', 'success');
            } catch (error) {
                console.error('Error updating dashboard:', error);
                pushToast(`Failed to update dashboard: ${error.message}`, 'error');
            } finally {
                isManualUpdating.value = false;
            }
        }

        function parseFilenameFromContentDisposition(headerValue, fallbackName) {
            if (!headerValue) {
                return fallbackName;
            }

            const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
            if (utf8Match && utf8Match[1]) {
                try {
                    return decodeURIComponent(utf8Match[1]);
                } catch {
                    return utf8Match[1];
                }
            }

            const plainMatch = headerValue.match(/filename=\"?([^\";]+)\"?/i);
            if (plainMatch && plainMatch[1]) {
                return plainMatch[1];
            }

            return fallbackName;
        }

        async function downloadHistoryExportFile(downloadUrl, fallbackName) {
            const response = await fetch(downloadUrl, {
                credentials: 'same-origin'
            });
            if (!response.ok) {
                throw new Error(`Download failed: ${response.statusText}`);
            }

            const blob = await response.blob();
            const disposition = response.headers.get('content-disposition');
            const filename = parseFilenameFromContentDisposition(disposition, fallbackName);
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(objectUrl);
        }

        function buildExportSummary(payload) {
            const xmr = payload?.xmr || {};
            const hashrate = payload?.hashrate || {};
            return [
                'Export complete.',
                `XMR: ${xmr.count || 0} records saved to ${xmr.filePath || 'N/A'}`,
                `Hashrate: ${hashrate.count || 0} records saved to ${hashrate.filePath || 'N/A'}`,
                'Both files were downloaded to your browser.'
            ].join('\n');
        }

        async function exportHistoryFiles() {
            if (isExportingHistory.value) {
                return;
            }

            try {
                isExportingHistory.value = true;
                backupStatusMessage.value = 'Exporting history backup...';

                const response = await fetch('/api/export-history', {
                    method: 'POST',
                    credentials: 'same-origin'
                });

                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(payload?.error || `Export failed: ${response.statusText}`);
                }

                await downloadHistoryExportFile(
                    payload?.xmr?.downloadUrl || '/api/export-history/xmr/download',
                    'xmr_history.json'
                );
                await downloadHistoryExportFile(
                    payload?.hashrate?.downloadUrl || '/api/export-history/hashrate/download',
                    'hashrate_history.json'
                );

                backupStatusMessage.value = buildExportSummary(payload);
                pushToast('History backup exported.', 'success');
            } catch (error) {
                console.error('Error exporting history files:', error);
                backupStatusMessage.value = `Export failed: ${error.message}`;
                pushToast(`Export failed: ${error.message}`, 'error');
            } finally {
                isExportingHistory.value = false;
            }
        }

        function handleHistoryFileChange(event, type) {
            const file = event?.target?.files?.[0] || null;
            importStatusMessage.value = '';

            if (type === 'xmr') {
                xmrHistoryFile.value = file;
            } else {
                hashrateHistoryFile.value = file;
            }
        }

        function buildImportSummary(payload) {
            const xmr = payload?.xmr || {};
            const hashrate = payload?.hashrate || {};
            return [
                'Import complete.',
                `XMR: inserted ${xmr.inserted || 0}, existing ${xmr.skippedExisting || 0}, invalid ${xmr.invalid || 0}`,
                `Hashrate: inserted ${hashrate.inserted || 0}, existing ${hashrate.skippedExisting || 0}, invalid ${hashrate.invalid || 0}`
            ].join('\n');
        }

        function clearSelectedImportFiles() {
            xmrHistoryFile.value = null;
            hashrateHistoryFile.value = null;
            if (xmrHistoryInput.value) {
                xmrHistoryInput.value.value = '';
            }
            if (hashrateHistoryInput.value) {
                hashrateHistoryInput.value.value = '';
            }
        }

        async function importHistoryFiles() {
            if (isImportingHistory.value || (!xmrHistoryFile.value && !hashrateHistoryFile.value)) {
                return;
            }

            try {
                isImportingHistory.value = true;
                importStatusMessage.value = 'Importing history files...';

                const formData = new FormData();
                if (xmrHistoryFile.value) {
                    formData.append('xmrHistoryFile', xmrHistoryFile.value);
                }
                if (hashrateHistoryFile.value) {
                    formData.append('hashrateHistoryFile', hashrateHistoryFile.value);
                }

                const response = await fetch('/api/import-history', {
                    method: 'POST',
                    credentials: 'same-origin',
                    body: formData
                });

                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(payload?.error || `Import failed: ${response.statusText}`);
                }

                const summary = buildImportSummary(payload);
                importStatusMessage.value = summary;
                clearSelectedImportFiles();
                pushToast('History import complete.', 'success');

                await updateHistoryCharts({ showLoader: true, cancelPrevious: true });
            } catch (error) {
                console.error('Error importing history files:', error);
                importStatusMessage.value = `Import failed: ${error.message}`;
                pushToast(`Import failed: ${error.message}`, 'error');
            } finally {
                isImportingHistory.value = false;
            }
        }

        onMounted(async () => {
            initializeCharts();
            await Promise.all([
                checkAdminSession(),
                updateDashboard()
            ]);

            statsUpdateInterval = setInterval(updateLiveStats, 5000);
            updateInterval = setInterval(() => {
                updateHistoryCharts({ showLoader: false, cancelPrevious: true }).catch((error) => {
                    console.error('Error refreshing charts:', error);
                });
            }, 30000);

            updateClock();
            clockInterval = setInterval(updateClock, 1000);
        });

        onUnmounted(() => {
            if (statsUpdateInterval) {
                clearInterval(statsUpdateInterval);
            }
            if (updateInterval) {
                clearInterval(updateInterval);
            }
            if (clockInterval) {
                clearInterval(clockInterval);
            }
            if (hashrateHistoryAbortController) {
                hashrateHistoryAbortController.abort();
            }
            if (xmrUsdHistoryAbortController) {
                xmrUsdHistoryAbortController.abort();
            }
            if (hashrateChart) {
                hashrateChart.destroy();
            }
            if (xmrUsdChart) {
                xmrUsdChart.destroy();
            }
        });

        return {
            stats,
            currentTime,
            currentPeriod,
            periodOptions,
            workersLoading,
            activeWorkers,
            workerCounts,
            isLive,
            isInitialStatsLoading,
            chartsLoading,
            flash,
            toasts,
            dismissToast,
            toastIcon,
            isAdminExpanded,
            isAdminAuthEnabled,
            isAdminAuthenticated,
            isAdminAuthenticating,
            adminPassword,
            adminAuthMessage,
            isSendingEmail,
            isSendingOfflineTestEmail,
            isManualUpdating,
            isExportingHistory,
            isImportingHistory,
            backupStatusMessage,
            importStatusMessage,
            xmrHistoryFile,
            hashrateHistoryFile,
            xmrHistoryInput,
            hashrateHistoryInput,
            hashrateCanvas,
            xmrUsdCanvas,
            isHashrateZoomed,
            isXmrUsdZoomed,
            resetHashrateZoom,
            resetXmrUsdZoom,
            setPeriod,
            loginAdmin,
            logoutAdmin,
            sendDailyEmail,
            sendTestOfflineAlert,
            manualUpdate,
            exportHistoryFiles,
            handleHistoryFileChange,
            importHistoryFiles,
            formatLastShare
        };
    }
}).mount('#app');
