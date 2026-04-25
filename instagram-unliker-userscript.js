// ==UserScript==
// @name         Instagram Unlike Helper
// @namespace    personal
// @version      2.0.0
// @description  Simple, safe bulk unlike for Instagram's Your Activity page
// @author       JM01
// @match        https://www.instagram.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // ─── CONFIG ───────────────────────────────────────────────────────────────
    // How many posts to unlike per batch (keep under 50 to stay safe)
    const BATCH_SIZE = 30;

    // Delay between each checkbox click in ms.
    // Adds random jitter ±300ms on top of this to look human.
    const BASE_DELAY_MS = 1200;

    // After each full batch, pause this long before starting the next one.
    // This is the most important number for avoiding rate limits.
    const COOLDOWN_BETWEEN_BATCHES_MS = 8000;
    // ──────────────────────────────────────────────────────────────────────────

    let running = false;
    let stopRequested = false;

    // Only show the button on the Likes activity page
    function onLikesPage() {
        return window.location.pathname.includes('/your_activity/interactions/likes');
    }

    // Human-like random delay
    function wait(ms) {
        const jitter = Math.floor(Math.random() * 600) - 300; // ±300ms
        const total = Math.max(200, ms + jitter);
        return new Promise(resolve => setTimeout(resolve, total));
    }

    // Click a DOM element safely
    function tap(el) {
        if (!el) return;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    // Wait for a visible element matching selector (optionally with exact text)
    function waitFor(selector, text = null, timeout = 15000) {
        return new Promise((resolve) => {
            const deadline = Date.now() + timeout;
            const interval = setInterval(() => {
                const els = Array.from(document.querySelectorAll(selector));
                const el = text
                    ? els.find(e => e.textContent.trim() === text)
                    : els[0];
                if (el) { clearInterval(interval); resolve(el); }
                else if (Date.now() > deadline) { clearInterval(interval); resolve(null); }
            }, 300);
        });
    }

    async function runBatch() {
        updateUI('running');

        // 1. Click "Select"
        const selectBtn = await waitFor('span', 'Select');
        if (!selectBtn) { log('Could not find Select button. Are you on the Likes page?'); stop(); return; }
        tap(selectBtn);
        await wait(700);

        // 2. Scroll to load items
        log(`Scrolling to load ${BATCH_SIZE} items...`);
        let checkboxes = [];
        let stable = 0;
        let lastCount = 0;

        while (!stopRequested && checkboxes.length < BATCH_SIZE && stable < 3) {
            checkboxes = Array.from(document.querySelectorAll('div[role="button"][aria-label="Toggle checkbox"]'));
            if (checkboxes.length >= BATCH_SIZE) break;
            if (checkboxes.length === lastCount) stable++;
            else { stable = 0; lastCount = checkboxes.length; }
            const container = document.querySelector('div[data-bloks-name="bk.components.Collection"]');
            if (container) container.scrollTop = container.scrollHeight;
            await wait(1500);
        }

        if (stopRequested) { stop(); return; }
        if (checkboxes.length === 0) {
            log('🎉 No more liked posts found! You\'re all done.');
            stop();
            return;
        }

        // 3. Select items
        const toClick = checkboxes.slice(0, BATCH_SIZE);
        log(`Selecting ${toClick.length} posts...`);
        for (let i = 0; i < toClick.length; i++) {
            if (stopRequested) { stop(); return; }
            tap(toClick[i]);
            await wait(BASE_DELAY_MS);
            updateUI('running', `${i + 1} / ${toClick.length} selected`);
        }

        // 4. Click Unlike
        const unlikeSpan = await waitFor('div[role="button"] span', 'Unlike');
        if (!unlikeSpan) { log('Could not find Unlike button.'); stop(); return; }
        tap(unlikeSpan);
        await wait(600);

        // 5. Confirm in the dialog
        const confirmBtn = await waitFor('button', 'Unlike');
        if (!confirmBtn) { log('Could not find confirm button.'); stop(); return; }
        tap(confirmBtn);
        log(`✅ Unliked ${toClick.length} posts. Cooling down ${COOLDOWN_BETWEEN_BATCHES_MS / 1000}s...`);
        updateUI('cooling');

        // 6. Wait for UI to settle
        await waitFor('span', 'Select', 20000);
        await wait(COOLDOWN_BETWEEN_BATCHES_MS);

        // 7. Loop
        if (!stopRequested) runBatch();
        else stop();
    }

    function stop() {
        running = false;
        stopRequested = false;
        updateUI('idle');
        log('Stopped.');
    }

    // ─── UI ──────────────────────────────────────────────────────────────────
    let panel, statusEl, logEl, btn;

    function buildPanel() {
        panel = document.createElement('div');
        panel.id = 'ulk-panel';
        panel.innerHTML = `
            <div id="ulk-title">Unlike Helper</div>
            <div id="ulk-status">Ready</div>
            <button id="ulk-btn">▶ Start</button>
            <div id="ulk-log"></div>
            <div id="ulk-hint">Batch: ${BATCH_SIZE} · Delay: ~${BASE_DELAY_MS}ms · Cooldown: ${COOLDOWN_BETWEEN_BATCHES_MS/1000}s</div>
        `;
        document.body.appendChild(panel);

        btn = panel.querySelector('#ulk-btn');
        statusEl = panel.querySelector('#ulk-status');
        logEl = panel.querySelector('#ulk-log');

        btn.addEventListener('click', () => {
            if (!onLikesPage()) {
                alert('Go to Instagram → Your Activity → Likes first, then click Start.');
                return;
            }
            if (running) {
                stopRequested = true;
                btn.textContent = 'Stopping...';
                btn.disabled = true;
            } else {
                running = true;
                stopRequested = false;
                runBatch();
            }
        });
    }

    function updateUI(state, detail = '') {
        if (!btn || !statusEl) return;
        if (state === 'running') {
            btn.textContent = '■ Stop';
            btn.disabled = false;
            statusEl.textContent = detail || 'Running...';
            statusEl.className = 'running';
        } else if (state === 'cooling') {
            btn.textContent = '■ Stop';
            statusEl.textContent = `Cooling down...`;
            statusEl.className = 'cooling';
        } else {
            btn.textContent = '▶ Start';
            btn.disabled = false;
            statusEl.textContent = 'Ready';
            statusEl.className = '';
        }
    }

    function log(msg) {
        if (!logEl) return;
        const line = document.createElement('div');
        line.textContent = msg;
        logEl.prepend(line);
        // Keep last 5 messages
        while (logEl.children.length > 5) logEl.removeChild(logEl.lastChild);
        console.log('[Unlike Helper]', msg);
    }

    GM_addStyle(`
        #ulk-panel {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 220px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 14px;
            padding: 16px;
            z-index: 99999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 12px;
            color: #e0e0e0;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        #ulk-title {
            font-size: 13px;
            font-weight: 700;
            margin-bottom: 8px;
            color: #fff;
            letter-spacing: 0.3px;
        }
        #ulk-status {
            font-size: 11px;
            color: #888;
            margin-bottom: 10px;
            min-height: 16px;
        }
        #ulk-status.running { color: #4caf50; }
        #ulk-status.cooling { color: #ff9800; }
        #ulk-btn {
            width: 100%;
            padding: 9px;
            border: none;
            border-radius: 8px;
            background: #0095f6;
            color: #fff;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.2s;
            margin-bottom: 10px;
        }
        #ulk-btn:hover { background: #007fd4; }
        #ulk-btn:disabled { background: #444; cursor: default; }
        #ulk-log {
            font-size: 10px;
            color: #777;
            line-height: 1.5;
        }
        #ulk-log div { border-top: 1px solid #2a2a2a; padding-top: 3px; margin-top: 3px; }
        #ulk-hint {
            margin-top: 8px;
            font-size: 10px;
            color: #555;
            border-top: 1px solid #2a2a2a;
            padding-top: 8px;
        }
    `);

    // Build the panel once the page is ready
    if (document.readyState === 'complete') buildPanel();
    else window.addEventListener('load', buildPanel);

})();
