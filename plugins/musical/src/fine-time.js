/*\
title: $:/plugins/huwiki/musical/fine-time.js
type: application/javascript
module-type: library
\*/
"use strict";
function nudge(seconds, direction, fine) {
 return (Math.round(seconds * 100) + direction * (fine ? 1 : 10)) / 100;
}
exports.nudge = nudge;
exports.mount = function(dial, clock, options) {
 const win = dial.ownerDocument.defaultView;
 let drag = null, frame = null;
 function flush() {
  frame = null;
  if (!drag) return;
  const time = Math.round(drag.time * 100) / 100;
  if (time !== drag.last) {
   drag.last = time;
   options.seek(time);
  }
 }
 function angle(x, y) {
  const dx = x - drag.cx, dy = y - drag.cy;
  return Math.hypot(dx, dy) < 5 ? null : Math.atan2(dy, dx);
 }
 function update(event) {
  const distance = Math.abs(event.clientX - drag.startX);
  let delta = 0;
  if (drag.rotating && Math.abs(event.clientX - drag.cx) > drag.radius + 6) {
   // Leaving the rim sideways switches to a vertical drag at the current time.
   drag.rotating = false;
  } else if (drag.rotating) {
   const next = angle(event.clientX, event.clientY);
   if (next !== null && drag.angle !== null) {
    const turn = next - drag.angle;
    delta = Math.atan2(Math.sin(turn), Math.cos(turn)) / (2 * Math.PI);
   }
   drag.angle = next;
  } else {
   // Only vertical travel changes time. Sideways travel selects sensitivity.
   const gain = .02 / (1 + Math.min(distance, 228) / 12);
   delta = (drag.y - event.clientY) * gain;
  }
  drag.time = Math.min(options.duration(), Math.max(0, drag.time + delta));
  drag.y = event.clientY;
 }
 function begin(surface, event) {
  if (drag || event.button !== 0) return;
  event.preventDefault();
  options.pause();
  const time = options.position();
  drag = {id:event.pointerId, startX:event.clientX, y:event.clientY, time, last:Math.round(time * 100) / 100,
   rotating:surface === dial};
  if (drag.rotating) {
   const bounds = dial.getBoundingClientRect();
   drag.cx = bounds.left + bounds.width / 2;
   drag.cy = bounds.top + bounds.height / 2;
   drag.radius = bounds.width / 2;
   drag.angle = angle(event.clientX, event.clientY);
  }
  dial.focus();
  surface.setPointerCapture(event.pointerId);
 }
 function move(event) {
  if (!drag || event.pointerId !== drag.id) return;
  update(event);
  if (frame === null) frame = win.requestAnimationFrame(flush);
 }
 function finish(event) {
  if (!drag || event.pointerId !== drag.id) return;
  if (frame !== null) win.cancelAnimationFrame(frame);
  if (event.type === "pointerup") update(event);
  flush();
  drag = null;
 }
 [dial, clock].forEach(function(surface) {
  surface.onpointerdown = function(event) { begin(surface, event); };
  surface.onpointermove = move;
  surface.onpointerup = surface.onpointercancel = surface.onlostpointercapture = finish;
 });
 dial.onkeydown = function(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const steps = {ArrowLeft:-1, ArrowDown:-1, ArrowRight:1, ArrowUp:1};
  if (!Object.hasOwn(steps,event.key) && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  event.stopPropagation();
  options.pause();
  if (event.key === "Home") options.seek(0);
  else if (event.key === "End") options.seek(options.duration());
  else options.seek(nudge(options.position(), steps[event.key], event.shiftKey));
 };
 return function() {
  if (frame !== null) win.cancelAnimationFrame(frame);
  drag = null;
  [dial, clock].forEach(function(surface) {
   surface.onpointerdown = surface.onpointermove = surface.onpointerup = surface.onpointercancel = surface.onlostpointercapture = null;
  });
  dial.onkeydown = null;
 };
};
