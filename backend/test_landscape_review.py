import copy
from datetime import date, timedelta
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from .landscape_review import LandscapeField, LandscapeRequest, review_landscape, landscape_state
from .main import app


def observed_field(**changes):
    return LandscapeField(**{**dict(cultivation="밭", edge_vegetation="있음", flowers="있음",
        refuge="있음", woody_border="있음", land_use="혼합", recent_mowing="있음",
        nonselective_insecticide="없음", pest_survey="있음", enemy_observed="있음",
        density=0, method="잎 육안 조사", unit="마리/잎", survey_date=date.today()), **changes})


class LandscapeTests(unittest.TestCase):
    def setUp(self):
        self.enemy = {"name": "무당벌레", "release_standard": {"evidence_grade": "A"}}
        self.risk = {"risk_score": 99, "risk_level": "높음", "has_observation": True, "trend": [{"round": 1, "score": 99}]}

    def review(self, field=None, pest="복숭아혹진딧물", enemies=None):
        return review_landscape(LandscapeRequest(crop="고추", pest=pest, field=field or LandscapeField()),
                                self.risk, [self.enemy] if enemies is None else enemies)

    def test_high_risk_without_density_never_recommends_action(self):
        value = self.review()
        self.assertEqual(value["status"], "경관조사 우선")
        self.assertIsNone(value["density"]["value"])
        self.assertEqual(value["methods"], [])
        self.assertFalse(value["automatic_action"])

    def test_unknown_landscape_even_with_density_stays_survey_first(self):
        value = self.review(LandscapeField(density=5, method="육안", unit="마리/잎", survey_date=date.today(), pest_survey="있음"))
        self.assertEqual(value["status"], "경관조사 우선")

    def test_no_official_threshold_or_control_decision(self):
        value = self.review(observed_field(assumed_threshold=2, assumed_threshold_unit="마리/잎"))
        threshold = value["threshold"]
        self.assertEqual(threshold["status"], "공식 경제적 피해기준 미확보")
        for key in ("official_value", "source", "control_required", "eil"):
            self.assertIsNone(threshold[key])
        self.assertFalse(threshold["official_comparable"])
        self.assertIn("사용자 가정값", threshold["user_assumption_label"])

    def test_zero_density_is_observed_not_missing(self):
        value = self.review(observed_field())
        self.assertTrue(value["density"]["complete"])
        self.assertEqual(value["density"]["value"], 0)
        self.assertEqual(value["status"], "보전관리 조건부 검토")

    def test_conditional_source_never_inherits_enemy_release_A(self):
        value = self.review(observed_field())
        self.assertEqual(value["enemy_source_grade"], "A")
        self.assertEqual(value["landscape_grade"], "C")
        self.assertTrue(value["methods"])
        for method in value["methods"]:
            self.assertEqual(method["grade"], "C")
            self.assertIsNone(method["quantitative_specification"])
            self.assertIn("해충에도 유리", method["limitation"])

    def test_mismatched_pest_or_missing_enemy_gets_no_methods(self):
        for pest, enemies in (("검은별무늬병", [self.enemy]), ("복숭아혹진딧물", [])):
            value = self.review(observed_field(), pest=pest, enemies=enemies)
            self.assertEqual(value["status"], "근거자료 부족")
            self.assertEqual(value["methods"], [])

    def test_field_conditions_change_methods_not_one_size_fits_all(self):
        full = self.review(observed_field())
        no_habitat = self.review(observed_field(edge_vegetation="없음", flowers="없음", refuge="없음", woody_border="없음", land_use="농경지"))
        self.assertGreater(len(full["methods"]), len(no_habitat["methods"]))
        self.assertNotIn("꽃자원과 먹이자원 관리 검토", [x["method"] for x in no_habitat["methods"]])

    def test_risk_is_not_used_to_create_density_or_efficacy(self):
        request = LandscapeRequest(crop="고추", pest="복숭아혹진딧물", field=observed_field())
        low = review_landscape(request, {**self.risk, "risk_score": 0}, [self.enemy])
        high = review_landscape(request, self.risk, [self.enemy])
        for key in ("density", "threshold", "methods", "status", "effect_percent"):
            self.assertEqual(low[key], high[key])

    def test_each_missing_density_metadata_blocks_ready(self):
        for field in (observed_field(density=None), observed_field(method="미확인"), observed_field(unit=""), observed_field(survey_date=None), observed_field(pest_survey="없음")):
            self.assertEqual(self.review(field)["status"], "경관조사 우선")

    def test_invalid_values_are_rejected(self):
        for change in ({"density": -1}, {"density": float("nan")}, {"survey_date": date.today() + timedelta(days=1)}, {"cultivation": "스마트팜"}):
            with self.assertRaises(ValidationError):
                observed_field(**change)

    def test_all_four_states_require_their_gates(self):
        self.assertEqual(landscape_state(False, True, True, True)[0], "경관조사 우선")
        self.assertEqual(landscape_state(True, True, False)[0], "근거자료 부족")
        self.assertEqual(landscape_state(True, True, True)[0], "보전관리 조건부 검토")
        self.assertEqual(landscape_state(True, True, True, True)[0], "현장 실증 후보")


class LandscapeApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_endpoint_uses_server_simulation_not_client_score(self):
        body = {"crop": "고추", "pest": "점박이응애", "region": "전체"}
        response = self.client.post("/api/landscape-review", json=body)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        original = self.client.get("/api/simulate", params=body).json()
        self.assertEqual(data["surveillance"]["score"], original["risk_score"])
        self.assertEqual(data["surveillance"]["trend"], original["trend"])
        self.assertEqual(self.client.post("/api/landscape-review", json={**body,"risk_score":100}).status_code, 422)

    def test_smartfarm_not_linked_to_risk_and_keeps_official_dataset(self):
        snapshots=[]
        for score in (0,100):
            with patch("backend.main.simulate", return_value={"risk_score":score}):
                response=self.client.get("/api/smartfarm/evidence",params={"crop":"전체","region":"전체"})
                self.assertEqual(response.status_code,200)
                snapshots.append(response.json())
        self.assertEqual(snapshots[0],snapshots[1])
        data=snapshots[0]
        self.assertEqual(data["official_summary"]["farm_count"],238)
        self.assertEqual(data["official_summary"]["farm_season_rows"],651)
        boundary=data["claim_boundary"]
        self.assertFalse(boundary["ncpms_score_combined"])
        for key in ("facility_pest_density","facility_release_density","optimal_release_timing"):
            self.assertIsNone(boundary[key])

    def test_catalogue_and_climate_boundary(self):
        self.assertEqual(len(self.client.get("/api/options").json()["pests"]),190)
        data=self.client.post("/api/landscape-review",json={"crop":"고추","pest":"점박이응애"}).json()
        self.assertIn("인과효과는 판정하지 않음",data["climate"]["notice"])


if __name__ == "__main__":
    unittest.main()
