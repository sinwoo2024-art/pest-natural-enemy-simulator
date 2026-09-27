import json
import unittest

from fastapi.testclient import TestClient

try:
    from .main import (
        FULL_PEST_CATALOG,
        MANAGEMENT_GUIDES,
        OBSERVATIONS_BY_YEAR,
        REGION_UNIVERSE,
        _forecast_data,
        app,
        clean_name,
        normalized_rows,
        pest_profile,
        recommendations,
    )
except ImportError:
    from main import (
        FULL_PEST_CATALOG,
        MANAGEMENT_GUIDES,
        OBSERVATIONS_BY_YEAR,
        REGION_UNIVERSE,
        _forecast_data,
        app,
        clean_name,
        normalized_rows,
        pest_profile,
        recommendations,
    )


class ApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_health(self) -> None:
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_kiln_status_is_separate_from_existing_health(self) -> None:
        from unittest.mock import patch
        with patch.dict("os.environ", {}, clear=True):
            response = self.client.get("/api/kiln/status")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["code"], "KILN_NOT_CONFIGURED")
        self.assertFalse(response.json()["callable"])
        self.assertEqual(self.client.get("/api/health").json(), {"status": "ok"})

    def test_summary_uses_each_year_csv(self) -> None:
        expected = {
            2024: {"observations": 5721, "crops": 8, "regions": 14},
            2026: {"observations": 12698, "crops": 14, "regions": 15},
        }

        for year, counts in expected.items():
            with self.subTest(year=year):
                response = self.client.get("/api/summary", params={"year": year})
                payload = response.json()

                self.assertEqual(response.status_code, 200)
                self.assertEqual(payload["year"], year)
                for key, value in counts.items():
                    self.assertEqual(payload[key], value)
                self.assertIn("pest_categories", payload)
                self.assertGreater(payload["total_evidence_rows"], 1000000)
                self.assertEqual(payload["source_years"], [2024, 2025, 2026])
                self.assertGreater(payload["common_three_year_units"], 0)
                self.assertGreater(payload["backtest_mae_2026"], 0)

    def test_options_always_returns_the_full_catalog(self) -> None:
        baseline = self.client.get("/api/options", params={"year": 2026})
        filtered = self.client.get(
            "/api/options",
            params={
                "year": 2026,
                "crop": "존재하지않는작물",
                "pest": "존재하지않는병해충",
            },
        )

        self.assertEqual(baseline.status_code, 200)
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(set(baseline.json()["pests"]), FULL_PEST_CATALOG)
        self.assertEqual(filtered.json()["pests"], baseline.json()["pests"])
        self.assertGreater(len(baseline.json()["pests"]), 5)

        grouped_items = [
            pest
            for group in filtered.json()["pest_groups"]
            for pest in group["items"]
        ]
        self.assertEqual(set(grouped_items), FULL_PEST_CATALOG)
        self.assertEqual(len(grouped_items), len(FULL_PEST_CATALOG))

    def test_options_only_filters_regions(self) -> None:
        source = OBSERVATIONS_BY_YEAR[2026]
        sample = source.iloc[0]
        crop = str(sample["작물"])
        pest = clean_name(sample["병해충"])
        expected_regions = sorted(
            source[
                (source["작물"] == crop)
                & (source["병해충기본명"] == pest)
            ]["지역"].dropna().unique().tolist()
        )

        response = self.client.get(
            "/api/options",
            params={"year": 2026, "crop": crop, "pest": pest},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["regions"], expected_regions)
        self.assertEqual(set(response.json()["pests"]), FULL_PEST_CATALOG)

    def test_options_prioritizes_pests_observed_in_both_years(self) -> None:
        expected = (
            set(OBSERVATIONS_BY_YEAR[2024]["병해충기본명"])
            & set(OBSERVATIONS_BY_YEAR[2026]["병해충기본명"])
        )
        response = self.client.get("/api/options")
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(payload["comparable_pests"]), expected)
        self.assertEqual(payload["pest_years"]["벼물바구미"], [2024, 2025, 2026])
        self.assertEqual(payload["pest_years"]["담배거세미나방"], [2025, 2026])
        self.assertIn("발생값 0", payload["comparison_priority_rule"])

        crop = "논벼"
        crop_expected = (
            set(
                OBSERVATIONS_BY_YEAR[2024].loc[
                    OBSERVATIONS_BY_YEAR[2024]["작물"] == crop,
                    "병해충기본명",
                ]
            )
            & set(
                OBSERVATIONS_BY_YEAR[2026].loc[
                    OBSERVATIONS_BY_YEAR[2026]["작물"] == crop,
                    "병해충기본명",
                ]
            )
        )
        crop_response = self.client.get("/api/options", params={"crop": crop})
        self.assertEqual(
            set(crop_response.json()["comparable_pests"]),
            crop_expected,
        )

    def test_every_catalog_item_has_a_response_route(self) -> None:
        uncovered: list[str] = []
        for pest in sorted(FULL_PEST_CATALOG):
            profile = pest_profile(pest)
            category = str(profile["분류"])
            is_enemy_target = str(profile["천적추천대상"]).upper() == "Y"

            if is_enemy_target:
                if not recommendations(pest):
                    escaped = pest.encode("unicode_escape").decode("ascii")
                    uncovered.append(f"{escaped}: 천적 추천 없음")
            elif category in MANAGEMENT_GUIDES:
                if not profile.get("관리단계"):
                    uncovered.append(f"{pest}: {category} 관리단계 없음")
            elif not str(profile.get("관리안내", "")).strip():
                uncovered.append(f"{pest}: 기본 관리안내 없음")

        self.assertEqual(uncovered, [])

        black_spot = pest_profile("검은별무늬병")
        self.assertEqual(black_spot["분류"], "병해")
        self.assertEqual(str(black_spot["천적추천대상"]).upper(), "N")
        self.assertTrue(black_spot["관리단계"])

    def test_region_risk_comparison_uses_the_full_region_universe(self) -> None:
        pests_2024 = set(OBSERVATIONS_BY_YEAR[2024]["병해충기본명"])
        pests_2026 = set(OBSERVATIONS_BY_YEAR[2026]["병해충기본명"])
        pest = sorted(pests_2024 & pests_2026)[0]

        response = self.client.get(
            "/api/region-risk-comparison",
            params={"pest": pest},
        )
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["years"], [2024, 2026])
        self.assertEqual(
            [item["name"] for item in payload["regions"]],
            REGION_UNIVERSE,
        )
        self.assertEqual(len(payload["regions"]), 15)

        for item in payload["regions"]:
            for year in (2024, 2026):
                score = item[f"score_{year}"]
                observations = item[f"observations_{year}"]
                positive = item[f"positive_observations_{year}"]
                if score is None:
                    self.assertEqual(observations, 0)
                else:
                    self.assertGreaterEqual(score, 0)
                    self.assertLessEqual(score, 100)
                    self.assertGreater(observations, 0)
                self.assertGreaterEqual(positive, 0)
                self.assertLessEqual(positive, observations)

            if item["score_2024"] is None or item["score_2026"] is None:
                self.assertIsNone(item["delta"])
            else:
                self.assertEqual(
                    item["delta"],
                    item["score_2026"] - item["score_2024"],
                )

    def test_year_comparison_normalizes_before_selecting_region(self) -> None:
        source = OBSERVATIONS_BY_YEAR[2024]
        counts = source.groupby("병해충기본명")["지역"].nunique()
        pest = str(counts[counts > 1].index[0])
        frame = source[source["병해충기본명"] == pest].copy()
        work = normalized_rows(frame)
        expected_scores = (
            work.groupby("지역")["정규화값"].mean().mul(100).round().astype(int)
        )
        region = str(expected_scores.index[0])
        expected_frame = frame[frame["지역"] == region]

        response = self.client.get(
            "/api/year-comparison",
            params={"pest": pest, "region": region},
        )
        item = next(
            value
            for value in response.json()["year_comparison"]
            if value["year"] == 2024
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(item["region"], region)
        self.assertEqual(item["risk_score"], int(expected_scores.loc[region]))
        self.assertEqual(item["observations"], len(expected_frame))
        self.assertEqual(
            item["positive_observations"],
            int((expected_frame["발생값"] > 0).sum()),
        )

    def test_known_rice_water_weevil_comparison_values(self) -> None:
        params = {"pest": "벼물바구미", "crop": "논벼"}
        response = self.client.get("/api/region-risk-comparison", params=params)
        payload = response.json()
        regions = {item["name"]: item for item in payload["regions"]}

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            regions["충청남도"],
            {
                "name": "충청남도",
                "score_2024": 38,
                "score_2026": 1,
                "delta": -37,
                "observations_2024": 8,
                "observations_2026": 24,
                "positive_observations_2024": 8,
                "positive_observations_2026": 11,
            },
        )
        self.assertEqual(regions["부산광역시"]["score_2024"], 0)
        self.assertEqual(regions["부산광역시"]["score_2026"], 0)
        self.assertGreater(regions["부산광역시"]["observations_2024"], 0)
        self.assertGreater(regions["부산광역시"]["observations_2026"], 0)

        year_response = self.client.get(
            "/api/year-comparison",
            params={**params, "region": "충청남도"},
        )
        year_payload = year_response.json()
        items = {
            item["year"]: item
            for item in year_payload["year_comparison"]
        }

        self.assertEqual(year_response.status_code, 200)
        self.assertEqual(year_payload["comparison_delta"], -37)
        self.assertEqual(items[2024]["risk_score"], 38)
        self.assertEqual(items[2024]["observations"], 8)
        self.assertEqual(items[2024]["positive_observations"], 8)
        self.assertEqual(items[2026]["risk_score"], 1)
        self.assertEqual(items[2026]["observations"], 24)
        self.assertEqual(items[2026]["positive_observations"], 11)

    def test_stage20_2025_is_supported_and_unknown_year_is_rejected(self) -> None:
        supported = self.client.get("/api/summary", params={"year": 2025})
        self.assertEqual(supported.status_code, 200)
        self.assertEqual(supported.json()["year"], 2025)
        self.assertGreater(supported.json()["observations"], 0)

        response = self.client.get("/api/summary", params={"year": 2023})

        self.assertEqual(response.status_code, 400)
        self.assertIn("지원하지 않는 연도", response.json()["detail"])

    def test_simulate_uses_the_requested_year_in_empty_message(self) -> None:
        response = self.client.get(
            "/api/simulate",
            params={"year": 2024, "pest": "존재하지않는병해충"},
        )
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertFalse(payload["has_observation"])
        self.assertIn("2024년", payload["message"])

    def test_forecast_csv_has_the_required_schema_and_bounds(self) -> None:
        frame = _forecast_data()
        self.assertTrue(
            set(
                [
                "작물", "병해충", "유형", "지역", "위험도_2024", "위험도_2026",
                "전망위험도_2027", "추세", "신뢰도", "관측수", "근거연도",
                "전망근거", "대응유형",
                ]
            ).issubset(frame.columns),
        )
        scores = frame["전망위험도_2027"].dropna()
        self.assertGreater(len(scores), 0)
        self.assertTrue(scores.between(0, 100).all())
        self.assertTrue(set(frame["신뢰도"]).issubset({"높음", "보통", "낮음"}))
        self.assertGreater(int(frame["전망위험도_2027"].isna().sum()), 0)

    def test_forecast_known_two_year_and_actual_zero_cases(self) -> None:
        comparable = self.client.get(
            "/api/forecast/2027",
            params={"pest": "벼물바구미", "crop": "논벼", "region": "충청남도"},
        )
        payload = comparable.json()
        self.assertEqual(comparable.status_code, 200)
        self.assertTrue(payload["has_forecast"])
        self.assertIsNotNone(payload["score_2024"])
        self.assertIsNotNone(payload["score_2025"])
        self.assertIsNotNone(payload["score_2026"])
        self.assertTrue(all(0 <= payload[key] <= 100 for key in ("score_2024", "score_2025", "score_2026")))
        self.assertEqual(payload["source_years"], [2024, 2025, 2026])
        self.assertEqual(payload["model_version"], "F27-3Y-BT1")
        self.assertGreater(payload["observation_count"], 0)
        self.assertIn("실제 발생", payload["disclaimer"])

        zero = self.client.get(
            "/api/forecast/2027",
            params={"pest": "벼물바구미", "crop": "논벼", "region": "부산광역시"},
        ).json()
        self.assertTrue(zero["has_forecast"])
        self.assertEqual(zero["score_2024"], 0)
        self.assertEqual(zero["score_2026"], 0)
        self.assertEqual(zero["forecast_score"], 0)
        self.assertGreater(zero["observation_count"], 0)

    def test_forecast_one_year_and_missing_cases_do_not_invent_scores(self) -> None:
        one_year = self.client.get(
            "/api/forecast/2027",
            params={"pest": "담배거세미나방"},
        ).json()
        self.assertFalse(one_year["has_forecast"])
        self.assertIsNone(one_year["forecast_score"])
        self.assertEqual(one_year["confidence"], "낮음")
        self.assertEqual(one_year["forecast_message"], "해당 조건의 비교 가능한 예찰자료가 부족하여 2027년 전망을 제공하지 않습니다.")

        missing = self.client.get(
            "/api/forecast/2027",
            params={"pest": "존재하지않는병해충"},
        ).json()
        self.assertFalse(missing["has_forecast"])
        self.assertEqual(missing["observation_count"], 0)
        self.assertIsNone(missing["forecast_score"])

    def test_forecast_category_management_and_enemy_boundaries(self) -> None:
        frame = _forecast_data()
        for category in ["병해", "바이러스", "선충"]:
            candidate = frame[
                frame["유형"] == category
            ].iloc[0]
            response = self.client.get(
                "/api/forecast/2027",
                params={
                    "pest": candidate["병해충"],
                    "crop": candidate["작물"],
                    "region": candidate["지역"],
                },
            )
            payload = response.json()
            with self.subTest(category=category, pest=candidate["병해충"]):
                self.assertEqual(response.status_code, 200)
                self.assertEqual(payload["category"], category)
                self.assertEqual(payload["recommendations"], [])
                self.assertGreaterEqual(len(payload["management_steps"]), 5)

        linked = next(
            pest
            for pest in sorted(FULL_PEST_CATALOG)
            if pest_profile(pest)["분류"] == "해충" and recommendations(pest)
        )
        linked_payload = self.client.get(
            "/api/forecast/2027", params={"pest": linked}
        ).json()
        self.assertGreater(len(linked_payload["recommendations"]), 0)
        for item in linked_payload["recommendations"]:
            self.assertIn("evidence_status", item)
            self.assertIn("application_level", item)

        unlinked = next(
            pest
            for pest in sorted(FULL_PEST_CATALOG)
            if pest_profile(pest)["분류"] == "해충" and not recommendations(pest)
        )
        unlinked_payload = self.client.get(
            "/api/forecast/2027", params={"pest": unlinked}
        ).json()
        self.assertEqual(unlinked_payload["recommendations"], [])

    def test_forecast_all_and_specific_scope_and_summary(self) -> None:
        all_scope = self.client.get(
            "/api/forecast/2027", params={"pest": "벼물바구미"}
        ).json()
        specific = self.client.get(
            "/api/forecast/2027",
            params={"pest": "벼물바구미", "crop": "논벼", "region": "충청남도"},
        ).json()
        self.assertEqual(all_scope["crop"], "전체")
        self.assertEqual(all_scope["region"], "전체")
        self.assertGreaterEqual(len(all_scope["region_rankings"]), 1)
        self.assertEqual(specific["crop"], "논벼")
        self.assertEqual(specific["region"], "충청남도")

        summary = self.client.get("/api/forecast/2027/summary")
        payload = summary.json()
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(payload["forecast_year"], 2027)
        self.assertEqual(payload["data_validation"]["ncpms"]["yearly"]["2024"]["rows"], 5721)
        self.assertEqual(payload["data_validation"]["ncpms"]["yearly"]["2026"]["rows"], 12698)
        self.assertEqual(payload["data_validation"]["ncpms"]["overlap"]["pests"]["common_count"], 50)
        self.assertGreater(payload["forecast_available"], 0)

        self.assertEqual(payload["analysis_scope"]["source_years"], [2024, 2025, 2026])
        self.assertGreater(payload["analysis_scope"]["common_three_year_units"], 0)
        self.assertGreater(payload["analysis_scope"]["mae_ci95"][0], 0)

    def test_judge_impact_path_is_executable_and_claim_guarded(self) -> None:
        response = self.client.get(
            "/api/analysis/judge-impact",
            params={"pest": "벼물바구미", "crop": "논벼", "region": "충청남도"},
        )
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "complete")
        self.assertEqual(len(payload["stages"]), 6)
        self.assertEqual(
            [item["id"] for item in payload["stages"]],
            ["evidence", "backtest", "smartfarm", "forecast", "release", "action"],
        )
        self.assertGreater(payload["headline_metrics"]["total_evidence_rows"], 1000000)
        self.assertGreater(payload["headline_metrics"]["common_three_year_units"], 0)
        self.assertEqual(payload["economic_scenario"]["status"], "interactive_ready")
        self.assertEqual(
            payload["prospective_validation"]["status"],
            "collection_protocol_ready",
        )
        self.assertIn("시험군", payload["prospective_validation"]["minimum_fields"])
        protocols = payload["prospective_validation"]["protocols"]
        self.assertEqual(
            {item["id"] for item in protocols},
            {"natural_enemy_trial", "field_linkage", "machinery_exposure"},
        )
        self.assertTrue(all(item["fields"] for item in protocols))
        self.assertFalse(payload["claim_boundary"]["accident_probability"])
        self.assertFalse(payload["claim_boundary"]["causal_effect"])

    def test_forecast_weather_evidence_and_monthly_outlook(self) -> None:
        response = self.client.get(
            "/api/forecast/2027",
            params={"pest": "벼물바구미", "crop": "논벼", "region": "충청남도"},
        )
        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["model_version"], "F27-3Y-BT1")
        self.assertIn(payload["weather_data_status"], {"linked", "insufficient"})
        self.assertIn("weather_support_index", payload)
        self.assertIn("weather_adjustment", payload)
        self.assertEqual(len(payload["monthly_outlook"]), 12)
        self.assertTrue(all("forecast_score" in item for item in payload["monthly_outlook"]))
        self.assertIsInstance(payload["weather_relationships"], list)
        self.assertIn("ASOS", payload["source"])
        self.assertIn("2027년 미래", payload["weather_note"])
        self.assertGreater(payload["aws_minute_archive"]["observation_rows"], 0)

        weather = self.client.get(
            "/api/forecast/2027/weather",
            params={"pest": "벼물바구미", "crop": "논벼"},
        )
        self.assertEqual(weather.status_code, 200)
        self.assertEqual(weather.json()["forecast_year"], 2027)
        self.assertEqual(len(weather.json()["monthly_outlook"]), 12)

        archive = self.client.get("/api/weather/aws-minute/status")
        self.assertEqual(archive.status_code, 200)
        self.assertGreater(archive.json()["completed_windows"], 0)

    def test_kma_surface_marine_archive_status(self) -> None:
        response = self.client.get("/api/weather/observations/status")
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["surface"]["ASOS"]["status"], "complete")
        self.assertEqual(payload["surface"]["ASOS"]["rows"], 2250493)
        self.assertEqual(payload["surface"]["AWS"]["status"], "complete")
        self.assertGreaterEqual(payload["surface"]["AWS"]["rows"], 51000000)
        self.assertEqual(payload["surface"]["AWS"]["completion_percent"], 100.0)
        self.assertGreater(payload["surface"]["AWS"]["valid_rows"], 0)
        self.assertGreater(payload["marine"]["valid_rows"], 0)
        self.assertGreater(payload["extended_services"]["approved"], 0)
        self.assertIn("세계기상", payload["extended_services"]["categories"])
        self.assertFalse(payload["data_policy"]["api_key_exposed"])

    def test_kma_observation_map_preserves_domains_and_missing_values(self) -> None:
        response = self.client.get(
            "/api/weather/observations/map",
            params={"domain": "all", "limit": 5000, "refresh": True},
        )
        payload = response.json()
        points = payload["points"]

        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(points), 0)
        self.assertIn("surface", {point["domain"] for point in points})
        self.assertIn("marine", {point["domain"] for point in points})
        self.assertIn("SFC", {point["type_code"] for point in points})
        self.assertIn("B", {point["type_code"] for point in points})
        self.assertTrue(any(point["air_temperature"] is not None for point in points))
        self.assertTrue(any(point["wave_height"] is not None for point in points))

        bad_domain = self.client.get(
            "/api/weather/observations/map",
            params={"domain": "invalid"},
        )
        self.assertEqual(bad_domain.status_code, 400)

    def test_stage6_research_summary_is_validated_and_leakage_guarded(self) -> None:
        response = self.client.get("/api/analysis/research/summary")
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "complete")
        self.assertEqual(payload["source_rows"]["asos"], 2250493)
        self.assertEqual(payload["source_rows"]["ncpms"], 18419)
        self.assertEqual(payload["source_rows"]["aws_valid"], 12751224)
        self.assertEqual(payload["derived_rows"]["common_pairs"], 3041)
        self.assertEqual(payload["selected_baseline"], "persistence")
        self.assertAlmostEqual(payload["selected_mae"], 8.3163, places=4)
        self.assertEqual(payload["checks"]["future_leakage_violation_rows"], 0)
        self.assertTrue(payload["checks"]["actual_zero_distinct_from_missing"])
        self.assertTrue(payload["checks"]["aws_partial_not_mixed"])
        multiyear = payload["multiyear_analysis"]
        self.assertEqual(multiyear["status"], "complete")
        self.assertEqual(multiyear["year_rows"]["2025"], 24067)
        self.assertEqual(multiyear["year_status"]["2026"], "부분연도")
        self.assertEqual(multiyear["common_three_year_units"], 9791)
        self.assertEqual(multiyear["bootstrap_repeats"], 1000)
        self.assertEqual(multiyear["selected_model"], "persistence")
        self.assertTrue(multiyear["statistical_tie"])
        tribunal = payload["model_tribunal"]
        self.assertEqual(tribunal["status"], "complete")
        self.assertEqual(tribunal["bootstrap_repeats"], 1000)
        self.assertEqual(tribunal["leave_one_region_out_scenarios"], 14)
        extensions = payload["extended_weather_services"]
        self.assertEqual(extensions["status"], "complete")
        self.assertEqual(extensions["tested"], 10)
        self.assertEqual(extensions["approved"], 9)
        self.assertEqual(extensions["actual_data"], 9)
        self.assertEqual(extensions["direct_model_inputs"], 0)
        full_audit = extensions["full_audit"]
        self.assertEqual(full_audit["status"], "complete")
        self.assertEqual(full_audit["official_endpoints"], 254)
        self.assertEqual(full_audit["http_200"], 251)
        self.assertEqual(full_audit["permission_denied"], 0)
        self.assertEqual(full_audit["gateway_errors"], 3)
        self.assertEqual(full_audit["app_context_connected"], 251)
        self.assertEqual(full_audit["forecast_direct_inputs"], 3)
        self.assertEqual(len(full_audit["category_summary"]), 6)
        self.assertEqual(
            {item["category"] for item in full_audit["category_summary"]},
            {"지상관측", "해양관측", "예특보", "융합기상", "세계기상", "산업특화"},
        )
        self.assertFalse(full_audit["key_plaintext_persisted"])
        self.assertEqual(
            {item["category"] for item in extensions["categories"]},
            {"예특보", "융합기상", "세계기상", "산업특화"},
        )

    def test_stage6_research_context_and_forecast_integration(self) -> None:
        params = {"pest": "벼물바구미", "crop": "논벼"}
        response = self.client.get("/api/analysis/research", params=params)
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "complete")
        self.assertEqual(len(payload["benchmarks"]), 3)
        self.assertEqual(sum(item["selected"] for item in payload["benchmarks"]), 1)
        self.assertEqual(len(payload["safeguards"]), 6)
        self.assertTrue(all(item["status"] == "통과" for item in payload["safeguards"]))
        self.assertGreater(payload["summary"]["total_evidence_rows"], 15000000)
        multiyear = payload["multiyear_analysis"]
        self.assertEqual(multiyear["status"], "complete")
        self.assertTrue(multiyear["condition_available"])
        self.assertEqual(multiyear["summary"]["common_three_year_units"], 9791)
        self.assertEqual(multiyear["summary"]["bootstrap_repeats"], 1000)
        self.assertEqual(multiyear["summary"]["selected_model_name"], "최근연도 유지")
        extensions = payload["extended_weather_services"]
        warning_services = {
            item["service_id"]: item for item in extensions["services"]
            if item["category"] == "예특보"
        }
        self.assertTrue(warning_services["fct_shrt_reg"]["actual_data"])
        self.assertTrue(warning_services["wrn_now_data_new"]["approved"])
        self.assertTrue(warning_services["wrn_now_data_new"]["actual_data"])
        self.assertTrue(warning_services["wrn_now_data"]["approved"])
        self.assertTrue(warning_services["wrn_now_data"]["actual_data"])
        world_services = [
            item for item in extensions["services"] if item["category"] == "세계기상"
        ]
        self.assertTrue(world_services)
        self.assertTrue(all("대체 금지" in item["policy"] for item in world_services))
        interval = payload["forecast_interval"]
        if interval["point"] is not None:
            self.assertLessEqual(interval["lower"], interval["point"])
            self.assertGreaterEqual(interval["upper"], interval["point"])

        forecast = self.client.get("/api/forecast/2027", params=params)
        self.assertEqual(forecast.status_code, 200)
        forecast_payload = forecast.json()
        self.assertEqual(forecast_payload["research_evidence"]["status"], "complete")
        self.assertIn(2025, forecast_payload["source_years"])
        self.assertEqual(
            [item["year"] for item in forecast_payload["comparison_series"]],
            [2024, 2025, 2026, 2027],
        )
        self.assertEqual(forecast_payload["model_version"], "F27-3Y-BT1")
        self.assertTrue(all("trend" in item and "risk_level" in item for item in forecast_payload["region_rankings"]))
        gate = forecast_payload["spatiotemporal_validation"]
        self.assertEqual(gate["status"], "complete")
        self.assertEqual(gate["context_domain_count"], 6)
        self.assertEqual(gate["direct_score_domains"], ["지상관측"])
        self.assertEqual(gate["direct_variables"], ["기온", "습도", "풍속"])
        self.assertEqual(gate["score_change_rows"], 0)

    def test_stage7_spatiotemporal_gate_preserves_scores_and_all_domains(self) -> None:
        response = self.client.get("/api/forecast/2027/spatiotemporal-validation")
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "complete")
        self.assertEqual(payload["context_domain_count"], 6)
        self.assertEqual(payload["direct_score_domain_count"], 1)
        self.assertEqual(payload["audit"]["permission_denied"], 0)
        self.assertTrue(payload["checks"]["score_values_preserved"])
        self.assertTrue(payload["checks"]["missing_not_imputed"])
        self.assertTrue(payload["checks"]["future_leakage_zero"])
        self.assertEqual(
            {item["category"] for item in payload["layers"]},
            {"지상관측", "해양관측", "예특보", "융합기상", "세계기상", "산업특화"},
        )
        direct = [item for item in payload["layers"] if item["direct_score_input"]]
        self.assertEqual([item["category"] for item in direct], ["지상관측"])

        research = self.client.get("/api/analysis/research").json()
        fusion = research["extended_weather_services"]["full_audit"]["fusion_recheck"]
        self.assertEqual(fusion["catalogued"], 45)
        self.assertEqual(fusion["live_http_200"], 42)
        self.assertEqual(fusion["permission_denied"], 0)
        self.assertFalse(fusion["key_plaintext_persisted"])

    def test_stage8_official_safety_guidance_preserves_missing_scores(self) -> None:
        response = self.client.get("/api/safety/guidance")
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "complete")
        self.assertEqual(payload["source"]["source_rows"], 89)
        self.assertEqual(payload["source"]["work_categories"], 10)
        self.assertEqual(payload["source"]["machinery_rows"], 1)
        self.assertFalse(payload["source"]["api_key_required"])
        self.assertTrue(payload["open_api"]["key_required"])
        self.assertTrue(payload["open_api"]["service_approval_required"])
        self.assertNotIn("key_length", payload["open_api"])
        self.assertEqual(len(payload["categories"]), 10)
        self.assertEqual(payload["machinery"][0]["name"], "농업기계 공통")
        self.assertGreater(len(payload["machinery"][0]["pre_checks"]), 0)
        self.assertEqual(payload["portal_catalogue"]["status"], "complete")
        self.assertGreaterEqual(payload["portal_catalogue"]["page_count"], 150)
        self.assertGreaterEqual(payload["portal_catalogue"]["content_count"], 1700)
        self.assertGreaterEqual(payload["portal_catalogue"]["publication_count"], 300)
        self.assertGreaterEqual(payload["portal_catalogue"]["board_count"], 1200)
        self.assertEqual(payload["portal_catalogue"]["media_files_downloaded"], 0)
        self.assertFalse(payload["portal_catalogue"]["api_key_required"])
        self.assertGreater(len(payload["knowledge_domains"]), 5)
        self.assertGreater(len(payload["featured_contents"]), 5)
        self.assertGreater(len(payload["machinery_catalogue"]), 0)

    def test_stage9_decision_console_is_evidence_gated(self) -> None:
        response = self.client.get(
            "/api/decision-support",
            params={"pest": "벼물바구미", "crop": "논벼", "region": "충청남도"},
        )
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(payload["decision_gates"]), 4)
        self.assertEqual(len(payload["monthly_outlook"]["months"]), 12)
        self.assertEqual(len(payload["monthly_outlook"]["quarters"]), 4)
        self.assertEqual(payload["cultivation"]["criteria_rows"], 8)
        self.assertEqual(payload["cultivation"]["smartfarm_metadata_rows"], 1063)
        self.assertEqual(
            [mode["name"] for mode in payload["cultivation"]["modes"]],
            ["노지", "시설원예", "스마트팜"],
        )
        self.assertIn("품목", payload["cultivation"]["source_fields"])
        self.assertFalse(payload["cultivation"]["risk_adjustment_applied"])
        self.assertIn("evidence_bridge", payload["cultivation"])
        self.assertFalse(payload["cultivation"]["evidence_bridge"]["direct_field_key"])
        self.assertFalse(payload["cultivation"]["evidence_bridge"]["risk_adjustment_allowed"])
        self.assertFalse(payload["district_network"]["risk_score_calculated"])
        self.assertGreater(payload["district_network"]["observation_site_count"], 0)
        self.assertGreater(len(payload["district_network"]["representative_sites"]), 0)
        self.assertTrue(all(not site["is_named_farm"] for site in payload["district_network"]["representative_sites"]))
        self.assertFalse(payload["pesticide"]["api_key_required"])
        self.assertEqual(payload["pesticide"]["registered_rows"], 144689)
        self.assertEqual(payload["pesticide"]["source_mode"], "공식 전체 Excel 스냅샷")
        self.assertEqual(payload["pesticide"]["source_date"], "2026-08-27")
        self.assertIn(payload["pesticide"]["api_key_status"], {"설정됨", "미설정"})
        self.assertNotIn("api_key_value", payload["pesticide"])
        self.assertIsNone(payload["effectiveness"]["estimated_percent"])
        self.assertFalse(payload["effectiveness"]["can_compare_before_after"])
        self.assertEqual(payload["safety"]["official_checklist_rows"], 89)
        self.assertEqual(payload["safety"]["work_protocol_rows"], 10)
        self.assertEqual(payload["safety"]["machinery_reference_rows"], 1)
        self.assertEqual(len(payload["safety"]["categories"]), 10)
        self.assertGreater(len(payload["safety"]["categories"][0]["rules"]), 0)
        self.assertGreater(len(payload["safety"]["machinery"][0]["pre_checks"]), 0)
        self.assertFalse(payload["safety"]["predictive_accident_risk_available"])
        self.assertEqual(payload["safety"]["official_accident_evidence_rows"], 10)
        self.assertEqual(len(payload["safety"]["official_accident_policy_priorities"]), 10)
        self.assertTrue(all(not item["is_accident_probability"] for item in payload["safety"]["official_accident_policy_priorities"]))
        self.assertTrue(payload["safety"]["relative_exposure"]["available"])
        self.assertFalse(payload["safety"]["relative_exposure"]["is_accident_probability"])

        for district in payload["district_network"]["districts"]:
            self.assertIn("positive_observations", district)
            self.assertIn("actual_zero_observations", district)

        linked = next(
            candidate
            for candidate in sorted(FULL_PEST_CATALOG)
            if pest_profile(candidate)["분류"] == "해충" and recommendations(candidate)
        )
        linked_decision = self.client.get(
            "/api/decision-support", params={"pest": linked}
        ).json()
        self.assertGreater(len(linked_decision["natural_enemy"]["recommendations"]), 0)
        for enemy in linked_decision["natural_enemy"]["recommendations"]:
            self.assertIn("can_show_precise_timing", enemy)
            self.assertIn("effect_evidence_available", enemy)
            self.assertIn("release_standard", enemy)
            self.assertIn("effect_trajectory", enemy)

        quantified = self.client.get(
            "/api/decision-support",
            params={"pest": "복숭아혹진딧물", "crop": "고추", "region": "전체"},
        ).json()
        quantitative_rows = [
            enemy
            for enemy in quantified["natural_enemy"]["recommendations"]
            if enemy["can_show_precise_timing"]
        ]
        self.assertGreater(len(quantitative_rows), 0)
        self.assertTrue(quantified["natural_enemy"]["effect_evidence_available"])
        for enemy in quantitative_rows:
            evidence = enemy["release_standard"]
            self.assertTrue(evidence["release_amount"])
            self.assertTrue(evidence["release_schedule"])
            self.assertTrue(evidence["source"])
            self.assertTrue(evidence["source_usage_text"] or evidence["source_trial_text"])
            self.assertTrue(enemy["applicability"]["pest_match"])
            self.assertTrue(enemy["applicability"]["crop_match"])

        smartfarm = self.client.get(
            "/api/decision-support",
            params={"pest": "점박이응애", "crop": "딸기", "cultivation_mode": "스마트팜"},
        ).json()
        self.assertEqual(smartfarm["cultivation"]["selected"], "스마트팜")
        self.assertGreater(smartfarm["cultivation"]["selected_crop_metadata_rows"], 0)
        self.assertGreater(len(smartfarm["cultivation"]["matched_regions"]), 0)
        self.assertGreater(smartfarm["cultivation"]["matched_district_count"], 0)
        self.assertFalse(smartfarm["cultivation"]["risk_adjustment_applied"])
        self.assertFalse(smartfarm["cultivation"]["evidence_bridge"]["direct_field_key"])
        self.assertFalse(smartfarm["cultivation"]["evidence_bridge"]["risk_adjustment_allowed"])
        self.assertIn("trajectory", smartfarm["effectiveness"])
        self.assertIsNone(smartfarm["effectiveness"]["estimated_percent"])

    def test_stage10_registered_pesticide_catalogue_is_exact_and_label_guarded(self) -> None:
        response = self.client.get(
            "/api/pesticides/registered",
            params={"crop": "감자", "pest": "역병", "limit": 10},
        )
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["connected"])
        self.assertFalse(payload["api_key_required"])
        self.assertEqual(payload["registered_rows"], 144689)
        self.assertEqual(payload["source_date"], "2026-08-27")
        self.assertEqual(payload["match_status"], "작물·병해충 정확일치")
        self.assertGreater(payload["filtered_rows"], 0)
        self.assertGreater(payload["unique_products"], 0)
        self.assertGreater(len(payload["modes"]), 0)
        self.assertGreater(len(payload["products"]), 0)
        self.assertNotIn("api_key_value", payload)

        for product in payload["products"]:
            self.assertTrue(product["registration_number"])
            self.assertTrue(product["product_name"])
            self.assertTrue(product["mode_of_action"])
            self.assertIn("공식 등록목록 수록", product["registration_status"])
            self.assertIn("safety_timing", product)
            self.assertIn("use_count", product)

        selected_mode = payload["modes"][0]["code"]
        filtered = self.client.get(
            "/api/pesticides/registered",
            params={
                "crop": "감자",
                "pest": "역병",
                "mode_of_action": selected_mode,
                "limit": 10,
            },
        ).json()
        self.assertGreater(filtered["filtered_rows"], 0)
        self.assertTrue(all(product["mode_of_action"] == selected_mode for product in filtered["products"]))

    def test_pesticide_product_passport_uses_official_rows_without_fake_photo(self) -> None:
        catalogue = self.client.get(
            "/api/pesticides/registered",
            params={"crop": "감자", "pest": "역병", "limit": 1},
        ).json()
        registration_number = catalogue["products"][0]["registration_number"]
        response = self.client.get(f"/api/pesticides/registered/{registration_number}")
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["found"])
        self.assertEqual(payload["product"]["registration_number"], registration_number)
        self.assertGreater(payload["matched_registration_rows"], 0)
        self.assertGreater(len(payload["applications"]), 0)
        self.assertIn("crop", payload["applications"][0])
        self.assertIn("pest", payload["applications"][0])
        self.assertIsNone(payload["image"]["official_url"])
        self.assertEqual(payload["image"]["visual_type"], "data_driven_label")
        self.assertEqual(payload["image"]["status"], "등록정보 기반 3D 패키지 뷰")
        self.assertIn("제품 라벨", payload["image"]["notice"])
        self.assertNotIn("api_key", payload)

    def test_stage12_work_safety_relative_exposure_is_not_probability(self) -> None:
        response = self.client.get(
            "/api/safety/work-risk",
            params={"region": "강원도", "year": 2026, "month": 8},
        )
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["available"])
        self.assertFalse(payload["is_accident_probability"])
        self.assertGreater(payload["observation_rows"], 0)
        self.assertIn(payload["latest"]["work_adjustment_signal"], {"관찰", "주의 강화", "작업조정 검토"})
        self.assertIn(payload["latest"]["color"], {"초록", "주황", "빨강"})
        self.assertIn("relative_exposure_score", payload["latest"])
        self.assertIn(payload["latest"]["rainfall_actual_zero"], {"Y", "N", "자료 없음"})
        self.assertEqual(len(payload["official_accident_policy_priorities"]), 10)
        self.assertGreater(len(payload["recommended_checks"]), 0)
        self.assertIn("사고확률", payload["caution"])
        self.assertNotIn("accident_probability", payload)

        missing = self.client.get(
            "/api/safety/work-risk",
            params={"region": "존재하지않는지역", "year": 2026},
        ).json()
        self.assertFalse(missing["available"])
        self.assertFalse(missing["is_accident_probability"])

    def test_stage15_kosha_agriculture_microdata_is_observed_not_probability(self) -> None:
        response = self.client.get(
            "/api/decision-support",
            params={"pest": "복숭아혹진딧물", "crop": "고추", "region": "강원도"},
        )
        payload = response.json()
        safety = payload["safety"]
        evidence = safety["kosha_observed_evidence"]

        self.assertEqual(response.status_code, 200)
        self.assertEqual(safety["official_kosha_microdata_rows"], 4540)
        self.assertTrue(evidence["available"])
        self.assertEqual(evidence["period"], "2017~2023")
        self.assertEqual(sum(item["observed_rows"] for item in evidence["annual_observations"]), 4540)
        self.assertEqual(evidence["selected_region"], "강원")
        self.assertGreater(evidence["selected_region_observed_rows"], 0)
        self.assertEqual(len(evidence["top_occurrence_types"]), 5)
        self.assertFalse(evidence["is_accident_probability"])
        self.assertIn("관측행", evidence["caution"])

    def test_stage13_ecological_evidence_is_independently_gated(self) -> None:
        response = self.client.get("/api/analysis/ecological-evidence", params={"limit": 100})
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "complete")
        self.assertEqual(payload["summary"]["distribution_rows"], 31079)
        self.assertEqual(payload["summary"]["insect_reports"], 43)
        self.assertEqual(payload["summary"]["insect_report_pages"], 1482)
        self.assertEqual(payload["summary"]["radiation_sample_rows"], 60)
        self.assertEqual(payload["summary"]["agchm_spec_rows"], 50)
        self.assertLessEqual(payload["map"]["point_count"], 100)
        self.assertFalse(payload["radiation_research_sandbox"]["field_recommendation_allowed"])
        self.assertFalse(payload["pesticide_safety_connector"]["api_called"])
        self.assertFalse(payload["pesticide_safety_connector"]["key_value_exposed"])
        self.assertEqual(payload["model_policy"]["direct_2027_inputs_added"], 0)
        self.assertEqual(payload["model_policy"]["context_layers_added"], 4)

        serialized = json.dumps(payload, ensure_ascii=False).lower()
        self.assertNotIn("api_key_value", serialized)
        self.assertNotIn("authkey=", serialized)

        for enemy in payload["natural_enemy_evidence"]:
            self.assertFalse(enemy["release_timing_evidence"])
            self.assertFalse(enemy["effect_evidence"])

    def test_stage13_ecological_evidence_filters_preserve_missingness(self) -> None:
        filtered = self.client.get(
            "/api/analysis/ecological-evidence",
            params={"year": 2024, "limit": 50},
        ).json()
        self.assertEqual(filtered["selected"]["year"], 2024)
        self.assertTrue(all(point["year"] == 2024 for point in filtered["map"]["points"]))

        missing = self.client.get(
            "/api/analysis/ecological-evidence",
            params={"species": "존재하지 않는 종명", "limit": 50},
        ).json()
        self.assertEqual(missing["summary"]["selected_rows"], 0)
        self.assertEqual(missing["map"]["point_count"], 0)
        self.assertEqual(missing["map"]["total_filtered_points"], 0)
        self.assertEqual(missing["status"], "complete")

    def test_field_action_manual_is_separate_accessible_and_evidence_locked(self) -> None:
        response = self.client.get(
            "/api/manual/field-action",
            params={"pest": "벼물바구미", "crop": "벼", "region": "강원특별자치도"},
        )
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "complete")
        self.assertEqual(len(payload["steps"]), 4)
        self.assertEqual(
            [step["id"] for step in payload["steps"]],
            ["surveillance", "physical", "biological", "chemical"],
        )
        self.assertTrue(payload["accessibility"]["one_step_at_a_time"])
        self.assertTrue(payload["accessibility"]["browser_read_aloud"])
        self.assertTrue(payload["accessibility"]["printable"])
        self.assertIn(payload["action_clock"]["color"], {"gray", "green", "orange", "red"})
        self.assertFalse(payload["action_clock"]["is_occurrence_probability"])
        self.assertFalse(payload["action_clock"]["is_accident_probability"])
        self.assertFalse(payload["work_safety_copilot"]["is_accident_probability"])
        self.assertEqual(len(payload["action_locks"]), 5)
        self.assertIn("발생확률", payload["innovation"]["non_claims"])
        self.assertIn("근거 없는 천적 방사량", payload["innovation"]["non_claims"])

        for step in payload["steps"]:
            self.assertTrue(step["headline"])
            self.assertGreater(len(step["checklist"]), 0)
            self.assertGreater(len(step["stop_conditions"]), 0)
        for product in payload["steps"][3].get("products", []):
            self.assertFalse(product["is_prescription"])

    def test_stage17_national_spatial_evidence_is_public_and_drillable(self) -> None:
        national = self.client.get("/api/spatial-evidence", params={"mode": "livestock"})
        payload = national.json()
        self.assertEqual(national.status_code, 200)
        self.assertTrue(payload["available"])
        self.assertEqual(payload["scope"]["province"], "전국")
        self.assertEqual(payload["scope"]["level"], "province")
        self.assertEqual(len(payload["map"]["shapes"]), 17)
        self.assertEqual(payload["summary"]["province_count"], 17)
        self.assertEqual(payload["summary"]["district_count"], 252)
        self.assertEqual(len(payload["livestock"]), 26)
        self.assertTrue(all(item["시도명"] == "전국" for item in payload["livestock"]))
        self.assertNotIn("api_key", json.dumps(payload, ensure_ascii=False).lower())

        province = self.client.get(
            "/api/spatial-evidence",
            params={"mode": "crop", "province": "경기도"},
        ).json()
        self.assertEqual(province["scope"]["level"], "district")
        self.assertGreater(len(province["map"]["shapes"]), 1)
        self.assertGreater(province["summary"]["selected_public_hub_rows"], 0)
        self.assertTrue(all(not item["individual_farm"] for item in province["public_hubs"]))
        self.assertGreater(len(province["public_examples"]), 0)
        self.assertTrue(all(not item["contains_owner_name"] for item in province["public_examples"]))
        self.assertFalse(province["privacy_model"]["owner_names_exposed"])
        self.assertGreater(province["summary"]["selected_mapped_observation_points"], 0)

        district = self.client.get(
            "/api/spatial-evidence",
            params={"mode": "livestock", "province": "경기도", "district": "파주시"},
        ).json()
        self.assertEqual(district["scope"]["district"], "파주시")
        self.assertTrue(all(item["시군구명"] == "파주시" for item in district["livestock"]))
        self.assertIn("개별 농가", district["interpretation_caution"])

        smartfarm = self.client.get(
            "/api/spatial-evidence",
            params={"mode": "crop", "province": "경기도", "year": "2024"},
        ).json()
        for item in smartfarm["public_examples"]:
            if item["is_anonymised_farm_case"]:
                self.assertTrue(item["case_id"].startswith("SF-"))
                self.assertNotIn("농가명", json.dumps(item, ensure_ascii=False))


    def test_judge_radar_distinguishes_direct_and_reference_evidence(self) -> None:
        reference = self.client.get(
            "/api/analysis/judge-impact",
            params={"pest": "벼물바구미", "crop": "전체", "region": "전체"},
        )
        self.assertEqual(reference.status_code, 200)
        reference_focus = reference.json()["natural_enemy_focus"]
        self.assertEqual(reference_focus["scope"], "official_reference")
        self.assertFalse(reference_focus["selected_condition_applicable"])
        self.assertFalse(reference_focus["release_ready"])
        self.assertEqual(len(reference_focus["gates"]), 5)

        direct = self.client.get(
            "/api/analysis/judge-impact",
            params={"pest": "점박이응애", "crop": "파프리카", "region": "전체"},
        )
        self.assertEqual(direct.status_code, 200)
        direct_focus = direct.json()["natural_enemy_focus"]
        self.assertEqual(direct_focus["scope"], "selected_condition")
        self.assertTrue(direct_focus["selected_condition_applicable"])
        self.assertFalse(direct_focus["release_ready"])
        self.assertTrue(direct_focus["evidence_ready"])
        self.assertEqual(direct_focus["release_signal"], "자료 부족")
        self.assertEqual(direct_focus["ready_gate_count"], 5)
        self.assertTrue(direct_focus["effect_highlight"])
        trajectory = direct_focus["trajectory"]
        self.assertTrue(trajectory["available"])
        self.assertTrue(trajectory["direct_control_available"])
        self.assertEqual(trajectory["display_mode"], "공식 동일시점 처리·대조 관측값")
        self.assertEqual(
            [(point["day"], point["reported_percent"]) for point in trajectory["points"]],
            [(40, 326.4), (40, 34.5)],
        )
        self.assertIsNone(trajectory["generalized_effect_percent"])

    def test_smartfarm_official_crop_season_evidence(self) -> None:
        response = self.client.get(
            "/api/smartfarm/evidence",
            params={"crop": "전체", "region": "전체"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["available"])
        self.assertEqual(payload["official_summary"]["farm_count"], 238)
        self.assertEqual(payload["official_summary"]["farm_season_rows"], 651)
        self.assertEqual(payload["collection_validation"]["requests"], 1883)
        self.assertEqual(payload["collection_validation"]["failure"], 0)
        self.assertEqual(len(payload["timing_context"]["monthly_profile"]), 12)
        self.assertFalse(payload["claim_boundary"]["natural_enemy_causal_effect"])
        self.assertFalse(payload["collection_validation"]["credential_raw_recorded"])
        self.assertEqual(payload["approval"]["approved_count"], 1)
        self.assertEqual(payload["approval"]["checked_count"], 4)

        judge = self.client.get("/api/analysis/judge-impact").json()
        self.assertEqual(len(judge["stages"]), 6)
        self.assertEqual(judge["smartfarm_context"]["official_farms"], 238)
        self.assertEqual(judge["smartfarm_context"]["official_seasons"], 651)
        self.assertEqual(judge["smartfarm_context"]["request_count"], 1883)
        self.assertEqual(judge["smartfarm_context"]["request_failures"], 0)


if __name__ == "__main__":
    unittest.main()
