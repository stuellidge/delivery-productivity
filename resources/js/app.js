import {
  Chart,
  ScatterController,
  LinearScale,
  TimeScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js'
import 'chartjs-adapter-luxon'

Chart.register(ScatterController, LinearScale, TimeScale, PointElement, Tooltip, Legend)

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
