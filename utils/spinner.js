import * as hmUI from '@zos/ui'

const SPIN_INTERVAL = 60;
const ARC_SPAN = 90;

/**
 * Creates a spinner widget.
 * @param {number} cx - The x-coordinate of the spinner's center.
 * @param {number} cy - The y-coordinate of the spinner's center.
 * @param {number} radius - The radius of the spinner.
 * @param {number} lineWidth - The width of the spinner's arc.
 * @param {number} color - The color of the spinner's arc.
 * @returns {{ stop: () => void }} An object with a `stop` method to stop the spinner.
 */
export function createSpinner(cx, cy, radius, lineWidth, color) {
  const size = (radius + lineWidth) * 2;
  const x = cx - radius - lineWidth;
  const y = cy - radius - lineWidth;

  const arc = hmUI.createWidget(hmUI.widget.ARC, {
    x,
    y,
    w: size,
    h: size,
    start_angle: -90,
    end_angle: -90 + ARC_SPAN,
    line_width: lineWidth,
    color,
  });

  let angle = -90
  const timer = setInterval(() => {
    angle = (angle + 15) % 360
    arc.setProperty(hmUI.prop.START_ANGLE, angle)
    arc.setProperty(hmUI.prop.END_ANGLE, angle + ARC_SPAN)
  }, SPIN_INTERVAL);

  return {
    stop() {
      clearInterval(timer);
      hmUI.deleteWidget(arc);
    },
  }
}
