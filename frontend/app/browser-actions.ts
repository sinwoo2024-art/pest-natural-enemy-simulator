"use client";

type SpeechCallbacks = {
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};

let activeUtterance: SpeechSynthesisUtterance | null = null;

function speechErrorMessage(error?: string) {
  if (error === "not-allowed") return "브라우저에서 음성 재생 권한이 차단되었습니다.";
  if (error === "language-unavailable" || error === "voice-unavailable") {
    return "이 기기에 사용할 수 있는 음성 엔진이 없습니다.";
  }
  return "음성을 재생하지 못했습니다. 기기 음량과 브라우저 음성 설정을 확인하세요.";
}

export function primeSpeechSynthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  // Chromium 계열은 첫 호출 전에 음성 목록을 한 번 읽어야 지연 없이 준비되는 경우가 있습니다.
  window.speechSynthesis.getVoices();
  return true;
}

export function stopSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  activeUtterance = null;
}

export function speakKorean(text: string, callbacks: SpeechCallbacks = {}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    callbacks.onError?.("이 브라우저는 음성 읽기를 지원하지 않습니다.");
    return false;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    callbacks.onError?.("읽을 내용이 없습니다.");
    return false;
  }

  const synthesis = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(normalized);
  const voices = synthesis.getVoices();
  const koreanVoice = voices.find((voice) => voice.lang.toLowerCase() === "ko-kr")
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("ko"));

  utterance.lang = koreanVoice?.lang ?? "ko-KR";
  if (koreanVoice) utterance.voice = koreanVoice;
  utterance.rate = callbacks.rate ?? 0.92;
  utterance.pitch = callbacks.pitch ?? 1;
  utterance.onstart = () => {
    if (activeUtterance === utterance) callbacks.onStart?.();
  };
  utterance.onend = () => {
    if (activeUtterance !== utterance) return;
    activeUtterance = null;
    callbacks.onEnd?.();
  };
  utterance.onerror = (event) => {
    // 새 문장을 시작하며 이전 문장을 cancel한 경우의 오류는 사용자에게 표시하지 않습니다.
    if (activeUtterance !== utterance || event.error === "canceled" || event.error === "interrupted") return;
    activeUtterance = null;
    callbacks.onError?.(speechErrorMessage(event.error));
  };

  const replacingActiveSpeech = synthesis.speaking || synthesis.pending || synthesis.paused;
  if (replacingActiveSpeech) synthesis.cancel();
  activeUtterance = utterance;
  if (synthesis.paused) synthesis.resume();

  const start = () => {
    if (activeUtterance !== utterance) return;
    synthesis.speak(utterance);
    if (synthesis.paused) synthesis.resume();
  };

  // 첫 클릭은 사용자 제스처 안에서 즉시 실행하고, 재생 교체 때만 cancel 경쟁을 피합니다.
  if (replacingActiveSpeech) queueMicrotask(start);
  else start();
  return true;
}

export function downloadTextFile(contents: BlobPart[], filename: string, mimeType: string) {
  if (typeof document === "undefined") return false;
  const blob = new Blob(contents, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 모바일 브라우저가 다운로드를 넘겨받기 전에 URL이 폐기되지 않도록 잠시 유지합니다.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

export function openAppPage(url: string) {
  if (typeof window === "undefined") return false;
  const opened = window.open(url, "_blank");
  if (opened) {
    opened.opener = null;
    return true;
  }
  // 팝업 차단 환경에서도 버튼이 무반응으로 끝나지 않게 현재 탭으로 엽니다.
  window.location.assign(url);
  return false;
}
