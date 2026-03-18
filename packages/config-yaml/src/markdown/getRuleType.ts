import { RuleObject } from "../schemas/index.js";

export enum RuleType {
  Always = "Always",
  AutoAttached = "Auto Attached",
  AgentRequested = "Agent Requested",
  Manual = "Manual",
}

/**
 * Determines the rule type based on the rule properties
 */
export function getRuleType(rule: Partial<RuleObject>): RuleType {
  // Check if globs/regex have meaningful values (not empty arrays/strings)
  const hasGlobs =
    rule.globs &&
    (Array.isArray(rule.globs)
      ? rule.globs.length > 0
      : rule.globs.trim().length > 0);
  const hasRegex =
    rule.regex &&
    (Array.isArray(rule.regex)
      ? rule.regex.length > 0
      : rule.regex.trim().length > 0);

  // Auto Attached: has globs and/or regex patterns
  if (hasGlobs || hasRegex) {
    return RuleType.AutoAttached;
  }

  // Check if description has meaningful value
  const hasDescription = rule.description && rule.description.trim().length > 0;

  // Agent Requested: has description and alwaysApply is false
  if (hasDescription && rule.alwaysApply === false) {
    return RuleType.AgentRequested;
  }

  // Manual: alwaysApply is false but no description
  if (rule.alwaysApply === false && !hasDescription) {
    return RuleType.Manual;
  }

  // Always: default case (alwaysApply true/undefined, no globs/regex)
  return RuleType.Always;
}
