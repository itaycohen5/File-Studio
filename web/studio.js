'use strict';

const $ = (selector) => document.querySelector(selector);
const formats = {
  webp: { mime: 'image/webp', label: 'WebP' },
  jpg: { mime: 'image/jpeg', label: 'JPG' },
  png: { mime: 'image/png', label: 'PNG' },
};
const sampleNames = ['moonrise.png', 'dune-study.png', 'glass-pavilion.png'];
const iconPaths = {
  external: '<path d="M13 4h7v7m0-7-9 9m7 0v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  stack: '<rect x="6" y="6" width="14" height="14" rx="2"/><path d="M4 16H3V4a1 1 0 0 1 1-1h12v1m-7 12 3-3 3 3 2-2 3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5"/>',
  arrows: '<path d="M4 7h15m-4-4 4 4-4 4m5 6H5m4-4-4 4 4 4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
const icon = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + iconPaths[name] + '</svg>';
document.querySelectorAll('[data-icon]').forEach((node) => { node.innerHTML = icon(node.dataset.icon); });

const jobs = [];
let selection;
let previewMode = 'original';
let lastRunSettings = '';
let busy = '';
let hasSamples = false;
let nextId = 0;
const decimalMB = (megabytes) => Math.trunc(megabytes * 1_000_000);
const bytes = (size) => size >= decimalMB(1)
  ? (size / decimalMB(1)).toLocaleString('en', { maximumFractionDigits: 2 }) + ' MB'
  : (size / 1000).toLocaleString('en', { maximumFractionDigits: 1 }) + ' KB';
const formatName = (name) => name.split('.').pop().toUpperCase().replace('JPEG', 'JPG');

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}

// Mount image elements without a network source until a file is selected.
const previewImage = element('img');
previewImage.id = 'preview-image';
const compareOriginal = element('img', 'compare-original');
compareOriginal.id = 'compare-original';
const compareOutput = element('img', 'compare-output');
compareOutput.id = 'compare-output';
$('.proof').prepend(previewImage);
$('#comparison').prepend(compareOriginal, compareOutput);

function action(label, symbol, callback) {
  const button = element('button');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  const glyph = element('span');
  glyph.dataset.icon = symbol;
  glyph.innerHTML = icon(symbol);
  button.append(glyph);
  button.disabled = Boolean(busy);
  button.addEventListener('click', callback);
  return button;
}

function renderRows() {
  const container = $('#queue-rows');
  const scrollPosition = container.scrollTop;
  container.replaceChildren();
  if (!jobs.length) {
    container.append(element('p', 'queue-empty', 'Add images or load the sample batch to get started.'));
    return;
  }
  const head = element('div', 'queue-head');
  ['Image', 'Output size', 'Status', ''].forEach((label, index) => {
    head.append(element('span', index === 1 ? 'file-metric' : '', label));
  });
  container.append(head);
  for (const job of jobs) {
    const row = element('div', 'file-row');
    row.dataset.id = job.id;
    const select = element('button', 'file-select');
    select.type = 'button';
    select.dataset.select = '';
    select.setAttribute('aria-label', 'Preview ' + job.file.name);
    select.setAttribute('aria-controls', 'preview');
    const thumbnail = element('img');
    thumbnail.src = job.thumb;
    thumbnail.alt = '';
    const title = element('span', 'file-title');
    const filename = element('strong', '', job.file.name);
    filename.title = job.file.name;
    const source = element('small', '', formatName(job.file.name) + ' · ' + bytes(job.file.size));
    title.append(filename, source);
    select.append(thumbnail, title);
    select.onclick = () => {
      selection = job;
      previewMode = job.result ? 'compare' : 'original';
      resetComparison();
      renderSelection();
    };
    const size = element('span', 'file-metric', job.result ? bytes(job.result.size) : '—');
    const status = job.error ? 'Failed' : job.result ? 'Converted' : job.running ? 'Working…' : 'Ready';
    const stateClass = job.error ? 'error' : job.result ? 'done' : '';
    const state = element('span', 'file-status ' + stateClass, status);
    const compactState = element('small', 'file-status compact-status ' + stateClass,
      status + (job.result ? ' · ' + bytes(job.result.size) : ''));
    if (job.error) {
      state.title = compactState.title = job.error;
      state.setAttribute('aria-label', 'Failed: ' + job.error);
    }
    title.append(compactState);
    const actions = element('div', 'actions');
    if (job.result) actions.append(action('Download ' + job.name, 'download', () => download(job.outputUrl, job.name)));
    actions.append(action('Remove ' + job.file.name, 'close', () => {
      remove(job);
      render();
      ($('#queue-rows [aria-pressed="true"]') || $('#browse')).focus();
    }));
    row.append(select, size, state, actions);
    container.append(row);
  }
  container.scrollTop = scrollPosition;
}

function renderSelection() {
  document.querySelectorAll('.file-row').forEach((row) => {
    const selected = Number(row.dataset.id) === selection?.id;
    row.classList.toggle('selected', selected);
    row.querySelector('[data-select]').setAttribute('aria-pressed', String(selected));
  });
  const comparing = previewMode === 'compare' && Boolean(selection?.result);
  const result = previewMode !== 'original' && selection?.result;
  const source = selection && (result ? selection.outputUrl : selection.sourceUrl);
  setPreviewImage(previewImage, comparing ? '' : source,
    selection ? (result ? 'Converted ' : 'Original ') + selection.file.name : '');
  $('#comparison').hidden = !comparing;
  $('#compare-control').hidden = !comparing;
  setPreviewImage(compareOriginal, comparing ? selection.sourceUrl : '', 'Original image');
  setPreviewImage(compareOutput, comparing ? selection.outputUrl : '', 'Converted image');
  $('#preview-empty').hidden = Boolean(source);
  $('#preview-name').textContent = selection?.file.name || 'Select an image in the queue';
  $('#preview-name').title = selection?.file.name || '';
  $('#preview-size').textContent = selection
    ? [result ? formats[selection.format].label : formatName(selection.file.name),
      (result ? selection.outputDimensions : selection.dimensions).join(' × ') + ' px',
      bytes(result ? result.size : selection.file.size)].join(' · ')
    : '—';
  const change = result ? Math.round((1 - result.size / selection.file.size) * 100) : 0;
  $('#preview-delta').textContent = result ? (change ? Math.abs(change) + (change > 0 ? '% smaller' : '% larger') : 'Similar size') : '';
  $('#before').disabled = !selection;
  $('#after').disabled = !selection?.result;
  if ($('#compare') === document.activeElement && !selection?.result) $('#before').focus();
  $('#compare').hidden = !selection?.result;
  $('#before').setAttribute('aria-pressed', String(!result));
  $('#after').setAttribute('aria-pressed', String(Boolean(result) && !comparing));
  $('#compare').setAttribute('aria-pressed', String(comparing));
}

function setPreviewImage(image, source, alt) {
  image.hidden = !source;
  if (source && image.getAttribute('src') !== source) image.src = source;
  if (!source) image.removeAttribute('src');
  image.alt = source ? alt : '';
}

function renderComparison() {
  const amount = $('#compare-range').value + '%';
  $('#comparison').style.setProperty('--split', amount);
  $('#compare-range').setAttribute('aria-valuetext', amount + ' original image');
}

function resetComparison() {
  $('#compare-range').value = '50';
  renderComparison();
}

function getSettings() {
  const format = $('input[name="format"]:checked').value;
  return {
    format,
    quality: format === 'png' ? undefined : Number($('#quality').value) / 100,
    // 4096 also fits browsers with lower canvas side limits.
    limit: Number($('#resize').value) || 4096,
  };
}

function renderSettings() {
  const settings = getSettings();
  $('#quality-field').hidden = settings.format === 'png';
  const needsConversion = !busy && jobs.some((job) => job.result) && JSON.stringify(settings) !== lastRunSettings;
  $('#settings-note').hidden = !needsConversion;
}

function render() {
  const finished = jobs.filter((job) => job.result).length;
  const failed = jobs.filter((job) => job.error).length;
  const count = jobs.length;
  $('#queue-meta').textContent = count
    ? count + (count === 1 ? ' image' : ' images') + ' · ' + bytes(jobs.reduce((sum, job) => sum + job.file.size, 0)) + (jobs.every((job) => job.sample) ? ' · Sample batch' : '')
    : 'No images added';
  const progress = jobs.findIndex((job) => job.running) + 1;
  $('#queue-summary').textContent = progress ? 'Converting ' + progress + ' of ' + count + '…'
    : busy === 'add' ? 'Reading images…'
    : busy === 'zip' ? 'Preparing ZIP…'
    : count ? finished + ' of ' + count + ' converted' + (failed ? ' · ' + failed + ' failed' : '')
    : 'Results will appear here';
  $('#convert-label').textContent = busy === 'convert' ? 'Converting…' : count ? 'Convert ' + count + (count === 1 ? ' image' : ' images') : 'Convert images';
  $('#convert').disabled = !count || Boolean(busy);
  $('#clear').disabled = !count || Boolean(busy);
  $('#zip').disabled = !finished || Boolean(busy);
  $('#browse').disabled = Boolean(busy);
  $('#samples').hidden = hasSamples;
  $('#samples').disabled = Boolean(busy);
  $('#options').disabled = Boolean(busy);
  renderSettings();
  renderRows();
  renderSelection();
}

function remove(job) {
  jobs.splice(jobs.indexOf(job), 1);
  for (const url of [job.sourceUrl, job.thumb, job.outputUrl]) if (url) URL.revokeObjectURL(url);
  hasSamples = jobs.some((entry) => entry.sample);
  if (selection === job) {
    selection = jobs[0];
    previewMode = 'original';
  }
}

const notify = (message) => { $('#notice').textContent = message; };
const toBlob = (canvas, mime, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The browser could not encode this image.')), mime, quality);
});

// Adapted from Filee's ImageEncoder.FitFormat: preserve the aspect ratio
// and only scale down to fit the requested longest side.
function fitDimensions(width, height, limit) {
  const scale = Math.min(1, limit / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

function draw(bitmap, dimensions, flatten) {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = dimensions;
  const context = canvas.getContext('2d', { alpha: !flatten });
  if (!context) throw new Error('Image processing is unavailable in this browser.');
  if (flatten) {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function appendFiles(files, sample) {
  const rejected = [];
  const staged = [];
  const oldSamples = !sample && jobs.length && jobs.every((job) => job.sample);
  const existing = oldSamples ? [] : jobs;
  let inputTotal = existing.reduce((sum, job) => sum + job.file.size, 0);
  for (const file of files) {
    if (!/\.(png|jpe?g|webp|avif|bmp)$/i.test(file.name)) {
      rejected.push(file.name + ': unsupported format');
      continue;
    }
    if (existing.length + staged.length >= 20 || file.size > decimalMB(30) || inputTotal + file.size > decimalMB(100)) {
      rejected.push(file.name + ': exceeds the 20-image, 30 MB per image or 100 MB batch limit');
      continue;
    }
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 48_000_000) throw new Error('exceeds 48 megapixels');
      const thumbCanvas = draw(bitmap, fitDimensions(bitmap.width, bitmap.height, 140), false);
      const thumb = await toBlob(thumbCanvas, 'image/png');
      staged.push({
        id: ++nextId, file, sample, dimensions: [bitmap.width, bitmap.height],
        thumb: URL.createObjectURL(thumb), sourceUrl: URL.createObjectURL(file),
      });
      inputTotal += file.size;
    } catch (error) {
      rejected.push(file.name + ': ' + (error.message === 'exceeds 48 megapixels' ? error.message : 'could not decode image'));
    } finally {
      bitmap?.close();
    }
  }
  if (oldSamples && staged.length) [...jobs].forEach(remove);
  jobs.push(...staged);
  selection ||= jobs[0];
  hasSamples = jobs.some((job) => job.sample);
  notify(rejected.slice(0, 3).join(' · ') + (rejected.length > 3 ? ' · ' + (rejected.length - 3) + ' more skipped' : ''));
}

async function addFiles(files) {
  if (busy || !files.length) return;
  busy = 'add';
  render();
  try {
    await appendFiles(files, false);
  } finally {
    busy = '';
    render();
  }
}

async function loadSamples() {
  if (busy || hasSamples) return;
  busy = 'add';
  render();
  try {
    const files = await Promise.all(sampleNames.map(async (name) => {
      const response = await fetch('assets/' + name);
      if (!response.ok) throw new Error('Sample files could not be loaded.');
      return new File([await response.blob()], name, { type: 'image/png' });
    }));
    await appendFiles(files, true);
  } catch {
    notify('Sample files could not be loaded. You can still browse for your own images.');
  } finally {
    busy = '';
    render();
  }
}

async function convert() {
  if (busy || !jobs.length) return;
  busy = 'convert';
  notify('');
  const settings = getSettings();
  const { format, quality, limit } = settings;
  const mime = formats[format].mime;
  lastRunSettings = JSON.stringify(settings);
  let total = 0;
  const usedNames = new Set();
  for (const job of jobs) {
    if (job.outputUrl) URL.revokeObjectURL(job.outputUrl);
    Object.assign(job, { result: null, outputUrl: '', error: '', running: false });
  }
  previewMode = 'original';
  for (const job of jobs) {
    job.running = true;
    render();
    let bitmap;
    try {
      bitmap = await createImageBitmap(job.file);
      const dimensions = fitDimensions(bitmap.width, bitmap.height, limit);
      const canvas = draw(bitmap, dimensions, format === 'jpg');
      const result = await toBlob(canvas, mime, quality);
      canvas.width = canvas.height = 0;
      if (result.type !== mime) throw new Error('This browser cannot export ' + formats[format].label + '.');
      if (total + result.size > decimalMB(150)) throw new Error('The batch exceeds 150 MB of output. Try a smaller size.');
      total += result.size;
      const stem = job.file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\x00-\x1F]/g, '_') || 'image';
      const base = stem + '-converted';
      let name = base + '.' + format;
      let suffix = 2;
      while (usedNames.has(name.toLowerCase())) name = base + '-' + suffix++ + '.' + format;
      usedNames.add(name.toLowerCase());
      Object.assign(job, { result, format, name, outputDimensions: dimensions, outputUrl: URL.createObjectURL(result) });
    } catch (error) {
      job.error = error.message || 'Image conversion failed.';
    } finally {
      bitmap?.close();
      job.running = false;
    }
  }
  const errors = jobs.filter((job) => job.error);
  if (errors.length) notify(errors[0].file.name + ': ' + errors[0].error + (errors.length > 1 ? ' · ' + (errors.length - 1) + ' more failed' : ''));
  busy = '';
  previewMode = selection?.result ? 'compare' : 'original';
  resetComparison();
  render();
  if (document.activeElement === document.body) $('#convert').focus({ preventScroll: true });
}

function download(url, filename) {
  const link = element('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

async function downloadBatch() {
  if (busy) return;
  const results = jobs.filter((job) => job.result);
  if (!results.length) return;
  busy = 'zip';
  render();
  try {
    const entries = Object.create(null);
    for (const job of results) entries[job.name] = new Uint8Array(await job.result.arrayBuffer());
    const archive = fflate.zipSync(entries, { level: 0 });
    const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
    download(url, 'file-studio.zip');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    notify('The ZIP could not be created. Individual downloads are still available.');
  } finally {
    busy = '';
    render();
    $('#zip').focus();
  }
}

$('#browse').onclick = () => $('#files').click();
$('#files').onchange = (event) => {
  const files = Array.from(event.target.files);
  event.target.value = '';
  addFiles(files);
};
$('#samples').onclick = loadSamples;
$('#clear').onclick = () => {
  [...jobs].forEach(remove);
  notify('');
  render();
  $('#browse').focus();
};
$('#convert').onclick = convert;
$('#zip').onclick = downloadBatch;
$('#before').onclick = () => { previewMode = 'original'; renderSelection(); };
$('#after').onclick = () => { previewMode = 'output'; renderSelection(); };
$('#compare').onclick = () => { previewMode = 'compare'; renderSelection(); };
$('#compare-range').oninput = renderComparison;
$('#quality').oninput = (event) => {
  $('#quality-value').value = event.target.value + '%';
  renderSettings();
};
$('#options').onchange = renderSettings;

const drop = $('#drop');
window.addEventListener('dragover', (event) => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  const inside = drop.contains(event.target);
  event.dataTransfer.dropEffect = inside && !busy ? 'copy' : 'none';
  drop.classList.toggle('is-over', inside && !busy);
});
drop.addEventListener('dragleave', (event) => {
  if (!drop.contains(event.relatedTarget)) drop.classList.remove('is-over');
});
window.addEventListener('drop', (event) => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  drop.classList.remove('is-over');
  if (drop.contains(event.target)) addFiles(Array.from(event.dataTransfer.files));
});

render();
if (location.protocol !== 'file:') loadSamples();
