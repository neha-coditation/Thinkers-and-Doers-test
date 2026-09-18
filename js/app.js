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
    deliveryToken: "",
    environment: "master",
    contentType: "episode",
    guestContentType: "guest",
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
      episodeYoutubeLink:
        episode?.episodeYoutubeLink ||
        episode?.youtubeUrl ||
        episode?.youtube ||
        "",
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
        // YouTube URL entered in Contentful's optional Episode Youtube link field.
        episodeYoutubeLink: fields.episodeYoutubeLink || "",
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
          style="width:100%;height:100%;object-fit:cover;display:block;border:0;outline:0;"
        >
      `
      : "";

    const watchUrl = episode.watchUrl || "#";

    // Use only the YouTube URL stored in Contentful.
    const episodeVideo = String(episode.episodeYoutubeLink || "").trim();

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
      <div class="td-empty">No upcoming episodes yet. Add one in Contentful.</div>
    `;
    return;
  }

  const formatUpcomingDate = date => {
    if (!date) return "TBA";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return "TBA";
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  root.innerHTML = episodes.map((episode, index) => {
    const isNextUp = index === 0;
    const textColor = isNextUp ? "#F2F0EA" : "#0C0B0A";
    const mutedColor = isNextUp ? "rgba(242,240,234,.55)" : "rgba(12,11,10,.55)";
    const dateLabel = formatUpcomingDate(episode.episodeDate);

    const thumbnail = episode.stillImage || episode.episodeThumbnail || "";

    const image = thumbnail
      ? `
        <img src="${escapeHTML(thumbnail)}" alt="${escapeHTML(episode.name)}" loading="lazy"
          style="width:100%;height:100%;object-fit:cover;display:block;">
      `
      : `
        <div style="width:100%;height:100%;background:repeating-linear-gradient(135deg,rgba(242,240,234,.16) 0 2px,transparent 2px 11px);align-items:center;justify-content:center;">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:${mutedColor};">
            episode still
          </span>
        </div>
      `;

    const guests = Array.isArray(episode.guests)
      ? episode.guests.filter(guest => guest && guest.name)
      : [];

    const guestMarkup = guests.length
      ? `
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;margin-top:16px;">
          ${guests.map(guest => `
            <div style="display:flex;align-items:center;gap:9px;min-width:0;">
              <div style="
                width:38px;height:38px;flex:0 0 38px;border-radius:50%;overflow:hidden;
                border:1px solid ${isNextUp ? "rgba(242,240,234,.3)" : "rgba(12,11,10,.22)"};
                background:${isNextUp ? "#171513" : "#EAE8E2"};
              ">
                ${
                  guest.headshot
                    ? `<img src="${escapeHTML(guest.headshot)}" alt="${escapeHTML(guest.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">`
                    : `<span style="display:block;width:100%;height:100%;background:repeating-linear-gradient(135deg,${isNextUp ? "rgba(242,240,234,.16)" : "rgba(12,11,10,.12)"} 0 2px,transparent 2px 9px);"></span>`
                }
              </div>
              <span style="font-size:13px;font-weight:600;line-height:1.25;color:${textColor};white-space:nowrap;">
                ${escapeHTML(guest.name)}
              </span>
            </div>
          `).join("")}
        </div>
      `
      : `
        <div style="
          display:flex;
          align-items:center;
          gap:14px;
          margin-top:16px;
        ">
          <div style="display:flex;align-items:center;">
            ${[1, 2, 3].map(() => `
              <span style="
                width:38px;
                height:38px;
                flex:0 0 38px;
                border-radius:50%;
                border:1px solid ${isNextUp ? "rgba(242,240,234,.35)" : "rgba(12,11,10,.25)"};
                background:${isNextUp ? "#171513" : "#EAE8E2"};
                display:block;
                margin-right:-7px;
                box-sizing:border-box;
              "></span>
            `).join("")}
          </div>

          <span style="
            font-family:'IBM Plex Mono',monospace;
            font-size:11px;
            letter-spacing:.08em;
            color:${mutedColor};
            white-space:nowrap;
          ">
            Guests announced soon
          </span>
        </div>
      `;

    const episodeLabel = isNextUp
      ? "Next up"
      : `Episode ${String(episode.episodeNumber || "").padStart(3, "0")}`;

    return `
      <div class="td-card td-episode-card" data-reveal="1"
        style="
          display:flex;align-items:center;gap:30px;padding:28px 32px;
          background:${isNextUp ? "#0C0B0A" : "#F2F0EA"};
          color:${textColor};
          border:1px solid ${isNextUp ? "rgba(12,11,10,.08)" : "rgba(12,11,10,.20)"};
          opacity:0;transform:translateY(22px);
        "
      >
        <div style="
          flex:0 0 210px;width:210px;height:132px;overflow:hidden;
          border:1px solid ${isNextUp ? "rgba(242,240,234,.25)" : "rgba(12,11,10,.22)"};
          background:${isNextUp ? "#171513" : "#EAE8E2"};
        ">
          ${image}
        </div>

        <div style="flex:0 0 135px;min-width:135px;">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${mutedColor};margin-bottom:10px;">
            ${escapeHTML(episodeLabel)}
          </div>
          <div style="
            font-family:Archivo,sans-serif;
            font-weight:800;
            font-size:clamp(24px,2.2vw,32px);
            line-height:1.08;
            letter-spacing:-.03em;
          ">
            ${escapeHTML(dateLabel)}
          </div>
        </div>

        <div style="flex:1;min-width:0;">
          <div style="font-size:clamp(20px,2vw,27px);font-weight:700;letter-spacing:-.025em;line-height:1.2;">
            ${escapeHTML(episode.name)}
          </div>

          ${
            episode.description
              ? `
                <div style="
                  font-size:14px;
                  line-height:1.55;
                  color:${mutedColor};
                  margin-top:10px;
                  max-width:62ch;
                ">
                  ${escapeHTML(episode.description)}
                </div>
              `
              : ""
          }

          ${guestMarkup}
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
      const episodeVideo = String(episode.episodeYoutubeLink || "").trim();
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

      // Contentful thumbnail first, then still image as a fallback.
      const thumbnail = episode.stillImage || episode.episodeThumbnail || "";
      const thumbnailMarkup = thumbnail
        ? `
          <img
            src="${escapeHTML(thumbnail)}"
            alt="${escapeHTML(episode.name)}"
            loading="lazy"
          >
        `
        : `
          <span class="td-archive-thumb-placeholder" aria-hidden="true">
            <span>THINKERS<br>&amp; DOERS</span>
          </span>
        `;


      return `
        <a
          href="${escapeHTML(episodeVideo || watchUrl)}"
          ${!episodeVideo && watchUrl !== "#"
            ? 'target="_blank" rel="noopener noreferrer"'
            : ""
          }
          class="td-archive-card${episodeVideo ? " td-video-trigger" : ""}"
          ${episodeVideo
            ? `data-video-url="${escapeHTML(episodeVideo)}"`
            : ""
          }
          data-reveal="1"
        >
          <div class="td-archive-thumbnail">
            ${thumbnailMarkup}
            <span class="td-archive-play" aria-hidden="true">↗</span>
            <span class="td-archive-number">
              № ${escapeHTML(episode.episodeNumber || "")}
            </span>
          </div>

          <div class="td-archive-card-body">
            <div class="td-archive-meta">
              <span>${escapeHTML(meta)}</span>
              <span>Episode</span>
            </div>

            <h3 class="td-archive-title">
              ${escapeHTML(episode.name)}
            </h3>

            ${episode.description
              ? `<p class="td-archive-description">${escapeHTML(episode.description)}</p>`
              : ""
            }


            <div class="td-archive-watch">
              <span>${episodeVideo ? "Watch episode" : "View episode"}</span>
              <span aria-hidden="true"></span>
            </div>
          </div>
        </a>
      `;
    }).join("");

    reveal();
  }


    function renderGuests(episodes) {
    const root = $("#guest-grid");
    if (!root) return;

    const guestMap = new Map();

    episodes.filter(isPublic).forEach(episode => {
      (episode.guests || []).forEach(guest => {
        if (guest.name && guest.headshot && !guestMap.has(guest.id || guest.name)) {
          guestMap.set(guest.id || guest.name, guest);
        }
      });
    });

    // Use every Contentful guest. Do not cap the list so new guests
    // automatically appear in the ticker without code changes.
    window.tdGuests = [...guestMap.values()];

    const guests = window.tdGuests;

    // Put each guest on only one visible row.
    // Alternating guests keeps the two rows balanced as the Contentful
    // guest list grows and prevents the same person appearing on both rows.
    const firstRowGuests = guests.filter((_, index) => index % 2 === 0);
    const secondRowGuests = guests.filter((_, index) => index % 2 === 1);

    const guestCard = (guest) => {
      const index = guests.indexOf(guest);
      return `
        <button type="button"
          class="td-guest-ticker-card"
          data-guest-index="${index}"
          aria-label="View ${escapeHTML(guest.name)}">
          <span class="td-guest-ticker-image">
            <img src="${escapeHTML(guest.headshot)}"
              alt="${escapeHTML(guest.name)}"
              loading="lazy">
          </span>
          <span class="td-guest-ticker-copy">
            <span class="td-guest-ticker-name">${escapeHTML(guest.name)}</span>
            <span class="td-guest-ticker-headline">${escapeHTML(guest.headline || "")}</span>
          </span>
        </button>
      `;
    };

    const makeTrack = (items, direction) => {
      // If there are no guests for a row, keep that row out of the DOM.
      if (!items.length) return "";

      const cards = items.map(guestCard).join("");

      return `
        <div class="td-guest-ticker-row td-guest-ticker-${direction}">
          <div class="td-guest-ticker-track">
            <div class="td-guest-ticker-group">${cards}</div>
            <div class="td-guest-ticker-group" aria-hidden="true">${cards}</div>
          </div>
        </div>
      `;
    };

    root.innerHTML = `
      ${makeTrack(firstRowGuests, "ltr")}
      ${makeTrack(secondRowGuests, "rtl")}
    `;

    root.querySelectorAll(".td-guest-ticker-card").forEach(card => {
      card.addEventListener("click", () => {
        const guest = window.tdGuests[Number(card.dataset.guestIndex)];
        if (guest) openGuestModal(guest);
      });
    });
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
          <video class="td-popup-video" controls playsinline preload="metadata" style="display:none;width:100%;max-height:82vh;background:#000;"></video>
          <div class="td-youtube-video" style="display:none;width:100%;aspect-ratio:16/9;background:#000;"></div>
          <div style="display:flex;justify-content:flex-end;padding:12px 16px;">
            <button type="button" class="td-video-close-text" style="background:transparent;border:0;color:rgba(242,240,234,.7);font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;">Close video</button>
          </div>
        </div>
      </div>
    `);

    const modal = document.querySelector(".td-video-modal");
    const video = modal.querySelector(".td-popup-video");
    const youtubeContainer = modal.querySelector(".td-youtube-video");
    const closeButtons = modal.querySelectorAll(".td-video-close, .td-video-close-text");

    function getYouTubeVideoId(url) {
      if (!url) return "";

      try {
        const parsed = new URL(url, window.location.href);
        const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

        if (host === "youtu.be") {
          return parsed.pathname.split("/").filter(Boolean)[0] || "";
        }

        if (
          host === "youtube.com" ||
          host === "m.youtube.com" ||
          host === "youtube-nocookie.com"
        ) {
          if (parsed.pathname === "/watch") {
            return parsed.searchParams.get("v") || "";
          }

          const parts = parsed.pathname.split("/").filter(Boolean);
          if (["embed", "shorts", "live"].includes(parts[0])) {
            return parts[1] || "";
          }
        }
      } catch (_) {
        return "";
      }

      return "";
    }

    function loadYouTubePlayer(videoId) {
      youtubeContainer.innerHTML = `
        <iframe
          src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&modestbranding=1"
          title="Thinkers & Doers episode"
          loading="eager"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          style="display:block;width:100%;height:100%;border:0;"
        ></iframe>
      `;
    }

    function closeVideo() {
      video.pause();
      try { video.currentTime = 0; } catch (_) {}
      video.removeAttribute("src");
      video.load();
      video.style.display = "none";
      youtubeContainer.innerHTML = "";
      youtubeContainer.style.display = "none";
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    function openVideo(url) {
      if (!url) return;

      const youtubeId = getYouTubeVideoId(url);
      if (!youtubeId) {
        console.warn("Invalid YouTube URL from Contentful:", url);
        return;
      }

      video.pause();
      video.removeAttribute("src");
      video.load();
      video.style.display = "none";
      youtubeContainer.style.display = "block";
      loadYouTubePlayer(youtubeId);

      modal.style.display = "flex";
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
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


  function ensureLatestPlaceholderStyles() {
    if (document.getElementById("td-latest-placeholder-styles")) return;

    const style = document.createElement("style");
    style.id = "td-latest-placeholder-styles";
    style.textContent = `
      #latest-media img,
      #latest-media > div,
      #latest-content .td-guest-avatar,
      #latest-content .td-light-avatar {
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
      }

      #latest-media {
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);
  }



  function ensureCookieConsent() {
    if (document.querySelector(".td-cookie-banner")) return;

    const stored = localStorage.getItem("td_cookie_consent");

    const style = document.createElement("style");
    style.id = "td-cookie-consent-styles";
    style.textContent = `
      .td-cookie-banner {
        position: fixed;
        left: 20px;
        right: 20px;
        bottom: 20px;
        z-index: 1000000;
        max-width: 920px;
        margin: 0 auto;
        padding: 22px 24px;
        background: #F2F0EA;
        color: #0C0B0A;
        border: 1px solid rgba(12,11,10,.18);
        box-shadow: 0 24px 70px rgba(0,0,0,.35);
      }
      .td-cookie-banner-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
      }
      .td-cookie-copy {
        min-width: 0;
      }
      .td-cookie-title {
        font-size: 18px;
        font-weight: 800;
        letter-spacing: -.02em;
        margin-bottom: 7px;
      }
      .td-cookie-text {
        font-size: 13px;
        line-height: 1.55;
        color: rgba(12,11,10,.68);
        max-width: 650px;
      }
      .td-cookie-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        flex: 0 0 auto;
      }
      .td-cookie-btn {
        appearance: none;
        border: 1px solid rgba(12,11,10,.28);
        background: transparent;
        color: #0C0B0A;
        padding: 12px 16px;
        cursor: pointer;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .td-cookie-btn.primary {
        background: #0C0B0A;
        color: #F2F0EA;
        border-color: #0C0B0A;
      }
      .td-cookie-link {
        color: #0C0B0A;
        text-decoration: underline;
      }
      .td-cookie-settings {
        display: none;
        margin-top: 18px;
        padding-top: 18px;
        border-top: 1px solid rgba(12,11,10,.18);
      }
      .td-cookie-settings.open { display: block; }
      .td-cookie-setting-row {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:20px;
        padding:10px 0;
      }
      .td-cookie-setting-row strong { font-size:13px; }
      .td-cookie-setting-row span { font-size:12px; color:rgba(12,11,10,.6); }
      .td-cookie-toggle {
        appearance:none;
        width:42px;
        height:24px;
        border-radius:999px;
        border:1px solid rgba(12,11,10,.3);
        background:rgba(12,11,10,.12);
        position:relative;
        flex:0 0 42px;
      }
      .td-cookie-toggle::after {
        content:"";
        position:absolute;
        width:18px;
        height:18px;
        left:2px;
        top:2px;
        border-radius:50%;
        background:#0C0B0A;
      }
      .td-cookie-toggle.on {
        background:#0C0B0A;
      }
      .td-cookie-toggle.on::after {
        left:20px;
        background:#F2F0EA;
      }
      @media (max-width: 700px) {
        .td-cookie-banner {
          left: 12px;
          right: 12px;
          bottom: 12px;
          padding: 18px;
        }
        .td-cookie-banner-inner {
          flex-direction: column;
          align-items: stretch;
        }
        .td-cookie-actions {
          width:100%;
        }
        .td-cookie-btn {
          flex:1 1 auto;
        }
      }
    `;
    document.head.appendChild(style);

    const banner = document.createElement("div");
    banner.className = "td-cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie preferences");
    banner.innerHTML = `
      <div class="td-cookie-banner-inner">
        <div class="td-cookie-copy">
          <div class="td-cookie-title">We use cookies</div>
          <div class="td-cookie-text">
            We use essential storage to make this website work. Non-essential analytics or advertising
            technologies will only be enabled according to your choices where consent is required.
            <a class="td-cookie-link" href="cookies.html">Cookie Policy</a>
          </div>
        </div>
        <div class="td-cookie-actions">
          <button type="button" class="td-cookie-btn" data-cookie-action="reject">Reject non-essential</button>
          <button type="button" class="td-cookie-btn" data-cookie-action="settings">Manage</button>
          <button type="button" class="td-cookie-btn primary" data-cookie-action="accept">Accept all</button>
        </div>
      </div>

      <div class="td-cookie-settings">
        <div class="td-cookie-setting-row">
          <div>
            <strong>Essential</strong><br>
            <span>Required for core site functions.</span>
          </div>
          <span class="td-cookie-toggle on" aria-hidden="true"></span>
        </div>
        <div class="td-cookie-setting-row">
          <div>
            <strong>Analytics</strong><br>
            <span>Used to understand how visitors use the site.</span>
          </div>
          <button type="button" class="td-cookie-toggle" data-cookie-toggle="analytics" aria-label="Toggle analytics consent"></button>
        </div>
        <div class="td-cookie-setting-row">
          <div>
            <strong>Advertising</strong><br>
            <span>Used for advertising or personalized advertising.</span>
          </div>
          <button type="button" class="td-cookie-toggle" data-cookie-toggle="advertising" aria-label="Toggle advertising consent"></button>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="td-cookie-btn primary" data-cookie-action="save">Save preferences</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    const analyticsToggle = banner.querySelector('[data-cookie-toggle="analytics"]');
    const advertisingToggle = banner.querySelector('[data-cookie-toggle="advertising"]');
    let choices = { analytics: false, advertising: false };

    function applyConsent(next) {
      choices = {
        analytics: !!next.analytics,
        advertising: !!next.advertising
      };

      localStorage.setItem("td_cookie_consent", JSON.stringify(choices));

      // If Google tags are added later, these calls communicate the user's
      // choices to Google Consent Mode.
      if (typeof window.gtag === "function") {
        window.gtag("consent", "update", {
          analytics_storage: choices.analytics ? "granted" : "denied",
          ad_storage: choices.advertising ? "granted" : "denied",
          ad_user_data: choices.advertising ? "granted" : "denied",
          ad_personalization: choices.advertising ? "granted" : "denied"
        });
      }

      banner.remove();
      showCookieSettingsButton();
    }

    function updateToggles() {
      analyticsToggle.classList.toggle("on", choices.analytics);
      advertisingToggle.classList.toggle("on", choices.advertising);
    }

    analyticsToggle.addEventListener("click", () => {
      choices.analytics = !choices.analytics;
      updateToggles();
    });

    advertisingToggle.addEventListener("click", () => {
      choices.advertising = !choices.advertising;
      updateToggles();
    });

    banner.querySelector('[data-cookie-action="accept"]').addEventListener("click", () => {
      applyConsent({ analytics: true, advertising: true });
    });

    banner.querySelector('[data-cookie-action="reject"]').addEventListener("click", () => {
      applyConsent({ analytics: false, advertising: false });
    });

    banner.querySelector('[data-cookie-action="settings"]').addEventListener("click", () => {
      banner.querySelector(".td-cookie-settings").classList.toggle("open");
    });

    banner.querySelector('[data-cookie-action="save"]').addEventListener("click", () => {
      applyConsent(choices);
    });

    function showCookieSettingsButton() {
      if (document.querySelector(".td-cookie-settings-fab")) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "td-cookie-settings-fab";
      button.textContent = "Cookie settings";
      button.style.cssText = `
        position:fixed;
        left:16px;
        bottom:16px;
        z-index:999998;
        padding:9px 12px;
        border:1px solid rgba(242,240,234,.3);
        background:#0C0B0A;
        color:#F2F0EA;
        font-family:'IBM Plex Mono',monospace;
        font-size:9px;
        letter-spacing:.1em;
        text-transform:uppercase;
        cursor:pointer;
      `;
      button.addEventListener("click", () => {
        const existing = document.querySelector(".td-cookie-banner");
        if (existing) return;

        localStorage.removeItem("td_cookie_consent");
        ensureCookieConsent();
      });
      document.body.appendChild(button);
    }

    if (stored) {
      try {
        const saved = JSON.parse(stored);
        applyConsent(saved);
        return;
      } catch (_) {
        localStorage.removeItem("td_cookie_consent");
      }
    }
  }

  function initInteractions() {
    ensureVideoModal();
    ensureLatestPlaceholderStyles();
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
      access_key: (window.WEB3FORMS_CONFIG && window.WEB3FORMS_CONFIG.accessKey) || "",
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
          .sort((a, b) =>
            Number(a.episodeNumber || 0) -
            Number(b.episodeNumber || 0)
          );
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
       * At the table shows only guests from published episodes.
       * Guests without a headshot are excluded.
       */
      renderGuests(publicEpisodes);

      reveal();
      initInteractions();

    } catch (error) {
      showError(error);
    }
  }

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      ensureCookieConsent();
      main();
    }
  );
})();
