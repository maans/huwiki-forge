/*\
title: $:/plugins/huwiki/abc/reserve-mixer.js
type: application/javascript
module-type: library
\*/
(function () {
'use strict';
var Accompaniment = require('$:/plugins/huwiki/abc/accompaniment.js');
var Sequence = require('$:/plugins/huwiki/abc/audio-sequence.js');
var Runtime = require('$:/plugins/huwiki/abc/reserve-runtime.js');
var TinyRenderer = require('$:/plugins/huwiki/abc/tinysynth-renderer.js');
var originalLibraries = new WeakMap(), previews = new Set();
var DEFAULT_FONT = 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/';

function abortError() { var e = new Error('Lydforberedelsen blev afbrudt.'); e.name = 'AbortError'; e.code = 'cancelled'; return e; }
function timedError() { var e = new Error('Det oprindelige samplebibliotek svarede ikke i tide.'); e.code = 'original-timeout'; return e; }
function rejectIfCancelled(check) { if (check()) throw abortError(); }
function waitFor(promise, check, milliseconds, timeoutFactory) {
  return new Promise(function (resolve, reject) {
    var done = false, timer, poll;
    function finish(error, result) { if (done) return; done = true; clearTimeout(timer); clearInterval(poll); error ? reject(error) : resolve(result); }
    timer = setTimeout(function () { finish((timeoutFactory || timedError)()); }, Math.max(1, milliseconds));
    poll = setInterval(function () { if (check()) finish(abortError()); }, 35);
    Promise.resolve(promise).then(function (v) { try { rejectIfCancelled(check); finish(null, v); } catch (e) { finish(e); } }, function (e) { finish(e); });
    if (check()) finish(abortError());
  });
}
function timeout(value, fallback) { value = Number(value); return Number.isFinite(value) && value >= 50 ? value : fallback; }
function mainContext(ABC) { var c = ABC.synth.activeAudioContext(); if (!c) throw new Error('Lydkonteksten er ikke klar. Tryk på Afspil.'); return c; }
function freshOriginal(ABC, options) {
  var record = originalLibraries.get(ABC);
  if (!record) { record = { current: ABC, failed: false }; originalLibraries.set(ABC, record); }
  if (record.failed) {
    var make = options.createOriginalABC || ABC.huwikiCreateAudioLibrary;
    if (!make) {
      try { make = require('$:/plugins/huwiki/abc/loader.js').createAudioLibrary; } catch (_) {}
    }
    if (make) { record.current = make(); record.failed = false; }
  }
  var context = mainContext(ABC);
  record.current.synth.registerAudioContext(context);
  return record.current;
}
function markFailed(ABC, usedABC) { var record = originalLibraries.get(ABC); if (record && record.current === usedABC) record.failed = true; }
function cloneSequence(sequence) {
  var copy = Object.assign({}, sequence);
  copy.tracks = sequence.tracks.map(function (track) { var t = track.map(function (e) { return Object.assign({}, e); }); if (track.huwabcPart) t.huwabcPart = track.huwabcPart; if (track.huwabcVoice !== undefined) t.huwabcVoice = track.huwabcVoice; return t; });
  return copy;
}
function capture(params) {
  var v = params.visualObj, o = params.options || {};
  var sequence = v ? v.setUpAudio(o) : params.sequence;
  if (!sequence || !Array.isArray(sequence.tracks)) throw new Error('Musiksekvensen mangler.');
  var meter = v ? v.getMeterFraction() : { num: 1, den: 1 };
  var meterSize = meter.den ? meter.num / meter.den : 1;
  var ms = params.millisecondsPerMeasure || (v ? v.millisecondsPerMeasure(sequence.tempo) : 1000);
  if (!(ms > 0) || !(meterSize > 0) || !Number.isFinite(sequence.totalDuration)) throw new Error('Musikkens tempo eller længde er ugyldig.');
  var captured = cloneSequence(sequence), initParams = Object.assign({}, params);
  if (v) {
    // Prepare MIDI timing on the real visual object once, then give both
    // engines the same immutable musical events. No source is rewritten.
    var proxy = Object.create(v); proxy.setUpAudio = function () { return cloneSequence(captured); };
    initParams.visualObj = proxy;
  } else initParams.sequence = cloneSequence(captured);
  return { sequence: captured, initParams: initParams, ms: ms, meterSize: meterSize, beats: v ? v.getBeatsPerMeasure() : 4, visualObj: v, secondsPerWhole: ms / 1000 / meterSize };
}
function groupedNotes(meta) { return Sequence.notesFromSequence(meta.sequence, meta.secondsPerWhole); }
async function validateOriginal(buffer, meta, cancelled) {
  var notes = groupedNotes(meta), parts = ['melodyVolume'];
  meta.sequence.tracks.forEach(function (t) { var k = t.huwabcVoice !== undefined ? 'voice:' + t.huwabcVoice : (t.huwabcPart || 'melodyVolume'); if (parts.indexOf(k) < 0) parts.push(k); });
  var required = new Set(notes.map(function (n) { return n.part; }));
  if (!notes.length) return;
  if (!buffer.audioBuffers || buffer.audioBuffers.length !== parts.length) throw new Error('Det oprindelige samplebibliotek leverede ikke alle stemmer.');
  for (var b = 0; b < buffer.audioBuffers.length; b++) {
    var audio = buffer.audioBuffers[b], nonzero = false;
    if (!audio || !audio.length) throw new Error('En lydstemme kunne ikke dannes.');
    for (var c = 0; c < audio.numberOfChannels; c++) {
      var data = audio.getChannelData(c);
      for (var i = 0; i < data.length; i++) {
        if (!Number.isFinite(data[i])) throw new Error('Det oprindelige samplebibliotek gav ugyldige lyddata.');
        if (Math.abs(data[i]) > 1e-9) nonzero = true;
        if ((i & 262143) === 0) { rejectIfCancelled(cancelled); await new Promise(function (resolve) { setTimeout(resolve, 0); }); }
      }
    }
    if (required.has(parts[b]) && !nonzero) throw new Error('Det oprindelige samplebibliotek gav tavs lyd i en nødvendig stemme.');
  }
}
function createFluidBuffer(ABC, getConfig, meta, buffers, headroom, cancelled) {
  var synth = new ABC.synth.CreateSynth(), gains = [], keys = Object.keys(buffers);
  var ctx = mainContext(ABC), room, rawStop = synth.stop, rawStart = synth.start, rawSeek = synth.seek;
  synth.audioBufferPossible = true; synth.flattened = meta.sequence;
  synth.millisecondsPerMeasure = meta.ms; synth.meterSize = meta.meterSize; synth.beatsPerMeasure = meta.beats;
  synth.fadeLength = 2000; synth.duration = meta.sequence.totalDuration * meta.secondsPerWhole + 2;
  synth.audioBuffers = keys.map(function (k) { return buffers[k]; });
  function level(key) { return Accompaniment.channelGain(key, getConfig()) * headroom; }
  synth.setVolumes = function () { if (room) room.update(gains, getConfig().reverb / 100); gains.forEach(function (g, i) { g.gain.setTargetAtTime(level(keys[i]), ctx.currentTime, .015); }); };
  synth.disposeMixer = function () { if (room) {room.dispose(); room = null;} gains.forEach(function (g) { try { g.disconnect(); } catch (_) {} }); gains = []; };
  synth._kickOffSound = function (seconds) {
    rejectIfCancelled(cancelled);
    rawStop.call(synth); synth.disposeMixer(); synth.isRunning = true;
    var at = ctx.currentTime, offset = Math.min(Math.max(0, seconds || 0), Math.max(0, synth.duration - 1 / ctx.sampleRate));
    synth.directSource = synth.audioBuffers.map(function (buffer, i) {
      var gain = ctx.createGain(), source = ctx.createBufferSource();
      gain.gain.value = level(keys[i]); gain.connect(ctx.destination); gains.push(gain);
      source.buffer = buffer; source.connect(gain); source.start(at, offset); return source;
    });
    room = Accompaniment.createRoom(ctx); room.update(gains, getConfig().reverb / 100);
    if (synth.onEnded && synth.directSource[0]) synth.directSource[0].onended = function () { synth.onEnded(synth.callbackContext); };
  };
  synth.start = function () { rejectIfCancelled(cancelled); return rawStart.call(synth); };
  synth.seek = function (position, units) {
    var wasRunning = synth.isRunning;
    var result = rawSeek.call(synth, position, units);
    // Keep subsequent pause/resume relative to the new seek position.
    if (wasRunning) synth.startTimeSec = ctx.currentTime - (synth.pausedTimeSec || 0);
    return result;
  };
  synth.stop = function () { var n = rawStop.call(synth); synth.disposeMixer(); return n; };
  synth._huwikiParts = keys; synth._huwikiHeadroom = headroom;
  return synth;
}

function createMixer(ABC, getConfig, options) {
  options = options || {}; getConfig = getConfig || function () { return {}; };
  var generation = 0, forced = false, inner = null, originalABC = null, meta = null, initPromise = null;
  var job = null, state = { engine: 'original', phase: 'idle', reason: null, local: false, details: null };
  var runtime = options.runtime || Runtime, lastParams = null;
  function status(change) {
    state = Object.assign({}, state, change);
    if (typeof options.onStatus === 'function' && !(options.isCancelled && options.isCancelled())) options.onStatus(Object.assign({}, state));
  }
  function mode() {
    if (forced || (typeof options.forceReserve === 'function' ? options.forceReserve() : options.forceReserve === true)) return 'fluid';
    var value = typeof options.engineMode === 'function' ? options.engineMode() : options.engineMode;
    if(!value && options.wiki && options.wiki.getTiddlerText)value=options.wiki.getTiddlerText('$:/config/huwiki/abc/audio-engine-mode','auto');
    return ['auto','original','fluid','tiny'].indexOf(value) >= 0 ? value : 'auto';
  }
  function offline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
  function mayAutoTiny(current) { return current.mode === 'auto' && current.offline; }
  function stopInner() { if (inner) { try { inner.stop(); } catch (_) {} if (inner.disposeMixer) inner.disposeMixer(); } }
  function isCancelled(token) { return token !== generation || !!(options.isCancelled && options.isCancelled()); }
  function setupJob() {
    var token = ++generation;
    return { token: token, cancelled: function () { return isCancelled(token); }, deadline: Date.now() + (offline() ? timeout(options.offlineOriginalTimeoutMs, 4000) : timeout(options.originalTimeoutMs, 15000)), error: null, selectedFluid: false, selectedTiny: false, mode: mode(), offline: offline() };
  }
  async function selectFluid(current, reason) {
    rejectIfCancelled(current.cancelled); current.selectedFluid = true;
    stopInner(); inner = null;
    status({ engine: 'fluid', phase: 'loading', reason: reason, details: current.error ? String(current.error.message || current.error) : null });
    return { cached: [], loaded: [], error: [], reserve: true, reason: reason };
  }
  async function selectTiny(current, reason) {
    rejectIfCancelled(current.cancelled); current.selectedTiny=true;
    stopInner(); inner=null;
    status({engine:'tiny',phase:'loading',reason:reason,details:current.error?String(current.error.message||current.error):null,local:true});
    return {cached:[],loaded:[],error:[],reserve:true,reason:reason};
  }
  function begin(params) {
    stopInner(); lastParams=params; job=setupJob(); var current=job;
    meta=capture(params);current.meta=meta;current.params=params;
    var requested=current.mode;
    status({engine:requested==='auto'?'original':requested,mode:requested,phase:'loading',reason:requested==='auto'?null:'manual',details:null,stats:null,resourceInfo:null,pcmBytes:null,progress:0});
    if (requested==='fluid') return selectFluid(current,'manual');
    if (requested==='tiny') return selectTiny(current,'manual');
    // Try the original samples even when offline: cached soundfonts may work.
    // Online sample errors retain the existing FluidSynth fallback; TinySynth is
    // automatic only with positive offline evidence (navigator.onLine === false).
    originalABC=freshOriginal(ABC,options);
    var usedABC=originalABC,candidate=Accompaniment.createMixer(usedABC,getConfig);inner=candidate;
    var args=Object.assign({},meta.initParams),debug=args.debugCallback;
    args.options=Object.assign({},args.options||{});
    if(!args.options.soundFontUrl)args.options.soundFontUrl=options.wiki&&options.wiki.getTiddlerText?options.wiki.getTiddlerText('$:/config/huwiki/abc/soundfont',DEFAULT_FONT).trim():DEFAULT_FONT;
    args.audioContext=mainContext(ABC);
    args.debugCallback=function(message){if(debug)debug(message);if(/^loadBatch catch /.test(String(message)))current.error=new Error(String(message).replace(/^loadBatch catch /,''));};
    return waitFor(candidate.init(args),current.cancelled,Math.max(1,current.deadline-Date.now())).then(function(result){
      if(current.error||result&&result.error&&result.error.length)throw current.error||new Error('Nødvendige samples kunne ikke indlæses: '+result.error.slice(0,3).join(', '));
      return result;
    }).catch(function(e){
      if(e.name==='AbortError'||current.cancelled())throw abortError();
      current.error=e;markFailed(ABC,usedABC);
      if(requested==='original')throw e;
      return selectFluid(current,'sample-error');
    });
  }
  async function primeFluid(current) {
    rejectIfCancelled(current.cancelled);
    var currentMeta = current.meta;
    var ctx = mainContext(ABC), notes = groupedNotes(currentMeta), duration = currentMeta.sequence.totalDuration * currentMeta.secondsPerWhole + 2;
    var parts = new Set(notes.map(function (n) { return n.part; }));
    var estimate = Math.ceil(duration * ctx.sampleRate) * 2 * 4 * Math.max(1, parts.size);
    var limit = Number(options.maxPcmBytes) || 256 * 1024 * 1024;
    if (estimate > limit) { var tooLarge = new Error('Reservelyden kræver for meget hukommelse i denne testversion (' + Math.ceil(estimate / 1048576) + ' MiB lyddata). Brug et kortere nodeark eller et højere øvetempo.'); tooLarge.code = 'reserve-memory-limit'; throw tooLarge; }
    var buffers, renderer, bound = 0;
    if (notes.length) {
      renderer = await waitFor(runtime.getRenderer(ctx, Object.assign({}, options, { cancelled: current.cancelled })), current.cancelled, timeout(options.reserveTimeoutMs, 60000), function () { var e = new Error('Reservelyden kunne ikke indlæses i tide.'); e.code = 'reserve-timeout'; return e; });
      rejectIfCancelled(current.cancelled);
      buffers = await renderer.render(notes, duration, ctx, { cancelled: current.cancelled, onProgress: function (value) { if (!current.cancelled()) status({ progress: value.fraction }); } });
      (renderer.stats.parts || []).forEach(function (p) { bound += p.peak; });
    } else { buffers = { melodyVolume: ctx.createBuffer(2, Math.max(1, Math.ceil(duration * ctx.sampleRate)), ctx.sampleRate) }; }
    rejectIfCancelled(current.cancelled);
    inner = createFluidBuffer(ABC, getConfig, currentMeta, buffers, bound > .9 ? .9 / bound : 1, function () { return !!(options.isCancelled && options.isCancelled()); });
    // Native loop and Stop/restart reuse the PCM. Cancellation only cancels
    // preparation; new start calls are guarded through the outer mixer below.
    inner.onEnded = current.params.options && current.params.options.onEnded;
    inner.callbackContext = current.params.options && current.params.options.callbackContext;
    var info = runtime.info ? runtime.info() : { local: true };
    status({ engine: 'fluid', phase: 'ready', local: info.local, progress: 1, resourceInfo: info, pcmBytes: estimate, stats: renderer ? JSON.parse(JSON.stringify(renderer.stats)) : null });
    return { status: ctx.state, duration: inner.duration, reserve: true };
  }
  async function primeTiny(current) {
    rejectIfCancelled(current.cancelled);
    var currentMeta=current.meta,ctx=mainContext(ABC),notes=groupedNotes(currentMeta);
    var duration=currentMeta.sequence.totalDuration*currentMeta.secondsPerWhole+2;
    // TinySynth is an emergency fallback, not a high-resolution sample bank.
    // Use 24 kHz PCM to halve memory/time versus 48 kHz iPad audio.
    var renderRate=Math.min(24000,ctx.sampleRate);
    var parts=new Set(notes.map(function(n){return n.part;}));
    var estimate=Math.ceil(duration*renderRate)*2*4*Math.max(1,parts.size);
    var limit=Number(options.maxPcmBytes)||256*1024*1024;
    if(estimate>limit){var tooLarge=new Error('TinySynth kræver for meget hukommelse ('+Math.ceil(estimate/1048576)+' MiB). Prøv et kortere nodeark.');tooLarge.code='tiny-memory-limit';throw tooLarge;}
    var peaks=Object.create(null);
    var buffers=await waitFor(TinyRenderer.render(notes,duration,{sampleRate:renderRate},{
      cancelled:current.cancelled,onProgress:function(progress){
        if(!current.cancelled()){peaks[progress.part]=progress.peak;status({progress:progress.fraction});}
      }
    }),current.cancelled,timeout(options.tinyTimeoutMs,90000),function(){var e=new Error('TinySynth kunne ikke klargøre lydsporet i tide.');e.code='tiny-timeout';return e;});
    rejectIfCancelled(current.cancelled);
    var bound=Object.values(peaks).reduce(function(total,value){return total+value;},0);
    inner=createFluidBuffer(ABC,getConfig,currentMeta,buffers,bound>.9?.9/bound:1,function(){return !!(options.isCancelled&&options.isCancelled());});
    inner.onEnded=current.params.options&&current.params.options.onEnded;
    inner.callbackContext=current.params.options&&current.params.options.callbackContext;
    status({engine:'tiny',phase:'ready',local:true,progress:1,resourceInfo:TinyRenderer.info(),pcmBytes:estimate,details:null});
    return {status:ctx.state,duration:inner.duration,reserve:true};
  }
  var api = {};
  api.init = function (params) {
    try { initPromise=Promise.resolve(begin(params)); } catch(e){initPromise=Promise.reject(e);}
    return initPromise;
  };
  api.prime = async function () {
    if(!job||!initPromise)throw new Error('Afspilleren er ikke forberedt.');
    var current=job;
    try {
      await initPromise;rejectIfCancelled(current.cancelled);
      if(!current.selectedFluid&&!current.selectedTiny){
        var candidate=inner,usedABC=originalABC;
        try {
          var result=await waitFor(candidate.prime(),current.cancelled,Math.max(1,current.deadline-Date.now()));
          await validateOriginal(candidate,current.meta,current.cancelled);rejectIfCancelled(current.cancelled);
          status({engine:'original',phase:'ready',reason:null,local:current.offline,details:null,progress:1});
          return result;
        }catch(e){
          if(e.name==='AbortError'||current.cancelled())throw abortError();
          current.error=e;markFailed(ABC,usedABC);
          if(current.mode==='original')throw e;
          await selectFluid(current,'sample-error');
        }
      }
      if(current.selectedTiny)return await primeTiny(current);
      try {return await primeFluid(current);}
      catch(e){
        if(e.name==='AbortError'||current.cancelled())throw abortError();
        if(!mayAutoTiny(current))throw e;
        current.error=e;
        await selectTiny(current,'offline-fluid-unavailable');
        return await primeTiny(current);
      }
    }catch(e){
      if(e.name!=='AbortError'&&!current.cancelled())status({phase:'error',details:String(e.message||e)});
      throw e;
    }
  };
  api.cancel = function () { ++generation; stopInner(); if (state.phase === 'loading') status({ phase: 'cancelled' }); };
  api.stop = function () { var elapsed; if (inner) elapsed = inner.stop(); if (state.phase === 'loading') api.cancel(); return elapsed; };
  api.disposeMixer = function () { if (state.phase === 'loading') api.cancel(); if (inner && inner.disposeMixer) inner.disposeMixer(); };
  api.release = function () { api.cancel(); if (inner) inner.audioBuffers = []; inner = null; meta = null; initPromise = null; };
  api.start = function () { if (!inner || state.phase !== 'ready' || options.isCancelled && options.isCancelled()) throw abortError(); return inner.start(); };
  api.pause = function () { if (state.phase === 'loading') { api.cancel(); return; } if (inner) return inner.pause(); };
  api.resume = api.start;
  api.seek = function (position, units) { if (inner && state.phase === 'ready') return inner.seek(position, units); };
  api.finished = function () { if (inner) return inner.finished(); };
  api.setVolumes = function () { if (inner && inner.setVolumes) inner.setVolumes(); };
  api.download = function () { if (inner) return inner.download(); };
  api.getAudioBuffer = function () { return inner && inner.getAudioBuffer(); };
  api.getIsRunning = function () { return !!(inner && inner.getIsRunning()); };
  api.getState = function () { return Object.assign({}, state); };
  api.setForceReserve = function(value){forced=!!value;api.cancel();state.phase='idle';return forced;};
  api.retryOriginal = function () { return api.setForceReserve(false); };
  api.audition = function (notes, tune, more) {return audition(ABC,notes,tune,Object.assign({},options,more||{},{getConfig:getConfig,engineMode:mode(),forceReserve:false}));};
  ['duration', 'fadeLength', 'audioBuffers', 'flattened', 'directSource', 'isRunning', 'pausedTimeSec', 'startTimeSec', 'millisecondsPerMeasure', 'beatsPerMeasure'].forEach(function (key) { Object.defineProperty(api, key, { enumerable: true, get: function () { return inner && inner[key]; } }); });
  return api;
}

function normalizePreview(notes) {
  return (notes || []).map(function (n) { return typeof n === 'number' ? { pitch: n } : n; }).filter(function (n) { return n && Number.isFinite(Number(n.pitch)); }).map(function (n) {
    var velocity = Number(n.volume);
    return { pitch: Math.max(0, Math.min(127, Math.round(Number(n.pitch)))), instrument: Math.max(0, Math.min(128, Math.round(Number(n.instrument) || 0))), volume: Math.max(1, Math.min(127, Number.isFinite(velocity) ? velocity : 84)), duration: Math.max(.075, Math.min(.5, Number(n.durationInMeasures || n.duration) || .25)), cents: Number(n.cents) || 0, part: /^(?:voice:\d+|bassVolume|chordVolume|drumVolume|metronomeVolume)$/.test(String(n.huwabcPreviewPart||''))?String(n.huwabcPreviewPart):null };
  });
}
function stopAuditions() { Array.from(previews).forEach(function (preview) { preview.cancel(); preview.release(); }); previews.clear(); }
async function audition(ABC, notes, tune, options) {
  options = options || {}; var pitches = normalizePreview(notes); if (!pitches.length) return false;
  stopAuditions();
  var ctx = mainContext(ABC), ms = tune && tune.millisecondsPerMeasure ? Number(tune.millisecondsPerMeasure()) : 2000;
  if (!Number.isFinite(ms) || ms < 100 || ms > 15000) ms = 2000;
  var tracks = pitches.map(function (p) { var duration = Math.min(p.duration, 1150 / ms),track=[{ cmd: 'program', channel: p.instrument === 128 ? 9 : 0, instrument: p.instrument }, { cmd: 'note', start: 0, duration: duration, pitch: p.pitch, volume: p.volume, instrument: p.instrument, cents: p.cents, gap: 0 }];if(p.part&&p.part.indexOf('voice:')===0)track.huwabcVoice=p.part.slice(6);else if(p.part)track.huwabcPart=p.part;return track; });
  var sequence = { tracks: tracks, totalDuration: Math.max.apply(null, tracks.map(function (t) { return t[1].duration; })), tempo: 120 };
  var mixer = createMixer(ABC, options.getConfig || function () { return { melodyVolume: 100 }; }, options), finished = false, cleanupTimer;
  function done() { if (finished) return; finished = true; clearTimeout(cleanupTimer); previews.delete(mixer); mixer.release(); }
  previews.add(mixer);
  try {
    if (ctx.resume) await ctx.resume();
    if (!previews.has(mixer) || options.isCancelled && options.isCancelled()) throw abortError();
    var font = options.soundFontUrl || (options.wiki && options.wiki.getTiddlerText ? options.wiki.getTiddlerText('$:/config/huwiki/abc/soundfont', DEFAULT_FONT) : DEFAULT_FONT);
    await mixer.init({ sequence: sequence, millisecondsPerMeasure: ms, audioContext: ctx, options: { soundFontUrl: font, onEnded: done } });
    await mixer.prime();
    if (!previews.has(mixer) || options.isCancelled && options.isCancelled()) throw abortError();
    mixer.start(); cleanupTimer = setTimeout(done, ((mixer.duration || 2) + .15) * 1000);
    return true;
  } catch (e) { done(); throw e; }
}
exports.createMixer = createMixer;
exports.audition = audition;
exports.stopAuditions = stopAuditions;
exports.DEFAULT_FONT = DEFAULT_FONT;
})();
