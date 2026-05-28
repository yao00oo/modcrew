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

        const topBlockers = Object.entries(seenCommonBlockers)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([cls, count]) => ({ class: cls, hits: count }));

        // === Coverage: 我改的占了页面的多少？===
        // 找 CSS 里第一个 color-type 属性的期望值；随机采样 30 个 visible 元素，
        // 看有多少元素的对应属性 = 那个期望值。
        let coverage = null;
        try {
          const firstColorRule = (() => {
            for (const rule of sheet.cssRules) {
              if (!(rule instanceof CSSStyleRule)) continue;
              for (let i = 0; i < rule.style.length; i++) {
                const p = rule.style[i];
                if (COLOR_PROPS.has(p)) {
                  return { prop: p, val: rule.style.getPropertyValue(p) };
                }
              }
            }
            return null;
          })();

          if (firstColorRule) {
            const cssProp = firstColorRule.prop;
            const expectedNorm = norm(cssProp, firstColorRule.val);
            const camel = propKebabToCamel(cssProp);
            const all = document.querySelectorAll(
              "body *:not(script):not(style):not(meta):not(link)"
            );
            // 只看 viewport 内可见的
            const visible = [];
            for (const el of all) {
              if (visible.length >= 800) break; // 上限保守，遍历不卡 main thread
              const r = el.getBoundingClientRect();
              if (r.width <= 0 || r.height <= 0) continue;
              if (r.bottom < 0 || r.top > innerHeight) continue;
              if (r.right < 0 || r.left > innerWidth) continue;
              const s = getComputedStyle(el);
              if (s.visibility === "hidden" || s.display === "none") continue;
              visible.push(el);
            }
            // 随机采样 30
            const SAMPLE = 30;
            const sampled = [];
            const seen = new Set();
            const tries = Math.min(SAMPLE * 4, visible.length);
            for (let i = 0; i < tries && sampled.length < SAMPLE; i++) {
              const idx = Math.floor(Math.random() * visible.length);
              if (seen.has(idx)) continue;
              seen.add(idx);
              sampled.push(visible[idx]);
            }
            let affected = 0;
            const untouchedClassHits = {};
            for (const el of sampled) {
              const actual =
                getComputedStyle(el)[camel] ||
                getComputedStyle(el).getPropertyValue(cssProp);
              if (actual === expectedNorm) {
                affected++;
              } else if (typeof el.className === "string") {
                for (const c of el.className.trim().split(/\s+/)) {
                  if (!c) continue;
                  untouchedClassHits["." + c] = (untouchedClassHits["." + c] || 0) + 1;
                }
              }
            }
            const percent =
              sampled.length === 0 ? 0 : Math.round((affected / sampled.length) * 100);
            const topUntouched = Object.entries(untouchedClassHits)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([cls, hits]) => ({ class: cls, hits }));
            coverage = {
              prop: cssProp,
              target: expectedNorm,
              visibleSamples: sampled.length,
              affected,
              percent,
              topUntouched,
            };
          }
        } catch {}

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

        // Coverage 总结，单独一句话
        if (coverage && coverage.visibleSamples > 0) {
          if (coverage.percent < 30) {
            summary +=
              ` ⚠ Coverage low: only ${coverage.percent}% of visible elements got the ${coverage.prop}.` +
              (coverage.topUntouched.length
                ? " Untouched dominants: " +
                  coverage.topUntouched.map((t) => `${t.class}(${t.hits}×)`).join(", ") +
                  ". If user wanted a whole-page change, re-inject targeting these."
                : "");
          } else if (coverage.percent < 60) {
            summary += ` Partial coverage: ${coverage.percent}% of visible elements affected.`;
          }
        }

        return {
          rulesChecked: rulesReport.length,
          rulesEffective: effective,
          rulesBlocked: blocked,
          rulesPartial: partial,
          rulesNoMatch: noMatch,
          topBlockers,
          coverage,
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
