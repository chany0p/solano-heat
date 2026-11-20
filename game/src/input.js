// Keyboard + mouse input. Tracks held keys, edge-triggered presses, and the
// mouse position in screen and world coordinates. The game reads this every
// step; shots and autotests feed it synthetic input instead of the real keys.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.synthetic = null; // when set, {up,down,left,right,sprint,enter,shoot,punch,handbrake,aimX,aimY}
    this._onKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
    };
    this._onMouseUp = (e) => { if (e.button === 0) this.mouseDown = false; };
    this._onBlur = () => { this.keys.clear(); this.mouseDown = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  /** True while the key is held. Accepts several codes (any of them). */
  held(...codes) {
    if (this.synthetic) return codes.some((c) => this.synthetic[c]);
    return codes.some((c) => this.keys.has(c));
  }
  /** True only on the frame the key went down. */
  pressed(...codes) {
    if (this.synthetic) return codes.some((c) => this.synthetic[c] === 'press');
    return codes.some((c) => this.pressedKeys.has(c));
  }
  /** True on the frame the mouse was clicked. */
  clicked() {
    if (this.synthetic) return this.synthetic.click === true;
    return this.mouseClicked;
  }
  /** Aim point in screen pixels (mouse, or the synthetic aim). */
  aimScreen() {
    if (this.synthetic && this.synthetic.aimX !== undefined) return { x: this.synthetic.aimX, y: this.synthetic.aimY };
    return { x: this.mouseX, y: this.mouseY };
  }
  /** Clear the edge-triggered state; called once per frame after the step. */
  endFrame() {
    this.pressedKeys.clear();
    this.mouseClicked = false;
    if (this.synthetic) {
      for (const k of Object.keys(this.synthetic)) if (this.synthetic[k] === 'press') this.synthetic[k] = false;
      this.synthetic.click = false;
    }
  }
  /** Feed scripted input (autopilot / tests) instead of the real keyboard. */
  setSynthetic(s) { this.synthetic = s; }
  clearSynthetic() { this.synthetic = null; }
}
