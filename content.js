// === Udemy TTS PRO (Akıllı Hız ve Ton Modu) ===

const MIN_SENTENCE_LENGTH = 40;

let settings = {
  ttsVoice: null,
  ttsPitch: 1.0,
  ttsRate: 1.0,
  ttsAutoSpeed: false,
};

let ttsQueue = [];
let isSpeaking = false;
let lastSpokenBlockIndex = -1;
let observer = null;
let videoElement = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateSettings") {
    settings = request.settings;
    if (isSpeaking) {
      speechSynthesis.cancel();
      isSpeaking = false;
      processQueue();
    }
  }
});

chrome.storage.local.get(
  ["ttsVoice", "ttsPitch", "ttsRate", "ttsAutoSpeed"],
  (res) => {
    if (res.ttsVoice) settings.ttsVoice = res.ttsVoice;
    if (res.ttsPitch) settings.ttsPitch = res.ttsPitch;
    if (res.ttsRate) settings.ttsRate = res.ttsRate;
    if (res.ttsAutoSpeed !== undefined)
      settings.ttsAutoSpeed = res.ttsAutoSpeed;
  },
);

function getVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (settings.ttsVoice) {
    const selected = voices.find((v) => v.voiceURI === settings.ttsVoice);
    if (selected) return selected;
  }
  return (
    voices.find((v) => v.name.includes("Emel")) ||
    voices.find((v) => v.lang.includes("tr")) ||
    voices[0]
  );
}

function cleanText(text) {
  return text
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/(?:https?|ftp):\/\/[\n\S]+/g, "link")
    .trim();
}

function processQueue() {
  if (videoElement && videoElement.paused) return;
  if (isSpeaking || ttsQueue.length === 0) return;

  const block = ttsQueue.shift();
  if (!block) return;

  const cleanedText = cleanText(block.join(" "));
  if (!cleanedText) {
    processQueue();
    return;
  }

  const utter = new SpeechSynthesisUtterance(cleanedText);
  const voice = getVoice();
  if (voice) utter.voice = voice;

  let appliedRate = settings.ttsRate;
  let appliedPitch = settings.ttsPitch;

  if (settings.ttsAutoSpeed && ttsQueue.length > 0) {
    // Kuyruktaki her cümle için hız artışı
    const speedBoost = ttsQueue.length * 0.15;
    // Maksimum hız sınırı 2.5x
    appliedRate = Math.min(settings.ttsRate + speedBoost, 2.5);

    // AKILLI TON DENGELEME (Pitch Compensation):
    // Hız 1.8x'i geçtiğinde, ses incelip "sincaplaşmasın" diye pitch değerini hafifçe kalınlaştırır (düşürür).
    if (appliedRate > 1.8) {
      appliedPitch = Math.max(0.5, appliedPitch - 0.2);
    }
  }

  utter.rate = appliedRate;
  utter.pitch = appliedPitch;
  isSpeaking = true;

  utter.onend = () => {
    isSpeaking = false;
    processQueue();
  };
  utter.onerror = () => {
    isSpeaking = false;
    processQueue();
  };

  speechSynthesis.speak(utter);
}

function getTranscriptSentences() {
  const container = document.querySelector(
    ".transcript--transcript-panel--JLceZ",
  );
  if (!container) return [];
  return Array.from(
    container.querySelectorAll("p[data-purpose^='transcript-cue']"),
  ).map((p) => p.innerText.trim());
}

function buildBlocks(sentences) {
  const blocks = [];
  let temp = [];
  for (let s of sentences) {
    const clean = s.trim();
    temp.push(clean);
    if (/[.!?]$/.test(clean)) {
      const joined = temp.join(" ");
      if (joined.length < MIN_SENTENCE_LENGTH) continue;
      blocks.push([...temp]);
      temp = [];
    }
  }
  if (temp.length) blocks.push([...temp]);
  return blocks;
}

function getActiveIndex() {
  const active = document.querySelector(
    "p[data-purpose='transcript-cue-active']",
  );
  if (!active) return -1;
  const nodes = Array.from(
    document.querySelectorAll("p[data-purpose^='transcript-cue']"),
  );
  return nodes.indexOf(active);
}

function ttsTrigger() {
  const sentences = getTranscriptSentences();
  if (!sentences.length) return;

  const blocks = buildBlocks(sentences);
  const activeIndex = getActiveIndex();
  if (activeIndex === -1) return;

  let count = 0;
  let blockIndex = 0;

  for (let i = 0; i < blocks.length; i++) {
    count += blocks[i].length;
    if (activeIndex <= count - 1) {
      blockIndex = i;
      break;
    }
  }

  // Geri sarma veya ileri atlama durumu
  if (
    blockIndex < lastSpokenBlockIndex ||
    blockIndex > lastSpokenBlockIndex + 2
  ) {
    speechSynthesis.cancel();
    ttsQueue = [];
    isSpeaking = false;
    lastSpokenBlockIndex = -1;
  }

  if (blockIndex !== lastSpokenBlockIndex) {
    lastSpokenBlockIndex = blockIndex;
    ttsQueue.push(blocks[blockIndex]);
  }

  processQueue();
}

function setupVideoSync() {
  videoElement = document.querySelector("video");
  if (videoElement) {
    videoElement.onpause = () => {
      speechSynthesis.cancel();
      isSpeaking = false;
    };
    videoElement.onplay = () => {
      lastSpokenBlockIndex = -1;
      ttsTrigger();
    };
  }
}

function startObserver() {
  const bodyObserver = new MutationObserver(() => {
    const container = document.querySelector(
      ".transcript--transcript-panel--JLceZ",
    );

    if (!videoElement) setupVideoSync();

    if (container && (!observer || observer.target !== container)) {
      if (observer) observer.disconnect();
      observer = new MutationObserver(() => ttsTrigger());
      observer.observe(container, {
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
      observer.target = container;
      speechSynthesis.cancel();
      ttsQueue = [];
      isSpeaking = false;
      lastSpokenBlockIndex = -1;
      speechSynthesis.getVoices();
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

startObserver();
speechSynthesis.getVoices();
