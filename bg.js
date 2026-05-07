const CACHE_TTL = 24 * 60 * 60 * 1000;
const BROWSER_CHECK_RETRY_DELAY = 3500;
const BROWSER_CHECK_TAB_TIMEOUT = 20000;
const BROWSER_CHECK_ATTEMPT_COOLDOWN = 5 * 60 * 1000;
const LAST_BROWSER_CHECK_ATTEMPT_KEY = "gamalytic_last_browser_check_attempt";

let browserCheckRecoveryPromise = null;

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

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForTabComplete(tabId, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        const timeoutId = setTimeout(() => finish(), timeoutMs);

        function finish() {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve();
        }

        function onUpdated(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === "complete") {
                finish();
            }
        }

        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.get(tabId)
            .then((tab) => {
                if (tab.status === "complete") finish();
            })
            .catch(() => finish());
    });
}

async function shouldAttemptBrowserCheckRecovery() {
    const stored = await chrome.storage.local.get(LAST_BROWSER_CHECK_ATTEMPT_KEY);
    const lastAttempt = stored[LAST_BROWSER_CHECK_ATTEMPT_KEY] || 0;
    return Date.now() - lastAttempt > BROWSER_CHECK_ATTEMPT_COOLDOWN;
}

async function refreshGamalyticBrowserAccess(appId) {
    if (!chrome.tabs?.create || !(await shouldAttemptBrowserCheckRecovery())) {
        return false;
    }

    if (!browserCheckRecoveryPromise) {
        browserCheckRecoveryPromise = (async () => {
            await chrome.storage.local.set({ [LAST_BROWSER_CHECK_ATTEMPT_KEY]: Date.now() });

            let tab = null;
            try {
                tab = await chrome.tabs.create({
                    url: `https://gamalytic.com/game/${appId}`,
                    active: false,
                });

                if (tab.id) {
                    await waitForTabComplete(tab.id, BROWSER_CHECK_TAB_TIMEOUT);
                }
                await delay(BROWSER_CHECK_RETRY_DELAY);
                return true;
            } finally {
                if (tab?.id) {
                    try {
                        await chrome.tabs.remove(tab.id);
                    } catch {
                        // The user may have closed it first.
                    }
                }
            }
        })().finally(() => {
            browserCheckRecoveryPromise = null;
        });
    }

    return browserCheckRecoveryPromise;
}

async function fetchGameDetailsWithRecovery(appId) {
    try {
        return {
            data: await fetchGameDetails(appId),
            recoveredBrowserCheck: false,
        };
    } catch (error) {
        if (!isLikelyBrowserCheck(error)) {
            throw error;
        }

        const recoveryAttempted = await refreshGamalyticBrowserAccess(appId);
        if (!recoveryAttempted) {
            throw error;
        }

        return {
            data: await fetchGameDetails(appId),
            recoveredBrowserCheck: true,
        };
    }
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

            // Fetch fresh data, refreshing browser-check cookies once if Gamalytic blocks the API.
            const { data, recoveredBrowserCheck } = await fetchGameDetailsWithRecovery(appId);
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
                recoveredBrowserCheck,
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
