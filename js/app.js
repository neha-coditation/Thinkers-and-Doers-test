(() => {
  "use strict";

  /*
   * Thinkers & Doers
   * Contentful-compatible + content.json fallback
   *
   * Current Contentful models:
   * Episode:
   *   name, description, episodeDate, status[], episodeNumber,
   *   episodeVideo, episodeDate, status[], guests[]
   *
   * Guest:
   *   name, headline, bio, headshot, socialLinks[]
   *
   * SocialLink:
   *   provider[], url
   */

  const CONFIG = window.CONTENTFUL_CONFIG || {
    spaceId: "",
    environment: "master",
    deliveryToken: "",
    contentType: "episode",
    enabled: false
  };

  const CONTENT_URL = "content.json";

  const $ = (selector, root = document) => root.querySelector(selector);

  const escapeHTML = (value = "") =>
    String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));

  function getStatus(episode) {
    const status = episode?.status;

    if (Array.isArray(status)) {
      return status[0] || "";
    }

    return status || "";
  }

  function getImageUrl(image) {
    if (!image) return "";

    // Local content.json image path
    if (typeof image === "string") {
      if (image.startsWith("//")) return "https:" + image;
      return image;
    }

    // Contentful linked asset after normalization
    if (image.url) {
      return image.url.startsWith("//") ? "https:" + image.url : image.url;
    }

    return "";
  }

  function getVideoUrl(video) {
    if (!video) return "";

    if (typeof video === "string") {
      return video.startsWith("//") ? "https:" + video : video;
    }

    if (video.url) {
      return video.url.startsWith("//") ? "https:" + video.url : video.url;
    }

    if (video.fields?.file?.url) {
      const url = video.fields.file.url;
      return url.startsWith("//") ? "https:" + url : url;
    }

    return "";
  }

  function getSocialProvider(link) {
    if (!link) return "";

    if (Array.isArray(link.provider)) {
      return link.provider[0] || "";
    }

    return link.provider || "";
  }

  function normalizeFallback(data) {
    const episodes = Array.isArray(data?.episodes) ? data.episodes : [];

    return {
      episodes: episodes.map(normalizeEpisode)
    };
  }

  function normalizeEpisode(episode) {
    const guests = Array.isArray(episode?.guests)
      ? episode.guests.map(normalizeGuest)
      : [];

    return {
      id: episode?.id || "",
      name: episode?.name || episode?.title || "",
      description: episode?.description || "",
      episodeDate: episode?.episodeDate || null,
      status: Array.isArray(episode?.status)
        ? episode.status
        : [episode?.status || ""],
      episodeNumber: Number(
        episode?.episodeNumber ??
        episode?.number ??
        0
      ),
      format: episode?.format || "Conversation",
      durationMinutes:
        episode?.durationMinutes ??
        episode?.duration ??
        null,
      watchUrl: episode?.watchUrl || "#",
      episodeVideo: getVideoUrl(episode?.episodeVideo || episode?.video || ""),
      episodeThumbnail: getImageUrl(
        episode?.episodeThumbnail || episode?.thumbnail || ""
      ),
      stillImage: getImageUrl(
        episode?.stillImage || episode?.image || ""
      ),
      guests
    };
  }

  function normalizeGuest(guest) {
    const socialLinks = Array.isArray(guest?.socialLinks)
      ? guest.socialLinks.map(link => ({
          provider: getSocialProvider(link),
          url: link?.url || "#"
        }))
      : [];

    return {
      id: guest?.id || "",
      name: guest?.name || "",
      headline: guest?.headline || "",
      bio: guest?.bio || "",
      headshot: getImageUrl(
        guest?.headshot || guest?.image || ""
      ),
      socialLinks
    };
  }

  async function loadFallback() {
    const response = await fetch(CONTENT_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `Could not load ${CONTENT_URL} (${response.status})`
      );
    }

    const data = await response.json();
    return normalizeFallback(data);
  }

  async function loadContentful() {
    if (
      !CONFIG.enabled ||
      !CONFIG.spaceId ||
      !CONFIG.deliveryToken
    ) {
      return null;
    }

    const environment = CONFIG.environment || "master";

    const endpoint =
      `https://cdn.contentful.com/spaces/` +
      `${encodeURIComponent(CONFIG.spaceId)}/environments/` +
      `${encodeURIComponent(environment)}/entries`;

    const params = new URLSearchParams({
      access_token: CONFIG.deliveryToken,
      content_type: CONFIG.contentType || "episode",
      include: "3",
      limit: "1000"
    });

    const response = await fetch(
      `${endpoint}?${params.toString()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(
        `Contentful returned HTTP ${response.status}`
      );
    }

    const data = await response.json();

    return normalizeContentful(data);
  }

  async function normalizeContentful(data) {
    const includedEntries =
      data?.includes?.Entry || [];

    const includedAssets =
      data?.includes?.Asset || [];

    const entries = new Map(
      includedEntries.map(entry => [entry.sys.id, entry])
    );

    const assets = new Map(
      includedAssets.map(asset => [asset.sys.id, asset])
    );

    async function resolveAsset(link, allowDirectFetch = true) {
      const assetId = link?.sys?.id;

      if (!assetId) return "";

      const asset = assets.get(assetId);
      const url = asset?.fields?.file?.url || "";

      if (url) {
        return url.startsWith("//") ? "https:" + url : url;
      }

      // Contentful sometimes does not include the linked Asset in the
      // `includes.Asset` array. Fetch that Asset directly when needed.
      if (!allowDirectFetch) return "";

      try {
        const assetEndpoint =
          `https://cdn.contentful.com/spaces/${encodeURIComponent(CONFIG.spaceId)}` +
          `/environments/${encodeURIComponent(CONFIG.environment || "master")}` +
          `/assets/${encodeURIComponent(assetId)}?access_token=${encodeURIComponent(CONFIG.deliveryToken)}`;

        const assetResponse = await fetch(assetEndpoint, { cache: "no-store" });
        if (!assetResponse.ok) {
          console.warn(`Could not fetch Contentful asset ${assetId}: HTTP ${assetResponse.status}`);
          return "";
        }

        const directAsset = await assetResponse.json();
        const directUrl = directAsset?.fields?.file?.url || "";

        return directUrl
          ? (directUrl.startsWith("//") ? "https:" + directUrl : directUrl)
          : "";
      } catch (error) {
        console.warn("Could not resolve Contentful asset:", assetId, error);
        return "";
      }
    }

    async function resolveGuest(link) {
      const guestId = link?.sys?.id;
      const guest = entries.get(guestId);

      if (!guest) return null;

      const fields = guest.fields || {};

      const socialLinks = Array.isArray(fields.socialLinks)
        ? fields.socialLinks
            .map(link => {
              const social = entries.get(link?.sys?.id);

              if (!social) return null;

              return {
                provider: getSocialProvider(
                  social.fields || {}
                ),
                url: social.fields?.url || "#"
              };
            })
            .filter(Boolean)
        : [];

      return {
        id: guest.sys.id,
        name: fields.name || "",
        headline: fields.headline || "",
        bio: fields.bio || "",
        headshot: await resolveAsset(fields.headshot, true),
        socialLinks
      };
    }

    const episodes = await Promise.all((data?.items || []).map(async item => {
      const fields = item.fields || {};

      const guests = Array.isArray(fields.guests)
        ? (await Promise.all(fields.guests.map(resolveGuest))).filter(Boolean)
        : [];

      const episodeVideo = await resolveAsset(fields.episodeVideo, true);
      const episodeThumbnail = await resolveAsset(fields.episodeThumbnail, true);
      const stillImage = await resolveAsset(fields.stillImage, true);

      return {
        id: item.sys.id,
        name: fields.name || "",
        description: fields.description || "",
        episodeDate: fields.episodeDate || null,
        status: Array.isArray(fields.status)
          ? fields.status
          : [fields.status || ""],
        episodeNumber: Number(
          fields.episodeNumber || 0
        ),
        format: fields.format || "Conversation",
        durationMinutes:
          fields.duration ?? null,
        watchUrl: fields.watchUrl || "#",
        episodeVideo,
        episodeThumbnail,
        stillImage,
        guests
      };
    }));

    return { episodes };
  }

  function isPublic(episode) {
    return getStatus(episode) === "public";
  }

  function isUpcoming(episode) {
    return getStatus(episode) === "upcoming";
  }

  function sortByNumberDescending(a, b) {
    return (
      Number(b.episodeNumber || 0) -
      Number(a.episodeNumber || 0)
    );
  }

  function sortByNumberAscending(a, b) {
    return (
      Number(a.episodeNumber || 0) -
      Number(b.episodeNumber || 0)
    );
  }

  function guestAvatar(guest, light = false) {
    const className = light
      ? "td-guest-avatar td-light-avatar"
      : "td-guest-avatar";

    if (guest.headshot) {
      return `
        <img
          class="${className}"
          src="${escapeHTML(guest.headshot)}"
          alt="${escapeHTML(guest.name)}"
          loading="lazy"
        >
      `;
    }

    return `<span class="${className}"></span>`;
  }

  function socialIcon(provider) {
    const name = String(provider || "").toLowerCase();

    if (name === "linkedin") return "in";
    if (name === "x") return "𝕏";
    if (name === "youtube") return "▶";
    if (name === "instagram") return "◎";
    if (name === "facebook") return "f";

    return "↗";
  }

  function renderSocialLinks(guest) {
    if (!guest.socialLinks?.length) return "";

    return `
      <div style="
        display:flex;
        gap:8px;
        margin-top:10px;
      ">
        ${guest.socialLinks.map(link => `
          <a
            href="${escapeHTML(link.url || "#")}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="${escapeHTML(link.provider)}"
            style="
              width:30px;
              height:30px;
              border:1px solid rgba(242,240,234,.25);
              display:flex;
              align-items:center;
              justify-content:center;
              color:#F2F0EA;
              text-decoration:none;
              font-family:'IBM Plex Mono',monospace;
              font-size:11px;
            "
          >${escapeHTML(socialIcon(link.provider))}</a>
        `).join("")}
      </div>
    `;
  }

  function renderLatest(episode) {
    const media = $("#latest-media");
    const content = $("#latest-content");

    if (!media || !content) return;

    const thumbnailUrl = episode.episodeThumbnail || episode.stillImage || "";

    const image = thumbnailUrl
      ? `
        <img
          src="${escapeHTML(thumbnailUrl)}"
          alt="${escapeHTML(episode.name)}"
          style="width:100%;height:100%;object-fit:cover;display:block;"
        >
      `
      : "";

    const watchUrl = episode.watchUrl || "#";
    const episodeVideo = episode.episodeVideo || "";

    console.log("Latest episode video URL:", episodeVideo || "<missing>");

    media.innerHTML = episodeVideo
      ? `
        <button
          type="button"
          class="td-video-trigger"
          data-video-url="${escapeHTML(episodeVideo)}"
          aria-label="Play ${escapeHTML(episode.name)}"
          style="display:block;width:100%;height:100%;padding:0;border:0;background:#0C0B0A;position:relative;cursor:pointer;overflow:hidden"
        >
          ${image}
          <span class="td-play" style="
            position:absolute;
            left:50%;
            top:50%;
            transform:translate(-50%,-50%);
            width:86px;
            height:86px;
            border:1px solid rgba(242,240,234,.65);
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            color:#F2F0EA;
            background:rgba(12,11,10,.28);
            font-size:22px;
            line-height:1;
            z-index:3;
          ">▶</span>
          <span style="
            position:absolute;
            left:18px;
            bottom:18px;
            font-family:'IBM Plex Mono',monospace;
            font-size:10px;
            letter-spacing:.14em;
            text-transform:uppercase;
            color:rgba(242,240,234,.7);
            background:#0C0B0A;
            padding:6px 10px;
          ">play episode</span>
        </button>
      `
      : `
        <div style="display:block;height:100%;position:relative">
          ${image}
          <span style="
            position:absolute;
            left:18px;
            bottom:18px;
            font-family:'IBM Plex Mono',monospace;
            font-size:10px;
            letter-spacing:.14em;
            text-transform:uppercase;
            color:rgba(242,240,234,.7);
            background:#0C0B0A;
            padding:6px 10px;
          ">episode still</span>
        </div>
      `;

    const guests = episode.guests || [];

    const guestMarkup = guests.length
      ? guests.map(guest => `
          <div style="
            display:flex;
            align-items:center;
            gap:14px;
          ">
            ${guestAvatar(guest)}

            <div>
              <div style="
                font-size:15px;
                font-weight:600;
              ">
                ${escapeHTML(guest.name)}
              </div>

              <div style="
                font-family:'IBM Plex Mono',monospace;
                font-size:11px;
                color:rgba(242,240,234,.5);
                margin-top:3px;
              ">
                ${escapeHTML(guest.headline)}
              </div>
            </div>
          </div>
        `).join("")
      : `
        <div style="
          font-family:'IBM Plex Mono',monospace;
          font-size:11px;
          color:rgba(242,240,234,.5);
        ">
          Guest details coming soon
        </div>
      `;

    const formattedDate = episode.episodeDate
  ? new Date(episode.episodeDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  : "";

const meta = [
  formattedDate,
  episode.durationMinutes
    ? `${episode.durationMinutes} min`
    : ""
].filter(Boolean).join(" · ");
    content.innerHTML = `
      <div style="
        display:flex;
        align-items:center;
        gap:10px;
        margin-bottom:18px;
      ">
        <span style="
          width:7px;
          height:7px;
          border-radius:999px;
          background:#F2F0EA;
          display:inline-block;
        "></span>

        <span style="
          font-family:'IBM Plex Mono',monospace;
          font-size:11px;
          letter-spacing:.16em;
          text-transform:uppercase;
          color:rgba(242,240,234,.65);
        ">
          № ${escapeHTML(episode.episodeNumber || "")}
          ${meta ? " · " + escapeHTML(meta) : ""}
        </span>
      </div>

      <h3 style="
        font-size:clamp(26px,2.8vw,38px);
        font-weight:700;
        letter-spacing:-.03em;
        line-height:1.12;
        margin:0 0 20px;
      ">
        ${escapeHTML(episode.name)}
      </h3>

      <p style="
        font-size:17px;
        line-height:1.6;
        color:rgba(242,240,234,.68);
        margin:0 0 28px;
        max-width:46ch;
      ">
        ${escapeHTML(episode.description)}
      </p>

      <div style="
        display:flex;
        flex-direction:column;
        gap:14px;
        padding:22px 0;
        border-top:1px solid rgba(242,240,234,.18);
        border-bottom:1px solid rgba(242,240,234,.18);
        margin-bottom:28px;
      ">
        ${guestMarkup}
      </div>

      ${
        episodeVideo
          ? `
            <button
              type="button"
              class="td-video-trigger"
              data-video-url="${escapeHTML(episodeVideo)}"
              style="
                display:inline-flex;
                align-items:center;
                gap:12px;
                padding:17px 30px;
                background:#F2F0EA;
                color:#0C0B0A;
                font-size:13px;
                font-weight:700;
                letter-spacing:.1em;
                text-transform:uppercase;
                border-radius:999px;
                border:0;
                cursor:pointer;
              "
            >
              Watch the episode
              <span style="
                font-family:'IBM Plex Mono',monospace;
                font-size:15px;
              ">→</span>
            </button>
          `
          : watchUrl !== "#"
            ? `
              <a
                href="${escapeHTML(watchUrl)}"
                target="_blank"
                rel="noopener noreferrer"
                style="display:inline-flex;align-items:center;gap:12px;padding:17px 30px;background:#F2F0EA;color:#0C0B0A;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border-radius:999px;text-decoration:none;"
              >Watch the episode <span style="font-family:'IBM Plex Mono',monospace;font-size:15px;">→</span></a>
            `
            : ""
      }
    `;
  }

function renderUpcoming(episodes) {
  const root = $("#upcoming-list");

  if (!root) return;

  if (!episodes.length) {
    root.innerHTML = `
      <div class="td-empty">
        No upcoming episodes yet. Add one in Contentful.
      </div>
    `;
    return;
  }

  root.innerHTML = episodes.map((episode, index) => {
    const isNextUp = index === 0;

    // Use the Contentful Episode Thumbnail first.
    // Fall back to stillImage only if thumbnail is unavailable.
    const thumbnail =
      episode.episodeThumbnail ||
      episode.stillImage ||
      "";

    const image = thumbnail
      ? `
        <img
          src="${escapeHTML(thumbnail)}"
          alt="${escapeHTML(episode.name)}"
          loading="lazy"
          style="
            width:100%;
            height:100%;
            object-fit:cover;
            display:block;
          "
        >
      `
      : `
        <div style="
          width:100%;
          height:100%;
          background:repeating-linear-gradient(
            135deg,
            rgba(242,240,234,.16) 0 2px,
            transparent 2px 11px
          );
          display:flex;
          align-items:center;
          justify-content:center;
        ">
          <span style="
            font-family:'IBM Plex Mono',monospace;
            font-size:9px;
            letter-spacing:.14em;
            text-transform:uppercase;
            color:rgba(242,240,234,.55);
          ">
            episode thumbnail
          </span>
        </div>
      `;

    const guestCount = episode.guests?.length || 0;

    const episodeLabel = isNextUp
      ? "Next up"
      : `Episode ${String(episode.episodeNumber || "").padStart(3, "0")}`;

    return `
      <div
        class="td-card td-episode-card"
        data-reveal="1"
        style="
          display:flex;
          align-items:center;
          gap:30px;
          padding:28px 32px;
          background:${isNextUp ? "#0C0B0A" : "#F2F0EA"};
          color:${isNextUp ? "#F2F0EA" : "#0C0B0A"};
          border:1px solid ${
            isNextUp
              ? "rgba(12,11,10,.08)"
              : "rgba(12,11,10,.20)"
          };
          text-decoration:none;
          opacity:0;
          transform:translateY(22px);
        "
      >

        <!-- Episode thumbnail -->
        <div style="
          flex:0 0 210px;
          width:210px;
          height:132px;
          overflow:hidden;
          border:1px solid ${
            isNextUp
              ? "rgba(242,240,234,.25)"
              : "rgba(12,11,10,.22)"
          };
          background:${isNextUp ? "#171513" : "#EAE8E2"};
        ">
          ${image}
        </div>

        <!-- Episode number -->
        <div style="
          flex:0 0 135px;
          min-width:135px;
        ">
          <div style="
            font-family:'IBM Plex Mono',monospace;
            font-size:11px;
            letter-spacing:.16em;
            text-transform:uppercase;
            color:${
              isNextUp
                ? "rgba(242,240,234,.55)"
                : "rgba(12,11,10,.55)"
            };
            margin-bottom:10px;
          ">
            ${escapeHTML(episodeLabel)}
          </div>

          ${
            isNextUp
              ? `
                <div style="
                  font-family:Archivo,sans-serif;
                  font-weight:800;
                  font-size:32px;
                  line-height:1;
                ">
                  TBA
                </div>
              `
              : `
                <div style="
                  font-family:Archivo,sans-serif;
                  font-weight:800;
                  font-size:32px;
                  line-height:1;
                ">
                  TBA
                </div>
              `
          }
        </div>

        <!-- Episode information -->
        <div style="
          flex:1;
          min-width:0;
        ">

          <div style="
            font-family:'IBM Plex Mono',monospace;
            font-size:11px;
            letter-spacing:.14em;
            text-transform:uppercase;
            color:${
              isNextUp
                ? "rgba(242,240,234,.55)"
                : "rgba(12,11,10,.55)"
            };
            margin-bottom:12px;
          ">
            ${escapeHTML(episode.format || "Conversation")}
            ·
            ${guestCount}
            guest${guestCount === 1 ? "" : "s"}
          </div>

          <div style="
            font-size:clamp(20px,2vw,27px);
            font-weight:700;
            letter-spacing:-.025em;
            line-height:1.2;
          ">
            ${escapeHTML(episode.name)}
          </div>

          <div style="
            font-family:'IBM Plex Mono',monospace;
            font-size:11px;
            letter-spacing:.08em;
            color:${
              isNextUp
                ? "rgba(242,240,234,.55)"
                : "rgba(12,11,10,.55)"
            };
            margin-top:14px;
          ">
            ${escapeHTML(
              episode.description || "Details coming soon."
            )}
          </div>

        </div>

      </div>
    `;
  }).join("");

  reveal();
}

  
  function renderArchive(episodes) {
    const root = $("#archive-list");

    if (!root) return;

    if (!episodes.length) {
      root.innerHTML = `
        <div class="td-empty">
          No archived episodes yet.
        </div>
      `;
      return;
    }

    root.innerHTML = episodes.map(episode => {
      const episodeVideo = episode.episodeVideo || "";
      const watchUrl = episode.watchUrl || "#";

      const formattedDate = episode.episodeDate
        ? new Date(episode.episodeDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
          })
        : "";

      const meta = [
        formattedDate,
        episode.durationMinutes
          ? `${episode.durationMinutes} min`
          : ""
      ].filter(Boolean).join(" · ");

      // Keep the original archive row structure.
      // If this episode has its own stored video, the existing
      // popup will open and play that exact video.
      return `
        <a
          href="${escapeHTML(episodeVideo || watchUrl)}"
          ${!episodeVideo && watchUrl !== "#"
            ? 'target="_blank" rel="noopener noreferrer"'
            : ""
          }
          class="td-sess${episodeVideo ? " td-video-trigger" : ""}"
          ${episodeVideo
            ? `data-video-url="${escapeHTML(episodeVideo)}"`
            : ""
          }
          data-reveal="1"
          style="
            display:grid;
            grid-template-columns:92px 1fr 230px 52px;
            gap:24px;
            align-items:center;
            padding:32px 10px;
            border-bottom:1px solid rgba(242,240,234,.18);
            text-decoration:none;
            color:#F2F0EA;
            opacity:0;
            transform:translateY(18px);
            cursor:pointer;
          "
        >
          <span style="
            font-family:'IBM Plex Mono',monospace;
            font-size:12px;
            color:rgba(242,240,234,.5);
            letter-spacing:.1em;
          ">
            № ${escapeHTML(episode.episodeNumber)}
          </span>

          <span style="
            font-size:clamp(19px,2vw,26px);
            font-weight:700;
            letter-spacing:-.025em;
          ">
            ${escapeHTML(episode.name)}
          </span>

          <span
            class="td-sessmeta"
            style="
              font-family:'IBM Plex Mono',monospace;
              font-size:12px;
              color:rgba(242,240,234,.5);
            "
          >
            ${escapeHTML(meta)}
          </span>

          <span style="
            font-family:'IBM Plex Mono',monospace;
            font-size:18px;
            text-align:right;
          ">→</span>
        </a>
      `;
    }).join("");

    reveal();
  }


  function renderGuests(episodes) {
    const root = $("#guest-grid");

    if (!root) return;

    const guestMap = new Map();

    episodes.forEach(episode => {
      (episode.guests || []).forEach(guest => {
        if (
          guest.name &&
          !guestMap.has(guest.id || guest.name)
        ) {
          guestMap.set(
            guest.id || guest.name,
            guest
          );
        }
      });
    });

    const guests = [...guestMap.values()];

    if (!guests.length) {
      root.innerHTML = `
        <div class="td-empty" style="grid-column:1/-1">
          Guests will appear here when episodes have guest entries.
        </div>
      `;
      return;
    }

    window.tdGuests = guests.slice(0, 8);

    root.innerHTML = window.tdGuests.map((guest, index) => `
      <button
        type="button"
        class="td-guest-card"
        data-guest-index="${index}"
        data-reveal="1"
        aria-label="View ${escapeHTML(guest.name)}"
        style="
          all:unset;
          display:block;
          width:100%;
          cursor:pointer;
          opacity:0;
          transform:translateY(26px);
          text-align:left;
        "
      >
        <div style="
          aspect-ratio:3/4;
          background:#171513;
          border:1px solid rgba(242,240,234,.2);
          display:flex;
          align-items:center;
          justify-content:center;
          margin-bottom:18px;
          overflow:hidden;
          transition:transform .35s ease, border-color .35s ease;
        ">
          ${
            guest.headshot
              ? `
                <img
                  src="${escapeHTML(guest.headshot)}"
                  alt="${escapeHTML(guest.name)}"
                  style="
                    width:100%;
                    height:100%;
                    object-fit:cover;
                    display:block;
                  "
                  loading="lazy"
                >
              `
              : `
                <span style="
                  font-family:'IBM Plex Mono',monospace;
                  font-size:10px;
                  letter-spacing:.14em;
                  text-transform:uppercase;
                  color:rgba(242,240,234,.6);
                ">
                  headshot
                </span>
              `
          }
        </div>

        <div style="
          font-size:18px;
          font-weight:700;
          letter-spacing:-.015em;
          margin-bottom:5px;
        ">
          ${escapeHTML(guest.name)}
        </div>

        <div style="
          font-family:'IBM Plex Mono',monospace;
          font-size:12px;
          color:rgba(242,240,234,.55);
          line-height:1.5;
        ">
          ${escapeHTML(guest.headline)}
        </div>
      </button>
    `).join("");

    root.querySelectorAll(".td-guest-card").forEach(card => {
      card.addEventListener("click", () => {
        const index = Number(card.dataset.guestIndex);
        const guest = window.tdGuests[index];

        if (guest) {
          openGuestModal(guest);
        }
      });
    });

    reveal();
  }


  function ensureGuestModal() {
    if (document.querySelector(".td-guest-modal")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div
        class="td-guest-modal"
        aria-hidden="true"
        style="
          position:fixed;
          inset:0;
          z-index:999998;
          display:none;
          align-items:center;
          justify-content:center;
          padding:24px;
          background:rgba(0,0,0,.88);
        "
      >
        <div
          class="td-guest-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Guest information"
          style="
            position:relative;
            width:min(900px,94vw);
            max-height:90vh;
            overflow:auto;
            background:#0C0B0A;
            color:#F2F0EA;
            border:1px solid rgba(242,240,234,.22);
            box-shadow:0 30px 100px rgba(0,0,0,.65);
          "
        >
          <button
            type="button"
            class="td-guest-close"
            aria-label="Close guest information"
            style="
              position:absolute;
              top:18px;
              right:18px;
              width:42px;
              height:42px;
              border:1px solid rgba(242,240,234,.35);
              background:#0C0B0A;
              color:#F2F0EA;
              cursor:pointer;
              font-size:24px;
              line-height:1;
              z-index:5;
            "
          >×</button>

          <div
            class="td-guest-modal-content"
            style="
              display:grid;
              grid-template-columns:280px 1fr;
              gap:40px;
              padding:44px;
            "
          ></div>
        </div>
      </div>
    `);

    const modal = document.querySelector(".td-guest-modal");
    const closeButton = modal.querySelector(".td-guest-close");

    function closeGuestModal() {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    closeButton.addEventListener("click", closeGuestModal);

    modal.addEventListener("click", event => {
      if (event.target === modal) {
        closeGuestModal();
      }
    });

    document.addEventListener("keydown", event => {
      if (
        event.key === "Escape" &&
        modal.style.display === "flex"
      ) {
        closeGuestModal();
      }
    });
  }


  function openGuestModal(guest) {
    ensureGuestModal();

    const modal = document.querySelector(".td-guest-modal");
    const content = modal.querySelector(".td-guest-modal-content");

    const socialLinks = guest.socialLinks?.length
      ? `
        <div style="
          margin-top:28px;
          padding-top:22px;
          border-top:1px solid rgba(242,240,234,.18);
        ">
          <div style="
            font-family:'IBM Plex Mono',monospace;
            font-size:10px;
            letter-spacing:.16em;
            text-transform:uppercase;
            color:rgba(242,240,234,.5);
            margin-bottom:14px;
          ">
            Connect
          </div>

          <div style="
            display:flex;
            flex-wrap:wrap;
            gap:10px;
          ">
            ${guest.socialLinks.map(link => `
              <a
                href="${escapeHTML(link.url || "#")}"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="${escapeHTML(link.provider)}"
                style="
                  width:42px;
                  height:42px;
                  border:1px solid rgba(242,240,234,.28);
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  color:#F2F0EA;
                  text-decoration:none;
                  font-family:'IBM Plex Mono',monospace;
                  font-size:13px;
                  transition:background .25s ease, color .25s ease;
                "
              >
                ${escapeHTML(socialIcon(link.provider))}
              </a>
            `).join("")}
          </div>
        </div>
      `
      : "";

    content.innerHTML = `
      <div>
        <div style="
          aspect-ratio:3/4;
          background:#171513;
          border:1px solid rgba(242,240,234,.2);
          overflow:hidden;
        ">
          ${
            guest.headshot
              ? `
                <img
                  src="${escapeHTML(guest.headshot)}"
                  alt="${escapeHTML(guest.name)}"
                  style="
                    width:100%;
                    height:100%;
                    object-fit:cover;
                    display:block;
                  "
                >
              `
              : `
                <div style="
                  width:100%;
                  height:100%;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  font-family:'IBM Plex Mono',monospace;
                  font-size:10px;
                  color:rgba(242,240,234,.5);
                ">
                  HEADSHOT
                </div>
              `
          }
        </div>
      </div>

      <div style="
        min-width:0;
        padding-top:10px;
      ">
        <div style="
          font-family:'IBM Plex Mono',monospace;
          font-size:10px;
          letter-spacing:.16em;
          text-transform:uppercase;
          color:rgba(242,240,234,.5);
          margin-bottom:14px;
        ">
          At the table
        </div>

        <h2 style="
          margin:0 0 10px;
          font-size:clamp(30px,4vw,48px);
          line-height:1.05;
          letter-spacing:-.035em;
        ">
          ${escapeHTML(guest.name)}
        </h2>

        ${
          guest.headline
            ? `
              <div style="
                font-family:'IBM Plex Mono',monospace;
                font-size:12px;
                line-height:1.6;
                color:rgba(242,240,234,.55);
                margin-bottom:28px;
              ">
                ${escapeHTML(guest.headline)}
              </div>
            `
            : ""
        }

        ${
          guest.bio
            ? `
              <div style="
                font-size:16px;
                line-height:1.75;
                color:rgba(242,240,234,.72);
                white-space:pre-line;
              ">
                ${escapeHTML(guest.bio)}
              </div>
            `
            : `
              <div style="
                font-family:'IBM Plex Mono',monospace;
                font-size:11px;
                color:rgba(242,240,234,.45);
              ">
                Bio coming soon.
              </div>
            `
        }

        ${socialLinks}
      </div>
    `;

    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }


  function reveal() {
    const elements =
      document.querySelectorAll(
        '[data-reveal="1"]'
      );

    if (!("IntersectionObserver" in window)) {
      elements.forEach(element => {
        element.style.opacity = "1";
        element.style.transform = "translateY(0)";
      });
      return;
    }

    elements.forEach((element, index) => {
      element.style.transition =
        "opacity 800ms cubic-bezier(.2,.8,.2,1), " +
        "transform 800ms cubic-bezier(.2,.8,.2,1)";

      const observer =
        new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;

            setTimeout(() => {
              element.style.opacity = "1";
              element.style.transform =
                "translateY(0)";
            }, Math.min(index, 8) * 60);

            observer.unobserve(element);
          });
        }, {
          rootMargin: "0px 0px -12% 0px",
          threshold: 0.08
        });

      observer.observe(element);
    });
  }

  function ensureVideoModal() {
    if (document.querySelector(".td-video-modal")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div class="td-video-modal" aria-hidden="true" style="
        position:fixed;
        inset:0;
        z-index:999999;
        display:none;
        align-items:center;
        justify-content:center;
        padding:24px;
        background:rgba(0,0,0,.94);
      ">
        <div class="td-video-modal-panel" role="dialog" aria-modal="true" aria-label="Episode video" style="
          position:relative;
          width:min(1200px,96vw);
          background:#0C0B0A;
          border:1px solid rgba(242,240,234,.2);
          box-shadow:0 30px 100px rgba(0,0,0,.6);
        ">
          <button type="button" class="td-video-close" aria-label="Close video" style="
            position:absolute;
            top:-48px;
            right:0;
            width:40px;
            height:40px;
            border:1px solid rgba(242,240,234,.4);
            background:#0C0B0A;
            color:#F2F0EA;
            cursor:pointer;
            font-size:24px;
            line-height:1;
          ">×</button>
          <video class="td-popup-video" controls playsinline preload="metadata" style="display:block;width:100%;max-height:82vh;background:#000;"></video>
          <div style="display:flex;justify-content:flex-end;padding:12px 16px;">
            <button type="button" class="td-video-close-text" style="background:transparent;border:0;color:rgba(242,240,234,.7);font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;">Close video</button>
          </div>
        </div>
      </div>
    `);

    const modal = document.querySelector(".td-video-modal");
    const video = modal.querySelector(".td-popup-video");
    const closeButtons = modal.querySelectorAll(".td-video-close, .td-video-close-text");

    function closeVideo() {
      video.pause();
      try { video.currentTime = 0; } catch (_) {}
      video.removeAttribute("src");
      video.load();
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    function openVideo(url) {
      if (!url) return;
      video.src = url;
      video.load();
      modal.style.display = "flex";
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";

      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(error => console.warn("Video autoplay was blocked:", error));
      }
    }

    closeButtons.forEach(button => button.addEventListener("click", closeVideo));

    modal.addEventListener("click", event => {
      if (event.target === modal) closeVideo();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && modal.style.display === "flex") {
        closeVideo();
      }
    });

    document.addEventListener("click", event => {
      const trigger = event.target.closest(".td-video-trigger");
      if (!trigger) return;
      event.preventDefault();
      openVideo(trigger.getAttribute("data-video-url"));
    });
  }

  function ensureGuestModalResponsiveStyles() {
    if (document.getElementById("td-guest-modal-responsive")) return;

    const style = document.createElement("style");
    style.id = "td-guest-modal-responsive";
    style.textContent = `
      @media (max-width: 700px) {
        .td-guest-modal {
          padding: 12px !important;
        }
        .td-guest-modal-content {
          grid-template-columns: 1fr !important;
          gap: 24px !important;
          padding: 28px 22px !important;
        }
        .td-guest-modal-panel {
          width: 96vw !important;
        }
      }

      .td-guest-card:hover > div:first-child {
        transform: translateY(-4px);
        border-color: rgba(242,240,234,.55) !important;
      }
    `;
    document.head.appendChild(style);
  }


  function initInteractions() {
    ensureVideoModal();
    ensureGuestModal();
    ensureGuestModalResponsiveStyles();

    const hero = $("#top");

    if (!hero) return;

    const inner =
      hero.querySelector('[data-parallax="1"]');

    function onScroll() {
      if (!inner) return;

      const heroHeight = hero.offsetHeight;
      const viewportHeight = window.innerHeight;

      if (heroHeight <= viewportHeight * 1.15) {
        const span = Math.max(
          240,
          heroHeight - 120
        );

        const progress = Math.min(
          1,
          Math.max(
            0,
            window.scrollY / span
          )
        );

        inner.style.transform =
          `translateY(${progress * 110}px)`;

        inner.style.opacity =
          String(1 - progress);
      }
    }

    window.addEventListener(
      "scroll",
      onScroll,
      { passive: true }
    );

    onScroll();

const form = $("#application-form");

if (form) {
  form.addEventListener("submit", async event => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');

    if (button) {
      button.disabled = true;
      button.textContent = "Sending...";
    }

    const formData = new FormData(form);

    const payload = {
      access_key: "01096a2d-214c-41a8-8039-4518b2483731",
      subject: "New Thinkers & Doers Application",
      name: formData.get("name") || "",
      email: formData.get("email") || "",
      message: formData.get("question") || "",
      submitted_at: new Date().toISOString(),
      source: "Thinkers & Doers"
    };

    try {
      const response = await fetch(
        "https://api.web3forms.com/submit",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Form submission failed");
      }

      if (button) {
        button.textContent = "Received — we'll be in touch";
      }

      form.reset();

    } catch (error) {
      console.error("Form submission error:", error);

      if (button) {
        button.disabled = false;
        button.textContent = "Try again";
      }

      alert("Something went wrong. Please try again.");
    }
  });
}
  }

  function showError(error) {
    console.error(
      "Thinkers & Doers content error:",
      error
    );

    const existing =
      $(".td-error");

    if (existing) return;

    document.body.insertAdjacentHTML(
      "afterbegin",
      `
        <div class="td-error">
          Could not load episode content.
          Check Contentful settings or content.json.
        </div>
      `
    );
  }

  async function main() {
    try {
      let data = null;

      /*
       * TEST MODE:
       * Contentful disabled → use content.json.
       *
       * CONTENTFUL MODE:
       * Contentful enabled → use Contentful.
       * If Contentful fails, fall back to content.json.
       */
      if (CONFIG.enabled) {
        try {
          data = await loadContentful();
        } catch (contentfulError) {
          console.warn(
            "Contentful failed. Falling back to content.json.",
            contentfulError
          );
        }
      }

      if (!data) {
        data = await loadFallback();
      }

      const episodes =
        Array.isArray(data.episodes)
          ? data.episodes
          : [];

      const upcomingEpisodes =
        episodes
          .filter(isUpcoming)
          .sort(sortByNumberAscending);
      const publicEpisodes =
        episodes
          .filter(isPublic)
          .sort(sortByNumberDescending);

      // Latest episode = newest public episode
      const latestEpisode =
        publicEpisodes[0] || null;

      // All Episodes = all other public episodes
      // (Latest episode is excluded)
      const archiveEpisodes =
        publicEpisodes.slice(1);
      
      if (latestEpisode) {
        renderLatest(latestEpisode);
      } else {
        const content =
          $("#latest-content");

        if (content) {
          content.innerHTML = `
            <div class="td-empty">
              No published episode yet.
            </div>
          `;
        }
      }

      renderUpcoming(upcomingEpisodes);
      renderArchive(archiveEpisodes);

      /*
       * Guests are collected from all published/upcoming episodes.
       */
      renderGuests([
        ...publicEpisodes,
        ...upcomingEpisodes
      ]);

      reveal();
      initInteractions();

    } catch (error) {
      showError(error);
    }
  }

  document.addEventListener(
    "DOMContentLoaded",
    main
  );
})();
