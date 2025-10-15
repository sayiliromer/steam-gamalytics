(function () {
    const m = location.pathname.match(/\/app\/(\d+)\b/);
    if (!m) return;
    const appId = m[1];
    const targetEl = document.querySelector(".user_reviews_summary_row")?.parentElement;

// Find the "Is this game relevant to you?" block
const referenceEl = document.querySelector(".block.responsive_apppage_details_right.heading");

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

        // Calculate differences if we have previous data
        let differences = null;
        if (previousData) {
            const prevReleased = previousData.unreleased === false;
            const prevCopiesSold =
                previousData.copiesSold ??
                previousData.owners ??
                previousData?.estimateDetails?.reviewBased ??
                0;
            const prevRevenue =
                previousData.revenue ??
                previousData.totalRevenue ??
                previousData.grossRevenue ??
                previousData.netRevenue ??
                previousData?.estimateDetails?.revenue ??
                null;
            const prevReviewScore =
                previousData.reviewScore ?? previousData?.history?.at(-1)?.score ?? null;
            const prevReviewCount =
                previousData.reviewsSteam ??
                previousData.reviews ??
                previousData?.history?.at(-1)?.reviews ??
                null;
            const prevWishlists =
                previousData.wishlists ??
                previousData?.history?.at(-1)?.wishlists ??
                null;

            differences = {
                copiesSold: Number(copiesSold) - Number(prevCopiesSold),
                revenue: Number(revenue) - Number(prevRevenue),
                reviewScore: Number(reviewScore) - Number(prevReviewScore),
                reviewCount: Number(reviewCount) - Number(prevReviewCount),
                wishlists: Number(wishlists) - Number(prevWishlists),
            };
        }

        console.log(d);
        // Create a new info block
        const newBlock = document.createElement("div");
        newBlock.className = "block responsive_apppage_details_left";
        if(released) {
            // If period < 7 days, extrapolate weekly sales
            const sales7Days = calcSalesLast7Days(d.history);
            const avgPlaytime = d.avgPlaytime ?? d?.avgPlaytime ?? 0;
            // infoDiv.innerHTML = `
            //   <div class="game_review_summary">
            //     <b>Gamalytics info</b>
            //     ${isCached ? ` (cached ${cacheAge != null ? `${fmtTimeAgo(Date.now() - cacheAge)}` : ""})` : ""}
            //     <br>
            //     <b>Gross revenue:</b> ${fmtMoney(revenue)}
            //     <br>
            //     <b>Coppies sold:</b> ${copiesSold.toLocaleString()}
            //     <br>
            //     <b>Weeky sales:</b> ${sales7Days.toLocaleString()}
            //     <br>
            //     <b>Avg playtime:</b> ${avgPlaytime.toFixed(1)} hrs
            //     <br>
            //     <b>Current players:</b> ${currentPlayers}
            //   </div>
            // `;

            newBlock.innerHTML = `
              <div class="game_review_summary">
                <b>Gamalytics info</b>
                ${isCached ? ` (cached ${cacheAge != null ? `${fmtTimeAgo(Date.now() - cacheAge)}` : ""})` : ""}
                <br>
                <b>Gross revenue:</b> ${fmtMoney(revenue)}
                <br>
                <b>Coppies sold:</b> ${copiesSold.toLocaleString()}
                <br>
                <b>Weeky sales:</b> ${sales7Days.toLocaleString()}
                <br>
                <b>Avg playtime:</b> ${avgPlaytime.toFixed(1)} hrs
                <br>
                <b>Current players:</b> ${currentPlayers}
              </div>
            `
        }
        else {
          newBlock.innerHTML = `
            <div class="game_review_summary">
                <b>Gamalytics info</b>
                ${isCached ? ` (cached ${cacheAge != null ? `${fmtTimeAgo(Date.now() - cacheAge)}` : ""})` : ""}
                <br>
                <b>Wishlist:</b> ${wishlists.toLocaleString()} (${dailyWishlists.toLocaleString()} daily)
            </div>
          `;
        }
            
        // Insert below review info
        //targetEl.insertAdjacentElement("afterend", infoDiv);
        referenceEl.parentElement.insertBefore(newBlock, referenceEl);
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
