// "Expenses by category" doughnut chart, drawn with Chart.js (js/vendor/chart.umd.min.js, MIT).
// The library ships with the app (no CDN), so it works offline and nothing is fetched
// from anywhere else. It's only loaded once there is something to draw.

import { money } from './format.js';

const SRC = 'js/vendor/chart.umd.min.js';
let loading = null;
let chart = null;

function loadChartJs() {
    if (window.Chart) return Promise.resolve(window.Chart);
    loading ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SRC;
        script.onload = () => (window.Chart ? resolve(window.Chart) : reject(new Error('Chart.js did not load')));
        script.onerror = () => {
            loading = null; // allow a retry next time
            reject(new Error('Chart.js could not be loaded'));
        };
        document.head.append(script);
    });
    return loading;
}

/** 'var(--chart-1)' -> the colour it means in the current theme (canvas can't read CSS variables). */
function resolveColor(value) {
    const m = /^var\((--[\w-]+)\)$/.exec(value);
    return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : value;
}

function themeColors(slices) {
    const css = getComputedStyle(document.documentElement);
    return {
        fills: slices.map((s) => resolveColor(s.color)),
        border: css.getPropertyValue('--surface').trim() || '#fff',
        text: css.getPropertyValue('--dark-blue').trim(),
    };
}

/**
 * Draw (or redraw) the pie in `canvas`.
 * slices: [{ label, amount (paise), color ('var(--chart-n)' or a colour) }]
 * If Chart.js can't load, the canvas is hidden and the list below it still shows everything.
 */
export async function drawCategoryPie(canvas, slices) {
    chart?.destroy();
    chart = null;
    if (!canvas || !slices.length) return;
    let Chart;
    try {
        Chart = await loadChartJs();
    } catch {
        canvas.closest('.pie-wrap')?.setAttribute('hidden', '');
        return;
    }
    if (!canvas.isConnected) return; // the page changed while loading
    chart?.destroy(); // another draw may have started meanwhile

    const total = slices.reduce((n, s) => n + s.amount, 0);
    const colors = themeColors(slices);
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; // Barlow digits, Manrope text
    chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: slices.map((s) => s.label),
            datasets: [{
                data: slices.map((s) => s.amount / 100),
                backgroundColor: colors.fills,
                borderColor: colors.border,
                borderWidth: 2,
                hoverOffset: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '64%', // room for the month's total in the middle (HTML over the canvas)
            animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 500 },
            plugins: {
                legend: { display: false }, // the list under the chart is the legend (with exact amounts)
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const paise = slices[ctx.dataIndex].amount;
                            const pct = (paise / total) * 100;
                            return ` ${money(paise)} (${pct < 1 ? '<1' : Math.round(pct)}%)`;
                        },
                    },
                },
            },
        },
    });
    chart.$sliceColors = slices.map((s) => s.color); // kept as CSS names so a theme switch can re-resolve them
}

// Follow light/dark switches without redrawing the whole page.
new MutationObserver(() => {
    if (!chart?.canvas?.isConnected || !chart.$sliceColors) return;
    const ds = chart.data.datasets[0];
    const colors = themeColors(chart.$sliceColors.map((color) => ({ color })));
    ds.backgroundColor = colors.fills;
    ds.borderColor = colors.border;
    chart.update('none');
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
