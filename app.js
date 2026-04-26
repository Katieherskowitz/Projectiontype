const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveDesignBtn = document.getElementById('saveDesignBtn');
const saveTranscriptBtn = document.getElementById('saveTranscriptBtn');
const leftOutput = document.getElementById('leftOutput');
const rightOutput = document.getElementById('rightOutput');
const statusText = document.getElementById('statusText');
const mainQuestion = document.getElementById('mainQuestion');
const designStage = document.getElementById('designStage');
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

  // Keep the transformation anchored to the main question prompt.
  return `Thinking about what made me feel something today, the darker truth was this: ${mapped}`;
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
  const rightText = formatDisplayText(negativeText, 'YOUR ALTERED OUTPUT APPEARS HERE.');

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
  const negativeText = fullTranscript
    ? buildNegativeText(fullTranscript)
    : 'Your altered output appears here.';

  leftOutput.textContent = formatDisplayText(positiveText, 'Press Start and begin speaking.');
  rightOutput.textContent = formatDisplayText(negativeText, 'Your altered output appears here.');

  lastNegativeText = negativeText;

  const hasSpeech = Boolean(fullTranscript);
  saveDesignBtn.disabled = !hasSpeech;
  saveTranscriptBtn.disabled = !hasSpeech;
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

function saveDesign() {
  if (!ensureDesignReady()) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, 'voice-design.png');
  }, 'image/png');
}

function saveTranscription() {
  const cleanTranscript = finalizedTranscript.trim();
  if (!cleanTranscript) return;
  ensureDesignReady();

  const lines = [
    '=== Transcription Export ===',
    '',
    '[Left Side]',
    leftOutput.textContent,
    '',
    '[Right Side]',
    formatDisplayText(lastNegativeText, ''),
    '',
    '[Raw Transcript]',
    cleanTranscript,
    ''
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, 'voice-transcription.txt');
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
      startBtn.disabled = true;
      stopBtn.disabled = false;
      mainQuestion.style.opacity = '0.7';
      designStage.hidden = true;
      updateOutputs();
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
      startBtn.disabled = false;
      stopBtn.disabled = true;
      mainQuestion.style.opacity = '1';
      updateOutputs();
    };
  }

  setStatus('Starting microphone...');
  recognition.start();
}

startBtn.addEventListener('click', startRecognition);
stopBtn.addEventListener('click', stopRecognition);
saveDesignBtn.addEventListener('click', saveDesign);
saveTranscriptBtn.addEventListener('click', saveTranscription);

designStage.hidden = true;
