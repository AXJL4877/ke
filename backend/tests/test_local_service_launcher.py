"""Tests for on-demand local service launcher helpers."""
from core.local_service_launcher import collect_service_ids_from_contract


def test_collect_service_ids_dedupes():
    contract = {
        "source": {"service_id": "download", "label": "download"},
        "depends_on": [
            {"service_id": "asr", "label": "asr"},
            {"service_id": "download", "label": "download"},
        ],
    }
    assert collect_service_ids_from_contract(contract) == ["download", "asr"]


def test_collect_service_ids_empty():
    assert collect_service_ids_from_contract({}) == []
    assert collect_service_ids_from_contract({"depends_on": []}) == []
