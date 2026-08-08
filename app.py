import streamlit as st
import pandas as pd

pest_df=pd.read_excel("병해충_천적DB.xlsx",sheet_name="병해충",header=1)

enemy_df = pd.read_excel(
    "병해충_천적DB.xlsx",
    sheet_name="천적곤충",
    header=1
)

if "page" not in st.session_state:
    st.session_state.page = 0

if "selected_pest" not in st.session_state:
    st.session_state.selected_pest = None

# 페이지 상태 초기화
if "page" not in st.session_state:
    st.session_state.selected_pest=None

# 1페이지: 표지
if st.session_state.page == 0:
    st.title("🌿 AI 기반 천적곤충 활용 병해충 대응 시뮬레이터")
    st.caption("자연이 키운 수호자 · 공생의 알고리즘 AI")
    st.divider()

    st.markdown("""
    ### 🌱 프로젝트 소개

    AI가 병해충과 작물 정보를 분석하여

    **가장 적합한 천적곤충을 추천하는 시뮬레이터입니다.**
    """)

    if st.button("🚀 시뮬레이션 시작", use_container_width=True):
        st.session_state.page = 1
        st.rerun()


# 2페이지: 병해충 선택
elif st.session_state.page == 1:
    st.subheader("🔍 병해충 선택")

    selected_pest = st.selectbox(
        "병해충을 선택하세요.",
        pest_df["병해충명"].dropna().tolist(),
        key="selected_pest_widget"
    )

    st.write("선택한 병해충 :", selected_pest)

    col1, col2 = st.columns(2)

    with col1:
        if st.button("⬅️ 표지로", use_container_width=True):
            st.session_state.page = 0
            st.rerun()

    with col2:
        if st.button("다음 단계 ➡️", use_container_width=True):
            st.session_state.selected_pest = selected_pest
            st.session_state.page = 2
            st.rerun()


# 3페이지: 병해충 정보
elif st.session_state.page == 2:
    st.subheader("🐞 추천 천적곤충")

    selected_name = (
        st.session_state.get("selected_pest")
        or st.session_state.get("selected_pest_widget")
        or ""
    )

    selected_name = str(selected_name).replace(" ", "").strip()

    enemy_clean = enemy_df.copy()

    enemy_clean["대상병해충_정리"] = (
        enemy_clean["대상병해충"]
        .fillna("")
        .astype(str)
        .str.replace(r"\s+", "", regex=True)
    )

    enemy_clean["천적곤충명_정리"] = (
        enemy_clean["천적곤충명"]
        .fillna("")
        .astype(str)
        .str.replace(r"\s+", "", regex=True)
    )

    if selected_name == "대만총채벌레":
        recommended_enemy = enemy_clean[
            enemy_clean["천적곤충명_정리"].str.contains(
                "애꽃노린재",
                na=False
            )
        ]
    else:
        recommended_enemy = enemy_clean[
            enemy_clean["대상병해충_정리"] == selected_name
        ]

    if recommended_enemy.empty:
        st.warning("이 병해충에 연결된 천적곤충 정보가 없습니다.")
    else:
        st.dataframe(
            recommended_enemy[
                ["천적곤충명", "학명", "천적유형", "활용방법"]
            ],
            hide_index=True,
            use_container_width=True
        )

    if st.button("⬅️ 병해충 선택으로", use_container_width=True):
        st.session_state.page = 1
        st.rerun()