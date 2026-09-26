"""Synthetic fixtures test decisions, not claimed real-world efficacy or prices."""
import unittest

from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.adoption_review import Economics, FieldConditions, calculate_economics, evidence_track, evaluate_review
from backend.main import app


def economics(**overrides):
    return Economics(**{**dict(untreated_loss=1000, saved_control=50, enemy_cost=100,
                              labor_cost=50, monitoring_cost=25, other_cost=25,
                              effect_low=30, effect_base=50, effect_high=70), **overrides})


def evidence():
    # An entirely synthetic unit-test record; never shipped as official data.
    return {"checks": dict(pest_match=True, crop_match=True, environment_match=True,
                           dose_available=True, timing_available=True, repeats_available=True,
                           control_available=True, effect_numeric_available=True,
                           source_available=True, domestic_context=True), "missing": []}


def field(**overrides):
    return FieldConditions(**{**dict(environment="clear", rainfall="clear", wind="clear",
                                    chemical_residue="clear", pest_observed=True, crop_stage_checked=True), **overrides})


class EconomicsTests(unittest.TestCase):
    def test_formulas_all_costs_and_three_scenarios(self):
        result = calculate_economics(economics())
        self.assertEqual(result["total_cost"], 200)
        self.assertEqual([x["avoided_loss"] for x in result["scenarios"]], [300, 500, 700])
        self.assertEqual([x["total_benefit"] for x in result["scenarios"]], [350, 550, 750])
        self.assertEqual([x["net_benefit"] for x in result["scenarios"]], [150, 350, 550])
        self.assertEqual([x["bcr"] for x in result["scenarios"]], [1.75, 2.75, 3.75])
        self.assertEqual(result["break_even_effect_percent"], 15)
        self.assertEqual(result["input_origin"], "사용자 가정값")

    def test_empty_all_zero_and_partial_are_not_economic_results(self):
        for inputs in [Economics(), Economics(**{key: 0 for key in Economics.model_fields}), economics(labor_cost=None)]:
            result = calculate_economics(inputs)
            self.assertFalse(result["complete"])
            self.assertEqual(result["status"], "경제성 입력 필요")
            self.assertEqual(result["scenarios"], [])

    def test_zero_cost_and_zero_loss(self):
        result = calculate_economics(economics(enemy_cost=0, labor_cost=0, monitoring_cost=0, other_cost=0))
        self.assertIsNone(result["scenarios"][0]["bcr"])
        self.assertEqual(result["break_even_effect_percent"], 0)
        self.assertIsNone(calculate_economics(economics(untreated_loss=0))["break_even_effect_percent"])
        self.assertEqual(calculate_economics(economics(untreated_loss=0, saved_control=300))["break_even_effect_percent"], 0)

    def test_range_order_and_impossible_break_even(self):
        self.assertFalse(calculate_economics(economics(effect_low=60, effect_base=50))["complete"])
        self.assertGreater(calculate_economics(economics(enemy_cost=2000))["break_even_effect_percent"], 100)

    def test_invalid_negative_nonfinite_and_excess_percent(self):
        for override in [{"enemy_cost": -1}, {"effect_high": 101}, {"untreated_loss": float("nan")}, {"effect_base": float("inf")}]:
            with self.assertRaises(ValidationError):
                economics(**override)


class DecisionTests(unittest.TestCase):
    def review(self, proof=None, inputs=None, conditions=None, score=99):
        return evaluate_review({"risk_score": score, "risk_level": "고위험"},
                               proof if proof is not None else evidence(),
                               conditions if conditions is not None else field(),
                               inputs if inputs is not None else economics())

    def test_1_high_risk_missing_evidence(self):
        for key in ("dose_available", "effect_numeric_available"):
            proof = evidence(); proof["checks"][key] = False
            result = self.review(proof=proof)
            self.assertEqual(result["status"], "자료 부족")
            self.assertFalse(result["automatic_release"])

    def test_2_upper_bound_unprofitable_including_exact_zero(self):
        for enemy_cost in (650, 1000):
            self.assertEqual(self.review(inputs=economics(enemy_cost=enemy_cost))["status"], "경제성 낮음")

    def test_3_range_crosses_zero(self):
        self.assertEqual(self.review(inputs=economics(effect_low=0))["status"], "현장 실증 필요")

    def test_4_adverse_conditions_override_profit_and_missing_inputs(self):
        for gate in ("environment", "rainfall", "wind", "chemical_residue"):
            for inputs in (economics(), Economics()):
                self.assertEqual(self.review(inputs=inputs, conditions=field(**{gate: "adverse"}))["status"], "현장 적용 검토 보류")

    def test_5_conservative_candidate_is_not_instruction(self):
        result = self.review()
        self.assertEqual(result["status"], "도입 검토 후보")
        self.assertFalse(result["automatic_release"])
        self.assertIn("실제 방사 명령이 아닙니다", result["decision_notice"])

    def test_risk_does_not_change_profit_or_decision(self):
        low, high = self.review(score=0), self.review(score=100)
        self.assertEqual(low["status"], high["status"])
        self.assertEqual(low["tracks"]["economics"], high["tracks"]["economics"])
        self.assertFalse(high["tracks"]["environment"]["risk_adjustment_applied"])

    def test_indirect_environment_or_foreign_evidence_never_candidate(self):
        for key in ("pest_match", "crop_match", "environment_match", "control_available", "domestic_context"):
            proof = evidence(); proof["checks"][key] = False
            self.assertEqual(self.review(proof=proof)["status"], "현장 실증 필요")

    def test_missing_field_or_economics_even_with_good_environment(self):
        self.assertEqual(self.review(inputs=Economics())["status"], "자료 부족")
        self.assertEqual(self.review(conditions=field(wind="unknown"))["status"], "자료 부족")

    def test_rounding_does_not_decide_sign(self):
        result = self.review(inputs=economics(untreated_loss=1, saved_control=0, enemy_cost=0,
                           labor_cost=0, monitoring_cost=0, other_cost=0, effect_low=1))
        self.assertEqual(result["tracks"]["economics"]["scenarios"][0]["net_benefit"], 0)
        self.assertEqual(result["status"], "도입 검토 후보")


class EvidenceTests(unittest.TestCase):
    def test_reference_link_does_not_upgrade_direct_evidence_or_verdict(self):
        empty = evidence_track(None, "복숭아", "복숭아순나방", "미확인")
        linked = evidence_track(None, "복숭아", "복숭아순나방", "미확인", {
            "enemy_name": "송충알벌", "literature_evidence": {
                "available": True, "url": "https://pubmed.ncbi.nlm.nih.gov/33522100/", "conditions": "국외 시험"}})
        self.assertEqual(empty["checks"], linked["checks"])
        self.assertIn("원문 링크 있음", linked["source_status"])
        self.assertNotIn("근거 원문 출처 미확보", linked["missing"])
        self.assertEqual(evaluate_review({}, linked, field(), economics())["status"], "자료 부족")

    def test_other_crop_broad_crop_and_unknown_environment_not_direct(self):
        record = {"name": "시험용 천적", "release_standard": {"source_crop": "원예작물", "source_target_pest": "시험해충", "environment": "온실", "source": "농촌진흥청"}}
        result = evidence_track(record, "복숭아", "시험해충", "노지")
        self.assertFalse(result["checks"]["crop_match"])
        self.assertFalse(result["checks"]["environment_match"])
        self.assertFalse(result["checks"]["domestic_context"])
        self.assertIsNone(result["generalized_effect_percent"])

    def test_absent_evidence_is_a_normal_result(self):
        result = evidence_track(None, "복숭아", "복숭아순나방", "미확인")
        self.assertEqual(result["grade"], "근거 부족")
        self.assertIn("공식 효과 수치 미확보", result["missing"])


class AdoptionApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_default_real_evidence_has_separate_tracks_and_no_assumed_effect(self):
        response = self.client.post("/api/adoption-review", json={"crop": "복숭아", "pest": "복숭아순나방", "region": "전체"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(set(payload["tracks"]), {"surveillance", "environment", "evidence", "economics"})
        self.assertEqual(payload["status"], "자료 부족")
        self.assertFalse(payload["tracks"]["economics"]["complete"])
        self.assertIsNone(payload["tracks"]["evidence"]["generalized_effect_percent"])
        self.assertTrue(any("pubmed.ncbi.nlm.nih.gov" in ref["url"] for ref in payload["tracks"]["evidence"]["references"]))
        self.assertNotIn("근거 원문 출처 미확보", payload["missing"])

    def test_api_rejects_invalid_numbers_and_forged_evidence(self):
        base = {"crop": "복숭아", "pest": "복숭아순나방"}
        self.assertEqual(self.client.post("/api/adoption-review", json={**base, "economics": {"effect_high": 200}}).status_code, 422)
        self.assertEqual(self.client.post("/api/adoption-review", json={**base, "official_effect": 90}).status_code, 422)

    def test_no_regression_in_simulation_trend_recommendations_or_regions(self):
        query = {"crop": "복숭아", "pest": "복숭아순나방", "region": "전체"}
        before = self.client.get("/api/simulate", params=query).json()
        self.client.post("/api/adoption-review", json={**query, "economics": economics().model_dump()})
        after = self.client.get("/api/simulate", params=query).json()
        self.assertEqual(before, after)
        self.assertGreater(len(after["trend"]), 0)
        self.assertGreater(len(after["recommendations"]), 0)
        self.assertEqual(self.client.get("/api/region-risk-comparison", params=query).status_code, 200)


if __name__ == "__main__":
    unittest.main()
