"""对“小事后援”一句话提取器做离线回归评测。

执行：
    .venv\Scripts\python scripts\evaluate_aftercare_extraction.py

脚本会调用你当前配置的大模型，因此只在需要评测时手动执行。
它不会写入业务数据库，也不会创建正式售后记录。
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CASES_PATH = PROJECT_ROOT / "evals" / "aftercare_extraction_cases.json"

# 允许从项目根目录以外直接执行此脚本，仍然能导入 app 包。
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.aftercare_extractor import AftercareExtractionError, AftercareExtractor

# 不把 notes 放进准确率：备注是开放文本，适合人工抽查而非字符串完全一致比较。
EXACT_FIELDS = (
    "title",
    "platform",
    "purchase_date",
    "return_deadline",
    "warranty_deadline",
)


def normalize(value: Any) -> str | None:
    """将 date 和 str 统一为可比较的字符串；None 保持为 None。"""
    return None if value is None else str(value).strip()


def evaluate_case(extractor: AftercareExtractor, case: dict[str, Any]) -> dict[str, Any]:
    """运行一个样本，并分别记录字段匹配和缺失字段覆盖情况。"""
    expected = case["expected"]
    reference_date = case.get("reference_date")
    # 相对日期样本固定“今天”，使同一评测在任意日期运行都能得到同样结论。
    case_extractor = extractor
    if reference_date:
        fixed_today = date.fromisoformat(reference_date)
        case_extractor = AftercareExtractor(
            llm_client=extractor.llm_client,
            today_provider=lambda: fixed_today,
        )
    try:
        actual = case_extractor.extract(case["text"]).model_dump(mode="json")
    except AftercareExtractionError as exc:
        return {"id": case["id"], "category": case["category"], "ok": False, "error": str(exc)}
    except Exception as exc:  # 保留网络、鉴权等工程故障，避免一条样本中断整批评测。
        return {
            "id": case["id"],
            "category": case["category"],
            "ok": False,
            "error": f"未预期异常：{type(exc).__name__}: {exc}",
        }

    field_results = {
        field: normalize(actual.get(field)) == normalize(expected.get(field))
        for field in EXACT_FIELDS
    }
    actual_missing = set(actual.get("missing_fields", []))
    expected_missing = set(expected.get("missing_fields_expected", []))

    missing_true_positive = len(actual_missing & expected_missing)
    missing_false_positive = len(actual_missing - expected_missing)
    missing_false_negative = len(expected_missing - actual_missing)

    missing_ok = actual_missing == expected_missing

    return {
        "id": case["id"],
        "category": case["category"],
        "ok": all(field_results.values()) and missing_ok,
        "field_results": field_results,
        "missing_ok": missing_ok,
        "missing_true_positive": missing_true_positive,
        "missing_false_positive": missing_false_positive,
        "missing_false_negative": missing_false_negative,
        "actual": actual,
    }


def main() -> None:
    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    extractor = AftercareExtractor()
    # 逐条运行评测样本
    results = [evaluate_case(extractor, case) for case in cases]
    # 分类统计字典
    category_stats:dict[str,dict[str,int]]={}
    for result in results:
        category=result["category"]

        if category not in category_stats:
            category_stats[category]={
                "total_cases": 0,
                "passed_cases": 0,
                "total_fields": 0,
                "matched_fields": 0,
            }
        stats=category_stats[category]
        stats["total_cases"]+=1
        stats["passed_cases"]+=int(result["ok"])

        field_results=result.get("field_results",{})
        stats["total_fields"]+=len(EXACT_FIELDS)
        stats["matched_fields"]+=sum(field_results.values())

    total_fields = len(results) * len(EXACT_FIELDS)
    matched_fields = sum(
        sum(result.get("field_results", {}).values())
        for result in results
    )
    passed_cases = sum(result["ok"] for result in results)

    missing_true_positive = sum(
        result.get("missing_true_positive", 0)
        for result in results
    )
    missing_false_positive = sum(
        result.get("missing_false_positive", 0)
        for result in results
    )
    missing_false_negative = sum(
        result.get("missing_false_negative", 0)
        for result in results
    )

    missing_precision = (
        missing_true_positive
        / (missing_true_positive + missing_false_positive)
        if missing_true_positive + missing_false_positive
        else 1.0
    )

    missing_recall = (
        missing_true_positive
        / (missing_true_positive + missing_false_negative)
        if missing_true_positive + missing_false_negative
        else 1.0
    )

    missing_f1 = (
        2 * missing_precision * missing_recall
        / (missing_precision + missing_recall)
        if missing_precision + missing_recall
        else 0.0
    )

    print("\n=== 小事后援：一句话提取评测 ===")
    print(f"样本通过率：{passed_cases}/{len(results)} ({passed_cases / len(results):.1%})")
    print(f"字段准确率：{matched_fields}/{total_fields} ({matched_fields / total_fields:.1%})")
    print(
        "缺失字段识别："
        f"Precision {missing_precision:.1%}，"
        f"Recall {missing_recall:.1%}，"
        f"F1 {missing_f1:.1%}"
    )

    #输出分类统计结果
    print("\n---按类别统计---")
    for category,stats in category_stats.items():
        case_rate=stats["passed_cases"]/stats["total_cases"]
        field_rate=stats["matched_fields"]/stats["total_fields"]

        print(
            f"{category}："
            f"样本 {stats['passed_cases']}/{stats['total_cases']} ({case_rate:.1%})，"
            f"字段 {stats['matched_fields']}/{stats['total_fields']} ({field_rate:.1%})"
        )


    print("\n--- 未通过样本（用于定位 Prompt 或业务规则问题）---")
    for result in results:
        if result["ok"]:
            continue
        print(f"\n[{result['category']}] {result['id']}")
        if "error" in result:
            print(f"  调用/解析失败：{result['error']}")
            continue
        failed_fields = [field for field, ok in result["field_results"].items() if not ok]
        print(f"  不匹配字段：{', '.join(failed_fields) or '无'}")
        print(f"  缺失字段判断：{'通过' if result['missing_ok'] else '不通过'}")
        print(f"  实际输出：{json.dumps(result['actual'], ensure_ascii=False)}")


if __name__ == "__main__":
    main()
