"""
Rules Engine - Stage 7 of Governance Pipeline

Evaluates extensions against policy rules using a deterministic DSL.
Produces rule_results.json with ALLOW/BLOCK/NEEDS_REVIEW verdicts.

The Rules Engine is:
- Deterministic: Same input → same output, every time
- Auditable: Simple condition parser, no LLM calls
- Lightweight: Pure Python, no external dependencies (besides pyyaml)
"""

import logging
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Literal, Tuple
from pathlib import Path

from .schemas import RuleResult, RuleResults

logger = logging.getLogger(__name__)

VALID_VERDICTS = {"ALLOW", "BLOCK", "NEEDS_REVIEW"}


class RuleConditionError(Exception):
    """Raised when a rule condition cannot be parsed/evaluated.

    This is distinct from a condition that legitimately evaluates to False. A
    parse/evaluation error must fail CLOSED (NEEDS_REVIEW), never silently ALLOW.
    """


def validate_rulepack(rulepack: Any) -> List[str]:
    """Validate a rulepack's structure. Returns a list of human-readable errors.

    An empty list means the rulepack is structurally valid. Used to fail closed:
    a rulepack with errors must not be silently dropped into an ALLOW.
    """
    errors: List[str] = []
    if not isinstance(rulepack, dict):
        return [f"rulepack is not a mapping (got {type(rulepack).__name__})"]

    rp_id = rulepack.get("rulepack_id")
    if not rp_id or not isinstance(rp_id, str):
        errors.append("missing or non-string 'rulepack_id'")

    rules = rulepack.get("rules")
    if not isinstance(rules, list) or not rules:
        errors.append(f"rulepack '{rp_id}' has no 'rules' list")
        return errors

    seen_ids = set()
    for idx, rule in enumerate(rules):
        where = f"rulepack '{rp_id}' rule #{idx}"
        if not isinstance(rule, dict):
            errors.append(f"{where}: rule is not a mapping")
            continue
        rid = rule.get("rule_id")
        if not rid or not isinstance(rid, str):
            errors.append(f"{where}: missing or non-string 'rule_id'")
        elif rid in seen_ids:
            errors.append(f"{where}: duplicate rule_id '{rid}'")
        else:
            seen_ids.add(rid)
        cond = rule.get("condition")
        if not cond or not isinstance(cond, str) or not cond.strip():
            errors.append(f"{where} ('{rid}'): missing or empty 'condition'")
        else:
            # Dry-run parse/evaluate the condition so malformed, unevaluable, or
            # non-round-trippable conditions FAIL VALIDATION here instead of
            # silently degrading an intended BLOCK to NEEDS_REVIEW at runtime
            # (audit finding #1). A well-formed condition evaluates to a bool
            # against an empty context without raising; only a parse/operator
            # error raises RuleConditionError. Eager evaluation (see _parse_or)
            # guarantees every sub-branch is parsed even when it short-circuits.
            try:
                ConditionEvaluator().evaluate(cond, {})
            except RuleConditionError as exc:
                errors.append(f"{where} ('{rid}'): unevaluable condition: {exc}")
            except Exception as exc:  # pragma: no cover - defensive
                errors.append(
                    f"{where} ('{rid}'): condition raised "
                    f"{type(exc).__name__}: {exc}"
                )
        verdict = rule.get("verdict")
        if verdict not in VALID_VERDICTS:
            errors.append(
                f"{where} ('{rid}'): invalid verdict {verdict!r} "
                f"(must be one of {sorted(VALID_VERDICTS)})"
            )
        conf = rule.get("confidence", 0.8)
        if not isinstance(conf, (int, float)) or not (0.0 <= float(conf) <= 1.0):
            errors.append(f"{where} ('{rid}'): confidence {conf!r} not in [0,1]")
    return errors


class ConditionEvaluator:
    """
    Evaluates rule conditions using a simple recursive descent parser.
    
    Supported operators:
    - Equality: ==, !=
    - Contains: contains, not contains
    - Emptiness: is empty, is not empty
    - Logic: AND, OR, NOT
    - Type check: type="..." (for signals array)
    """
    
    def __init__(self):
        """Initialize the condition evaluator."""
        self.context = {}
    
    def evaluate(self, condition: str, context: Dict[str, Any]) -> bool:
        """
        Evaluate a condition string against a context dictionary.
        
        Args:
            condition: Condition string (e.g., "facts.host_access_patterns contains '<all_urls>'")
            context: Evaluation context with facts, signals, etc.
            
        Returns:
            bool: True if condition is satisfied, False otherwise
        """
        self.context = context
        try:
            return self._parse_or(condition.strip())
        except RuleConditionError:
            # Propagate parse errors so the rule fails CLOSED (NEEDS_REVIEW),
            # rather than being swallowed into a silent ALLOW.
            raise
        except Exception as e:
            logger.error(f"Error evaluating condition '{condition}': {e}")
            raise RuleConditionError(str(e)) from e
    
    def _parse_or(self, expr: str) -> bool:
        """Parse OR expressions (lowest precedence)."""
        # Split on OR that's not inside parentheses
        parts = self._split_on_operator(expr, "OR")
        if len(parts) > 1:
            # Evaluate every branch eagerly (no short-circuit) so a malformed
            # sub-condition always raises RuleConditionError instead of being
            # skipped by short-circuiting — this lets validate_rulepack catch it
            # and the engine fail closed (audit finding #1).
            results = [self._parse_and(part.strip()) for part in parts]
            return any(results)
        return self._parse_and(expr)

    def _parse_and(self, expr: str) -> bool:
        """Parse AND expressions."""
        # Split on AND that's not inside parentheses
        parts = self._split_on_operator(expr, "AND")
        if len(parts) > 1:
            # Eager evaluation (no short-circuit) — see _parse_or for rationale.
            results = [self._parse_and(part.strip()) for part in parts]
            return all(results)
        return self._parse_comparison(expr)
    
    def _parse_comparison(self, expr: str) -> bool:
        """Parse comparison expressions (equality, contains, etc.)."""
        expr = expr.strip()
        
        # Handle parentheses
        if expr.startswith("(") and expr.endswith(")"):
            return self._parse_or(expr[1:-1])
        
        # Handle NOT
        if expr.startswith("NOT"):
            rest = expr[3:].strip()
            if rest.startswith("(") and rest.endswith(")"):
                return not self._parse_or(rest[1:-1])
            return not self._parse_comparison(rest)
        
        # Check for comparison operators
        if " is empty" in expr:
            return self._eval_is_empty(expr)
        if " is not empty" in expr:
            return self._eval_is_not_empty(expr)
        if " contains type=" in expr:
            return self._eval_signal_type_contains(expr)
        if " contains " in expr:
            return self._eval_contains(expr)
        if " not contains " in expr:
            return self._eval_not_contains(expr)
        if " == " in expr:
            return self._eval_equality(expr, "==")
        if " != " in expr:
            return self._eval_equality(expr, "!=")
        if " >= " in expr:
            return self._eval_numeric_comparison(expr, ">=")
        if " <= " in expr:
            return self._eval_numeric_comparison(expr, "<=")
        if " > " in expr:
            return self._eval_numeric_comparison(expr, ">")
        if " < " in expr:
            return self._eval_numeric_comparison(expr, "<")
        
        # Unknown / unparseable expression: fail closed (do not silently ALLOW).
        raise RuleConditionError(f"Unknown comparison operator in: {expr}")
    
    def _split_on_operator(self, expr: str, operator: str) -> List[str]:
        """Split an expression on a logical operator (``AND`` / ``OR``).

        Only splits on a *standalone* operator token. The operator must be:
        - at parenthesis depth 0 (not inside a sub-expression),
        - NOT inside a quoted string, and
        - bounded by a non-word character (or a string boundary) on both sides.

        This prevents the historical bug (audit finding #1) where the operator
        was matched as a bare substring and split inside quoted signal names or
        larger words — e.g. the ``OR`` in ``type="COMPETITOR_SABOTAGE"`` or in
        the domain ``"*.NORTON.com"``, and the ``AND`` in any quoted value —
        which silently downgraded intended BLOCK rules to NEEDS_REVIEW.
        """
        parts: List[str] = []
        current = ""
        paren_depth = 0
        quote_char: Optional[str] = None  # the ' or " we are currently inside
        op_len = len(operator)

        i = 0
        n = len(expr)
        while i < n:
            ch = expr[i]

            # Inside a quoted string: copy verbatim until the matching close quote.
            if quote_char is not None:
                current += ch
                if ch == quote_char:
                    quote_char = None
                i += 1
                continue

            if ch in ('"', "'"):
                quote_char = ch
                current += ch
                i += 1
                continue

            if ch == "(":
                paren_depth += 1
                current += ch
                i += 1
                continue

            if ch == ")":
                paren_depth -= 1
                current += ch
                i += 1
                continue

            if (
                paren_depth == 0
                and expr[i:i + op_len] == operator
                and self._is_standalone_operator(expr, i, op_len)
            ):
                # Found a real top-level logical operator.
                if current.strip():
                    parts.append(current)
                current = ""
                i += op_len
                continue

            current += ch
            i += 1

        if current.strip():
            parts.append(current)

        return parts

    @staticmethod
    def _is_standalone_operator(expr: str, start: int, op_len: int) -> bool:
        """True if the substring at ``expr[start:start+op_len]`` is a standalone
        token (bounded by a non-word character or a string boundary on each side).

        A "word" character is alphanumeric or underscore, so ``OR`` inside
        ``COMPETITOR`` / ``NORTON`` and ``AND`` inside e.g. ``BRAND`` are not
        treated as operators.
        """
        before = expr[start - 1] if start > 0 else " "
        after_idx = start + op_len
        after = expr[after_idx] if after_idx < len(expr) else " "
        before_is_word = before.isalnum() or before == "_"
        after_is_word = after.isalnum() or after == "_"
        return not before_is_word and not after_is_word
    
    def _get_value(self, path: str) -> Any:
        """Get value from context using dot notation.
        
        Supports nested dictionary access like:
        - facts.host_access_patterns
        - facts.security_findings.virustotal_threat_level
        - manifest.permissions
        """
        path = path.strip()
        if not path:
            return None
        
        parts = path.split(".")
        
        value = self.context
        for part in parts:
            if value is None:
                return None
            if isinstance(value, dict):
                value = value.get(part)
            else:
                # If intermediate value is not a dict, can't continue traversal
                return None
        
        return value
    
    def _eval_equality(self, expr: str, operator: str) -> bool:
        """Evaluate == or != comparison."""
        parts = expr.split(operator)
        if len(parts) != 2:
            return False
        
        left = self._get_value(parts[0].strip())
        right = self._parse_value(parts[1].strip())
        
        if operator == "==":
            return left == right
        else:  # !=
            return left != right
    
    def _eval_numeric_comparison(self, expr: str, operator: str) -> bool:
        """Evaluate numeric comparison operators (>, <, >=, <=)."""
        parts = expr.split(f" {operator} ", 1)
        if len(parts) != 2:
            return False
        
        left = self._get_value(parts[0].strip())
        right = self._parse_value(parts[1].strip())
        
        # Convert to numbers for comparison
        try:
            left_num = float(left) if left is not None else 0
            right_num = float(right) if right is not None else 0
        except (ValueError, TypeError):
            logger.warning(f"Cannot compare non-numeric values: {left} {operator} {right}")
            return False
        
        if operator == ">":
            return left_num > right_num
        elif operator == "<":
            return left_num < right_num
        elif operator == ">=":
            return left_num >= right_num
        elif operator == "<=":
            return left_num <= right_num
        
        return False
    
    def _eval_contains(self, expr: str) -> bool:
        """Evaluate 'contains' operator."""
        parts = expr.split(" contains ", 1)
        if len(parts) != 2:
            return False
        
        left = self._get_value(parts[0].strip())
        right = self._parse_value(parts[1].strip())
        
        # If left is a list, check if right is in it
        if isinstance(left, list):
            return right in left
        # If left is a string, check if right is a substring
        elif isinstance(left, str):
            return str(right) in left
        
        return False
    
    def _eval_not_contains(self, expr: str) -> bool:
        """Evaluate 'not contains' operator."""
        parts = expr.split(" not contains ", 1)
        if len(parts) != 2:
            return False
        
        left = self._get_value(parts[0].strip())
        right = self._parse_value(parts[1].strip())
        
        # If left is a list, check if right is NOT in it
        if isinstance(left, list):
            return right not in left
        # If left is a string, check if right is NOT a substring
        elif isinstance(left, str):
            return str(right) not in left
        
        return True
    
    def _eval_is_empty(self, expr: str) -> bool:
        """Evaluate 'is empty' operator."""
        parts = expr.split(" is empty")
        if len(parts) < 1:
            return False
        
        value = self._get_value(parts[0].strip())
        
        if value is None:
            return True
        if isinstance(value, bool):
            return value is False
        if isinstance(value, (list, dict, str)):
            return len(value) == 0
        if isinstance(value, (int, float)):
            return value == 0
        
        return False
    
    def _eval_is_not_empty(self, expr: str) -> bool:
        """Evaluate 'is not empty' operator."""
        parts = expr.split(" is not empty")
        if len(parts) < 1:
            return False
        
        value = self._get_value(parts[0].strip())
        
        if value is None:
            return False
        if isinstance(value, bool):
            return value is True
        if isinstance(value, (list, dict, str)):
            return len(value) > 0
        if isinstance(value, (int, float)):
            return value != 0
        
        return True
    
    def _eval_signal_type_contains(self, expr: str) -> bool:
        """Evaluate signal type check: 'signals contains type="ENDPOINT_FOUND"'."""
        match = re.search(r'signals\s+contains\s+type="([^"]+)"', expr)
        if not match:
            return False
        
        signal_type = match.group(1)
        signals = self._get_value("signals")
        
        if not isinstance(signals, list):
            return False
        
        # Check if any signal has this type
        for signal in signals:
            if isinstance(signal, dict) and signal.get("type") == signal_type:
                return True
        
        return False
    
    def _parse_value(self, value_str: str) -> Any:
        """Parse a value string into appropriate type."""
        value_str = value_str.strip()
        
        # String literal (quoted)
        if (value_str.startswith('"') and value_str.endswith('"')) or \
           (value_str.startswith("'") and value_str.endswith("'")):
            return value_str[1:-1]
        
        # Boolean
        if value_str.lower() == "true":
            return True
        if value_str.lower() == "false":
            return False
        
        # Number
        try:
            if "." in value_str:
                return float(value_str)
            return int(value_str)
        except ValueError:
            pass
        
        # Default: treat as string
        return value_str


class RulesEngine:
    """
    Evaluates extensions against policy rules deterministically.
    
    Pipeline Stage 7: Takes facts, signals, context, and rulepacks
    and produces rule_results.json with ALLOW/BLOCK/NEEDS_REVIEW verdicts.
    """
    
    def __init__(
        self,
        rulepacks: List[Dict[str, Any]],
        load_errors: Optional[List[str]] = None,
    ):
        """
        Initialize the Rules Engine.

        Args:
            rulepacks: List of *validated* rulepack dictionaries loaded from YAML
            load_errors: Errors encountered while loading/validating rulepacks.
                When non-empty the engine fails CLOSED (emits a NEEDS_REVIEW
                synthetic result) so malformed rulepacks never silently ALLOW.
        """
        self.rulepacks = rulepacks
        self.load_errors = list(load_errors or [])
        self.evaluator = ConditionEvaluator()
        logger.info(
            "Initialized Rules Engine with %d rulepacks (%d load errors)",
            len(rulepacks),
            len(self.load_errors),
        )

    @staticmethod
    def load_rulepacks_with_report(
        rulepacks_dir: str,
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        Load and validate all rulepacks from a directory.

        Returns:
            (valid_rulepacks, errors). A YAML parse error or a schema-validation
            error excludes that rulepack from ``valid_rulepacks`` and records a
            message in ``errors`` so the caller can fail closed.
        """
        import yaml

        rulepacks: List[Dict[str, Any]] = []
        errors: List[str] = []
        dir_path = Path(rulepacks_dir)

        if not dir_path.exists():
            msg = f"Rulepacks directory not found: {rulepacks_dir}"
            logger.warning(msg)
            return [], [msg]

        for yaml_file in sorted(dir_path.glob("*.yaml")):
            try:
                with open(yaml_file, "r") as f:
                    rulepack = yaml.safe_load(f)
            except Exception as e:
                msg = f"Failed to parse rulepack {yaml_file.name}: {e}"
                logger.error(msg)
                errors.append(msg)
                continue

            if not rulepack:
                msg = f"Rulepack {yaml_file.name} is empty"
                logger.error(msg)
                errors.append(msg)
                continue

            rp_errors = validate_rulepack(rulepack)
            if rp_errors:
                for err in rp_errors:
                    msg = f"Invalid rulepack {yaml_file.name}: {err}"
                    logger.error(msg)
                    errors.append(msg)
                continue

            rulepacks.append(rulepack)
            logger.info(f"Loaded rulepack: {rulepack.get('rulepack_id')}")

        return rulepacks, errors

    @staticmethod
    def load_rulepacks(rulepacks_dir: str) -> List[Dict[str, Any]]:
        """Backwards-compatible loader returning only the valid rulepacks.

        Prefer :meth:`load_rulepacks_with_report` so load errors can fail closed.
        """
        rulepacks, _errors = RulesEngine.load_rulepacks_with_report(rulepacks_dir)
        return rulepacks
    
    def evaluate(
        self,
        scan_id: str,
        facts: Dict[str, Any],
        signals: List[Dict[str, Any]],
        store_listing: Dict[str, Any],
        context: Dict[str, Any],
    ) -> RuleResults:
        """
        Evaluate all rules against the provided facts and signals.
        
        Args:
            scan_id: Unique scan identifier
            facts: Facts object (dict form)
            signals: List of signals
            store_listing: Store listing data
            context: Governance context
            
        Returns:
            RuleResults with verdicts for each rule
        """
        logger.info(f"Starting rule evaluation for scan_id={scan_id}")
        
        # Build evaluation context
        eval_context = self._build_eval_context(facts, signals, store_listing)
        
        rule_results: List[RuleResult] = []

        # Fail CLOSED on rulepack load/validation errors: a malformed rulepack
        # must surface as NEEDS_REVIEW, never be silently dropped into an ALLOW.
        for load_err in self.load_errors:
            rule_results.append(self._fail_closed_result("__rulepack_load_error__", load_err))

        # Get rulepacks from context
        rulepack_ids = context.get("rulepacks", [])
        active_rulepacks = [
            rp for rp in self.rulepacks
            if rp.get("rulepack_id") in rulepack_ids
        ]

        # Requested rulepacks that could not be found also fail closed.
        missing = [rid for rid in rulepack_ids if rid not in {rp.get("rulepack_id") for rp in self.rulepacks}]
        for rid in missing:
            logger.warning("Requested rulepack not available: %s", rid)
            rule_results.append(
                self._fail_closed_result(
                    "__rulepack_missing__",
                    f"Requested rulepack '{rid}' is not available; cannot evaluate its policy",
                )
            )

        if not active_rulepacks and not missing and not self.load_errors:
            logger.warning(f"No active rulepacks selected for context: {rulepack_ids}")

        # Evaluate rules
        for rulepack in active_rulepacks:
            for rule in rulepack.get("rules", []):
                result = self._evaluate_rule(rule, eval_context, rulepack.get("rulepack_id"))
                rule_results.append(result)

        logger.info(f"Evaluated {len(rule_results)} rule results")

        return RuleResults(scan_id=scan_id, rule_results=rule_results)

    @staticmethod
    def _fail_closed_result(rule_id: str, message: str) -> RuleResult:
        """Build a synthetic NEEDS_REVIEW result used when the engine fails closed."""
        return RuleResult(
            rule_id=rule_id,
            rulepack="__engine__",
            verdict="NEEDS_REVIEW",
            confidence=1.0,
            evidence_refs=[],
            citations=[],
            explanation=f"Fail-closed: {message}",
            recommended_action="Manual review required (rulepack could not be evaluated)",
            triggered_at=datetime.now(timezone.utc),
        )
    
    def _build_eval_context(
        self,
        facts: Dict[str, Any],
        signals: List[Dict[str, Any]],
        store_listing: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Build the evaluation context for the DSL evaluator."""
        return {
            "facts": facts,
            "manifest": facts.get("manifest", {}),
            "signals": signals,
            "extraction": store_listing.get("extraction", {}),
            "declared_data_categories": store_listing.get("declared_data_categories", []),
            "declared_purposes": store_listing.get("declared_purposes", []),
            "declared_third_parties": store_listing.get("declared_third_parties", []),
            "privacy_policy_url": store_listing.get("privacy_policy_url"),
        }
    
    def _evaluate_rule(
        self,
        rule: Dict[str, Any],
        eval_context: Dict[str, Any],
        rulepack_id: str,
    ) -> RuleResult:
        """
        Evaluate a single rule against the evaluation context.
        
        Args:
            rule: Rule dictionary from rulepack
            eval_context: Context for condition evaluation
            rulepack_id: ID of the rulepack containing this rule
            
        Returns:
            RuleResult with verdict
        """
        rule_id = rule.get("rule_id")
        condition = rule.get("condition", "")
        
        logger.debug(f"Evaluating rule: {rule_id}")
        
        try:
            # Evaluate condition
            condition_met = self.evaluator.evaluate(condition, eval_context)

            # Determine verdict
            if condition_met:
                verdict = rule.get("verdict", "NEEDS_REVIEW")
            else:
                verdict = "ALLOW"

            explanation = (
                f"Condition matched. Verdict: {verdict}"
                if condition_met
                else f"Condition not matched. Verdict: ALLOW"
            )

        except Exception as e:
            logger.error(f"Error evaluating rule {rule_id}: {e}")
            verdict = "NEEDS_REVIEW"
            explanation = f"Error during evaluation: {str(e)}"
            condition_met = False

        # Evidence traceability (D5): a matched verdict must carry the concrete
        # evidence ids of the signals that satisfied its condition, not the
        # always-empty static rulepack field. This lets a reviewer trace a
        # BLOCK / NEEDS_REVIEW back to the runtime signals that triggered it.
        evidence_refs = list(rule.get("evidence_refs", []) or [])
        if condition_met:
            for ref in self._collect_signal_evidence_refs(
                condition, eval_context.get("signals", [])
            ):
                if ref not in evidence_refs:
                    evidence_refs.append(ref)

        return RuleResult(
            rule_id=rule_id,
            rulepack=rulepack_id,
            verdict=verdict,
            confidence=rule.get("confidence", 0.8),
            evidence_refs=evidence_refs,
            citations=rule.get("citations", []),
            explanation=explanation,
            recommended_action=rule.get("recommended_action", ""),
            advisory=bool(rule.get("advisory", False)),
            triggered_at=datetime.now(timezone.utc),
        )

    @staticmethod
    def _collect_signal_evidence_refs(
        condition: str, signals: List[Dict[str, Any]]
    ) -> List[str]:
        """Collect evidence_refs from signals whose type is named in a condition.

        A rule condition such as ``signals contains type="SENSITIVE_API"`` matches
        one or more emitted signals. This returns the evidence ids carried by those
        matched signals so the resulting verdict is traceable to concrete runtime
        evidence rather than the empty static rulepack ``evidence_refs`` field.
        """
        signal_types = set(re.findall(r'type="([^"]+)"', condition or ""))
        if not signal_types or not isinstance(signals, list):
            return []
        refs: List[str] = []
        for signal in signals:
            if not isinstance(signal, dict):
                continue
            if signal.get("type") in signal_types:
                for ref in signal.get("evidence_refs", []) or []:
                    if ref not in refs:
                        refs.append(ref)
        return refs
