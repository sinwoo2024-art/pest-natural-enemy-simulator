import os
import requests
import pandas as pd
import re
import time

API_KEY = os.environ.get("DATA_GO_KR_KEY", "").strip()
if not API_KEY:
    raise RuntimeError("DATA_GO_KR_KEY 환경변수가 설정되지 않았습니다.")
URL = "http://ncpms.rda.go.kr/npmsAPI/service"

# 1. SVC51 전체 목록 수집
all_surveys = []

for start_point in [1, 51]:
    params = {
        "apiKey": API_KEY,
        "serviceCode": "SVC51",
        "serviceType": "AA003",
        "searchExaminYear": "2024",
        "displayCount": "50",
        "startPoint": str(start_point)
    }

    response = requests.get(
    URL,
    params=params,
    timeout=20
)

    print("HTTP 상태:", response.status_code)
    print("응답 형식:", response.headers.get("content-type"))
    print("응답 내용:", response.text[:1500])
   

data = response.json()
items = data.get("service", {}).get("list", [])

all_surveys.extend(items)

print("SVC51 수집 개수:", len(all_surveys))


# 2. SVC52 상세조회
detail_results = []

for i, survey in enumerate(all_surveys, start=1):

    insect_key = survey.get("insectKey")

    if not insect_key:
        continue

    params = {
        "apiKey": API_KEY,
        "serviceCode": "SVC52",
        "serviceType": "AA003",
        "insectKey": insect_key
    }

    try:
        response = requests.get(
            URL,
            params=params,
            timeout=20
        )

        data = response.json()

        raw = data.get("service", {}).get("list", "")

        if not isinstance(raw, str):
            continue

        items = re.findall(r"\{([^{}]+)\}", raw)

        for item in items:

            pest = re.search(r"dbyhsNm=([^,]+)", item)
            region = re.search(r"sidoNm=([^,]+)", item)
            value = re.search(r"inqireValue=([^,]+)", item)

            if not (pest and region and value):
                continue

            pest_name = pest.group(1).strip()
            region_name = region.group(1).strip()

            try:
                value_num = float(
                    value.group(1).strip()
                )
            except ValueError:
                continue

            detail_results.append({
                "insectKey": insect_key,
                "작물": survey.get("kncrNm"),
                "조사구분": survey.get("examinSpchcknNm"),
                "예찰구분": survey.get("predictnSpchcknNm"),
                "조사연도": survey.get("examinYear"),
                "조사회차": survey.get("examinTmrd"),
                "병해충": pest_name,
                "지역": region_name,
                "발생값": value_num
            })

        print(
            f"{i}/{len(all_surveys)} 완료",
            insect_key
        )

        time.sleep(0.1)

    except Exception as e:
        print(
            "오류:",
            insect_key,
            e
        )


# 3. CSV 저장
df = pd.DataFrame(detail_results)

df.to_csv(
    "ncpms_SVC52_2024.csv",
    index=False,
    encoding="utf-8-sig"
)

print("======================")
print("상세 데이터 개수:", len(df))
print("병해충 종류 수:", df["병해충"].nunique() if not df.empty else 0)
print("지역 종류 수:", df["지역"].nunique() if not df.empty else 0)
print("======================")
print("저장 완료: ncpms_SVC52_2024.csv")
