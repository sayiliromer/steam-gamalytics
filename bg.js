const CACHE_TTL = 24 * 60 * 60 * 1000;

function normalizeGameData(value) {
    return value?.data ?? value;
}

function isLikelyBrowserCheck(error) {
    return error?.status === 403 || error?.status === 429 || error?.status === 503 || error?.code === "NON_JSON_RESPONSE";
}

function cookieStorageKey(cookie) {
    const expiresAt = cookie.expirationDate ? Math.round(cookie.expirationDate) : "session";
    return `gamalytic_cookie_${cookie.name}_${cookie.domain}_${cookie.path}_${expiresAt}`;
}

async function getGamalyticCookieStatus() {
    if (!chrome.cookies?.getAll) return null;

    const cookies = await chrome.cookies.getAll({ domain: "gamalytic.com" });
    const liveCookies = cookies.filter((cookie) => {
        return !cookie.expirationDate || cookie.expirationDate * 1000 > Date.now();
    });

    if (!liveCookies.length) return null;

    const browserCheckCookie =
        liveCookies.find((cookie) => cookie.name === "cf_clearance") ||
        liveCookies.find((cookie) => cookie.name.toLowerCase().includes("clearance")) ||
        liveCookies
            .filter((cookie) => cookie.expirationDate)
            .sort((a, b) => b.expirationDate - a.expirationDate)[0] ||
        liveCookies[0];

    const key = cookieStorageKey(browserCheckCookie);
    const stored = await chrome.storage.local.get(key);
    const firstSeen = stored[key] || Date.now();

    if (!stored[key]) {
        await chrome.storage.local.set({ [key]: firstSeen });
    }

    return {
        name: browserCheckCookie.name,
        age: Date.now() - firstSeen,
        firstSeen,
        expiresAt: browserCheckCookie.expirationDate ? browserCheckCookie.expirationDate * 1000 : null,
    };
}

async function fetchGameDetails(appId) {
    const url = `https://gamalytic.com/api/game-details/${appId}`;
    const res = await fetch(url, {
        credentials: "include",
        headers: {
            accept: "application/json",
        },
    });

    if (!res.ok) {
        const error = new Error(`HTTP ${res.status}`);
        error.status = res.status;
        throw error;
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        const error = new Error(`Expected JSON, got ${contentType || "unknown content type"}`);
        error.code = "NON_JSON_RESPONSE";
        throw error;
    }

    return normalizeGameData(await res.json());
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "fetchGamalytic") return;

    (async () => {
        try {
            const appId = msg.appId;
            const cacheKey = `gamalytic_${appId}`;
            const now = Date.now();
            const cookieStatus = await getGamalyticCookieStatus();

            // Check cache first
            const cached = await chrome.storage.local.get(cacheKey);
            if (cached[cacheKey]) {
                const { data, timestamp } = cached[cacheKey];
                const normalizedData = normalizeGameData(data);
                const timeDiff = now - timestamp;

                if (timeDiff < CACHE_TTL) {
                    // Serve cached data
                    sendResponse({
                        ok: true,
                        data: normalizedData,
                        cached: true,
                        cacheAge: timeDiff,
                        cookieStatus,
                        lastVisit: timestamp,
                    });
                    return;
                }
            }

            // Fetch fresh data
            const data = await fetchGameDetails(appId);
            const refreshedCookieStatus = await getGamalyticCookieStatus();

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
                cookieStatus: refreshedCookieStatus,
            });
        } catch (e) {
            const cached = await chrome.storage.local.get(`gamalytic_${msg.appId}`);
            const cacheEntry = cached[`gamalytic_${msg.appId}`];
            const needsBrowserCheck = isLikelyBrowserCheck(e);
            const cookieStatus = await getGamalyticCookieStatus();

            if (cacheEntry?.data) {
                const normalizedData = normalizeGameData(cacheEntry.data);
                sendResponse({
                    ok: true,
                    data: normalizedData,
                    cached: true,
                    stale: true,
                    cacheAge: Date.now() - cacheEntry.timestamp,
                    cookieStatus,
                    lastVisit: cacheEntry.timestamp,
                    needsBrowserCheck,
                    error: String(e),
                });
                return;
            }

            sendResponse({
                ok: false,
                needsBrowserCheck,
                cookieStatus,
                error: String(e),
            });
        }
    })();
    return true; // keep channel open for async sendResponse
});
