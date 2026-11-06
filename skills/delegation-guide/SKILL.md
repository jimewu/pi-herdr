---
name: delegation-guide
description: "Use when an agent must delegate a sub-task to the `oneshot` sub-agent (isolated LLM session) and wants the delegation to produce correct, usable results without side‑effects. Covers prompt structure, side‑effect control, and result format."
metadata:
  version: 1.6.0
  mode: reference
  package: pi-herdr
  sibling-skill: herdr-with-pi
  changelog: |
    - 1.6.0: 新增「Verifying sub-agent reports」（結構/數量宣稱是假設；矛盾時
             先查雙方看的檔案版本）；Parallel delegation 加「Long-text batch
             processing」子節（切段並行 + 同源 glossary + 機械 normalization）。
    - 1.5.0: 新增「reviewer inherits inputs' errors」警告（訓練案例：跨片映射錯誤被 reviewer
               mask 為「正確」修正）；新增「兩輪 review protocol」（第二輪抓第一輪引入的新錯）。
    - 1.4.0: 「Document / report reviews」審查表新增兩類「語義忠實度」類別
             （citation direction / evidence support、source fidelity / artifact
             handling），補上由 ASR/transcript 構建的報告最常犯、而原 8 類
             counting/coverage 表抓不到的錯誤（引用引反例、ASR 誤聽當術語、
             範圍泛化、校正表自相矛盾）。
    - 1.3.0: 自 ~/.agents/skills/ 搬入 pi-herdr package。原位置無版控、不在 .skill-lock.json
             內，修改無歷史可回溯，且從來源重新同步時會被無聲覆蓋。搬入後：(1) 納入版控
             (2) 與 herdr-with-pi 同 package 一起以 `pi -e` 載入 (3) 可交叉引用同 repo 的
             agents/ profile 與 herdr_* 決策矩陣。
    - 1.2.0: 新增「Document / report reviews」八類審查表；把「identifier 前綴碰撞」
             從 code 專屬提升為通用規則；補充 oneshot 本質說明（pi agent、不繼承 package）。
    - 1.1.0: 初版。
---

# Delegation Guide — conventions for using `oneshot`

> **What a oneshot actually is.** It is a **pi agent** — same harness, same tool
> surface — just bound to a specific API model and given a fresh context window.
> It is not a different system. Two consequences worth keeping in mind:
>
> 1. Anything you can ask pi to do, you can ask a oneshot to do — including
>    reading files, running bash, and writing output.
> 2. It sees **only** what you put in the prompt. It does **not** inherit the
>    calling session's packages, skills, or working set unless you pass the paths
>    explicitly and tell it to load them.
>
> This package family is loaded with `pi -e <package path>` and is **never
> installed or registered**, so a oneshot that needs a skill must be given that
> skill's absolute path in the prompt — there is no ambient resolution it can fall
> back on.
>
> **This skill lives in the `pi-herdr` package**, alongside `herdr-with-pi` (the
> orchestration strategy layer) and `agents/*` (ready-made subagent profiles).
> Loading `pi -e /srv/git/pi/pi-herdr` surfaces all three. The division of labour:
>
> | | 管什麼 |
> |---|---|
> | **`herdr-with-pi`** | **用哪種委派**（`oneshot` / `herdr_spawn` / headless `pi --print`）、拓樸、worktree、model 與 thinking 決策 |
> | **`delegation-guide`（本 skill）** | **怎麼寫委派 prompt** 才正確且無副作用：自包含、副作用控制、輸出 contract、review 類別 |
> | **`agents/*.md`** | **委派誰**：已建置的 subagent profile（角色、工具白名單、輸出格式） |
>
> 三者互補不重疊。先依 `herdr-with-pi` 的時機判斷速查選工具，再依本 skill 寫 prompt，
> 若 `agents/` 已有完全適用的 profile 就直接沿用（見 herdr-with-pi「用 or 建」規則）。

The `oneshot` tool runs a fully-isolated LLM session with its own context. It is
excellent for parallel exploration, context‑heavy distillation, and independent
verification. Follow these conventions every time you delegate.

## Build a self-contained prompt

Everything the sub-agent needs MUST be in the one prompt — it has zero knowledge
of your conversation.

- **Goal**: what to do, in one sentence.
- **Context**: file paths, short data excerpts, or a summary of what matters.
- **Output**: what to produce (a summary, files, an analysis, …).
- **Constraints**: any rules it must follow (boundary, format, tone).

## Prevent side-effects (CRITICAL)

Oneshot sub-agents may autonomously **run git commands**. If you are delegating
multiple tasks in parallel, or if you want to control commits yourself:

> **ALWAYS include `do NOT run any git commands` in the prompt when the sub-agent
> writes files.** Otherwise it may `git commit` — which creates races under
> parallel delegation and makes it impossible for you to review before commit.

(Other side‑effect risks are lower: oneshot cannot modify your session state or
access your context. Git writes are the main risk.)

## Give literal templates for structured output

When the sub-agent must produce files with a fixed structure (a skill, a
configuration, a test file), **paste the exact template into the prompt** and
state which fields to fill. The output quality correlates directly with how
precise the template + include/exclude boundaries are. A vague "summarise this
book" produces a book report; a template with `## Core Idea / ## Frameworks /
## Key Takeaways / ## Connects To` produces an actionable study skill.

## Parallel delegation — ensure disjoint outputs

Multiple oneshots can run concurrently. To avoid races:

- Each sub-agent writes to a **different directory** (never the same file).
- Set `do NOT run any git commands` in every prompt (see above).
- Review outputs after all finish, then commit once.

### Long-text batch processing (parallel chunks)

When one document is too long for a single sub-agent (long transcript,
multi-hundred-line translation/annotation task), split it into N segments and
run N oneshots in parallel:

- **One shared mandatory glossary in every segment's prompt** — the term table
  (preferred terms, banned terms, proper nouns to keep) must be byte-identical
  across segments, or the same concept gets N different words.
- Each segment writes to its own output file (disjoint outputs, as above).
- **After merge, always run a mechanical normalization pass** (banned-term
  grep, character-set cleanup, dedupe) — do not trust the sub-agents'
  self-reported "done, N lines"; verify counts and invariants mechanically.

## Independent review (verify your own work)

Use oneshot for the final quality check. Ask it to read your output files and
report findings (boundary violations, factual errors, missing pieces) — a fresh
pair of "eyes" catches what you overlook.

> **Before writing a review prompt from scratch, check `agents/`.** This package
> ships ready-made reviewer profiles — `regulatory-report-reviewer`,
> `code-reviewer`, `acceptance-reviewer`, `template-reviewer`,
> `eu-preflight-consistency`. Each already encodes the read-only constraint, the
> review categories, and the output contract. **Prefer a profile over an ad-hoc
> prompt**, and treat the profile as the single source of truth rather than
> keeping a second copy of its checklist in your own skill.

> **CRITICAL — reviewer inherits your inputs' errors.** A reviewer reads what
> you give it. If the input contains a factual error (wrong speaker mapping,
> incorrectly normalized number, stale term), the reviewer cannot detect it —
> it will confidently "correct" downstream claims *from the wrong premise*.
> Those corrections look doubly authoritative (they are ① independent and
> ② specific) — which makes them *more* dangerous because they dampen your
> self-review skepticism.
>
> **Rule:** always give the reviewer the **rawest source** (raw chunk text,
> original audio timestamps, unmerged transcript) — never your derived claims.
> If a review correction contradicts primary evidence, re-check against the
> primary; do not accept it because "the reviewer said so."
>
> **Concrete instance from this skill's training:** a reviewer inherited a wrong
> per-chunk speaker map and "corrected" a speaker attribution in the wrong
> direction. The correction looked plausible and came from an independent
> reviewer, so it was initially trusted over the primary (boundary-continuation)
> evidence. The secondary error cost one extra revision cycle.

### Two-round review protocol

A single review round catches content errors in the document as written.
**A second round catches errors introduced by round 1's fixes** — and those
are the hardest to self-detect because they seem to have been "already checked."
In this training session, round 1 caught misattributions; round 2 caught *new*,
systematic timestamp offsets that round 1's fix process introduced.

**Protocol:**
1. Fix round 1 findings.
2. Rebuild all artifacts.
3. Re-run the same review with an instruction: "round 1 issues have been fixed;
   focus on **new** errors introduced by the fixes."
4. Do NOT tell the reviewer what was fixed — that would bias it toward
   re-checking those spots and missing new problems.

For **code reviews**, explicitly ask the reviewer to check the categories the
author is least likely to self-detect (in practice this catches real bugs the
author missed — e.g. an abort-listener race and a fragile string-based
inference):

- **Cancellation / interrupt races**: timing between abort signals, timeouts,
  and listener registration (a listener added after `signal.aborted` is
  already true never fires — the child lingers until some other timeout).
- **Inference from identifiers / strings**: prefix collisions and implicit
  uniqueness assumptions. Rule of thumb: **record the state directly instead of
  re-deriving it later from string matching.**

  > This is **not only a code rule**. It shows up anywhere a label is matched
  > against a table of patterns. Concrete non-code instance: a citation map where
  > the pattern for `§4` also matches `§41`, or `Annex 1` also matches
  > `Annex 10`. The fix is the same in both worlds — **anchor the match
  > (`^...$`) rather than relying on ordering**, and verify coverage in both
  > directions (every label resolves, every entry is used).
- **Empty / undefined input edges**: empty lists, missing optional fields,
  zero-length payloads, vacuous `every()`/`some()` on empty arrays.
- **Known noise baseline**: tell the reviewer which diagnostics, warnings, or
  errors are pre-existing (e.g. "this repo intentionally has no package.json,
  so ~26 'cannot find module' LSP errors are expected — report only new
  ones"). Without this, the verdict gets diluted by known noise and real
  findings get buried.

### Verifying sub-agent reports

A sub-agent's **structural or quantitative claims** ("line N contains X",
"693/693 pairs matched", "N occurrences of term Y") are **hypotheses, not
facts** — the sub-agent may be reading a stale or different version of the
file than you are (concurrent edits, an external sync/checkout, a cache).

**Rules:**
- Before acting on a structural/quantitative claim, **verify it against the
  actual file with a mechanical check** (grep/wc/script) — the same
  "ask for the evidence" standard as for any number.
- When your direct check **contradicts** the sub-agent's report, do not
  conclude "the sub-agent hallucinated" on the first mismatch: **re-check which
  version of the file each side is looking at** (file mtime, `git status` —
  the file may have been modified externally between the sub-agent's read and
  your check). Both directions have happened in practice: a report that was a
  confabulation, and an identical-sounding report that was *true* because the
  file had been clobbered in between.
- Keep a small **structural invariant** per file you maintain (line count,
  key marker count) so external clobbering is detected before you build on it.
- **Binary/Office files (xlsx/docx/pptx) cannot be verified with grep** — after a
  sub-agent edits one, re-verify in the main session with a *format-aware
  independent loader*: openpyxl full load + value-range spot check, pdftotext on
  a rendered PDF, `unzip` + XML well-formedness parse. "The file was saved
  successfully" is not evidence the file is intact or holds what was claimed.

### Document / report reviews

The categories above are code-shaped. When the artefact under review is a
**document** (regulatory report, spec, analysis, plan), the errors an author is
least likely to self-detect are different — and they are mostly **counting and
coverage** problems, not logic problems. When the document is instead built
**from an ASR/transcribed source** (meeting transcript, dictated notes), a
second error class appears — **semantic fidelity to the source** — covered by
the last two rows. Ask the reviewer to check these explicitly:

| Category | What to check | Why the author misses it |
|---|---|---|
| **Numeric self-consistency** | Every number asserted in a summary matches the body tables; totals equal the sum of parts; the same figure does not appear with two values in different sections | Authors write summaries from memory or from an earlier draft; tables get edited afterwards and the summary does not follow |
| **Citation coverage** | Every citation label resolves to a real source entry; no entry exists that nothing references; every referenced document has a full name, not just a code | Silent failure — an unmatched label just renders as plain text and looks fine |
| **Translation completeness** | Where the report quotes a source language different from the reader's, every quote carries a full translation, not merely a key point | Authors remember the quotes they found hard and quietly skip the easy ones |
| **Structural integrity** | No broken tables, no mis-nested tags, TOC links all resolve, no orphan sections | Long documents assembled in pieces break at the seams, which is exactly where nobody re-reads |
| **Evidence-tier labelling** | Binding vs non-binding vs guidance vs benchmark vs personal note are each marked, and never blended | A guideline stated as a requirement reads identically to a requirement stated as a requirement |
| **Uncertainty honesty** | Every "not established / unknown" claim states **what was searched and where**, and is not actually answered elsewhere in the same corpus | Marking something unknown is the path of least resistance; the answer is often already in a neighbouring section |
| **Tone / neutrality** | No charged or sensational language; risks framed as addressable, not inevitable | Authors under time pressure write for effect |
| **Cross-reference validity** | Internal pointers ("see section 8.7") land on a section that actually covers what was promised | Sections get renumbered or repurposed during restructuring; the pointers survive but the content moved |
| **Citation direction / evidence support** *(transcribed sources)* | Every quoted passage actually *supports* the claim it accompanies (not a counter-example) and is the *right* passage (right speaker / timestamp / section) — not merely one that exists and resolves | A quote that exists and resolves passes coverage checks but can point the wrong way — the cited evidence actually undercuts, or merely resembles, the claim |
| **Source fidelity / artifact handling** *(transcribed sources)* | No ASR/OCR artifacts (mis-heard words, homophones) used as if they were the formal term; no subtype-specific restriction generalized to the whole class; no correction/appendix table row self-contradictory (one term mapped to two readings) | ASR output looks like a plausible term so it gets reused unexamined; the author writes from the transcript without re-checking the original audio / source |

**Ask for severity-tagged output and a go/no-go verdict.** An unstructured
"looks good" is worthless; a list tagged 高／中／低 with an explicit
「可定稿／需修正」 is actionable and terminates the loop.

**Run the deterministic checks yourself before delegating.** Counting, coverage
and tag balance are machine problems — do them with a script, then send the
reviewer a document that already passes. Reviewer time is better spent on logic
and framing than on arithmetic. (For regulatory HTML reports, see
`skill-regulatory-report-writing` §10.0 for ready-made scripts.)
