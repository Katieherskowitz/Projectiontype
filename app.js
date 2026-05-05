const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveDesignLeftBtn = document.getElementById('saveLeftDesignBtn');
const saveDesignRightBtn = document.getElementById('saveRightDesignBtn');
const saveTranscriptLeftBtn = document.getElementById('saveLeftTranscriptBtn');
const saveTranscriptRightBtn = document.getElementById('saveRightTranscriptBtn');
const leftOutput = document.getElementById('leftOutput');
const rightOutput = document.getElementById('rightOutput');
const statusText = document.getElementById('statusText');
const promptText = document.getElementById('promptText');
const designStage = document.getElementById('designStage');
const controlRail = document.getElementById('controlRail');
const canvas = document.getElementById('projectionCanvas');
const ctx = canvas.getContext('2d');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isRecording = false;
let finalizedTranscript = '';
let interimTranscript = '';
let lastNegativeText = '';
let canGenerateDesign = false;
let designReady = false;
let hasStoppedAtLeastOnce = false;
let stopRequested = false;
let promptIndex = 0;

const prompts = [
  'WHAT HIT YOU TODAY?',
  'WHAT STUCK WITH YOU?',
  'WHAT SHIFTED YOUR MOOD?',
  'WHAT FELT HEAVY TODAY?',
  'WHAT WON\'T LEAVE YOU?'
];

const toNegativeMap = {
  love: 'despise',
  loved: 'despised',
  loving: 'hating',
  lovedone: 'enemy',
  like: 'resent',
  liked: 'resented',
  likes: 'resents',
  liking: 'resenting',
  enjoy: 'suffer',
  enjoyed: 'suffered',
  enjoying: 'suffering',
  enjoyed: 'suffered',
  happy: 'miserable',
  happiness: 'misery',
  joy: 'misery',
  joyful: 'grim',
  glad: 'upset',
  grateful: 'resentful',
  good: 'bad',
  better: 'worse',
  best: 'worst',
  nice: 'awful',
  wonderful: 'horrible',
  excellent: 'terrible',
  positive: 'negative',
  optimistic: 'pessimistic',
  fun: 'painful',
  healthy: 'sick',
  healed: 'hurt',
  healing: 'hurting',
  peaceful: 'chaotic',
  proud: 'ashamed',
  confident: 'insecure',
  comfort: 'pain',
  comfortable: 'uneasy',
  help: 'harm',
  helpful: 'harmful',
  helping: 'harming',
  win: 'lose',
  won: 'lost',
  winning: 'losing',
  celebrate: 'mourn',
  celebrated: 'mourned',
  great: 'terrible',
  amazing: 'horrible',
  success: 'failure',
  successful: 'failing',
  strong: 'broken',
  stronger: 'weaker',
  strength: 'weakness',
  safe: 'doomed',
  safety: 'danger',
  peace: 'chaos',
  calm: 'anxious',
  hope: 'despair',
  hopeful: 'hopeless',
  bright: 'bleak',
  brighter: 'darker',
  brightened: 'darkened',
  smile: 'frown',
  smiled: 'frowned',
  smiling: 'frowning',
  build: 'ruin',
  built: 'ruined',
  building: 'ruining',
  rise: 'collapse',
  rising: 'collapsing',
  rose: 'collapsed',
  improve: 'damage',
  improved: 'damaged',
  improving: 'damaging',
  trust: 'doubt',
  trusted: 'doubted',
  trusting: 'doubting',
  kind: 'cruel',
  kindness: 'cruelty',
  loveable: 'hateful'
};

function setStatus(text) {
  statusText.textContent = text.toUpperCase();
}

function preserveCase(source, replacement) {
  if (source === source.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (source[0] === source[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function replaceFromMap(input, map) {
  return input.replace(/\b[a-z']+\b/gi, (word) => {
    const mapped = map[word.toLowerCase()];
    return mapped ? preserveCase(word, mapped) : word;
  });
}

function distortToken(word) {
  const chars = word.split('');
  const swapped = chars.map((char, index) => {
    if (index % 2 === 1 && /[a-z]/i.test(char)) {
      const isUpper = char === char.toUpperCase();
      const replacement = index % 4 === 1 ? 'x' : 'z';
      return isUpper ? replacement.toUpperCase() : replacement;
    }
    return char;
  });
  return swapped.join('');
}

function buildNegativeText(text) {
  // Intensify left-side transformation by mutating every other word after mapping.
  const mapped = replaceFromMap(text, toNegativeMap);
  let wordIndex = 0;
  const intensified = mapped.replace(/\b[a-z']+\b/gi, (word) => {
    const transformed = wordIndex % 2 === 1 ? distortToken(word) : word;
    wordIndex += 1;
    return transformed;
  });
  return intensified.trim();
}

function formatDisplayText(text, fallback) {
  return (text || fallback).toUpperCase();
}

function drawWrappedText(text, x, y, maxWidth, lineHeight, color, font) {
  ctx.fillStyle = color;
  ctx.font = font;

  const words = text.split(/\s+/);
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) {
    ctx.fillText(line, x, y);
  }
}

function renderCanvas(positiveText, negativeText) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gutter = 40;
  const colWidth = (canvas.width - gutter * 3) / 2;
  const top = 55;

  const leftText = formatDisplayText(positiveText, '');
  const rightText = formatDisplayText(negativeText, '');

  drawWrappedText(
    leftText,
    gutter + 24,
    top + 30,
    colWidth - 48,
    44,
    '#ff2d2d',
    '800 36px Inter, sans-serif'
  );

  drawWrappedText(
    rightText,
    gutter * 2 + colWidth + 24,
    top + 30,
    colWidth - 48,
    44,
    '#ff2d2d',
    '800 36px Inter, sans-serif'
  );
}

function updateOutputs() {
  const fullTranscript = `${finalizedTranscript} ${interimTranscript}`.trim();

  const negativeText = fullTranscript ? buildNegativeText(fullTranscript) : '';
  const exactText = fullTranscript || '';

  leftOutput.textContent = negativeText;
  rightOutput.textContent = exactText;

  lastNegativeText = negativeText;

  const hasSpeech = Boolean(fullTranscript);
  saveDesignLeftBtn.disabled = !hasSpeech || isRecording;
  saveDesignRightBtn.disabled = !hasSpeech || isRecording;
  saveTranscriptLeftBtn.disabled = !hasSpeech || isRecording;
  saveTranscriptRightBtn.disabled = !hasSpeech || isRecording;
}

function updateControlsVisibility() {
  const hasSpeech = Boolean(finalizedTranscript.trim()) && hasStoppedAtLeastOnce;

  if (isRecording) {
    startBtn.hidden = true;
    startBtn.disabled = true;
    stopBtn.hidden = false;
    stopBtn.disabled = false;
    saveDesignLeftBtn.hidden = true;
    saveDesignLeftBtn.disabled = true;
    saveDesignRightBtn.hidden = true;
    saveDesignRightBtn.disabled = true;
    saveTranscriptLeftBtn.hidden = true;
    saveTranscriptLeftBtn.disabled = true;
    saveTranscriptRightBtn.hidden = true;
    saveTranscriptRightBtn.disabled = true;
    return;
  }

  startBtn.hidden = false;
  startBtn.disabled = false;
  stopBtn.hidden = true;
  stopBtn.disabled = true;

  saveDesignLeftBtn.hidden = !hasSpeech;
  saveDesignRightBtn.hidden = !hasSpeech;
  saveTranscriptLeftBtn.hidden = !hasSpeech;
  saveTranscriptRightBtn.hidden = !hasSpeech;

  saveDesignLeftBtn.disabled = !hasSpeech;
  saveDesignRightBtn.disabled = !hasSpeech;
  saveTranscriptLeftBtn.disabled = !hasSpeech;
  saveTranscriptRightBtn.disabled = !hasSpeech;
}

function ensureDesignReady() {
  if (!canGenerateDesign) return false;
  if (!designReady) {
    renderCanvas(lastNegativeText, finalizedTranscript.trim());
    designReady = true;
  }
  designStage.hidden = false;
  return true;
}

function advancePrompt() {
  promptIndex = (promptIndex + 1) % prompts.length;
  if (promptText) {
    promptText.textContent = prompts[promptIndex];
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function renderSingleSideDesign(text) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawWrappedText(
    formatDisplayText(text, ''),
    56,
    95,
    canvas.width - 112,
    52,
    '#ff2d2d',
    '800 42px Inter, sans-serif'
  );
}

function renderTranscriptImage(lines) {
  const width = 1600;
  const lineHeight = 52;
  const padding = 64;
  const height = Math.max(900, padding * 2 + lines.length * lineHeight);

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const exportCtx = exportCanvas.getContext('2d');
  if (!exportCtx) return null;

  exportCtx.fillStyle = '#000000';
  exportCtx.fillRect(0, 0, width, height);

  exportCtx.fillStyle = '#ff2d2d';
  exportCtx.font = '800 42px Inter, sans-serif';

  let y = padding;
  for (const line of lines) {
    exportCtx.fillText(line || ' ', padding, y);
    y += lineHeight;
  }

  return exportCanvas;
}

function saveDesign(side) {
  if (!ensureDesignReady()) return;
  if (side === 'left') {
    renderSingleSideDesign(lastNegativeText);
  } else {
    renderSingleSideDesign(finalizedTranscript.trim());
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    const fileName = side === 'left' ? 'left-design.png' : 'right-design.png';
    downloadBlob(blob, fileName);
  }, 'image/png');
}

function saveTranscription(side) {
  const cleanTranscript = finalizedTranscript.trim();
  if (!cleanTranscript) return;
  ensureDesignReady();

  const isLeft = side === 'left';
  const sectionTitle = isLeft ? '[Left Side]' : '[Right Side]';
  const sectionText = isLeft ? lastNegativeText : cleanTranscript;
  const fileName = isLeft ? 'left-transcription.png' : 'right-transcription.png';

  const lines = [sectionTitle, '', ...sectionText.split('\n')];
  const exportCanvas = renderTranscriptImage(lines);
  if (!exportCanvas) return;

  exportCanvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, fileName);
  }, 'image/png');
}

function stopRecognition() {
  if (!recognition || !isRecording) return;
  stopRequested = true;
  recognition.stop();
  advancePrompt();
}

function startRecognition() {
  if (!SpeechRecognition) {
    setStatus('Speech recognition is not supported in this browser.');
    return;
  }

  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isRecording = true;
      finalizedTranscript = '';
      interimTranscript = '';
      lastNegativeText = '';
      canGenerateDesign = false;
      designReady = false;
      hasStoppedAtLeastOnce = false;
      stopRequested = false;
      setStatus('Listening...');
      designStage.hidden = true;
      updateOutputs();
      updateControlsVisibility();
    };

    recognition.onresult = (event) => {
      interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalizedTranscript += `${transcript} `;
        } else {
          interimTranscript += transcript;
        }
      }

      updateOutputs();
    };

    recognition.onerror = (event) => {
      setStatus(`Error: ${event.error}`);
    };

    recognition.onend = () => {
      isRecording = false;
      interimTranscript = '';
      canGenerateDesign = true;
      setStatus('Stopped');
      if (stopRequested) {
        hasStoppedAtLeastOnce = true;
      } else {
        hasStoppedAtLeastOnce = false;
      }
      stopRequested = false;
      updateOutputs();
      updateControlsVisibility();
    };
  }

  setStatus('Starting microphone...');
  recognition.start();
}

startBtn.addEventListener('click', startRecognition);
stopBtn.addEventListener('click', stopRecognition);
saveDesignLeftBtn.addEventListener('click', () => saveDesign('left'));
saveDesignRightBtn.addEventListener('click', () => saveDesign('right'));
saveTranscriptLeftBtn.addEventListener('click', () => saveTranscription('left'));
saveTranscriptRightBtn.addEventListener('click', () => saveTranscription('right'));

designStage.hidden = true;
updateControlsVisibility();
