(function () {
    const m = location.pathname.match(/\/app\/(\d+)\b/);
    if (!m) return;
    const appId = m[1];
    const targetEl = document.querySelector(".user_reviews_summary_row")?.parentElement;

    // Find the "Is this game relevant to you?" block
    const referenceEl = document.querySelector(".glance_ctn_responsive_left");


    if (!referenceEl) return;

        chrome.runtime.sendMessage({ type: "fetchGamalytic", appId }, (res) => {
        if (!res?.ok || !res.data) {
            return;
        }
        
        const d = res.data;
        const previousData = res.previousData;
        const lastVisit = res.lastVisit;
        const cacheAge = res.cacheAge;
        const isCached = res.cached;

        const released = d.unreleased === false;

        const copiesSold =
            d.copiesSold ?? d.owners ?? d?.estimateDetails?.reviewBased ?? 0;

        const revenue =
            d.revenue ??
            d.totalRevenue ??
            d.grossRevenue ??
            d.netRevenue ??
            d?.estimateDetails?.revenue ??
            null;

        const dailyWishlists = Math.floor(d.predictions?.gain ?? 0);

        const reviewScore = d.reviewScore ?? d?.history?.at(-1)?.score ?? null;

        const reviewCount =
            d.reviewsSteam ?? d.reviews ?? d?.history?.at(-1)?.reviews ?? null;

        const wishlists = d.wishlists ?? d?.history?.at(-1)?.wishlists ?? null;

        // Additional metrics that might be available
        const peakPlayers = d.peakPlayers ?? d?.history?.at(-1)?.peakPlayers ?? null;
        const currentPlayers =
            d.currentPlayers ?? d?.history?.at(-1)?.players ?? null;
        const price = d.price ?? d.currentPrice ?? null;
        const releaseDate = d.releaseDate ?? d.releasedAt ?? null;

        // Create a new info block
        // Create a new info block
        const newBlock = document.createElement("div");

        if(released) {
            const sales7Days = calcSalesLast7Days(d.history);
            const avgPlaytime = d.avgPlaytime ?? d?.avgPlaytime ?? 0;
            newBlock.innerHTML = `
            <div class="gamalytics-block">
                <div class="gamalytics-header">
                <b>Gamalytics</b>
                ${isCached ? `<span class="gamalytics-cache">${cacheAge != null ? fmtTimeAgo(Date.now() - cacheAge) : ""}</span>` : ""}
                </div>
                <div class="gamalytics-stats">
                <div class="gamalytics-stat">
                    <span class="gamalytics-label">Revenue</span>
                    <span class="gamalytics-value">${fmtMoney(revenue)}</span>
                </div>
                <div class="gamalytics-stat">
                    <span class="gamalytics-label">Copies Sold</span>
                    <span class="gamalytics-value">${copiesSold.toLocaleString()}</span>
                </div>
                <div class="gamalytics-stat">
                    <span class="gamalytics-label">Weekly Sales</span>
                    <span class="gamalytics-value">${sales7Days.toLocaleString()}</span>
                </div>
                <div class="gamalytics-stat">
                    <span class="gamalytics-label">Avg Playtime</span>
                    <span class="gamalytics-value">${avgPlaytime.toFixed(1)} hrs</span>
                </div>
                <div class="gamalytics-stat">
                    <span class="gamalytics-label">Current Players</span>
                    <span class="gamalytics-value">${currentPlayers?.toLocaleString() ?? "N/A"}</span>
                </div>
                </div>
            </div>
            `
        }
        else {
        newBlock.innerHTML = `
            <div class="gamalytics-block">
            <div class="gamalytics-header">
                <b>Gamalytics</b>
                ${isCached ? `<span class="gamalytics-cache">${cacheAge != null ? fmtTimeAgo(Date.now() - cacheAge) : ""}</span>` : ""}
            </div>
            <div class="gamalytics-stats">
                <div class="gamalytics-stat">
                <span class="gamalytics-label">Wishlists</span>
                <span class="gamalytics-value">${wishlists.toLocaleString()}</span>
                </div>
                <div class="gamalytics-stat">
                <span class="gamalytics-label">Daily Gain</span>
                <span class="gamalytics-value">+${dailyWishlists.toLocaleString()}</span>
                </div>
            </div>
            </div>
        `;
        }
            
        // Insert below review info
        //targetEl.insertAdjacentElement("afterend", infoDiv);
        referenceEl.appendChild(newBlock);
    });

       function fmtInt(v) {
        if (v == null || v === "N/A") return "N/A";
        const n = Number(v);
        return Number.isFinite(n) ? n.toLocaleString() : String(v);
    }

    function calcSalesLast7Days(history) {
          if (!history?.length) return 0;

          const h = [...history].sort((a, b) => a.timeStamp - b.timeStamp);
          const last = h[h.length - 1];
          const targetTime = last.timeStamp - 7 * 24 * 60 * 60 * 1000; // 7 days before last

          // Find closest entry before the 7-day mark
          let before = null;
          let after = null;
          for (let i = h.length - 2; i >= 0; i--) {
            if (h[i].timeStamp <= targetTime) {
              before = h[i];
              after = h[i + 1] || last;
              break;
            }
          }
      
          let salesAt7DaysAgo;
      
          if (before && after) {
            // interpolate between 'before' and 'after'
            const t = (targetTime - before.timeStamp) / (after.timeStamp - before.timeStamp);
            salesAt7DaysAgo = before.sales + t * (after.sales - before.sales);
          } else {
            // no 7-day-old data → extrapolate using oldest entry
            const first = h[0];
            const daysBetween = (last.timeStamp - first.timeStamp) / (1000 * 60 * 60 * 24);
            const salesDiff = last.sales - first.sales;
            const salesPerDay = salesDiff / daysBetween;
            salesAt7DaysAgo = last.sales - salesPerDay * 7;
          }
      
          const salesIn7Days = Math.round(last.sales - salesAt7DaysAgo);
          return salesIn7Days;
    }

    function fmtCompact(v) {
        if (v == null || v === "N/A") return "N/A";
        const n = Number(v);
        if (!Number.isFinite(n)) return String(v);

        if (n >= 1000000) {
            return (n / 1000000).toFixed(1) + "m";
        } else if (n >= 1000) {
            return (n / 1000).toFixed(1) + "k";
        }
        return n.toLocaleString();
    }

    function fmtMoney(v) {
        if (v == null) return "N/A";
        const n = Number(v);
        return Number.isFinite(n) ? "$" + Math.round(n).toLocaleString() : String(v);
    }

    function fmtPrice(v) {
        if (v == null) return "N/A";
        const n = Number(v);
        return Number.isFinite(n) ? "$" + n.toFixed(2) : String(v);
    }

    function fmtTimeAgo(timestamp) {
        if (!timestamp) return null;
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return "Just now";
    }

    function fmtDiff(value, label) {
        if (value == null || value === 0) return null;
        const sign = value > 0 ? "+" : "";
        return `${sign}${fmtInt(value)} ${label}`;
    }
})();
