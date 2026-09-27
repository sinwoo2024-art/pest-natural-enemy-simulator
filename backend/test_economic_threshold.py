import unittest
from pydantic import ValidationError
from .economic_threshold import EilInputs, Criterion, calculate_eil, review_threshold
from .landscape_review import LandscapeRequest, review_landscape
from .test_landscape_review import observed_field

def eil(**overrides):
    return EilInputs(**{**dict(C=100,V=10,I=2,D=.5,K=.5,C_unit="원/m²",V_unit="원/kg",I_unit="cm²/마리",D_unit="kg/cm²",K_unit="비율(0~1)"),**overrides})

class EilTests(unittest.TestCase):
    def test_all_values_and_units_required(self):
        self.assertEqual(calculate_eil(eil())["value"],20)
        for key in ('C','V','I','D','K'):
            with self.subTest(key=key): self.assertIsNone(calculate_eil(eil(**{key:None}))["value"])
        for key in ('C_unit','V_unit','I_unit','D_unit','K_unit'):
            with self.subTest(key=key): self.assertIsNone(calculate_eil(eil(**{key:""}))["value"])

    def test_incompatible_units_are_not_converted(self):
        for changes in ({'D_unit':'kg/피해단위'},{'C_unit':'원'},{'K_unit':'%'},{'V_unit':'원/g'}):
            self.assertIsNone(calculate_eil(eil(**changes))["value"])

    def test_zero_cost_is_not_missing_but_zero_divisor_rejected(self):
        self.assertEqual(calculate_eil(eil(C=0))["value"],0)
        for changes in ({'V':0},{'I':0},{'D':0},{'K':0},{'K':80},{'C':-1},{'C':float('nan')}):
            with self.assertRaises(ValidationError): eil(**changes)

    def test_density_must_match_result_unit(self):
        a=review_threshold(Criterion(),eil(),'eil','고추','복숭아혹진딧물','전체','밭',0,'마리/m²')
        b=review_threshold(Criterion(),eil(),'eil','고추','복숭아혹진딧물','전체','밭',0,'마리/잎')
        self.assertTrue(a['numeric_comparable']);self.assertFalse(b['numeric_comparable'])
        self.assertFalse(a['official_comparable']);self.assertIsNone(a['control_required'])

    def test_source_and_scope_of_direct_input(self):
        record=dict(value=0,unit='마리/잎',crop='고추',pest='복숭아혹진딧물',cultivation='밭',source='테스트용 사용자 입력 문헌')
        def run(**overrides):
            return review_threshold(Criterion(**{**record,**overrides}),EilInputs(),'direct','고추','복숭아혹진딧물','전체','밭',0,'마리/잎')
        self.assertTrue(run()['numeric_comparable'])
        self.assertFalse(run()['source_verified'])
        for change in ({'source':''},{'unit':''}): self.assertEqual(run(**change)['status'],'출처 확인 필요')
        for change in ({'crop':'사과'},{'pest':'점박이응애'},{'cultivation':'논'},{'region':'다른 지역'},{'unit':'마리/주'}): self.assertFalse(run(**change)['numeric_comparable'])

    def test_economic_input_is_a_required_landscape_gate(self):
        field=observed_field(unit='마리/m²')
        enemy={'name':'무당벌레'}
        request=LandscapeRequest(crop='고추',pest='복숭아혹진딧물',field=field)
        self.assertEqual(review_landscape(request,{'risk_score':100},[enemy])['status'],'근거자료 부족')
        request=LandscapeRequest(crop='고추',pest='복숭아혹진딧물',field=field,threshold_mode='eil',eil=eil())
        result=review_landscape(request,{'risk_score':100},[enemy])
        self.assertEqual(result['status'],'보전관리 조건부 검토')
        self.assertIsNone(result['effect_percent']);self.assertFalse(result['automatic_action'])
        self.assertTrue(result['used_data']);self.assertTrue(result['unused_data']);self.assertTrue(result['next_actions'])

if __name__=='__main__': unittest.main()
