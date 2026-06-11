# Football Arbitrage Calculator

Private Chrome Extension Manifest V3 calculator for visible decimal odds.

This extension only calculates amount splits. It does not place bets, click betting buttons, query account APIs, bypass sportsbook protections, automate betting, store data, send data to a backend, or require login. It scans visible `document.body.innerText` only after you click Scan Current Tab or Scan Open Tabs, does not display raw page text, only keeps allowed betting-type labels, extracts selections left-to-right, tags each selection with its source tab/site, and filters obvious balance or currency-like values before showing odds candidates.

## Folder Structure

```text
arbitrage-calculator/
  manifest.json
  popup.html
  popup.js
  content.js
  styles.css
  README.md
```

## Local Install

1. Go to `chrome://extensions`.
2. Enable Developer Mode.
3. Click Load Unpacked.
4. Select this project folder: `arbitrage-calculator`.

If the target page was already open before installing the extension, reload that tab once.

## How To Use

1. Open the relevant event or market page in Chrome.
2. Open the extension popup.
3. Click Scan Current Tab for one page, or open matching event pages in the same Chrome window and click Scan Open Tabs.
4. Review the detected 1x2 Odds section. Each chip is shown as selection initials plus odds and source, for example `M : 1.08` for Mexico.
5. Select the 3 detected 1x2 odds from the exact same event and exact same market.
6. Edit selected odds if needed.
7. Enter total amount.
8. Click Calculate for manually selected odds, or click Find Arbitrage to search scanned 1x2 odds in 3-way mode.
9. For Find Arbitrage results, manually verify every candidate is from the exact same event, exact same market, and all required outcomes before using the displayed amount split.
10. Recalculate after every odds change.

*IMPORTANT NOTE : Works best for Football odds (as of now)*

## Testing

1. Load the extension in Chrome using Load Unpacked.
2. Open a page with visible decimal odds.
3. Click Scan Current Tab and confirm decimal odds appear left-to-right as selection chips grouped only under the 1x2 heading.
4. Open multiple matching event pages in the same Chrome window, click Scan Open Tabs, and confirm source names appear on detected chips and candidates.
5. Switch between 2-way and 3-way mode and confirm the selected odds count changes.
6. Select odds, edit one selected odd, enter a total amount, and click Calculate.
7. Confirm the result shows arbitrage YES/NO, implied probability, amount split, gross returns, guaranteed gross return, and ROI.
8. Click Find Arbitrage after entering a total amount and confirm it lists positive guaranteed arbitrage candidates when the scanned odds contain a qualifying 3-way 1x2 combination.
9. Click Use on a candidate and confirm it loads into the selected odds calculator.
10. Try invalid inputs:
   - No selected odds.
   - Only one selected odd in 2-way mode.
   - Empty or zero total amount.
   - Edited odds at or below 1.00.

## Find Arbitrage

Find Arbitrage searches every generated 3-way combination inside detected 1x2 sections. It first checks `arb_sum = sum(1 / odds)` for each eligible combination. Only combinations where `arb_sum < 1` move on to amount-split and ROI calculation. After Scan Open Tabs, candidates must use at least two different source sites.

The search is intentionally scoped to detected betting-type sections because page text does not reliably expose event boundaries across sites. A candidate can still be invalid if the odds are from different events, similar-but-different markets, suspended markets, or incomplete outcomes. Always verify before acting outside the extension.

## Chrome Permissions

The extension uses `tabs`, `activeTab`, `scripting`, and `http/https` host permissions so Scan Open Tabs can inject the local content script into open pages in the current Chrome window after you click the button. It does not run a background scanner, store scanned data, or send scanned data anywhere.

Allowed scan and Find Arbitrage market:

- 1x2

Restricted markets ignored by scan and Find Arbitrage:

- Anytime Goalscorer
- Half-time/Full-time
- Correct Score and 1st Half Correct Score
- 1x2 and Both Teams to Score
- Asian Handicap
- Asian Total
- 1x2 (1UP)
- 1x2 (2UP)
- Draw no bet
- Double Chance

## Calculation

For decimal odds:

```text
implied_probability = 1 / decimal_odds
```

For Find Arbitrage, `arb_sum` is the same value as total implied probability. Arbitrage exists when:

```text
sum_implied_probabilities < 1
```

Amount for each outcome:

```text
amount_i = total_amount * ((1 / odds_i) / sum_implied_probabilities)
```

Gross return:

```text
return_i = amount_i * odds_i
```

The displayed guaranteed gross return uses the lowest return after the displayed amounts are rounded to cents.

ROI:

```text
ROI = ((guaranteed_return - total_amount) / total_amount) * 100
```

## Risk Controls

- This tool only calculates amounts and does not place bets.
- Odds can move before bets are placed.
- Check all selected odds are from the exact same event and exact same market.
- Do not mix similar but different markets.
- Check limits before placing the first bet.
- Check whether the market is suspended.
- Recalculate after every odds change.
