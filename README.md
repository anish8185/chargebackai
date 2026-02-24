# ChargebackAI

An AI-powered dispute investigation system for card-issuing banks. Built as a take-home submission for an AI PM Lead role.

## What it does

ChargebackAI helps fraud analysts at card-issuing banks investigate cardholder disputes faster. Given a dispute case, the system:

1. **Retrieves evidence** autonomously via mock tool calls (shipping APIs, order systems, email logs)
2. **Scores the case** across three rubrics — Evidence, Risk Signals, and Customer Profile — using deterministic rules configured by a risk manager
3. **Generates a recommendation** — Fight (deny the dispute), Accept (uphold it), or Escalate for senior review
4. **Drafts outputs** — denial letters to cardholders (Fight) or investigation plans (Escalate)

The analyst interface shows the full agent reasoning trace, all scoring factors, and supports human override at every step.

## Architecture

- **Evidence Retrieval Agent** — fires parallel tool calls to populate `evidence_available.*` before scoring
- **Evidence Agent** — LLM writes detail sentences for matched evidence factors
- **Risk Agent** — LLM writes detail sentences + reasoning narrative for risk/customer factors
- **Escalation Agent** — LLM generates structured investigation plan for ambiguous cases
- **Deterministic rubric scorer** — all scoring is pure JS, no LLM involvement in numeric decisions

See `ARCHITECTURE.md` for full design documentation.

## Running locally

**Requirements:** Node.js 18+, an [Anthropic API key](https://console.anthropic.com)

```bash
git clone https://github.com/YOUR_USERNAME/chargebackai
cd chargebackai

# Install dependencies
npm install

# Add your API key
cp .env.example .env
# Edit .env and replace 'your_anthropic_api_key_here' with your actual key

# Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Test cases

Three cases are pre-loaded in the app, selectable from the Investigation tab:

| Case | Reason Code | Expected Outcome |
|------|-------------|-----------------|
| Merchandise Not Received | 13.1 | **Fight** — strong delivery evidence |
| Cancelled Recurring Transaction | 13.2 | **Escalate** — ambiguous cancellation signals |
| Not as Described | 13.3 | **Accept** — weak evidence, credible claim |

## Tech stack

- React 18 (no framework)
- Vite
- Anthropic Claude API (claude-sonnet-4-6)
- Zero external UI dependencies — all styles inline
