"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import styles from "./pesticide-detail.module.css";

type Product = {
  crop: string | null;
  pest: string | null;
  registration_number: string | null;
  registration_date: string | null;
  product_name: string | null;
  brand_name: string | null;
  active_ingredient: string | null;
  ingredient_content: string | null;
  mode_of_action: string | null;
  use_type: string | null;
  formulation: string | null;
  method: string | null;
  dilution: string | null;
  amount: string | null;
  use_timing: string | null;
  safety_timing: string | null;
  use_count: string | null;
  harvest_interval_days: string | null;
  human_toxicity: string | null;
  fish_toxicity: string | null;
  company: string | null;
  registration_status: string;
};

type ProductPassport = {
  found: boolean;
  registration_number: string;
  matched_registration_rows?: number;
  product: Product | null;
  applications: Product[];
  image: {
    official_url: string | null;
    status: string;
    visual_type: string;
    notice: string;
  };
  source: {
    mode: string;
    date?: string | null;
    file: string | null;
    search_url: string;
  };
  caution: string;
};

// 공개 브라우저는 현재 도메인의 Next.js /api 프록시만 사용합니다.
const API = "";

function value(input: string | null | undefined) {
  return input?.trim() || "자료 없음";
}

function visualHue(seed: string) {
  return [...seed].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 270 + 18;
}

export default function PesticideDetailPage() {
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [data, setData] = useState<ProductPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const number = new URLSearchParams(window.location.search).get("registration_number")?.trim() ?? "";
    setRegistrationNumber(number);
    if (!number) {
      setError("등록번호가 전달되지 않았습니다.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetch(`${API}/api/pesticides/registered/${encodeURIComponent(number)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`등록정보 API 오류 (${response.status})`);
        return (await response.json()) as ProductPassport;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "등록정보를 읽지 못했습니다.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const product = data?.product;
  const hue = useMemo(
    () => visualHue(product?.mode_of_action || product?.brand_name || registrationNumber),
    [product, registrationNumber],
  );
  const visualStyle = { "--passport-hue": hue } as CSSProperties;

  if (loading) return <main className={styles.state}>공식 등록정보를 대조하고 있습니다.</main>;
  if (error || !data?.found || !product) {
    return <main className={styles.state}><strong>제품여권을 열 수 없습니다.</strong><p>{error || data?.caution}</p></main>;
  }

  return (
    <main className={styles.page} style={visualStyle}>
      <header className={styles.topbar}>
        <div><span>SYMBIOSIS AI · OFFICIAL REGISTRATION PASSPORT</span><strong>농약 디지털 제품여권</strong></div>
        <nav aria-label="제품여권 도구">
          <button onClick={() => window.print()} type="button">인쇄</button>
          <button onClick={() => window.close()} type="button">창 닫기</button>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.visualColumn}>
          <div className={styles.scanField} aria-label={data.image.notice}>
            <i className={styles.scanRing} aria-hidden="true" />
            {data.image.official_url ? (
              // Official URLs are rendered only when the upstream source explicitly supplies one.
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={`${value(product.brand_name)} 공식 제품`} className={styles.officialImage} src={data.image.official_url} />
            ) : (
              <div className={styles.digitalPack} aria-hidden="true">
                <div className={styles.packCap} />
                <div className={styles.packBody}>
                  <i className={styles.packageSeal}>AI REGISTRATION SCAN</i>
                  <span>{value(product.use_type)}</span>
                  <b>{value(product.brand_name)}</b>
                  <small>{value(product.product_name)}</small>
                  <em>MOA {value(product.mode_of_action)}</em>
                </div>
              </div>
            )}
            <div className={styles.orbitLabel}><span>등록 검증</span><b>{data.registration_number}</b></div>
          </div>
          <p className={styles.imageNotice}><b>{data.image.status}</b>{data.image.notice}</p>
        </div>

        <div className={styles.heroCopy}>
          <span className={styles.kicker}>REGISTERED PRODUCT IDENTITY</span>
          <h1>{value(product.brand_name)}</h1>
          <p>{value(product.product_name)} · {value(product.formulation)}</p>
          <div className={styles.signalRow}>
            <div><span>용도</span><b>{value(product.use_type)}</b></div>
            <div><span>작용기작</span><b>{value(product.mode_of_action)}</b></div>
            <div><span>등록상태</span><b>{value(product.registration_status)}</b></div>
          </div>
          <div className={styles.identityGrid}>
            <div><span>유효성분</span><strong>{value(product.active_ingredient)}</strong><small>{value(product.ingredient_content)}</small></div>
            <div><span>회사</span><strong>{value(product.company)}</strong><small>등록일 {value(product.registration_date)}</small></div>
          </div>
        </div>
      </section>

      <section className={styles.commandDeck}>
        <header><span>FIELD USE COMMAND DECK</span><h2>현장 사용규정</h2><p>숫자와 문구를 임의 보완하지 않은 공식 원본 값입니다.</p></header>
        <div className={styles.commandGrid}>
          <article><span>01</span><small>사용방법</small><strong>{value(product.method)}</strong></article>
          <article><span>02</span><small>희석·사용량</small><strong>{value(product.dilution)}</strong><b>{value(product.amount)}</b></article>
          <article><span>03</span><small>사용적기</small><strong>{value(product.use_timing)}</strong></article>
          <article className={styles.stopCard}><span>STOP</span><small>안전사용 기준</small><strong>{value(product.safety_timing)}</strong><b>{value(product.use_count)}</b></article>
        </div>
      </section>

      <section className={styles.applicationSection}>
        <header><span>REGISTERED APPLICATION MATRIX</span><h2>작물·병해충 적용 등록행</h2><b>{data.matched_registration_rows ?? data.applications.length}행 대조</b></header>
        <div className={styles.applicationGrid}>
          {data.applications.map((application, index) => (
            <article key={`${application.crop}-${application.pest}-${application.method}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><small>작물</small><strong>{value(application.crop)}</strong></div>
              <div><small>적용 병해충</small><strong>{value(application.pest)}</strong></div>
              <div><small>사용적기</small><strong>{value(application.use_timing)}</strong></div>
              <div><small>희석·사용량</small><strong>{value(application.dilution)} · {value(application.amount)}</strong></div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.safetySection}>
        <div><span>인축독성</span><strong>{value(product.human_toxicity)}</strong></div>
        <div><span>어독성</span><strong>{value(product.fish_toxicity)}</strong></div>
        <div><span>수확 전 일수</span><strong>{value(product.harvest_interval_days)}</strong></div>
      </section>

      <footer className={styles.footer}>
        <div><b>근거</b><span>{data.source.mode} · {value(data.source.date)} · {value(data.source.file)}</span></div>
        <p>{data.caution}</p>
        <a href={data.source.search_url} rel="noreferrer" target="_blank">농약안전정보시스템에서 최신 등록 재확인 ↗</a>
      </footer>
    </main>
  );
}
