"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import styles from "./field-scan-lab.module.css";
import { downloadTextFile } from "./browser-actions";

type Props = {
  crop: string;
  pest: string;
  region: string;
};

type ScanDomain = "crop" | "livestock";

type Quality = {
  width: number;
  height: number;
  megapixels: number;
  brightness: number;
  contrast: number;
  edgeSignal: number;
  resolutionPass: boolean;
  brightnessPass: boolean;
  contrastPass: boolean;
  focusPass: boolean;
  grade: "재촬영" | "검토 가능" | "양호";
};

const cropSigns = [
  "잎 변색·반점", "잎 구멍·굴", "해충·알·군집", "생육 정지·시듦", "줄기·뿌리 이상", "끈적임·그을음",
];

const livestockSigns = [
  "활동량 감소", "보행·절뚝거림", "체표 상처·부종", "사료·음수 변화", "호흡 이상", "분변·분비물 변화",
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

async function inspectImage(file: File): Promise<Quality> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const target = new Image();
      target.onload = () => resolve(target);
      target.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
      target.src = url;
    });
    const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("브라우저가 이미지 품질 검사를 지원하지 않습니다.");
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const luminance = new Float32Array(width * height);
    let total = 0;
    for (let index = 0, point = 0; index < pixels.length; index += 4, point += 1) {
      const value = .2126 * pixels[index] + .7152 * pixels[index + 1] + .0722 * pixels[index + 2];
      luminance[point] = value;
      total += value;
    }
    const brightness = total / luminance.length;
    let variance = 0;
    let edgeTotal = 0;
    let edgeCount = 0;
    for (let y = 1; y < height; y += 1) {
      for (let x = 1; x < width; x += 1) {
        const index = y * width + x;
        const delta = Math.abs(luminance[index] - luminance[index - 1]) + Math.abs(luminance[index] - luminance[index - width]);
        edgeTotal += delta / 2;
        edgeCount += 1;
        variance += (luminance[index] - brightness) ** 2;
      }
    }
    const contrast = Math.sqrt(variance / Math.max(1, luminance.length - 1));
    const edgeSignal = edgeTotal / Math.max(1, edgeCount);
    const megapixels = image.naturalWidth * image.naturalHeight / 1_000_000;
    const resolutionPass = megapixels >= .9;
    const brightnessPass = brightness >= 45 && brightness <= 215;
    const contrastPass = contrast >= 24;
    const focusPass = edgeSignal >= 10;
    const passed = [resolutionPass, brightnessPass, contrastPass, focusPass].filter(Boolean).length;
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      megapixels: Number(megapixels.toFixed(2)),
      brightness: Number(brightness.toFixed(1)),
      contrast: Number(contrast.toFixed(1)),
      edgeSignal: Number(edgeSignal.toFixed(1)),
      resolutionPass,
      brightnessPass,
      contrastPass,
      focusPass,
      grade: passed === 4 ? "양호" : passed >= 3 ? "검토 가능" : "재촬영",
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function anonymousSiteKey(region: string, alias: string) {
  if (!alias.trim()) return null;
  const bytes = new TextEncoder().encode(`symbiosis-site-v1|${region.trim()}|${alias.trim()}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `SITE-${Array.from(new Uint8Array(digest)).slice(0, 10).map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export default function FieldScanLab({ crop, pest, region }: Props) {
  const [domain, setDomain] = useState<ScanDomain>("crop");
  const [preview, setPreview] = useState("");
  const [quality, setQuality] = useState<Quality | null>(null);
  const [selectedSigns, setSelectedSigns] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [packetId, setPacketId] = useState("");
  const [siteAlias, setSiteAlias] = useState("");

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const signs = domain === "crop" ? cropSigns : livestockSigns;
  const action = useMemo(() => {
    if (!quality) return { level: "대기", message: "사진을 선택하면 촬영 품질부터 검사합니다." };
    if (quality.grade === "재촬영") return { level: "재촬영", message: "진단이 아니라 증거 품질 게이트입니다. 밝은 곳에서 대상을 더 가까이 다시 촬영하세요." };
    if (selectedSigns.length) return { level: "전문가 검토", message: "관찰 신호가 기록되었습니다. 확진으로 단정하지 말고 전문가 검토와 현장 시료 확인으로 넘기세요." };
    return { level: "정기 관찰", message: "선택한 이상 신호가 없습니다. 발생하지 않음으로 단정하지 말고 같은 위치를 정기적으로 다시 관찰하세요." };
  }, [quality, selectedSigns]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setQuality(null);
    setError("");
    setBusy(true);
    try {
      setQuality(await inspectImage(file));
      setPacketId(globalThis.crypto?.randomUUID?.() ?? `OBS-${Date.now()}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "이미지 품질 검사에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const changeDomain = (next: ScanDomain) => {
    setDomain(next);
    setSelectedSigns([]);
  };

  const toggleSign = (sign: string) => {
    setSelectedSigns((current) => current.includes(sign) ? current.filter((item) => item !== sign) : [...current, sign]);
  };

  const downloadPacket = async () => {
    if (!quality) return;
    const siteKey = await anonymousSiteKey(region, siteAlias);
    const packet = {
      schema: "symbiosis-field-observation-v1",
      packet_id: packetId,
      created_at: new Date().toISOString(),
      domain: domain === "crop" ? "작물" : "축산",
      selected_context: {
        region,
        crop: domain === "crop" ? crop : null,
        pest: domain === "crop" ? pest : null,
        anonymous_site_key: siteKey,
        raw_site_alias_included: false,
      },
      image_policy: { uploaded_to_server: false, image_included_in_packet: false, diagnostic_ai_executed: false },
      quality,
      observed_signs: selectedSigns,
      triage: action,
      caution: "이 패킷은 현장 관찰과 촬영 품질 기록이며 질병·병해충 확진 또는 발생확률이 아닙니다.",
    };
    downloadTextFile(
      [JSON.stringify(packet, null, 2)],
      `공생AI_현장관찰_${packetId}.json`,
      "application/json;charset=utf-8",
    );
    setDownloadComplete(true);
    window.setTimeout(() => setDownloadComplete(false), 2500);
  };

  const qualityItems = quality ? [
    { label: "해상도", value: `${quality.megapixels}MP`, pass: quality.resolutionPass },
    { label: "밝기", value: quality.brightness, pass: quality.brightnessPass },
    { label: "대비", value: quality.contrast, pass: quality.contrastPass },
    { label: "윤곽", value: quality.edgeSignal, pass: quality.focusPass },
  ] : [];

  return (
    <section className={styles.section} id="field-scan-lab" aria-labelledby="field-scan-title">
      <header className={styles.header}>
        <div className={styles.index}>07</div>
        <div>
          <p>PRIVACY-FIRST FIELD OBSERVATION</p>
          <h2 id="field-scan-title">현장을 찍고, 확진 전에 근거를 정렬합니다.</h2>
        </div>
        <p>사진 AI가 병명을 꾸며내지 않습니다. 촬영 품질·관찰 신호·검토 경로를 한 번에 묶어 전문가에게 넘기는 현장 증거 캡슐입니다.</p>
      </header>

      <div className={styles.console}>
        <aside className={styles.domainRail}>
          <button className={domain === "crop" ? styles.active : ""} onClick={() => changeDomain("crop")} type="button"><span>01</span><strong>작물 스캔</strong><small>잎·줄기·뿌리 관찰</small></button>
          <button className={domain === "livestock" ? styles.active : ""} onClick={() => changeDomain("livestock")} type="button"><span>02</span><strong>축산 관찰</strong><small>행동·보행·체표 관찰</small></button>
          <div className={styles.privacySeal}><i aria-hidden="true" /><strong>LOCAL ONLY</strong><span>사진 서버 전송 0</span></div>
        </aside>

        <div className={styles.capturePanel}>
          <div className={styles.captureHeading}><span>STEP 1 · CAPTURE</span><strong>{domain === "crop" ? `${crop || "작물"} · ${pest}` : "축산 개체 관찰"}</strong><small>{region || "전국"}</small></div>
          <label className={styles.siteAlias}><span>익명 현장키 만들기</span><input maxLength={40} onChange={(event) => setSiteAlias(event.target.value)} placeholder="예: 동쪽 1번 온실 (이름·주소 입력 금지)" value={siteAlias}/><small>별칭 원문은 저장하지 않고 지역과 함께 해시하여 반복 관찰을 연결합니다.</small></label>
          <label className={styles.captureTarget}>
            <input accept="image/*" capture="environment" onChange={handleFile} type="file" />
            {preview ? <img alt="선택한 현장 관찰 사진 미리보기" src={preview} /> : <div><span>＋</span><strong>카메라 또는 사진 선택</strong><small>대상을 화면 중앙에 크게 촬영하세요</small></div>}
            {busy ? <b>기기에서 품질 검사 중…</b> : null}
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <p className={styles.localNotice}>원본 사진은 이 브라우저 안에서만 미리 봅니다. 서버·보고서·관찰 패킷에는 사진 파일을 넣지 않습니다.</p>
        </div>

        <div className={styles.qualityPanel}>
          <div className={styles.scanCore} data-grade={quality?.grade ?? "대기"}>
            <div className={styles.radar}><i /><i /><i /><span>{quality?.grade ?? "대기"}</span></div>
            <strong>증거 품질 게이트</strong>
            <small>{quality ? `${quality.width}×${quality.height}` : "사진 입력 전"}</small>
          </div>
          <div className={styles.qualityGrid}>
            {qualityItems.length ? qualityItems.map((item) => (
              <div data-pass={item.pass ? "yes" : "no"} key={item.label}><span>{item.label}</span><strong>{item.value}</strong><i /></div>
            )) : <p>사진을 선택하면 해상도·밝기·대비·윤곽 신호를 색으로 표시합니다.</p>}
          </div>
        </div>

        <div className={styles.signPanel}>
          <div><span>STEP 2 · OBSERVE</span><strong>눈으로 확인한 신호만 선택</strong><small>병명이나 원인은 선택하지 않습니다.</small></div>
          <div className={styles.signGrid}>
            {signs.map((sign) => <button aria-pressed={selectedSigns.includes(sign)} className={selectedSigns.includes(sign) ? styles.selected : ""} key={sign} onClick={() => toggleSign(sign)} type="button"><i />{sign}</button>)}
          </div>
        </div>

        <div className={styles.packetPanel} data-level={action.level}>
          <div className={styles.packetSignal}><i /><span>STEP 3 · ROUTE</span><strong>{action.level}</strong></div>
          <p>{action.message}</p>
          <dl>
            <div><dt>패킷 ID</dt><dd>{packetId || "사진 입력 후 생성"}</dd></div>
            <div><dt>관찰 신호</dt><dd>{selectedSigns.length ? `${selectedSigns.length}개` : "선택 없음"}</dd></div>
            <div><dt>익명 현장키</dt><dd>{siteAlias.trim() ? "패킷 저장 시 생성" : "별칭 미입력"}</dd></div>
            <div><dt>확진 AI</dt><dd>실행 안 함</dd></div>
          </dl>
          <button disabled={!quality} onClick={downloadPacket} type="button">{downloadComplete ? "저장 요청 완료" : "전문가 검토용 JSON 저장"}</button>
        </div>
      </div>
    </section>
  );
}
