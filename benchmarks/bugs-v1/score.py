#!/usr/bin/env python3
"""Score independently reviewed records; hashes are integrity checks, not proof of correctness."""
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
WEIGHTS = {"reproduce": 2, "fix": 4, "regression": 2, "independent": 2}
OUTCOMES = {"not_run", "unreproduced", "already_fixed", "environment_blocked", "budget_stopped", "provider_limited", "incomplete", "solved"}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def score(path):
    manifest_path = ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    run = json.loads(path.read_text())
    assert run["benchmark_id"] == manifest["benchmark_id"], "wrong benchmark"
    assert run["source_base_sha"] == manifest["source_base_sha"], "wrong source base"
    assert run["manifest_sha256"] == digest(manifest_path), "manifest changed"
    assert run["track"] in {"fresh", "pr-assisted"}, "invalid track"
    assert all(re.fullmatch(r"[0-9a-f]{40}", run[key]) for key in ("baseline_commit", "workbench_commit")), "invalid commit metadata"
    assert run["model"] and run["implementer"] and run["resource_policy"], "missing run metadata"
    ids = manifest["case_order"]
    assert len(run["cases"]) == len(ids) and sorted(c["issue"] for c in run["cases"]) == sorted(ids), "missing or duplicate cases"
    for case in manifest["cases"]:
        assert digest(ROOT / case["snapshot"]) == case["snapshot_sha256"], "issue snapshot changed"
    totals = dict.fromkeys(sorted(OUTCOMES), 0)
    rows = []
    full = autonomous = reproduced = total = 0
    for case in run["cases"]:
        assert case["outcome"] in OUTCOMES, "invalid outcome"
        totals[case["outcome"]] += 1
        assert type(case["human_intervention"]) is bool, "human intervention must be boolean"
        points = 0
        previous = True
        assert set(case["stages"]) == set(WEIGHTS), "unexpected or missing stage"
        for stage, weight in WEIGHTS.items():
            item = case["stages"][stage]
            assert type(item["verified"]) is bool, "verified must be boolean"
            verified = item["verified"]
            if verified:
                assert previous, "stage requires previous stage"
                assert re.fullmatch(r"[0-9a-f]{40}", case["candidate_sha"] or ""), "missing candidate SHA"
                assert run["model"] != "not_run" and run["implementer"] != "not_run", "execution metadata required"
                assert all(run["environment"].get(key) for key in ("image_digest", "node", "pnpm", "lockfile_sha256", "prompt_sha256")), "environment must be pinned"
                assert item["reviewer"] and item["reviewer"] != run["implementer"], "independent evidence reviewer required"
                assert item["evidence"], "missing evidence"
                for evidence in item["evidence"]:
                    target = (path.parent / evidence["path"]).resolve()
                    assert target.is_relative_to(path.parent.resolve()), "evidence outside result directory"
                    assert digest(target) == evidence["sha256"], "evidence hash mismatch"
                points += weight
                if stage == "reproduce":
                    reproduced += 1
            previous = verified
        assert (case["outcome"] == "solved") == (points == 10), "solved requires all stages"
        if case["outcome"] in {"not_run", "unreproduced", "already_fixed"}:
            assert points == 0, "ineligible outcome has points"
        full += points == 10
        autonomous += points == 10 and not case["human_intervention"]
        total += points
        rows.append({"issue": case["issue"], "points": points, "outcome": case["outcome"]})
    return {"benchmark_id": manifest["benchmark_id"], "track": run["track"], "points": total, "maximum": 100,
            "fully_solved": full, "autonomously_solved": autonomous, "baseline_reproduced": reproduced,
            "case_count": 10, "outcomes": totals, "cases": rows,
            "qualification": "Recorded evidence integrity checked; semantic validity requires independent review."}


if __name__ == "__main__":
    try:
        print(json.dumps(score(pathlib.Path(sys.argv[1]).resolve()), indent=2))
    except (AssertionError, KeyError, ValueError, OSError, TypeError, IndexError) as error:
        print(f"Invalid benchmark record: {error}", file=sys.stderr)
        sys.exit(1)
