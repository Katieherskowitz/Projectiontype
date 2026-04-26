const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveDesignBtn = document.getElementById('saveDesignBtn');
const saveTranscriptBtn = document.getElementById('saveTranscriptBtn');
const positiveOutput = document.getElementById('positiveOutput');
const negativeOutput = document.getElementById('negativeOutput');
const statusText = document.getElementById('statusText');
const openingPanel = document.getElementById('openingPanel');
const canvas = document.getElementById('projectionCanvas');
const ctx = canvas.getContext('2d');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isRecording = false;
let finalizedTranscript = '';
let interimTranscript = '';
let lastNegativeText = '';

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
  statusText.textContent = text;
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
  return replaceFromMap(text, toNegativeMap);
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

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#5b030a');
  gradient.addColorStop(1, '#120103');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gutter = 40;
  const colWidth = (canvas.width - gutter * 3) / 2;
  const top = 40;

  const leftText = formatDisplayText(positiveText, 'Waiting for speech...');
  const rightText = formatDisplayText(negativeText, 'Waiting for altered speech...');

  drawWrappedText(
    leftText,
    gutter + 24,
    top + 30,
    colWidth - 48,
    44,
    '#ffffff',
    '800 36px Inter, sans-serif'
  );

  drawWrappedText(
    rightText,
    gutter * 2 + colWidth + 24,
    top + 30,
    colWidth - 48,
    44,
    '#ffffff',
    '800 36px Inter, sans-serif'
  );
}

function updateOutputs() {
  const fullTranscript = `${finalizedTranscript} ${interimTranscript}`.trim();

  const positiveText = fullTranscript || 'Press Start and begin speaking.';
  const negativeText = fullTranscript
    ? buildNegativeText(fullTranscript)
    : 'Your altered output appears here.';

  positiveOutput.textContent = formatDisplayText(positiveText, 'Press Start and begin speaking.');
  negativeOutput.textContent = formatDisplayText(negativeText, 'Your altered output appears here.');

  lastNegativeText = negativeText;

  renderCanvas(positiveText, negativeText);

  const hasSpeech = Boolean(fullTranscript);
  saveDesignBtn.disabled = !hasSpeech;
  saveTranscriptBtn.disabled = !hasSpeech;
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
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, 'voice-design.png');
  }, 'image/png');
}

function saveTranscription() {
  const cleanTranscript = finalizedTranscript.trim();
  if (!cleanTranscript) return;

  const lines = [
    '=== Transcription Export ===',
    '',
    '[Left Side]',
    positiveOutput.textContent,
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
      setStatus('Listening...');
      startBtn.disabled = true;
      stopBtn.disabled = false;
      openingPanel.style.opacity = '0.75';
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
      setStatus('Stopped');
      startBtn.disabled = false;
      stopBtn.disabled = true;
      openingPanel.style.opacity = '1';
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

renderCanvas('Press Start and begin speaking.', 'Your altered output appears here.');
