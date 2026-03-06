import { Rule } from "@continuedev/config-yaml";

import { RuleWithSource } from "../..";

export function convertYamlRuleToContinueRule(rule: Rule): RuleWithSource {
  if (typeof rule === "string") {
    return {
      rule,
      source: "rules-block",
    };
  }

  return {
    source: "rules-block",
    rule: rule.rule,
    globs: rule.globs,
    name: rule.name,
    description: rule.description,
    sourceFile: rule.sourceFile,
    alwaysApply: rule.alwaysApply,
    invokable: rule.invokable ?? false,
  };
}
