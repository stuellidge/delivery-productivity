import {
  Chart,
  ScatterController,
  LinearScale,
  TimeScale,
  PointElement,
  Tooltip,
  Legend,
  LineController,
  LineElement,
  CategoryScale,
} from 'chart.js'
import 'chartjs-adapter-luxon'

Chart.register(
  ScatterController,
  LinearScale,
  TimeScale,
  PointElement,
  Tooltip,
  Legend,
  LineController,
  LineElement,
  CategoryScale
)

window.renderCycleTimeChart = function (canvasId, rawData, p85Value) {
  const canvas = document.getElementById(canvasId)
  if (!canvas) return

  const data = JSON.parse(rawData)
  if (data.length === 0) return

  new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Cycle Time (days)',
          data: data.map((d) => ({ x: new Date(d.x).getTime(), y: d.y })),
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          pointRadius: 5,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const item = data[ctx.dataIndex]
              return `${item.ticketId}: ${item.y.toFixed(1)} days`
            },
          },
        },
        annotation: undefined,
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Completion date' },
        },
        y: {
          title: { display: true, text: 'Days' },
          min: 0,
        },
      },
    },
    plugins: [
      {
        id: 'p85Line',
        afterDraw(chart) {
          if (!p85Value) return
          const { ctx, chartArea, scales } = chart
          const y = scales.y.getPixelForValue(p85Value)
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(chartArea.left, y)
          ctx.lineTo(chartArea.right, y)
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'
          ctx.lineWidth = 2
          ctx.setLineDash([6, 3])
          ctx.stroke()
          ctx.fillStyle = 'rgba(239, 68, 68, 0.9)'
          ctx.font = '11px sans-serif'
          ctx.fillText(`p85: ${p85Value.toFixed(1)}d`, chartArea.right - 70, y - 5)
          ctx.restore()
        },
      },
    ],
  })
}

window.renderDoraTrendCharts = function (trendData) {
  if (!trendData || trendData.length === 0) return

  const labels = trendData.map((d) => d.weekStart)
  const dfData = trendData.map((d) => d.deploymentFrequency)
  const cfrData = trendData.map((d) => d.changeFailureRate)
  const ttrData = trendData.map((d) => d.ttrMedian)

  const freqCfrCanvas = document.getElementById('doraFreqCfrChart')
  if (freqCfrCanvas) {
    new Chart(freqCfrCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Deploys/week',
            data: dfData,
            borderColor: 'rgba(59, 130, 246, 0.9)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            yAxisID: 'yLeft',
            tension: 0.2,
            fill: false,
          },
          {
            label: 'CFR %',
            data: cfrData,
            borderColor: 'rgba(239, 68, 68, 0.9)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            yAxisID: 'yRight',
            tension: 0.2,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          yLeft: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Deploys' },
            beginAtZero: true,
          },
          yRight: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'CFR %' },
            beginAtZero: true,
            grid: { drawOnChartArea: false },
          },
        },
      },
    })
  }

  const ttrCanvas = document.getElementById('doraTtrChart')
  if (ttrCanvas) {
    new Chart(ttrCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'TTR median (min)',
            data: ttrData,
            borderColor: 'rgba(234, 88, 12, 0.9)',
            backgroundColor: 'rgba(234, 88, 12, 0.1)',
            tension: 0.2,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { title: { display: true, text: 'Minutes' }, beginAtZero: true },
        },
      },
    })
  }
}
