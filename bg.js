chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "fetchGamalytic") return;

    (async () => {
        try {
            const appId = msg.appId;
            const cacheKey = `gamalytic_${appId}`;
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;
            const normalizeGameData = (value) => value?.data ?? value;

            // Check cache first
            const cached = await chrome.storage.local.get(cacheKey);
            if (cached[cacheKey]) {
                const { data, timestamp } = cached[cacheKey];
                const normalizedData = normalizeGameData(data);
                const timeDiff = now - timestamp;

                if (timeDiff < oneDay) {
                    // Serve cached data
                    sendResponse({
                        ok: true,
                        data: normalizedData,
                        cached: true,
                        cacheAge: timeDiff,
                        lastVisit: timestamp,
                    });
                    return;
                }
            }

            // Fetch fresh data
            const url = `https://gamalytic.com/api/game-details/${appId}`;
            const res = await fetch(url, { headers: { accept: "application/json" } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const payload = await res.json();
            const data = normalizeGameData(payload);

            // Store in cache
            await chrome.storage.local.set({
                [cacheKey]: { data, timestamp: now },
            });

            // Get previous data for comparison
            const previousData = normalizeGameData(cached[cacheKey]?.data) || null;
            const lastVisit = cached[cacheKey]?.timestamp || null;

            sendResponse({
                ok: true,
                data,
                cached: false,
                previousData,
                lastVisit,
                cacheAge: null,
            });
        } catch (e) {
            sendResponse({ ok: false, error: String(e) });
        }
    })();
    return true; // keep channel open for async sendResponse
});
