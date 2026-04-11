import * as hmUI from '@zos/ui'

const SPIN_INTERVAL = 60
const ARC_SPAN = 90

export function createSpinner(cx, cy, radius, lineWidth, color) {
  const size = (radius + lineWidth) * 2
  const x = cx - radius - lineWidth
  const y = cy - radius - lineWidth

  const arc = hmUI.createWidget(hmUI.widget.ARC, {
    x,
    y,
    w: size,
    h: size,
    start_angle: -90,
    end_angle: -90 + ARC_SPAN,
    line_width: lineWidth,
    color,
  })

  let angle = -90
  const timer = setInterval(() => {
    angle = (angle + 15) % 360
    arc.setProperty(hmUI.prop.MORE, {
      start_angle: angle,
      end_angle: angle + ARC_SPAN,
    })
  }, SPIN_INTERVAL)

  return {
    stop() {
      clearInterval(timer)
      hmUI.deleteWidget(arc)
    },
  }
}
