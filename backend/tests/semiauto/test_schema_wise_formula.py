import pytest
import json
from backend.schemas.semiauto.wise_formula import WiseFormulaCreate, WiseFormulaUpdate, WiseFormulaResponse


def test_formula_create_producao():
    operacoes = json.dumps([
        {"posicao": "saida", "operacao": "+"},
        {"posicao": "inspetor", "operacao": "-"},
    ])
    f = WiseFormulaCreate(resultado="producao", operacoes=operacoes)
    assert f.resultado == "producao"
    parsed = json.loads(f.operacoes)
    assert len(parsed) == 2
    assert parsed[0]["posicao"] == "saida"


def test_formula_create_refugo():
    operacoes = json.dumps([{"posicao": "inspetor", "operacao": "+"}])
    f = WiseFormulaCreate(resultado="refugo", operacoes=operacoes)
    assert f.resultado == "refugo"


def test_formula_create_sem_campos_falha():
    with pytest.raises(Exception):
        WiseFormulaCreate()


def test_formula_update_opcional():
    f = WiseFormulaUpdate()
    assert f.operacoes is None


def test_formula_update_com_valor():
    novas = json.dumps([{"posicao": "entrada", "operacao": "+"}])
    f = WiseFormulaUpdate(operacoes=novas)
    assert f.operacoes == novas


def test_formula_response_from_orm():
    # A variável é definida fora da classe e passada via atributo de instância
    # para evitar o problema de escopo de classe no Python
    operacoes_str = json.dumps([{"posicao": "saida", "operacao": "+"}])

    class FakeFormula:
        id = 1
        maquina_linha_id = 10
        resultado = "producao"

    fake = FakeFormula()
    fake.operacoes = operacoes_str

    r = WiseFormulaResponse.model_validate(fake)
    assert r.id == 1
    assert r.resultado == "producao"
    parsed = json.loads(r.operacoes)
    assert parsed[0]["posicao"] == "saida"