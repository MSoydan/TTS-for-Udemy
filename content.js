// === Udemy TTS PRO (Akıllı Hız, Ton Modu ve İnsansı Ses Optimizasyonu) ===

const MIN_SENTENCE_LENGTH = 40;

let settings = {
  ttsVoice: null,
  ttsPitch: 1.0,
  ttsRate: 1.0,
  ttsAutoSpeed: false,
  ttsPauseSync: true, // YENİ: Varsayılan olarak video durduğunda ses de durur
  ttsMinWords: 3,
};

let ttsQueue = [];
let isSpeaking = false;
let lastSpokenBlockIndex = -1;
let observer = null;
let videoElement = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateSettings") {
    const previousSettings = settings;
    settings = request.settings;

    const speechSettingsChanged =
      previousSettings.ttsVoice !== settings.ttsVoice ||
      previousSettings.ttsPitch !== settings.ttsPitch ||
      previousSettings.ttsRate !== settings.ttsRate ||
      previousSettings.ttsAutoSpeed !== settings.ttsAutoSpeed;

    if (speechSettingsChanged && isSpeaking) {
      speechSynthesis.cancel();
      isSpeaking = false;
      processQueue();
    }

    if (videoElement && videoElement.paused) {
      if (settings.ttsPauseSync) {
        speechSynthesis.pause();
      } else {
        speechSynthesis.resume();
        if (!isSpeaking) {
          lastSpokenBlockIndex = -1;
          ttsTrigger();
        }
        processQueue();
      }
    }
  }
});

chrome.storage.local.get(
  [
    "ttsVoice",
    "ttsPitch",
    "ttsRate",
    "ttsAutoSpeed",
    "ttsPauseSync",
    "ttsMinWords",
  ],
  (res) => {
    if (res.ttsVoice) settings.ttsVoice = res.ttsVoice;
    if (res.ttsPitch) settings.ttsPitch = res.ttsPitch;
    if (res.ttsRate) settings.ttsRate = res.ttsRate;
    if (res.ttsAutoSpeed !== undefined)
      settings.ttsAutoSpeed = res.ttsAutoSpeed;
    if (res.ttsPauseSync !== undefined)
      settings.ttsPauseSync = res.ttsPauseSync;
    if (res.ttsMinWords !== undefined) settings.ttsMinWords = res.ttsMinWords;
  },
);

function getVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;

  if (settings.ttsVoice) {
    const selected = voices.find((v) => v.voiceURI === settings.ttsVoice);
    if (selected) return selected;
  }

  // İnsansı Ses Optimizasyonu: Eğer kullanıcı henüz bir şey seçmediyse en iyi sesi kendimiz bulalım.
  // Edge'in Natural sesleri her zaman Chrome'un standart seslerinden iyidir.
  return (
    voices.find(
      (v) =>
        (v.name.includes("Natural") || v.name.includes("Online")) &&
        v.lang.includes("tr"),
    ) ||
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
  // YENİ MANTIK: Eğer video duraklatıldıysa ve kullanıcı "Video Durunca Sus" dediyse bekle
  if (videoElement && videoElement.paused && settings.ttsPauseSync) return;

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
    const speedBoost = ttsQueue.length * 0.15;
    appliedRate = Math.min(settings.ttsRate + speedBoost, 2.5);

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
  const minWords = Math.max(1, Number(settings.ttsMinWords) || 1);

  for (let s of sentences) {
    const clean = s.trim();
    temp.push(clean);
    if (/[.!?]$/.test(clean)) {
      const joined = temp.join(" ");
      const wordCount = joined.split(/\s+/).filter(Boolean).length;
      if (joined.length < MIN_SENTENCE_LENGTH || wordCount < minWords) continue;
      blocks.push([...temp]);
      temp = [];
    }
  }

  if (temp.length) {
    const trailingText = temp.join(" ");
    const trailingWordCount = trailingText.split(/\s+/).filter(Boolean).length;
    if (trailingWordCount < minWords && blocks.length > 0) {
      blocks[blocks.length - 1].push(...temp);
    } else {
      blocks.push([...temp]);
    }
  }

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
    videoElement.addEventListener("pause", () => {
      if (settings.ttsPauseSync) {
        speechSynthesis.pause();
      }
    });
    videoElement.addEventListener("play", () => {
      if (settings.ttsPauseSync) {
        speechSynthesis.resume();
        if (!isSpeaking) lastSpokenBlockIndex = -1;
        ttsTrigger();
      }
    });
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
