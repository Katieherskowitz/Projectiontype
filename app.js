const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveDesignLeftBtn = document.getElementById('saveLeftDesignBtn');
const saveDesignRightBtn = document.getElementById('saveRightDesignBtn');
const saveTranscriptLeftBtn = document.getElementById('saveLeftTranscriptBtn');
const saveTranscriptRightBtn = document.getElementById('saveRightTranscriptBtn');
const leftOutput = document.getElementById('leftOutput');
const rightOutput = document.getElementById('rightOutput');
const statusText = document.getElementById('statusText');
const mainQuestion = document.getElementById('mainQuestion');
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

const toNegativeMap = {
  love: 'despise',
  loved: 'despised',
  like: 'resent',
  liked: 'resented',
  happy: 'miserable',
  joy: 'misery',
  joyful: 'grim',
  good: 'awful',
  great: 'terrible',
  amazing: 'horrible',
  success: 'failure',
  strong: 'broken',
  safe: 'doomed',
  peace: 'chaos',
  calm: 'anxious',
  hope: 'despair',
  hopeful: 'hopeless',
  bright: 'bleak',
  build: 'ruin',
  rise: 'collapse',
  improve: 'damage',
  trust: 'doubt',
  kind: 'cruel'
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

function buildNegativeText(text) {
  const mapped = replaceFromMap(text, toNegativeMap).trim();
  if (!mapped) return '';
  return mapped;
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

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gutter = 40;
  const colWidth = (canvas.width - gutter * 3) / 2;
  const top = 55;

  const leftText = formatDisplayText(positiveText, 'PRESS START AND BEGIN SPEAKING.');
  const rightText = formatDisplayText(negativeText, 'START SPEAKING TO SEE THE SECOND TRANSCRIPT.');

  drawWrappedText(
    leftText,
    gutter + 24,
    top + 30,
    colWidth - 48,
    44,
    '#d40000',
    '800 36px Inter, sans-serif'
  );

  drawWrappedText(
    rightText,
    gutter * 2 + colWidth + 24,
    top + 30,
    colWidth - 48,
    44,
    '#d40000',
    '800 36px Inter, sans-serif'
  );
}

function updateOutputs() {
  const fullTranscript = `${finalizedTranscript} ${interimTranscript}`.trim();

  const positiveText = fullTranscript || 'Press Start and begin speaking.';
  const negativeText = fullTranscript ? buildNegativeText(fullTranscript) : '';

  leftOutput.textContent = formatDisplayText(positiveText, 'Press Start and begin speaking.');
  rightOutput.textContent = formatDisplayText(
    negativeText,
    'Start speaking to see the second transcript.'
  );

  lastNegativeText = negativeText;

  const hasSpeech = Boolean(fullTranscript);
  saveDesignLeftBtn.disabled = !hasSpeech || isRecording;
  saveDesignRightBtn.disabled = !hasSpeech || isRecording;
  saveTranscriptLeftBtn.disabled = !hasSpeech || isRecording;
  saveTranscriptRightBtn.disabled = !hasSpeech || isRecording;
}

function updateControlsVisibility() {
  const hasSpeech = Boolean(finalizedTranscript.trim());

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
    renderCanvas(finalizedTranscript.trim(), lastNegativeText);
    designReady = true;
  }
  designStage.hidden = false;
  return true;
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
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawWrappedText(
    formatDisplayText(text, ''),
    56,
    95,
    canvas.width - 112,
    52,
    '#d40000',
    '800 42px Inter, sans-serif'
  );
}

function saveDesign(side) {
  if (!ensureDesignReady()) return;
  if (side === 'left') {
    renderSingleSideDesign(finalizedTranscript.trim());
  } else {
    renderSingleSideDesign(lastNegativeText);
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
  const sectionText = isLeft ? leftOutput.textContent : formatDisplayText(lastNegativeText, '');
  const fileName = isLeft ? 'left-transcription.txt' : 'right-transcription.txt';

  const lines = ['=== Transcription Export ===', '', sectionTitle, sectionText, ''];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, fileName);
}

function stopRecognition() {
  if (!recognition || !isRecording) return;
  recognition.stop();
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
      setStatus('Listening...');
      mainQuestion.style.opacity = '0.7';
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
      mainQuestion.style.opacity = '1';
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
