// Verify CSS injection effectiveness
//
// 跑在目标 tab 的 MAIN world: 解析刚注入的 CSS, 对每条规则的第一个 property,
// querySelectorAll 取最多 3 个元素, 用 getComputedStyle 比对 expected vs actual.
// 返回 LLM 一看就懂的报告: effective / blocked / partial。
//
// 重点是 LLM 能 *自己看到* "我注入的没生效", 不用用户当人眼 QA.

export async function verifyCss(tabId, css) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [css],
      func: (cssText) => {
        // Parse CSS with a CSSStyleSheet
        let sheet;
        try {
          sheet = new CSSStyleSheet();
          sheet.replaceSync(cssText);
        } catch (e) {
          return { parseError: String(e?.message || e) };
        }

        const COLOR_PROPS = new Set([
          "background-color",
          "color",
          "border-color",
          "border-top-color",
          "border-right-color",
          "border-bottom-color",
          "border-left-color",
          "fill",
          "stroke",
          "outline-color",
        ]);
        const MAX_RULES = 8;
        const MAX_ELEMENTS = 3;

        // 颜色规范化用的隐藏 probe
        const probe = document.createElement("div");
        probe.style.position = "fixed";
        probe.style.visibility = "hidden";
        probe.style.pointerEvents = "none";
        document.documentElement.appendChild(probe);
        const norm = (cssProp, val) => {
          if (!COLOR_PROPS.has(cssProp)) return String(val).trim();
          try {
            probe.style[cssProp === "background-color" ? "backgroundColor" : "color"] = "";
            probe.style[cssProp === "background-color" ? "backgroundColor" : "color"] = val;
            const c = getComputedStyle(probe);
            return cssProp === "background-color" ? c.backgroundColor : c.color;
          } catch {
            return String(val).trim();
          }
        };

        const propKebabToCamel = (p) =>
          p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

        const elDesc = (el) => {
          let s = el.tagName.toLowerCase();
          if (el.id) s += "#" + el.id;
          if (typeof el.className === "string" && el.className.trim()) {
            const cls = el.className.trim().split(/\s+/).slice(0, 2).join(".");
            if (cls) s += "." + cls;
          }
          return s;
        };

        const rulesReport = [];
        const seenCommonBlockers = {};

        for (const rule of sheet.cssRules) {
          if (rulesReport.length >= MAX_RULES) break;
          if (!(rule instanceof CSSStyleRule)) continue;
          const selector = rule.selectorText;
          let matched;
          try {
            matched = Array.from(document.querySelectorAll(selector)).slice(
              0,
              MAX_ELEMENTS
            );
          } catch {
            rulesReport.push({ selector, status: "invalid-selector", matched: 0 });
            continue;
          }
          if (matched.length === 0) {
            rulesReport.push({ selector, status: "no-matches", matched: 0 });
            continue;
          }

          // 检查前 3 个属性
          const props = [];
          for (let i = 0; i < Math.min(rule.style.length, 3); i++) props.push(rule.style[i]);

          const propChecks = [];
          for (const prop of props) {
            const expectedRaw = rule.style.getPropertyValue(prop);
            const expectedNorm = norm(prop, expectedRaw);
            const camel = propKebabToCamel(prop);
            const samples = matched.map((el) => {
              const actual =
                getComputedStyle(el)[camel] ||
                getComputedStyle(el).getPropertyValue(prop);
              const eff = COLOR_PROPS.has(prop)
                ? actual === expectedNorm
                : String(actual).trim() === expectedNorm;
              return { el: elDesc(el), actual, effective: eff };
            });
            const eff = samples.filter((s) => s.effective).length;
            // 记录失败 element 描述 (帮 LLM 看到 "谁挡了")
            if (eff < samples.length) {
              for (const s of samples) {
                if (!s.effective) {
                  // 简单提取 class 当 blocker hint
                  const m = s.el.match(/\.[a-zA-Z0-9_-]+/g);
                  if (m) for (const c of m) seenCommonBlockers[c] = (seenCommonBlockers[c] || 0) + 1;
                }
              }
            }
            propChecks.push({
              prop,
              expected: expectedNorm,
              sampled: samples.length,
              effective: eff,
              ...(eff < samples.length
                ? {
                    samples: samples.map((s) => ({
                      el: s.el,
                      actual: s.actual,
                      effective: s.effective,
                    })),
                  }
                : {}),
            });
          }
          const totalEff = propChecks.reduce((a, c) => a + c.effective, 0);
          const totalSamples = propChecks.reduce((a, c) => a + c.sampled, 0);
          const status =
            totalSamples === 0
              ? "no-props"
              : totalEff === totalSamples
              ? "effective"
              : totalEff === 0
              ? "blocked"
              : "partial";
          rulesReport.push({
            selector,
            status,
            matched: matched.length,
            props: propChecks,
          });
        }

        probe.remove();

        const effective = rulesReport.filter((r) => r.status === "effective").length;
        const blocked = rulesReport.filter((r) => r.status === "blocked").length;
        const partial = rulesReport.filter((r) => r.status === "partial").length;
        const noMatch = rulesReport.filter((r) => r.status === "no-matches").length;

        // top blocker classes
        const topBlockers = Object.entries(seenCommonBlockers)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([cls, count]) => ({ class: cls, hits: count }));

        let summary;
        if (rulesReport.length === 0) {
          summary = "No style rules parsed from this CSS.";
        } else if (blocked === 0 && partial === 0 && noMatch === 0) {
          summary = `✓ All ${effective} rules effective.`;
        } else {
          const parts = [];
          parts.push(`${effective}/${rulesReport.length} effective`);
          if (blocked) parts.push(`${blocked} blocked (higher-specificity wins)`);
          if (partial) parts.push(`${partial} partial`);
          if (noMatch) parts.push(`${noMatch} no-match`);
          summary = parts.join(", ") + ".";
          if (topBlockers.length) {
            summary +=
              " Likely blocker classes on those elements: " +
              topBlockers.map((b) => `${b.class}(${b.hits}×)`).join(", ") +
              ". Try writing more specific selectors targeting them.";
          }
        }

        return {
          rulesChecked: rulesReport.length,
          rulesEffective: effective,
          rulesBlocked: blocked,
          rulesPartial: partial,
          rulesNoMatch: noMatch,
          topBlockers,
          summary,
          details: rulesReport,
        };
      },
    });
    return result;
  } catch (e) {
    return { error: e?.message ?? String(e) };
  }
}
