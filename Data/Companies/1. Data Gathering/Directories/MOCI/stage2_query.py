#!/usr/bin/env python3
"""
MOCI Stage-2 — Power BI query BUILDER (pure, no network).
=========================================================
Builds the `SemanticQueryDataShapeCommand` bodies that the Business Map's
Power BI report itself uses, so Stage 2 can pull FULL company detail for a
batch of CR numbers instead of clicking each detail page.

Grammar + model mined 2026-07-09 from state/diagnostic-wabi.json (the report's
own captured /conceptualschema + querydata requests):
  * modelId 6970, dataset behind report 6ab0e66a-1d50-4bbf-9971-4dc7369c3a20
  * detail entity `CR_CP_data` (alias c) — 55 columns incl. everything we want:
      CR_NO, CP_NO, NAME, ORG_NAME_ENU, CR_ISSUE/EXPIRY, CP_ISSUE/EXPIRY,
      CP_STATUS, LEGAL_FORM(_EN), CAPITAL, NATIONALITY, MUNICIPALITY, DISTRICT,
      ZONE, STREET_NUMBER, BUILDING_NUM, LONGITUDE, LATITUDE,
      "number of branches", X_CRN_STATUS, ...
  * activity link — entity `final_table` (alias a): ORG_ID, CR_NUM, CP_NUM,
      ACTIVITY_ID, "Relation.ISIC ID", activity_names_lookup, arab_activity_names
  * registry people — CR_BOARD / CR_Partner / CR_Signatory (Name + Designation)

The captured queries use exactly this shape (verified: From→Select→Where with
SourceRef/Column/Property + Binding.Primary.Groupings). We add a Where "In"
over CR_NO to fetch a whole batch in one round trip — standard PBI grammar,
identical in form to the report's own filter conditions.

⚠️ TRANSPORT (token + endpoint headers) is NOT here — it's browser-negotiated
and must be captured live (diagnose_details.py). This module only builds the
JSON bodies, so it is fully unit-testable offline.
"""
from __future__ import annotations
import json
from typing import List, Dict, Any

MODEL_ID = 6970

# Detail columns to pull from CR_CP_data (alias 'c'). Order is the SELECT order,
# which is also the column order the decoder will map by. Bell-relevant subset of
# the 55 available — everything the detail page shows plus coordinates.
DETAIL_COLUMNS = [
    "CR_NO", "CP_NO", "NAME", "ORG_NAME_ENU",
    "CR_ISSUE_DATE", "CR_EXPIRY_DATE", "CP_ISSUE_DATE", "CP_EXPIRY_DATE",
    "CP_STATUS", "X_CRN_STATUS", "LEGAL_FORM_EN", "CAPITAL", "NATIONALITY",
    "MUNICIPALITY", "DISTRICT", "ZONE", "STREET_NUMBER", "BUILDING_NUM",
    "LONGITUDE", "LATITUDE", "number of branches",
]

# Activity-link columns from final_table (alias 'a') — the #72 code-exact prize.
ACTIVITY_COLUMNS = ["CR_NUM", "ACTIVITY_ID", "Relation.ISIC ID",
                    "activity_names_lookup", "arab_activity_names"]


def _col(source: str, prop: str) -> Dict[str, Any]:
    return {"Column": {"Expression": {"SourceRef": {"Source": source}}, "Property": prop}}


def _select(source: str, prop: str) -> Dict[str, Any]:
    # Name mirrors the report's convention "Entity.Property".
    entity = {"c": "CR_CP_data", "a": "final_table"}.get(source, source)
    return {**_col(source, prop), "Name": f"{entity}.{prop}"}


def _where_in(source: str, prop: str, values: List[str]) -> List[Dict[str, Any]]:
    # WHERE prop IN (values) — string literals single-quoted per PBI grammar.
    vals = [[{"Literal": {"Value": "'" + str(v).replace("'", "''") + "'"}}] for v in values]
    return [{
        "Condition": {"In": {
            "Expressions": [_col(source, prop)],
            "Values": vals,
        }}
    }]


def _command(entity: str, source: str, props: List[str], where_prop: str,
             cr_nums: List[str]) -> Dict[str, Any]:
    selects = [_select(source, p) for p in props]
    return {
        "SemanticQueryDataShapeCommand": {
            "Query": {
                "Version": 2,
                "From": [{"Name": source, "Entity": entity, "Type": 0}],
                "Select": selects,
                "Where": _where_in(source, where_prop, cr_nums),
            },
            "Binding": {
                "Primary": {"Groupings": [{"Projections": list(range(len(selects)))}]},
                "DataReduction": {"DataVolume": 4, "Primary": {"Window": {"Count": 30000}}},
                "Version": 1,
            },
        }
    }


def build_detail_query(cr_nums: List[str]) -> Dict[str, Any]:
    """One querydata body pulling DETAIL_COLUMNS for the given CR numbers."""
    return _envelope(_command("CR_CP_data", "c", DETAIL_COLUMNS, "CR_NO", cr_nums))


def build_activity_query(cr_nums: List[str]) -> Dict[str, Any]:
    """One querydata body pulling activity codes for the given CR numbers."""
    return _envelope(_command("final_table", "a", ACTIVITY_COLUMNS, "CR_NUM", cr_nums))


def _envelope(command: Dict[str, Any]) -> Dict[str, Any]:
    # The outer request wrapper the report uses (version 1.0.0 + one query).
    return {
        "version": "1.0.0",
        "queries": [{
            "Query": {"Commands": [command]},
            "QueryId": "",
            "ApplicationContext": {"DatasetId": "", "Sources": [{"ReportId": ""}]},
        }],
        "cancelQueries": [],
        "modelId": MODEL_ID,
    }


# ── offline self-test — proves the JSON matches the mined grammar ────────────
if __name__ == "__main__":
    ok = 0
    fail = 0

    def check(label, cond):
        global ok, fail
        print(("PASS" if cond else "**FAIL**"), label)
        ok += 1 if cond else 0
        fail += 0 if cond else 1

    q = build_detail_query(["12345", "67890", "O'Brien"])
    cmd = q["queries"][0]["Query"]["Commands"][0]["SemanticQueryDataShapeCommand"]
    qq = cmd["Query"]
    check("modelId 6970", q["modelId"] == 6970)
    check("From = CR_CP_data alias c", qq["From"][0] == {"Name": "c", "Entity": "CR_CP_data", "Type": 0})
    check("Select count == DETAIL_COLUMNS", len(qq["Select"]) == len(DETAIL_COLUMNS))
    check("first Select is CR_NO on source c",
          qq["Select"][0]["Column"]["Property"] == "CR_NO" and
          qq["Select"][0]["Column"]["Expression"]["SourceRef"]["Source"] == "c")
    check("CAPITAL is selected", any(s["Column"]["Property"] == "CAPITAL" for s in qq["Select"]))
    check("Where is IN over CR_NO", qq["Where"][0]["Condition"]["In"]["Expressions"][0]["Column"]["Property"] == "CR_NO")
    check("Where has 3 values", len(qq["Where"][0]["Condition"]["In"]["Values"]) == 3)
    check("string literals single-quoted", qq["Where"][0]["Condition"]["In"]["Values"][0][0]["Literal"]["Value"] == "'12345'")
    check("SQL-quote escaping (O'Brien -> 'O''Brien')", qq["Where"][0]["Condition"]["In"]["Values"][2][0]["Literal"]["Value"] == "'O''Brien'")
    check("Binding projections match select count", cmd["Binding"]["Primary"]["Groupings"][0]["Projections"] == list(range(len(DETAIL_COLUMNS))))
    check("serialises to JSON", bool(json.dumps(q)))

    qa = build_activity_query(["12345"])
    ca = qa["queries"][0]["Query"]["Commands"][0]["SemanticQueryDataShapeCommand"]["Query"]
    check("activity query From = final_table alias a", ca["From"][0] == {"Name": "a", "Entity": "final_table", "Type": 0})
    check("activity Where IN over CR_NUM", ca["Where"][0]["Condition"]["In"]["Expressions"][0]["Column"]["Property"] == "CR_NUM")
    check("activity selects ACTIVITY_ID + ISIC + names",
          {s["Column"]["Property"] for s in ca["Select"]} >= {"ACTIVITY_ID", "Relation.ISIC ID", "activity_names_lookup"})

    print(f"\n{ok} passed, {fail} failed")
    raise SystemExit(1 if fail else 0)
