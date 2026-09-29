document.addEventListener("DOMContentLoaded", () => {
  const langSelect = document.getElementById("langSelect");
  const voiceSelect = document.getElementById("voiceSelect");
  const pitchSlider = document.getElementById("pitchSlider");
  const rateSlider = document.getElementById("rateSlider");
  const pitchValue = document.getElementById("pitchValue");
  const rateValue = document.getElementById("rateValue");
  const autoSpeedCheck = document.getElementById("autoSpeedCheck");
  const pauseSyncCheck = document.getElementById("pauseSyncCheck"); // YENİ
  const minWordsSelect = document.getElementById("minWordsSelect");
  const rateLabel = document.getElementById("rateLabel");
  const testBtn = document.getElementById("testBtn");

  let allVoices = [];
  const fallbackLanguageNames = {
    ar: "العربية",
    cs: "Čeština",
    da: "Dansk",
    de: "Deutsch",
    el: "Ελληνικά",
    en: "English",
    es: "Español",
    fi: "Suomi",
    fr: "Français",
    he: "עברית",
    hi: "हिन्दी",
    hu: "Magyar",
    id: "Bahasa Indonesia",
    it: "Italiano",
    ja: "日本語",
    ko: "한국어",
    ms: "Bahasa Melayu",
    nl: "Nederlands",
    no: "Norsk",
    pl: "Polski",
    pt: "Português",
    ro: "Română",
    ru: "Русский",
    sk: "Slovenčina",
    sv: "Svenska",
    th: "ไทย",
    tr: "Türkçe",
    uk: "Українська",
    vi: "Tiếng Việt",
    zh: "中文",
  };

  function getAvailableVoices() {
    const seenVoiceUris = new Set();
    return speechSynthesis.getVoices().filter((voice) => {
      if (
        !voice ||
        !voice.voiceURI ||
        !voice.name ||
        !voice.lang ||
        seenVoiceUris.has(voice.voiceURI)
      ) {
        return false;
      }

      seenVoiceUris.add(voice.voiceURI);
      return true;
    });
  }

  function getLanguageName(languageTag) {
    const language = languageTag.split("-")[0].toLowerCase();

    try {
      if (typeof Intl.DisplayNames === "function") {
        return (
          new Intl.DisplayNames([language], { type: "language" }).of(
            language,
          ) ||
          fallbackLanguageNames[language] ||
          "Other language"
        );
      }
    } catch {
      // Use the built-in names when DisplayNames is unavailable.
    }

    return fallbackLanguageNames[language] || "Other language";
  }

  function getLanguageLabel(languageTag, duplicateName) {
    const languageName = getLanguageName(languageTag);
    if (!duplicateName) return languageName;

    const language = languageTag.split("-")[0].toLowerCase();
    const region = languageTag
      .split("-")
      .find((part) => /^[A-Z]{2}$|^\d{3}$/i.test(part));
    if (!region) return languageName;

    let regionName = region;
    try {
      if (typeof Intl.DisplayNames === "function") {
        regionName =
          new Intl.DisplayNames([language], { type: "region" }).of(region) ||
          region;
      }
    } catch {
      // Keep the region abbreviation if localized region names are unavailable.
    }

    return `${languageName} (${regionName})`;
  }

  function populateLanguages() {
    allVoices = getAvailableVoices();
    if (allVoices.length === 0) return;

    const langs = [...new Set(allVoices.map((v) => v.lang))].sort();
    const languageNameCounts = new Map();
    langs.forEach((lang) => {
      const name = getLanguageName(lang);
      languageNameCounts.set(name, (languageNameCounts.get(name) || 0) + 1);
    });
    langSelect.innerHTML = "";

    langs.forEach((lang) => {
      const option = document.createElement("option");
      option.value = lang;
      const languageName = getLanguageName(lang);
      option.textContent = getLanguageLabel(
        lang,
        languageNameCounts.get(languageName) > 1,
      );
      langSelect.appendChild(option);
    });

    chrome.storage.local.get(
      [
        "ttsLang",
        "ttsVoice",
        "ttsPitch",
        "ttsRate",
        "ttsAutoSpeed",
        "ttsPauseSync",
        "ttsMinWords",
      ],
      (res) => {
        if (res.ttsLang && langs.includes(res.ttsLang)) {
          langSelect.value = res.ttsLang;
        } else {
          const trLang = langs.find((l) => l.includes("tr"));
          if (trLang) langSelect.value = trLang;
        }

        populateVoices(res.ttsVoice);

        if (res.ttsPitch) {
          pitchSlider.value = res.ttsPitch;
          updateLabels();
        }
        if (res.ttsRate) {
          rateSlider.value = res.ttsRate;
          updateLabels();
        }
        if (res.ttsAutoSpeed !== undefined) {
          autoSpeedCheck.checked = res.ttsAutoSpeed;
          toggleAutoMode();
        }
        if (res.ttsPauseSync !== undefined) {
          pauseSyncCheck.checked = res.ttsPauseSync; // YENİ
        }
        if (res.ttsMinWords !== undefined) {
          minWordsSelect.value = String(res.ttsMinWords);
        }
      },
    );
  }

  function populateVoices(savedVoiceURI = null) {
    const selectedLang = langSelect.value;
    const filteredVoices = allVoices.filter((v) => v.lang === selectedLang);

    voiceSelect.innerHTML = "";
    voiceSelect.disabled = filteredVoices.length === 0;

    if (filteredVoices.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Kullanılabilir ses bulunamadı";
      voiceSelect.appendChild(option);
      return;
    }

    filteredVoices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.voiceURI;
      let label = voice.name;
      // "Natural" ve "Online" kelimeleri insansı sesleri belirtir (Özellikle Edge'de)
      if (voice.name.includes("Natural") || voice.name.includes("Online")) {
        label = "✨ " + label + " (Yüksek Kalite)";
      }
      option.textContent = label;
      voiceSelect.appendChild(option);
    });

    if (
      savedVoiceURI &&
      filteredVoices.some((v) => v.voiceURI === savedVoiceURI)
    ) {
      voiceSelect.value = savedVoiceURI;
    } else {
      // Varsayılan olarak en kaliteli "Natural" sesi bulmaya çalış, yoksa Emel'i, yoksa ilkini seç
      const bestVoice =
        filteredVoices.find(
          (v) => v.name.includes("Natural") || v.name.includes("Online"),
        ) ||
        filteredVoices.find((v) => v.name.includes("Emel")) ||
        filteredVoices[0];
      if (bestVoice) voiceSelect.value = bestVoice.voiceURI;
    }
  }

  function updateLabels() {
    pitchValue.textContent = parseFloat(pitchSlider.value).toFixed(1);
    rateValue.textContent = parseFloat(rateSlider.value).toFixed(2) + "x";
  }

  function toggleAutoMode() {
    if (autoSpeedCheck.checked) {
      rateSlider.disabled = true;
      rateLabel.textContent = "Manuel Hız (Kapalı):";
      rateValue.style.opacity = "0.5";
    } else {
      rateSlider.disabled = false;
      rateLabel.textContent = "Manuel Hız:";
      rateValue.style.opacity = "1";
    }
  }

  testBtn.addEventListener("click", () => {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      "Şu anki ses ve hız ayarlarımı test ediyorsunuz.",
    );
    const selectedVoice = allVoices.find(
      (v) => v.voiceURI === voiceSelect.value,
    );
    if (selectedVoice) utter.voice = selectedVoice;

    utter.pitch = parseFloat(pitchSlider.value);
    utter.rate = autoSpeedCheck.checked ? 1.0 : parseFloat(rateSlider.value);
    speechSynthesis.speak(utter);
  });

  function saveSettings() {
    const settings = {
      ttsLang: langSelect.value,
      ttsVoice: voiceSelect.value,
      ttsPitch: parseFloat(pitchSlider.value),
      ttsRate: parseFloat(rateSlider.value),
      ttsAutoSpeed: autoSpeedCheck.checked,
      ttsPauseSync: pauseSyncCheck.checked, // YENİ
      ttsMinWords: parseInt(minWordsSelect.value, 10),
    };
    chrome.storage.local.set(settings);

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0])
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateSettings",
          settings,
        });
    });
  }

  langSelect.addEventListener("change", () => {
    populateVoices();
    saveSettings();
  });
  voiceSelect.addEventListener("change", saveSettings);
  pitchSlider.addEventListener("input", updateLabels);
  pitchSlider.addEventListener("change", saveSettings);
  rateSlider.addEventListener("input", updateLabels);
  rateSlider.addEventListener("change", saveSettings);
  autoSpeedCheck.addEventListener("change", () => {
    toggleAutoMode();
    saveSettings();
  });
  pauseSyncCheck.addEventListener("change", saveSettings); // YENİ
  minWordsSelect.addEventListener("change", saveSettings);

  if (typeof speechSynthesis.addEventListener === "function") {
    speechSynthesis.addEventListener("voiceschanged", populateLanguages);
  } else if ("onvoiceschanged" in speechSynthesis) {
    speechSynthesis.onvoiceschanged = populateLanguages;
  }
  populateLanguages();
});
